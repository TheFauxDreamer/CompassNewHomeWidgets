// Fetches the attendance grid from Compass and tallies the most recent roll session.
// Safe to inject repeatedly (each toolbar click re-runs this file).
globalThis.CompassAttendance = (() => {
  // ---------------------------------------------------------------------------
  // CODE MAPPING - edit to match your school's policy.
  // Keyed by extendedStatusIdRaw (not the letter) because letters repeat:
  // "L" = Late Explained AND Late Unexplained, "W" = Absent All Day AND Withdrawn,
  // "/" = Present AND Meeting, "E" = three different educational codes.
  // ---------------------------------------------------------------------------
  // [statusId, code, name, group]. The (i) button in the chart lists these, so
  // any change here shows up for users automatically.
  const STATUSES = [
    [470, "0", "Not Marked", "unmarked"],

    [480, "/", "Present", "present"],
    [635, "/", "Meeting", "present"],
    [490, "L", "Late Explained", "present"],
    [500, "L", "Late Unexplained", "present"],
    [550, "M", "Medical or Sick Bay", "present"],       // official list: attendance on site
    [540, "W", "Withdrawn", "present"],                 // official list: attendance on site

    [520, "E", "Educational Activity", "offsite"],
    [647, "E", "Educational Activity", "offsite"],
    [646, "E", "Online Educational Program at Home", "offsite"],

    [560, "R", "Reasonable Cause", "approved"],
    [590, "N", "Notified as Sick", "approved"],
    [600, "V", "Authorised Vacation", "approved"],
    [580, "C", "Cultural Absence", "approved"],
    [570, "Z", "Suspended", "approved"],

    [510, "U", "Unexplained Absence", "unapproved"],
    [501, "W", "Absent All Day", "unapproved"],         // not on official list; exports as "W"
    [502, "P", "Absent Part of the Day", "unapproved"], // not on official list
    [610, "K", "Unauthorised Vacation", "unapproved"],
    [620, "X", "Unacceptable Reason", "unapproved"],
    [630, "T", "Truant", "unapproved"],

    // Left out of the chart entirely (student wasn't expected at school)
    [530, "Q", "Not Required to Attend", "excluded"],
    [640, "Y", "School Closure", "excluded"],
    [645, "?", "Unscheduled", "excluded"],
  ];
  const CATEGORY_BY_STATUS_ID = Object.fromEntries(STATUSES.map(([id, , , group]) => [id, group]));
  const STATUS_BY_ID = Object.fromEntries(STATUSES.map((row) => [row[0], row]));

  // Colour-blind safe (Okabe-Ito based): blues for at school, orange for absent,
  // so nothing relies on telling red from green. Unapproved is also striped (chart.js).
  const CATEGORIES = [
    { key: "present",    label: "Present",            color: "#0072B2" },
    { key: "offsite",    label: "Excursion",          color: "#56B4E9" },
    { key: "approved",   label: "Approved absence",   color: "#E69F00" },
    { key: "unapproved", label: "Unapproved absence", color: "#B84A00", hatch: true },
    { key: "unmarked",   label: "Not marked",         color: "#9aa0a6" },
  ];

  const USER_IDS_QUERY = "'role'='student' AND 'status'IN('active','left')";

  const GRID_QUERY = `query GetHalfDaySummaryGridLinesByWeekStart($gridGroupType: BulkHalfDayGridGroupType!, $gridGroupId: String!, $weekStart: String, $unifiedUserIds: [Int!]) {
  currentOrganisation {
    halfDaySummaryGridLinesByWeekStart(gridGroupType: $gridGroupType, gridGroupId: $gridGroupId, weekStart: $weekStart, unifiedUserIds: $unifiedUserIds) {
      userId
      isActive
      yearLevelString
      formGroup
      houseGroup
      days {
        date
        amStatusName
        amExtendedStatusIdRaw
        amStatusExportIdentifier
        amStatusPeriodCalcNotMarked
        pmStatusName
        pmExtendedStatusIdRaw
        pmStatusExportIdentifier
        pmStatusPeriodCalcNotMarked
      }
    }
  }
}`;

  // --- helpers ---------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  async function postJson(path, body, extraHeaders = {}) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (res.redirected || res.status === 401 || res.status === 403) {
      throw new Error("Compass didn't accept the request. Check you're still logged in.");
    }
    if (!res.ok) throw new Error(`Compass returned HTTP ${res.status} for ${path}`);
    try { return await res.json(); }
    catch (_) { throw new Error("Compass returned something that wasn't JSON. Your session may have expired."); }
  }

  async function fetchStudentIds() {
    const json = await postJson(
      "/Services/PeopleManagement.svc/GetUserIdsBySearchApiQuery?sessionstate=readonly",
      { query: USER_IDS_QUERY },
      { "X-Requested-With": "XMLHttpRequest" }
    );
    if (!json?.d?.success || !Array.isArray(json.d.data)) throw new Error("Couldn't load the student list.");
    return json.d.data;
  }

  async function fetchWeek(weekStart, userIds) {
    const json = await postJson("/graphql/", {
      operationName: "GetHalfDaySummaryGridLinesByWeekStart",
      variables: { weekStart, gridGroupId: "", gridGroupType: "UNIFIEDGROUP", unifiedUserIds: userIds },
      query: GRID_QUERY,
    });
    if (json.errors?.length) throw new Error("Compass GraphQL error: " + json.errors[0].message);
    return json?.data?.currentOrganisation?.halfDaySummaryGridLinesByWeekStart || [];
  }

  // --- pure logic (no network) -----------------------------------------------
  function categorise(statusId, notMarkedFlag) {
    if (notMarkedFlag || statusId == null) return "unmarked";
    return CATEGORY_BY_STATUS_ID[statusId] || "unknown";
  }

  // half: "am", "pm", or "period" (the rows that loadPeriod makes).
  function halfOf(day, half) {
    const p = half === "am" || half === "period" ? half : "pm";
    return {
      id: day[`${p}ExtendedStatusIdRaw`],
      name: day[`${p}StatusName`],
      code: day[`${p}StatusExportIdentifier`],
      category: categorise(day[`${p}ExtendedStatusIdRaw`], day[`${p}StatusPeriodCalcNotMarked`]),
    };
  }

  // Which session to show:
  // - On a school day, today's AM until more than PM_SWITCH_THRESHOLD students
  //   have a PM code, then today's PM. A handful of pre-entered PM codes
  //   (e.g. whole-day sick notes) won't trigger the switch.
  // - Otherwise (weekend, holiday, or no one expected today), the latest
  //   earlier session where at least one student was marked.
  const PM_SWITCH_THRESHOLD = 100; // PM needs MORE than this many marked students

  // notMarked: a Set of user IDs to count as "Not marked" (students in a roll that isn't
  // marked yet, see unmarkedStudents), or null.
  function tally(students, date, half, notMarked = null) {
    const counts = { present: 0, offsite: 0, approved: 0, unapproved: 0, unmarked: 0, excluded: 0, unknown: 0 };
    const unknownCodes = new Map();
    const byCode = new Map(); // "code|name" -> { code, name, group, count } for the per-code chart
    for (const s of students) {
      const day = (s.days || []).find((d) => d.date === date);
      if (!day) continue;
      const h = halfOf(day, half);
      if (notMarked?.has(Number(s.userId)) && h.category !== "excluded") h.category = "unmarked";
      counts[h.category]++;
      if (h.category !== "unknown" && h.category !== "excluded") {
        const [, code, name, group] = h.category === "unmarked" ? STATUS_BY_ID[470] : STATUS_BY_ID[h.id];
        const key = code + "|" + name;
        const entry = byCode.get(key) || { code, name, group, count: 0 };
        entry.count++;
        byCode.set(key, entry);
      }
      if (h.category === "unknown") {
        const label = `${h.code ?? "?"} ${h.name ?? ""} (id ${h.id})`.trim();
        unknownCodes.set(label, (unknownCodes.get(label) || 0) + 1);
      }
    }
    const total = counts.present + counts.offsite + counts.approved + counts.unapproved + counts.unmarked;
    const marked = total - counts.unmarked;
    return { date, half, counts, total, marked, byCode: [...byCode.values()], unknownCodes: [...unknownCodes.entries()] };
  }

  // Picks the session using the WHOLE school (so the PM threshold still works when
  // a deputy filters down to a couple of year groups). Filtering happens afterwards.
  function summarise(lines, now = new Date()) {
    const todayStr = fmt(now);
    const students = lines.filter((l) => l.isActive !== false);

    const dates = new Set();
    for (const s of students) for (const d of s.days || []) if (d.date && d.date <= todayStr) dates.add(d.date);

    // Newest first: today PM, today AM, yesterday PM, ...
    const sessions = [];
    for (const date of dates) sessions.push(`${date}|am`, `${date}|pm`);
    sessions.sort().reverse();

    for (const key of sessions) {
      const [date, half] = key.split("|");
      const t = tally(students, date, half);
      const found =
        date === todayStr && half === "pm" ? t.marked > PM_SWITCH_THRESHOLD
        : date === todayStr ? t.total > 0 // today's AM, even if roll marking hasn't started
        : t.marked > 0;
      if (found) return { date, half, students };
    }
    return null;
  }

  // --- year groups -------------------------------------------------------------
  const UNASSIGNED = "No year level";
  const yearOf = (s) => (s.yearLevelString || "").trim() || UNASSIGNED;

  function yearLevels(students) {
    return globalThis.CompassYears.sort(new Set(students.map(yearOf)));
  }

  function filterByYears(students, selected) {
    const set = new Set(selected);
    return students.filter((s) => set.has(yearOf(s)));
  }

  // users: a Set of Compass user IDs, for example the members of Custom Groups (groups.js).
  const filterByUsers = (students, users) => students.filter((s) => users.has(Number(s.userId)));

  // --- students in today's unmarked rolls --------------------------------------------
  // The half-day grid does not always show a student as not marked while a roll for that
  // half is still unmarked (seen in the AM). So the widget also asks Compass for today's
  // unmarked rolls (the same call as Attendance > Unmarked Rolls), opens each one that has
  // started (the same call as a class roll), and counts its not-marked students as
  // "Not marked" for that half of the day.
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T00:00:00`;
  const NOT_MARKED_ID = 470;
  const ROLL_REQUESTS_AT_ONCE = 6;

  // "2026-09-25T03:50:00Z", or "/Date(1790272200000+1000)/". Gives a Date or null.
  function parseWhen(...values) {
    for (const v of values) {
      if (v == null || v === "") continue;
      const ms = /\/Date\((-?\d+)/.exec(String(v));
      const d = ms ? new Date(Number(ms[1])) : new Date(v);
      if (!isNaN(d)) return d;
    }
    return null;
  }

  async function fetchUnmarkedRolls(now) {
    // A wider window than today, in case Compass reads the dates as UTC; today is kept below.
    const filter = JSON.stringify([
      { property: "start", value: stamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)), type: ">=" },
      { property: "finish", value: stamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)), type: "<=" },
    ]);
    const items = [];
    for (let page = 1; page <= 5; page++) {
      const json = await postJson("/Services/Attendance.svc/GetAllUnmarkedRolls?sessionstate=readonly",
        { unifiedUserIds: null, page, start: (page - 1) * 200, limit: 200, filter }, { "X-Requested-With": "XMLHttpRequest" });
      const d = json?.d;
      if (!d || !Array.isArray(d.data)) throw new Error("Couldn't read the unmarked rolls.");
      items.push(...d.data);
      if (!d.data.length || items.length >= (d.total ?? 0)) break;
    }
    const today = now.toDateString();
    return items.filter((it) => { const s = parseWhen(it.s, it.start); return s && s.toDateString() === today && s <= now; });
  }

  // How one entry of a student's day timeline (in a class roll) reads: { id, name, code, notMarked }.
  // `status` can be a general type (1 present, 2 approved, 3 unapproved); the extended status
  // is the one that the STATUSES list uses.
  function timelineStatus(entry) {
    const es = entry.extendedStatus || {};
    const id = es.id ?? entry.status;
    // No status at all (a roll that no one has opened) is not marked too.
    return { id, name: es.n || entry.statusName, code: entry.exportId,
      notMarked: !!es.periodCalc_NotMarked || id === NOT_MARKED_ID || id == null || id === 0 };
  }

  // One class roll (the same call as opening a class roll), or null when there is no such roll.
  async function fetchRoll(instanceId) {
    const json = await postJson("/Services/Attendance.svc/GetRollPackage?sessionstate=readonly",
      { instanceId: String(instanceId) }, { "X-Requested-With": "XMLHttpRequest" });
    const data = json?.d?.data;
    return json?.d?.success !== false && data && Array.isArray(data.rollData) ? data : null;
  }

  // Runs fn on every item, ROLL_REQUESTS_AT_ONCE at a time. Gives the results in order.
  // onStep(done, total) runs after each item, for a progress count.
  async function inBatches(items, fn, onStep = null) {
    const out = [];
    let done = 0;
    for (let i = 0; i < items.length; i += ROLL_REQUESTS_AT_ONCE) {
      out.push(...await Promise.all(items.slice(i, i + ROLL_REQUESTS_AT_ONCE).map((x) =>
        Promise.resolve(fn(x)).finally(() => onStep?.(++done, items.length)))));
    }
    return out;
  }

  // The entry of a student's day timeline that belongs to the roll: the one that starts at the
  // roll's start (compared as times, not text), or else the one that is on at that time.
  function ownEntry(day, rollStart) {
    const t = parseWhen(rollStart)?.getTime();
    if (t == null) return day.find((p) => p.start === rollStart) || null;
    return day.find((p) => parseWhen(p.start)?.getTime() === t)
      || day.find((p) => { const a = parseWhen(p.start), b = parseWhen(p.finish); return a && b && a.getTime() <= t && t < b.getTime(); })
      || null;
  }

  // The not-marked students of one roll: { opened, students: [{ uid, half }] }. Each student's
  // timeline has every period of the day; ownEntry() finds the roll's own. Its half is "am"/"pm"
  // by name (for example "AM" or "AM Roll"), or else by whether it starts before the middle of
  // the school day.
  async function rollNotMarked(instanceId, fallbackStart) {
    const data = await fetchRoll(instanceId);
    if (!data) return { opened: false, students: [] };
    const out = [];
    for (const r of data.rollData) {
      const day = Array.isArray(r.userTimeLinePeriods) ? r.userTimeLinePeriods : [];
      const own = ownEntry(day, data.start ?? fallbackStart);
      if (!own || !timelineStatus(own).notMarked || r.uid == null) continue;
      const name = String(own.name || "").trim().toLowerCase();
      let half = /\bam\b/.test(name) ? "am" : /\bpm\b/.test(name) ? "pm" : null;
      if (!half) {
        const first = Math.min(...day.map((p) => parseWhen(p.start)));
        const last = Math.max(...day.map((p) => parseWhen(p.finish)));
        half = parseWhen(own.start) < (first + last) / 2 ? "am" : "pm";
      }
      out.push({ uid: Number(r.uid), half });
    }
    return { opened: true, students: out };
  }

  // { am: Set(user IDs), pm: Set(user IDs), rolls, opened, failed } for today. rolls: the
  // unmarked rolls that have started; opened: the ones Compass gave; failed: requests that
  // failed. The counts show in the chart, so a problem here is visible.
  // onProgress({ done, total, label }) runs as the rolls load.
  async function unmarkedStudents(now = new Date(), onProgress = null) {
    const rolls = await fetchUnmarkedRolls(now);
    const result = { am: new Set(), pm: new Set(), rolls: rolls.length, opened: 0, failed: 0 };
    const step = (done, total) => onProgress?.({ done, total, label: "unmarked rolls" });
    if (rolls.length) step(0, rolls.length);
    const found = await inBatches(rolls, (it) => rollNotMarked(it.id, it.s ?? it.start)
      .catch(() => { result.failed++; return { opened: false, students: [] }; }), step);
    for (const f of found) {
      if (f.opened) result.opened++;
      for (const { uid, half } of f.students) result[half].add(uid);
    }
    return result;
  }

  // --- by period (opt-in, see SESSION_KEY) ----------------------------------------------
  // Compass has attendance by period only class by class. So the widget lists the school's
  // classes (the same calls as Schedule Builder), works out each class's roll for the
  // period, and opens every roll. That is one request for each class, so it is slower.
  const SESSION_KEY = "attendanceSessionMode"; // "halfday" (default) | "period"
  const XRW = { "X-Requested-With": "XMLHttpRequest" };
  let classesPromise = null;

  // The activity IDs of the classes that run on `now`'s date. Fetched one time for each page.
  async function fetchClassIds(now) {
    classesPromise ||= (async () => {
      const subj = await postJson("/Services/Subjects.svc/GetSubjectsInAcademicGroup?sessionstate=readonly",
        { academicGroupId: -1, includeDataSyncSubjects: true, page: 1, start: 0, limit: 1000 }, XRW);
      const subjects = subj?.d?.data;
      if (!Array.isArray(subjects)) throw new Error("Couldn't read the subjects from Compass.");
      const lists = await inBatches(subjects, (s) => postJson("/Services/Subjects.svc/GetStandardClassesOfSubject?sessionstate=readonly",
        { subjectId: s.id, page: 1, start: 0, limit: 1000 }, XRW).then((j) => j?.d?.data || []).catch(() => []));
      return lists.flat().map((c) => ({ id: c.id, start: new Date(c.start), finish: new Date(c.finish) }));
    })();
    classesPromise.catch(() => { classesPromise = null; });
    const all = await classesPromise;
    return [...new Set(all.filter((c) => !(c.start > now) && !(c.finish < now)).map((c) => c.id))];
  }

  // A class roll's ID is the activity ID, the date (ddmmyyyy) and the UTC start time (hhmm),
  // for example "7" + "01022026" + "0030" (made up). The date is tried in UTC first, then local
  // time, for time zones where the two dates differ.
  function instanceIds(aid, start) {
    const utc = `${pad(start.getUTCDate())}${pad(start.getUTCMonth() + 1)}${start.getUTCFullYear()}`;
    const local = `${pad(start.getDate())}${pad(start.getMonth() + 1)}${start.getFullYear()}`;
    const time = `${pad(start.getUTCHours())}${pad(start.getUTCMinutes())}`;
    return [...new Set([utc, local])].map((d) => `${aid}${d}${time}`);
  }

  // The period to show: the one on now, or else the last one that finished today.
  // null before the first period, on a day with no school, or without the period structure.
  async function currentPeriod(now) {
    const P = globalThis.CompassPeriods;
    if (!P) return null;
    const periods = await P.compass(now);
    const { current, previous } = P.current(periods, now);
    return current || previous || null;
  }

  // The students in the class rolls of one period, in the same shape as the half-day grid
  // lines (with "period…" fields), so tally() and the filters work the same way.
  async function loadPeriod(period, now, lines, onProgress = null) {
    const aids = await fetchClassIds(now);
    const byUid = new Map();
    let rolls = 0;
    const step = (done, total) => onProgress?.({ done, total, label: "classes checked" });
    step(0, aids.length);
    await inBatches(aids, async (aid) => {
      for (const id of instanceIds(aid, period.start)) {
        const data = await fetchRoll(id).catch(() => null);
        if (!data) continue;
        rolls++;
        for (const r of data.rollData) {
          const own = (r.userTimeLinePeriods || []).find((p) => p.start === data.start);
          if (!own || r.uid == null) continue;
          const prev = byUid.get(Number(r.uid));
          if (prev && !prev.notMarked) continue; // a student in two rolls: a mark beats no mark
          byUid.set(Number(r.uid), timelineStatus(own));
        }
        break;
      }
    }, step);
    const year = new Map(lines.map((l) => [Number(l.userId), l.yearLevelString]));
    const date = fmt(now);
    const students = [...byUid].map(([uid, st]) => ({
      userId: uid, isActive: true, yearLevelString: year.get(uid) || "",
      days: [{ date, periodExtendedStatusIdRaw: st.id, periodStatusName: st.name,
        periodStatusExportIdentifier: st.code, periodStatusPeriodCalcNotMarked: st.notMarked }],
    }));
    return { date, half: "period", periodName: period.name, rolls, students };
  }

  // mode: "halfday" (AM/PM, the default) or "period".
  // onProgress({ done, total, label }) runs while class rolls load.
  async function load(now = new Date(), { mode = "halfday", onProgress = null } = {}) {
    const ids = await fetchStudentIds();
    const thisMonday = mondayOf(now);

    let result = summarise(await fetchWeek(fmt(thisMonday), ids), now);
    if (!result) {
      // Nothing marked yet this week (e.g. Monday before roll call) - use last week.
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      result = summarise(await fetchWeek(fmt(lastMonday), ids), now);
    }
    // By period: today's class rolls. With no period now (before school, a day with no
    // school) or an error, the chart shows the AM/PM session and says why.
    let periodError = "";
    if (mode === "period") {
      try {
        const period = await currentPeriod(now);
        if (!period) periodError = "No period has started today.";
        else {
          const byPeriod = await loadPeriod(period, now, result?.students || [], onProgress);
          if (byPeriod.rolls) return byPeriod;
          periodError = `Compass has no class rolls for ${period.name}.`;
        }
      } catch (e) { periodError = e.message || String(e); }
    }
    if (result && periodError) result.periodError = periodError;
    // For today's session, also count the students in rolls that aren't marked yet. If this
    // fails, the chart still shows the half-day grid.
    if (result && result.date === fmt(now)) {
      try {
        const u = await unmarkedStudents(now, onProgress);
        result.notMarked = u[result.half];
        result.unmarkedCheck = { rolls: u.rolls, opened: u.opened, failed: u.failed, students: u[result.half].size };
      } catch (e) { result.notMarkedError = e.message || String(e); }
    }
    return result;
  }

  // --- the whole day, period by period (the "Attendance today" widget) ---------------------
  // Gives { date, periods, students, mode, note }. Each student is { userId, yearLevelString,
  // statuses }, with one entry for each period: null (the period hasn't started, or the student
  // has no class then) or { id, name, code, category }.
  //   - AM/PM structure (every period is called AM or PM): the half-day grid (one request),
  //     with the students of unmarked rolls as "Not marked", as in the Attendance chart.
  //   - Other structures: every class roll of every period that has started. A student's day
  //     timeline in a roll has every period, so each roll fills in all the periods.
  //     Fully marked rolls and missing rolls are kept for the page, so a refresh opens only
  //     the rolls that can still change.
  const dayRolls = new Map(); // instance ID -> roll data (fully marked) or null (no such roll)
  const isAmPm = (periods) => periods.length > 0 && periods.every((p) => /^(am|pm)$/i.test(String(p.name).trim()));

  // onProgress gets { step } when a step starts ("periods", "students", "grid", "classes",
  // "rolls"), and { done, total, label } while rolls load.
  async function loadDay(now = new Date(), { onProgress = null } = {}) {
    const P = globalThis.CompassPeriods;
    if (!P) throw new Error("The period structure isn't loaded.");
    onProgress?.({ step: "periods" });
    const periods = await P.compass(now);
    const date = fmt(now);
    if (!periods.length) return { date, periods: [], students: [], mode: "none", note: periods.note || "" };
    const started = periods.map((p) => p.start <= now);
    onProgress?.({ step: "students" });
    const ids = await fetchStudentIds();
    onProgress?.({ step: "grid" });
    const lines = (await fetchWeek(fmt(mondayOf(now)), ids)).filter((l) => l.isActive !== false);

    if (isAmPm(periods)) {
      let notMarked = { am: new Set(), pm: new Set() }, unmarkedError = "";
      if (started.some(Boolean)) {
        onProgress?.({ step: "rolls", label: "unmarked rolls" });
        try { notMarked = await unmarkedStudents(now, onProgress); } catch (e) { unmarkedError = e.message || String(e); }
      }
      const halves = periods.map((p) => String(p.name).trim().toLowerCase());
      const students = lines.map((l) => {
        const day = (l.days || []).find((d) => d.date === date);
        return {
          userId: Number(l.userId), yearLevelString: l.yearLevelString,
          statuses: halves.map((h, i) => {
            if (!day || !started[i]) return null;
            const s = halfOf(day, h);
            const category = notMarked[h].has(Number(l.userId)) && s.category !== "excluded" ? "unmarked" : s.category;
            return { id: s.id, name: s.name, code: s.code, category };
          }),
        };
      });
      const unmarkedCheck = notMarked.rolls != null
        ? { rolls: notMarked.rolls, opened: notMarked.opened, failed: notMarked.failed, students: notMarked.am.size + notMarked.pm.size } : null;
      return { date, periods, students, mode: "halfday", unmarkedCheck, unmarkedError };
    }

    onProgress?.({ step: "classes" });
    const aids = await fetchClassIds(now);
    onProgress?.({ step: "rolls", label: "class rolls" });
    const jobs = [];
    periods.forEach((p, i) => { if (started[i]) for (const aid of aids) jobs.push({ aid, start: p.start }); });
    const step = (done, total) => onProgress?.({ done, total, label: "class rolls" });
    step(0, jobs.length);
    const index = new Map(periods.map((p, i) => [p.start.getTime(), i]));
    const byUid = new Map();
    let rolls = 0;
    await inBatches(jobs, async ({ aid, start }) => {
      for (const id of instanceIds(aid, start)) {
        let data = dayRolls.get(id);
        if (data === undefined) {
          data = await fetchRoll(id).catch(() => undefined);
          if (data === undefined) continue; // an error: try again next time
          const done = data && data.rollData.every((r) => {
            const own = (r.userTimeLinePeriods || []).find((p) => p.start === data.start);
            return !own || !timelineStatus(own).notMarked;
          });
          if (!data || done) dayRolls.set(id, data);
        }
        if (!data) continue;
        rolls++;
        for (const r of data.rollData) {
          if (r.uid == null) continue;
          const row = byUid.get(Number(r.uid)) || periods.map(() => null);
          for (const entry of r.userTimeLinePeriods || []) {
            const i = index.get(new Date(entry.start).getTime());
            if (i == null || !started[i]) continue;
            const st = timelineStatus(entry);
            if (row[i] && !row[i].notMarked) continue; // a mark beats no mark
            row[i] = st;
          }
          byUid.set(Number(r.uid), row);
        }
        break;
      }
    }, step);
    const year = new Map(lines.map((l) => [Number(l.userId), l.yearLevelString]));
    const students = [...byUid].map(([uid, row]) => ({
      userId: uid, yearLevelString: year.get(uid) || "",
      statuses: row.map((s) => s && { id: s.id, name: s.name, code: s.code, category: categorise(s.id, s.notMarked) }),
    }));
    return { date, periods, students, mode: "period", rolls };
  }

  // --- enrolment (the "Enrolment" widget) ------------------------------------------------
  // The active students, from the same half-day grid: [{ userId, year, form, house }].
  async function loadRoster(now = new Date()) {
    const ids = await fetchStudentIds();
    const lines = await fetchWeek(fmt(mondayOf(now)), ids);
    return lines.filter((l) => l.isActive !== false).map((l) => ({
      userId: Number(l.userId), year: yearOf(l),
      form: String(l.formGroup || "").trim(), house: String(l.houseGroup || "").trim(),
    }));
  }

  return { load, loadDay, loadRoster, summarise, tally, unmarkedStudents, instanceIds, SESSION_KEY, yearLevels, filterByYears, filterByUsers, CATEGORIES, CATEGORY_BY_STATUS_ID, STATUSES };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassAttendance;
