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

  function halfOf(day, half) {
    const p = half === "am" ? "am" : "pm";
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

  function tally(students, date, half) {
    const counts = { present: 0, offsite: 0, approved: 0, unapproved: 0, unmarked: 0, excluded: 0, unknown: 0 };
    const unknownCodes = new Map();
    const byCode = new Map(); // "code|name" -> { code, name, group, count } for the per-code chart
    for (const s of students) {
      const day = (s.days || []).find((d) => d.date === date);
      if (!day) continue;
      const h = halfOf(day, half);
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

  async function load(now = new Date()) {
    const ids = await fetchStudentIds();
    const thisMonday = mondayOf(now);

    let result = summarise(await fetchWeek(fmt(thisMonday), ids), now);
    if (!result) {
      // Nothing marked yet this week (e.g. Monday before roll call) - use last week.
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      result = summarise(await fetchWeek(fmt(lastMonday), ids), now);
    }
    return result;
  }

  return { load, summarise, tally, yearLevels, filterByYears, CATEGORIES, CATEGORY_BY_STATUS_ID, STATUSES };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassAttendance;
