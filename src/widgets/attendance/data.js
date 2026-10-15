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
        amStatus
        pmStatus
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

  // The grid with the students' names too, for the Period inconsistencies page only. The
  // other widgets show counts, so they keep GRID_QUERY without names.
  const GRID_QUERY_NAMES = GRID_QUERY.replace("      userId\n", "      userId\n      reportName\n      lastName\n");

  async function fetchWeek(weekStart, userIds, query = GRID_QUERY) {
    const json = await postJson("/graphql/", {
      operationName: "GetHalfDaySummaryGridLinesByWeekStart",
      variables: { weekStart, gridGroupId: "", gridGroupType: "UNIFIEDGROUP", unifiedUserIds: userIds },
      query,
    });
    if (json.errors?.length) throw new Error("Compass GraphQL error: " + json.errors[0].message);
    return json?.data?.currentOrganisation?.halfDaySummaryGridLinesByWeekStart || [];
  }

  // --- the school's codes from Compass ---------------------------------------------
  // The same request as the Compass attendance page. Gives [{ id, code, name }], with the
  // school's own names. STATUSES above stays the policy for the groups; this list gives the
  // names and shows codes that STATUSES doesn't have. Fetched one time for each page.
  const CODES_QUERY = `query GetExtendedStatuses {
  currentOrganisation {
    extendedStatuses {
      id
      extendedStatusIdRaw
      schoolSystemExportIdentifier
      name
    }
  }
}`;
  let codesPromise = null;
  let schoolCodes = null; // Map(id -> { id, code, name }) once loaded
  function fetchCodes() {
    codesPromise ||= postJson("/graphql/", { operationName: "GetExtendedStatuses", variables: {}, query: CODES_QUERY })
      .then((json) => {
        const list = json?.data?.currentOrganisation?.extendedStatuses;
        if (!Array.isArray(list)) throw new Error("Couldn't read the attendance codes from Compass.");
        const codes = list.map((c) => ({ id: Number(c.extendedStatusIdRaw), code: String(c.schoolSystemExportIdentifier ?? ""), name: String(c.name || "").trim() }))
          .filter((c) => Number.isFinite(c.id));
        schoolCodes = new Map(codes.map((c) => [c.id, c]));
        return codes;
      })
      .catch((e) => { codesPromise = null; throw e; });
    return codesPromise;
  }

  // A code that STATUSES doesn't list gets a group from the colour that the grid sends with
  // each mark: GREEN present, RED unexplained (unapproved), ORANGE an absence with a reason.
  // ORANGE is only a guess: Compass also shows Unauthorised Vacation as ORANGE. So these
  // codes are "auto" and the chart says so (see tally's autoCodes).
  const GROUP_BY_COLOUR = { GREEN: "present", RED: "unapproved", ORANGE: "approved" };

  // --- pure logic (no network) -----------------------------------------------
  // colour: the grid's general status (GREEN/ORANGE/RED), for a code that STATUSES doesn't list.
  function categorise(statusId, notMarkedFlag, colour = null) {
    if (notMarkedFlag || statusId == null) return "unmarked";
    return CATEGORY_BY_STATUS_ID[statusId] || GROUP_BY_COLOUR[String(colour || "").toUpperCase()] || "unknown";
  }

  // half: "am", "pm", or "period" (the rows that loadPeriod makes).
  function halfOf(day, half) {
    const p = half === "am" || half === "period" ? half : "pm";
    const id = day[`${p}ExtendedStatusIdRaw`] == null ? null : Number(day[`${p}ExtendedStatusIdRaw`]);
    return {
      id,
      name: day[`${p}StatusName`],
      code: day[`${p}StatusExportIdentifier`],
      category: categorise(id, day[`${p}StatusPeriodCalcNotMarked`], day[`${p}Status`]),
      auto: id != null && !(id in CATEGORY_BY_STATUS_ID) && !day[`${p}StatusPeriodCalcNotMarked`],
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
    const autoCodes = new Map(); // id|group -> { label, group, count }: codes grouped by the grid's colour
    const byCode = new Map(); // "code|name" -> { code, name, group, count } for the per-code chart
    for (const s of students) {
      const day = (s.days || []).find((d) => d.date === date);
      if (!day) continue;
      const h = halfOf(day, half);
      if (notMarked?.has(Number(s.userId)) && h.category !== "excluded") h.category = "unmarked";
      counts[h.category]++;
      if (h.category !== "unknown" && h.category !== "excluded") {
        const id = h.category === "unmarked" ? NOT_MARKED_ID : h.id;
        const known = STATUS_BY_ID[id];
        // The school's own name from Compass when it is loaded, else the name in STATUSES.
        const code = schoolCodes?.get(id)?.code ?? known?.[1] ?? h.code ?? "?";
        const name = schoolCodes?.get(id)?.name || known?.[2] || h.name || `Code ${id}`;
        const group = h.category;
        if (h.auto && h.category !== "unmarked") {
          const k = `${id}|${group}`;
          const a = autoCodes.get(k) || { label: `${code} ${name}`.trim(), group, count: 0 };
          a.count++;
          autoCodes.set(k, a);
        }
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
    return { date, half, counts, total, marked, byCode: [...byCode.values()], unknownCodes: [...unknownCodes.entries()],
      autoCodes: [...autoCodes.values()] };
  }

  // --- counted vs enrolled ---------------------------------------------------------
  // enrolled: the active students in the filter. counts: { total, excluded, unknown } of one
  // session (from tally, or Attendance Today's count). Gives where the other students are:
  //   notExpected: a code that means "not expected at school" (Q, school closure, unscheduled)
  //   unmapped:    a code that the extension doesn't know
  //   noRecord:    no mark at all for the session (for example, kindy on their days off)
  function enrolment(enrolled, counts) {
    const notExpected = counts.excluded || 0, unmapped = counts.unknown || 0;
    return { enrolled, counted: counts.total, notExpected, unmapped, noRecord: Math.max(0, enrolled - counts.total - notExpected - unmapped) };
  }

  // The hover text that explains the gap, or "" when every enrolled student is counted.
  function enrolmentNote(e) {
    const parts = [];
    if (e.notExpected) parts.push(`${e.notExpected} not expected at school (not required to attend, school closure or unscheduled)`);
    if (e.noRecord) parts.push(`${e.noRecord} with no record for this session (for example, kindy on their days off)`);
    if (e.unmapped) parts.push(`${e.unmapped} with a code the extension doesn't know`);
    return parts.length ? `${e.counted} of ${e.enrolled} enrolled students are counted. Not counted: ${parts.join(" · ")}.` : "";
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
  // onStep(done, total) runs as the subjects' classes load (only on the first call).
  async function fetchClassIds(now, onStep = null) {
    classesPromise ||= (async () => {
      const subj = await postJson("/Services/Subjects.svc/GetSubjectsInAcademicGroup?sessionstate=readonly",
        { academicGroupId: -1, includeDataSyncSubjects: true, page: 1, start: 0, limit: 1000 }, XRW);
      const subjects = subj?.d?.data;
      if (!Array.isArray(subjects)) throw new Error("Couldn't read the subjects from Compass.");
      const lists = await inBatches(subjects, (s) => postJson("/Services/Subjects.svc/GetStandardClassesOfSubject?sessionstate=readonly",
        { subjectId: s.id, page: 1, start: 0, limit: 1000 }, XRW).then((j) => j?.d?.data || []).catch(() => []), onStep);
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
    // roster: every active student, for the enrolled count (the rolls give only the students
    // who have a class in this period).
    return { date, half: "period", periodName: period.name, rolls, students, roster: lines };
  }

  // mode: "halfday" (AM/PM, the default) or "period".
  // onProgress({ done, total, label }) runs while class rolls load.
  async function load(now = new Date(), { mode = "halfday", onProgress = null } = {}) {
    fetchCodes().catch(() => {}); // the names only; the chart works without them
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

    const { rows, rolls } = await loadRollsForDay(periods, started, { onProgress });
    const year = new Map(lines.map((l) => [Number(l.userId), l.yearLevelString]));
    const students = [...rows].map(([uid, statuses]) => ({ userId: uid, yearLevelString: year.get(uid) || "", statuses }));
    const roster = lines.map((l) => ({ userId: Number(l.userId), yearLevelString: l.yearLevelString }));
    return { date, periods, students, roster, mode: "period", rolls };
  }

  // The class rolls of one day (any date): opens the roll of every class in each period that
  // has started. Gives { rows: Map(user ID -> statuses), rolls, stoppedAfter }, with statuses as
  // in loadDay. stoppedAfter: the name of the last period opened when the rest weren't needed.
  // expected: a Set of user IDs, or null. With it, the rolls are opened one period at a time,
  // and the rest are skipped once every expected student has a timeline (each roll gives the
  // student's whole day, so one or two periods usually cover everyone).
  // onProgress gets { step } as in loadDay; { step: "classes", done, total } while the subjects'
  // classes load; and { step: "rolls", done, total, label, period, periodNo, periods, rolls,
  // found, expected } while rolls load (found: the expected students found so far).
  // stopped(): true when the user stopped the load; the rolls left are not opened.
  async function loadRollsForDay(periods, started, { onProgress = null, expected = null, stopped = () => false } = {}) {
    onProgress?.({ step: "classes" });
    const aids = await fetchClassIds(periods[0].start, (done, total) => onProgress?.({ step: "classes", done, total }));
    onProgress?.({ step: "rolls", label: "class rolls" });
    const groups = [];
    periods.forEach((p, i) => { if (started[i]) groups.push({ name: p.name, jobs: aids.map((aid) => ({ aid, start: p.start })) }); });
    const total = groups.reduce((n, g) => n + g.jobs.length, 0);
    const index = new Map(periods.map((p, i) => [p.start.getTime(), i]));
    const byUid = new Map();
    let rolls = 0, before = 0, found = 0, stoppedAfter = null;
    const runs = expected ? groups : [{ name: groups.length === 1 ? groups[0].name : null, jobs: groups.flatMap((g) => g.jobs) }];
    let run = runs[0];
    const step = (done) => onProgress?.({ step: "rolls", label: "class rolls", done: before + done, total, rolls,
      period: run?.name ?? null, periodNo: runs.indexOf(run) + 1, periods: runs.length, found, expected: expected?.size ?? null });
    step(0);
    for (const [n, r] of runs.entries()) {
      if (expected && found >= expected.size && n > 0) { stoppedAfter = runs[n - 1].name; break; }
      if (stopped()) break;
      run = r;
      step(0);
      await inBatches(r.jobs, async ({ aid, start }) => {
        if (stopped()) return;
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
            const uid = Number(r.uid);
            if (!byUid.has(uid) && expected?.has(uid)) found++;
            const row = byUid.get(uid) || periods.map(() => null);
            for (const entry of r.userTimeLinePeriods || []) {
              const i = index.get(new Date(entry.start).getTime());
              if (i == null || !started[i]) continue;
              const st = timelineStatus(entry);
              if (row[i] && !row[i].notMarked) continue; // a mark beats no mark
              row[i] = st;
            }
            byUid.set(uid, row);
          }
          break;
        }
      }, step);
      before += r.jobs.length;
    }
    if (before < total && !stopped()) { before = total; step(0); } // the rest weren't needed
    const rows = new Map([...byUid].map(([uid, row]) =>
      [uid, row.map((s) => s && { id: s.id, name: s.name, code: s.code, category: categorise(s.id, s.notMarked) })]));
    return { rows, rolls, stoppedAfter };
  }

  // --- period inconsistencies (the Period inconsistencies page) --------------------------
  // The page is a Compass address, so it runs with the user's Compass login.
  const INCONSISTENCY_PAGE = "/?ext=period-inconsistencies";

  // Every student's marks on each of `dates` (Date objects), oldest first. Gives
  // { days: [{ date, periods, mode, students }], errors: [{ date, error }], stopped }, where each
  // student is { userId, name, yearLevelString, statuses } (statuses as in loadDay). Days with no
  // school are left out. An AM/PM school uses only the half-day grid; other schools open class
  // rolls (see loadRollsForDay), which is slow for many days.
  // onProgress gets one of these, so the page can show each step:
  //   { phase: "students" }, then { phase: "students", count }
  //   { phase: "grid", done, total }                       (weeks of the half-day grid)
  //   { phase: "day", date, day, days, state: "busy" }     (a day starts)
  //   { phase: "classes", date, done, total }               (subjects, the first time only)
  //   { phase: "rolls", date, done, total, rolls, period, periodNo, periods, found, expected }
  //   { phase: "day", date, day, days, state: "done", mode, students, rolls, stoppedAfter }
  //   { phase: "day", date, day, days, state: "skip", note } (no school, or no period started yet)
  //   { phase: "day", date, day, days, state: "fail", error }
  // onDay(day) runs as each day is ready, so the page can show it before the rest load.
  // stopped(): true when the user stopped the load; the days left are not loaded.
  async function loadInconsistencyRange(dates, { now = new Date(), onProgress = null, onDay = null, stopped = () => false } = {}) {
    const P = globalThis.CompassPeriods;
    if (!P) throw new Error("The period structure isn't loaded.");
    onProgress?.({ phase: "students" });
    const ids = await fetchStudentIds();
    onProgress?.({ phase: "students", count: ids.length });
    // One grid request for each week, with the names. A student is kept when the latest week
    // that has them says they are active.
    const mondays = [...new Set(dates.map((d) => fmt(mondayOf(d))))].sort();
    let weeksDone = 0;
    onProgress?.({ phase: "grid", done: 0, total: mondays.length });
    const weeks = await Promise.all(mondays.map((m) => fetchWeek(m, ids, GRID_QUERY_NAMES)
      .then((w) => { onProgress?.({ phase: "grid", done: ++weeksDone, total: mondays.length }); return w; })));
    const byUid = new Map();
    for (const week of weeks) {
      for (const l of week) {
        const uid = Number(l.userId);
        const prev = byUid.get(uid);
        byUid.set(uid, { ...l, days: [...(prev?.days || []), ...(l.days || [])] });
      }
    }
    const lines = [...byUid.values()].filter((l) => l.isActive !== false);
    const out = { days: [], errors: [], stopped: false };
    const sorted = [...dates].sort((a, b) => a - b);
    for (const [n, when] of sorted.entries()) {
      if (stopped()) { out.stopped = true; break; }
      const date = fmt(when);
      const dayEvent = (state, extra = {}) => onProgress?.({ phase: "day", date, day: n + 1, days: sorted.length, state, ...extra });
      dayEvent("busy");
      try {
        const periods = await P.compass(when);
        if (!periods.length) { dayEvent("skip", { note: periods.note || "No school" }); continue; }
        const started = periods.map((p) => p.start <= now);
        if (!started.some(Boolean)) { dayEvent("skip", { note: `School starts at ${periods[0].start.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}` }); continue; }
        const gridDay = new Map(lines.map((l) => [Number(l.userId), (l.days || []).find((d) => d.date === date)]));
        const person = (l) => ({ userId: Number(l.userId), name: String(l.reportName || "").trim(), lastName: String(l.lastName || "").trim(), yearLevelString: l.yearLevelString });
        let students, mode, rolls = 0, stoppedAfter = null;
        if (isAmPm(periods)) {
          mode = "halfday";
          const halves = periods.map((p) => String(p.name).trim().toLowerCase());
          students = lines.filter((l) => gridDay.get(Number(l.userId))).map((l) => {
            const day = gridDay.get(Number(l.userId));
            return { ...person(l), statuses: halves.map((h, i) => {
              if (!started[i]) return null;
              const s = halfOf(day, h);
              return { id: s.id, name: s.name, code: s.code, category: s.category };
            }) };
          });
        } else {
          mode = "period";
          // Expected: the students with a grid record that day that isn't "not expected at school".
          const expected = new Set(lines.filter((l) => {
            const day = gridDay.get(Number(l.userId));
            return day && (halfOf(day, "am").category !== "excluded" || halfOf(day, "pm").category !== "excluded");
          }).map((l) => Number(l.userId)));
          const res = await loadRollsForDay(periods, started, { expected, stopped, onProgress: (p) => {
            if (p.step === "classes" && p.total != null) onProgress?.({ phase: "classes", date, done: p.done, total: p.total });
            else if (p.step === "rolls" && p.total != null) onProgress?.({ phase: "rolls", date, ...p, step: undefined, label: undefined });
          } });
          if (stopped()) { out.stopped = true; break; }
          ({ rolls, stoppedAfter } = res);
          const line = new Map(lines.map((l) => [Number(l.userId), l]));
          students = [...res.rows].map(([uid, statuses]) => ({ ...person(line.get(uid) || { userId: uid }), statuses }));
        }
        const day = { date, periods, mode, students };
        out.days.push(day);
        dayEvent("done", { mode, students: students.length, rolls, stoppedAfter });
        onDay?.(day);
      } catch (e) {
        out.errors.push({ date, error: e.message || String(e) });
        dayEvent("fail", { error: e.message || String(e) });
      }
    }
    return out;
  }

  // --- who marked a student's rolls (the Period inconsistencies page) ---------------------
  // Compass keeps who saved each roll and when (the roll's previousMarkings), not who set one
  // student's code. So for each period of a student's day this finds the class roll that marked
  // it (the same call as the Attendance tab of a student's profile) and reads that roll's last save.
  // Only for the rows the page shows: two requests for each student and day, and the rolls are
  // shared between students.
  const markingRolls = new Map(); // instance ID -> promise of the roll (or null)
  const markingDays = new Map();  // "uid|yyyy/mm/dd" -> promise of the result below

  // The text of Compass's teacher HTML: "<s>(code)</s> code2" -> "code2 (relief for code)".
  function teacherText(html) {
    const text = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
    const away = [...String(html || "").matchAll(/<s>([\s\S]*?)<\/s>/gi)].map((m) => text(m[1])).filter(Boolean);
    const here = text(String(html || "").replace(/<s>[\s\S]*?<\/s>/gi, ""));
    return away.length && here ? `${here} (relief for ${away.join(", ")})` : here || away.join(", ");
  }

  // "First Last (username)" -> "First Last".
  const staffName = (n) => String(n || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

  // The last save of a roll: { by, at: Date, saves } or null when it was never saved.
  function lastMarking(roll) {
    const list = (roll?.previousMarkings || []).filter((m) => !m.isReset && parseWhen(m.dt));
    if (!list.length) return null;
    const last = list.reduce((a, b) => (parseWhen(b.dt) > parseWhen(a.dt) ? b : a));
    return { by: staffName(last.n), at: parseWhen(last.dt), saves: list.length };
  }

  // The class that marked each period: [{ className, teacher, rollMarked, by, at, saves } | null],
  // one for each of `periods`. date: "yyyy/mm/dd".
  function loadMarkings(userId, date, periods) {
    const key = `${userId}|${date}`;
    if (!markingDays.has(key)) {
      const promise = (async () => {
        const [y, m, d] = date.split("/").map(Number);
        const json = await postJson(`/Services/AttendanceV2.svc/GetDailySummaryForTimeline?_dc=${Date.now()}`,
          { userId: Number(userId), date: new Date(y, m - 1, d).toISOString(), page: 1, start: 0, limit: 25 }, XRW);
        if (!Array.isArray(json?.d)) throw new Error("Couldn't read the student's classes from Compass.");
        const classes = json.d.filter((c) => c.instanceId).map((c) => ({ ...c, s: parseWhen(c.start), f: parseWhen(c.finish) }));
        return Promise.all(periods.map(async (p) => {
          // The class on during the period: a marked roll first, then Compass's priority.
          const on = classes.filter((c) => c.s && c.f && c.s < p.finish && c.f > p.start)
            .sort((a, b) => Number(!!b.rollMarked) - Number(!!a.rollMarked) || (a.priority ?? 99) - (b.priority ?? 99));
          const c = on[0];
          if (!c) return null;
          if (!markingRolls.has(c.instanceId)) {
            const roll = fetchRoll(c.instanceId).catch((e) => { markingRolls.delete(c.instanceId); throw e; });
            markingRolls.set(c.instanceId, roll);
          }
          const roll = await markingRolls.get(c.instanceId);
          return { className: String(c.name || roll?.activityName || "").trim(), teacher: teacherText(c.manager), rollMarked: !!c.rollMarked, ...(lastMarking(roll) || {}) };
        }));
      })();
      promise.catch(() => markingDays.delete(key)); // ask again next time
      markingDays.set(key, promise);
    }
    return markingDays.get(key);
  }

  // Forgets the cached markings of one date ("yyyy/mm/dd"), or of every date, so they load again.
  function forgetMarkings(date = null) {
    for (const k of [...markingDays.keys()]) if (!date || k.endsWith(`|${date}`)) markingDays.delete(k);
    markingRolls.clear();
  }

  // The students whose marks on one day mix present and absent. Present: present or excursion.
  // Absent: an unapproved absence, and an approved one too when absences is "all". Other marks
  // (not marked, not expected, unknown, none) are skipped: they neither flag nor break a run.
  //   rule "between": an absence with a present mark before it and after it on the same day.
  //   rule "any":     at least one present mark and at least one absent mark.
  //   rule "present": a present mark with an absence before it and after it (usually a marking
  //                   mistake). Here flagged points at the present marks.
  // Gives [{ userId, name, yearLevelString, date, periods, mode, statuses, flagged }], newest
  // day first, then by year group (in school order), then by name: the first name (order "first",
  // the name as Compass writes it) or the surname (order "last"). With groupBy "student" the
  // rows come by year group, then by name, with each student's days together (newest first).
  // flagged: the indexes of the marks that made the match.
  function inconsistencies(days, { rule = "between", absences = "unapproved", order = "first", groupBy = "day" } = {}) {
    const isPresent = (c) => c === "present" || c === "offsite";
    const isAbsent = (c) => c === "unapproved" || (absences === "all" && c === "approved");
    const out = [];
    for (const day of days) {
      for (const s of day.students) {
        const cats = s.statuses.map((x) => x?.category);
        // Flag the `target` marks that have an `around` mark before and after them ("any": anywhere).
        const [target, around] = rule === "present" ? [isPresent, isAbsent] : [isAbsent, isPresent];
        const arounds = cats.map((c, i) => (around(c) ? i : -1)).filter((i) => i >= 0);
        if (!arounds.length) continue;
        const first = arounds[0], last = arounds[arounds.length - 1];
        const flagged = cats.map((c, i) => (target(c) && (rule === "any" || (i > first && i < last)) ? i : -1)).filter((i) => i >= 0);
        if (flagged.length) out.push({ ...s, date: day.date, periods: day.periods, mode: day.mode, flagged });
      }
    }
    const rank = globalThis.CompassYears.rank;
    // The surname: Compass's lastName, or else the last word of the name.
    const surname = (r) => r.lastName || r.name.split(/\s+/).pop() || "";
    const byName = (a, b) => (order === "last" ? surname(a).localeCompare(surname(b), "en", { sensitivity: "base" }) : 0)
      || a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    const byYear = (a, b) => rank(yearOf(a)) - rank(yearOf(b)) || yearOf(a).localeCompare(yearOf(b));
    const byDate = (a, b) => b.date.localeCompare(a.date);
    return out.sort(groupBy === "student"
      ? (a, b) => byYear(a, b) || byName(a, b) || a.userId - b.userId || byDate(a, b)
      : (a, b) => byDate(a, b) || byYear(a, b) || byName(a, b));
  }

  // --- arrivals and departures (the Period inconsistencies page) --------------------------
  // events: one student's arrivals and departures on one day, [{ type: "arrival" | "departure",
  // time: Date }] in any order. Gives the times they were off site, [{ from, to }] in ms:
  // before a first arrival (they came late), and from a departure until the next arrival (or
  // the end of the day). from/to are -Infinity/Infinity at the open ends.
  function offsiteSpans(events) {
    const list = [...events].sort((a, b) => a.time - b.time);
    const spans = [];
    let off = list[0]?.type === "arrival" ? -Infinity : null;
    for (const e of list) {
      const t = e.time.getTime();
      if (e.type === "arrival" && off !== null) { spans.push({ from: off, to: t }); off = null; }
      else if (e.type === "departure" && off === null) off = t;
    }
    if (off !== null) spans.push({ from: off, to: Infinity });
    return spans;
  }

  // Whether a sign-out or a late arrival explains a row from inconsistencies(): each flagged
  // absence's period overlaps a time the student was off site. Not for the "present" rule (the
  // flagged marks are present marks). Gives { explained, spans }.
  function explainedBy(row, events, rule = "between") {
    if (!events?.length || rule === "present") return { explained: false, spans: [] };
    const spans = offsiteSpans(events);
    const explained = row.flagged.length > 0 && row.flagged.every((i) => {
      const p = row.periods[i];
      return p && spans.some((s) => s.from < p.finish.getTime() && s.to > p.start.getTime());
    });
    return { explained, spans };
  }

  // --- summary (the Period inconsistencies page) -------------------------------------------
  // rows: from inconsistencies(). markings: "uid|yyyy/mm/dd" -> [{ className, teacher } | null]
  // (one for each period, from loadMarkings), for the rows that have loaded. Gives:
  //   students: [{ userId, name, yearLevelString, days, marks, last }] most days first, then most
  //             flagged marks, then by name
  //   periods:  [{ name, count }] by period name, most first (ties in the day's order)
  //   weekdays: [{ name, count }] Monday to Friday (and Saturday/Sunday if any), in week order
  //   classes:  [{ name, teacher, count }] most first, from the markings that have loaded
  //   marks:    the number of flagged marks; pending: the rows whose classes aren't loaded yet
  const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function summariseInconsistencies(rows, markings = new Map()) {
    const students = new Map(), periods = new Map(), weekdays = new Map(), classes = new Map();
    let marks = 0, pending = 0;
    const bump = (map, key, make) => { const v = map.get(key) || make(); v.count++; map.set(key, v); return v; };
    for (const r of rows) {
      const s = students.get(r.userId) || { userId: r.userId, name: r.name, yearLevelString: r.yearLevelString, days: 0, marks: 0, last: r.date };
      s.days++;
      s.marks += r.flagged.length;
      if (r.date > s.last) s.last = r.date;
      students.set(r.userId, s);
      const [y, m, d] = r.date.split("/").map(Number);
      const wd = new Date(y, m - 1, d).getDay();
      const known = markings.get(`${r.userId}|${r.date}`);
      if (!known) pending++;
      for (const i of r.flagged) {
        marks++;
        const p = r.periods[i];
        bump(periods, p.name, () => ({ name: p.name, count: 0, order: i }));
        bump(weekdays, wd, () => ({ name: WEEKDAY_NAMES[wd], count: 0, order: (wd + 6) % 7 }));
        const c = known?.[i];
        if (c?.className) bump(classes, `${c.className}|${c.teacher || ""}`, () => ({ name: c.className, teacher: c.teacher || "", count: 0 }));
      }
    }
    const byCount = (a, b) => b.count - a.count;
    const clean = (list) => list.map(({ order, ...x }) => x);
    return {
      students: [...students.values()].sort((a, b) => b.days - a.days || b.marks - a.marks || a.name.localeCompare(b.name)),
      periods: clean([...periods.values()].sort((a, b) => byCount(a, b) || a.order - b.order)),
      weekdays: clean([...weekdays.values()].sort((a, b) => a.order - b.order)),
      classes: [...classes.values()].sort((a, b) => byCount(a, b) || a.name.localeCompare(b.name)),
      marks, pending,
    };
  }

  // --- trend (the "Attendance Trend" widget) -----------------------------------------------
  // The roll sessions to show, oldest first: [{ date, half }]. The choice uses the whole school
  // (as summarise does), so a filter changes the numbers but not the sessions:
  //   - a past session with at least one mark;
  //   - today's AM once it has a mark; today's PM once more than PM_SWITCH_THRESHOLD students
  //     have a PM mark (a few pre-entered PM codes don't count).
  function trendSessions(lines, now = new Date()) {
    const today = fmt(now);
    const dates = new Set();
    for (const s of lines) for (const d of s.days || []) if (d.date && d.date <= today) dates.add(d.date);
    const out = [];
    for (const date of [...dates].sort()) {
      for (const half of ["am", "pm"]) {
        const t = tally(lines, date, half);
        const keep = date < today || half === "am" ? t.marked > 0 : t.marked > PM_SWITCH_THRESHOLD;
        if (keep) out.push({ date, half });
      }
    }
    return out;
  }

  // This week's and last week's grid, merged into one line for each active student.
  async function loadTrend(now = new Date()) {
    const ids = await fetchStudentIds();
    const thisMonday = mondayOf(now);
    const lastMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
    const [cur, prev] = await Promise.all([fetchWeek(fmt(thisMonday), ids), fetchWeek(fmt(lastMonday), ids)]);
    const byUid = new Map();
    for (const l of cur) if (l.isActive !== false) byUid.set(Number(l.userId), { ...l, days: [...(l.days || [])] });
    for (const l of prev) byUid.get(Number(l.userId))?.days.push(...(l.days || []));
    const students = [...byUid.values()];
    return { students, sessions: trendSessions(students, now), now };
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

  // The school's codes ([{ id, code, name, group, auto }]) for the (i) panel. group is the
  // group in STATUSES, or null for a code that STATUSES doesn't list.
  async function schoolCodeList() {
    const codes = await fetchCodes();
    return codes.map((c) => ({ ...c, group: CATEGORY_BY_STATUS_ID[c.id] || null }));
  }

  return { load, loadDay, loadInconsistencyRange, inconsistencies, loadMarkings, forgetMarkings, teacherText, offsiteSpans, explainedBy, summariseInconsistencies, INCONSISTENCY_PAGE, schoolCodeList, GROUP_BY_COLOUR, loadRoster, loadTrend, trendSessions, enrolment, enrolmentNote, summarise, tally, unmarkedStudents, instanceIds, SESSION_KEY, yearLevels, filterByYears, filterByUsers, CATEGORIES, CATEGORY_BY_STATUS_ID, STATUSES };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassAttendance;
