// The Period inconsistencies rule and loading in src/widgets/attendance/data.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, mockFetch } = require("./load.js");
load("src/widgets/attendance/data.js");
const A = globalThis.CompassAttendance;

const WED = "2026/10/14";
const at = (h, m = 0) => new Date(2026, 9, 14, h, m);
const PERIODS = [
  { name: "P1", start: at(8, 45), finish: at(9, 45) },
  { name: "P2", start: at(10, 0), finish: at(11, 0) },
  { name: "P3", start: at(11, 30), finish: at(12, 30) },
  { name: "P4", start: at(13, 15), finish: at(14, 15) },
];
// A status of each category, in the shape that loadDay gives.
const S = {
  pres: { category: "present" }, exc: { category: "offsite" }, sick: { category: "approved" },
  abs: { category: "unapproved" }, none: { category: "unmarked" }, q: { category: "excluded" },
};
const student = (userId, name, marks) => ({ userId, name, yearLevelString: "Year 9", statuses: marks.map((m) => (m ? S[m] : null)) });
const day = (students, periods = PERIODS, date = WED) => ({ date, periods, mode: "period", students });
const found = (rows) => rows.map((r) => [r.name, r.flagged]);

test("between presents: an absence with a present before and after it", () => {
  const days = [day([
    student(1, "Cloud Strife", ["pres", "pres", "abs", "pres"]),   // the staff member's case
    student(2, "Tifa Lockhart", ["pres", "pres", "abs", "abs"]),   // left early: not between
    student(3, "Barret Wallace", ["abs", "pres", "pres", "pres"]), // arrived late: not between
    student(4, "Aerith Gainsborough", ["pres", "pres", "pres", "pres"]),
  ])];
  assert.deepEqual(found(A.inconsistencies(days)), [["Cloud Strife", [2]]]);
});

test("any mix: every day with a present and an absent mark", () => {
  const days = [day([
    student(1, "Cloud Strife", ["pres", "pres", "abs", "pres"]),
    student(2, "Tifa Lockhart", ["pres", "pres", "abs", "abs"]),
    student(3, "Barret Wallace", ["abs", "pres", "pres", "pres"]),
    student(4, "Red XIII", ["abs", "abs", "abs", "abs"]), // absent all day: no present mark
  ])];
  assert.deepEqual(found(A.inconsistencies(days, { rule: "any" })),
    [["Barret Wallace", [0]], ["Cloud Strife", [2]], ["Tifa Lockhart", [2, 3]]]);
});

test("approved absences count only with absences = all", () => {
  const days = [day([student(1, "Yuffie Kisaragi", ["pres", "sick", "pres", "pres"])])];
  assert.deepEqual(found(A.inconsistencies(days)), []);
  assert.deepEqual(found(A.inconsistencies(days, { absences: "all" })), [["Yuffie Kisaragi", [1]]]);
});

test("an excursion counts as present; not marked, not expected and empty periods are skipped", () => {
  const days = [day([
    student(1, "Cid Highwind", ["exc", "none", "abs", "pres"]),      // excursion, then a gap, then absent
    student(2, "Vincent Valentine", ["pres", "abs", null, "q"]),     // nothing present after the absence
  ])];
  assert.deepEqual(found(A.inconsistencies(days)), [["Cid Highwind", [2]]]);
});

test("AM/PM days: never between, but any mix finds a half-day absence", () => {
  const halves = [{ name: "AM", start: at(8, 45), finish: at(12, 0) }, { name: "PM", start: at(12, 40), finish: at(15, 0) }];
  const days = [{ ...day([student(1, "Cait Sith", ["pres", "abs"])], halves), mode: "halfday" }];
  assert.deepEqual(found(A.inconsistencies(days)), []);
  assert.deepEqual(found(A.inconsistencies(days, { rule: "any" })), [["Cait Sith", [1]]]);
});

test("rows come newest day first, then by year group in school order, then by name", () => {
  const inYear = (s, year) => ({ ...s, yearLevelString: year });
  const gap = ["pres", "abs", "pres"];
  const days = [
    day([student(1, "Reno", gap)], PERIODS, "2026/10/13"),
    day([
      inYear(student(2, "Rude", gap), "Year 10"),
      inYear(student(3, "Elena", gap), "Year 2"),
      inYear(student(4, "Cait Sith", gap), "Year 10"),
      inYear(student(5, "Red XIII", gap), "Pre-Primary"),
      inYear(student(6, "Yuffie Kisaragi", gap), "Kindy"),
    ]),
  ];
  assert.deepEqual(A.inconsistencies(days).map((r) => [r.date, r.name]), [
    [WED, "Yuffie Kisaragi"], [WED, "Red XIII"], [WED, "Elena"], [WED, "Cait Sith"], [WED, "Rude"], ["2026/10/13", "Reno"],
  ]);
});

// A school with 3 periods. The P1 rolls cover every student, so P2 and P3 aren't opened.
test("loadInconsistencyRange opens one period's rolls when they cover everyone", async () => {
  const hhmm = (d) => d.toISOString().slice(11, 16).replace(":", "");
  const timeline = (ids) => PERIODS.slice(0, 3).map((p, i) => ({
    name: p.name, start: p.start.toISOString(), finish: p.finish.toISOString(), extendedStatus: { id: ids[i] },
  }));
  const p1 = `14102026${hhmm(PERIODS[0].start)}`;
  const rolls = {
    [`7${p1}`]: [{ uid: 1, userTimeLinePeriods: timeline([480, 510, 480]) }, { uid: 2, userTimeLinePeriods: timeline([480, 480, 510]) }],
    [`8${p1}`]: [{ uid: 3, userTimeLinePeriods: timeline([480, 590, 480]) }],
  };
  const gridLine = (userId, reportName) => ({ userId, reportName, isActive: true, yearLevelString: "Year 9",
    days: [{ date: WED, amExtendedStatusIdRaw: 480, pmExtendedStatusIdRaw: 480 }] });
  const calls = mockFetch({
    GetUserIdsBySearchApiQuery: () => ({ d: { success: true, data: [1, 2, 3] } }),
    "/graphql/": (body) => {
      assert.match(body.query, /reportName/);
      return { data: { currentOrganisation: { halfDaySummaryGridLinesByWeekStart: [
        gridLine(1, "Cloud Strife"), gridLine(2, "Tifa Lockhart"), gridLine(3, "Barret Wallace")] } } };
    },
    GetAllActivePeriodStructures: () => ({ d: [{ id: 1, name: "Midgar Academy", isDefault: true, cycleLength: 5 }] }),
    GetPeriodDaysBySelectedPeriodStructure: () => ({ d: [{ id: 10, d: 1 }] }),
    GetAllPeriodsForStructure: () => ({ d: PERIODS.slice(0, 3).map((p, i) => ({
      n: p.name, pn: i + 1, s: p.start.toISOString(), f: p.finish.toISOString(), pdid: 10 })) }),
    GetCalendarDataForPeriodStructure: () => ({ d: null }),
    GetSubjectsInAcademicGroup: () => ({ d: { data: [{ id: 1 }] } }),
    GetStandardClassesOfSubject: () => ({ d: { data: [
      { id: 7, start: "2026-01-01T00:00:00", finish: "2026-12-31T00:00:00" },
      { id: 8, start: "2026-01-01T00:00:00", finish: "2026-12-31T00:00:00" },
    ] } }),
    GetRollPackage: (body) => {
      const data = rolls[body.instanceId];
      return data ? { d: { success: true, data: { start: PERIODS[0].start.toISOString(), rollData: data } } } : { d: { success: false } };
    },
  });
  const events = [];
  const res = await A.loadInconsistencyRange([new Date(2026, 9, 14)], { now: new Date(2026, 9, 15, 9, 0), onProgress: (p) => events.push(p) });
  // The page shows each step: the student list, the grid, the subjects, each period's rolls and the day.
  assert.deepEqual(events.find((e) => e.phase === "students" && e.count != null).count, 3);
  assert.deepEqual(events.filter((e) => e.phase === "grid").map((e) => e.done), [0, 1]);
  assert.ok(events.some((e) => e.phase === "classes" && e.done === 1 && e.total === 1));
  const lastRolls = events.filter((e) => e.phase === "rolls").pop();
  assert.deepEqual([lastRolls.found, lastRolls.expected, lastRolls.done, lastRolls.total], [3, 3, 6, 6]);
  const done = events.find((e) => e.phase === "day" && e.state === "done");
  assert.deepEqual([done.students, done.rolls, done.stoppedAfter], [3, 2, "P1"]);
  assert.deepEqual(res.errors, []);
  assert.equal(res.days.length, 1);
  assert.equal(res.days[0].mode, "period");
  const opened = calls.filter((c) => c.url.includes("GetRollPackage")).map((c) => c.body.instanceId).sort();
  assert.deepEqual(opened, [`7${p1}`, `8${p1}`]);
  assert.deepEqual(found(A.inconsistencies(res.days)), [["Cloud Strife", [1]]]);
  assert.deepEqual(found(A.inconsistencies(res.days, { absences: "all" })), [["Barret Wallace", [1]], ["Cloud Strife", [1]]]);
});

test("loadInconsistencyRange stops between days when asked, and skips days with no school", async () => {
  mockFetch({
    GetUserIdsBySearchApiQuery: () => ({ d: { success: true, data: [] } }),
    "/graphql/": () => ({ data: { currentOrganisation: { halfDaySummaryGridLinesByWeekStart: [] } } }),
  });
  let stop = false;
  const events = [];
  const res = await A.loadInconsistencyRange([new Date(2026, 9, 17), new Date(2026, 9, 18)], {
    onProgress: (p) => { events.push(p); if (p.phase === "day" && p.state !== "busy") stop = true; },
    stopped: () => stop,
  });
  assert.equal(res.stopped, true);
  assert.deepEqual(events.filter((e) => e.phase === "day").map((e) => [e.date, e.state]), [["2026/10/17", "busy"], ["2026/10/17", "skip"]]);
});

test("teacherText reads Compass's teacher HTML, with relief teachers", () => {
  assert.equal(A.teacherText("cstrife"), "cstrife");
  assert.equal(A.teacherText("<s>(cstrife) Cloud STRIFE</s>&nbsp; (bwallace) Barret WALLACE"), "(bwallace) Barret WALLACE (relief for (cstrife) Cloud STRIFE)");
  assert.equal(A.teacherText(""), "");
});

// Who marked each period: the student's classes that day, then each class roll's last save.
test("loadMarkings finds the class of each period and who last saved its roll", async () => {
  const halves = [{ name: "AM", start: at(8, 45), finish: at(12, 0) }, { name: "PM", start: at(12, 40), finish: at(15, 0) }];
  const calls = mockFetch({
    GetDailySummaryForTimeline: () => ({ d: [
      { instanceId: "AM-ROLL", name: "Seventh Heaven", manager: "<s>tlockhart</s>&nbsp;cstrife", rollMarked: true, priority: 10,
        start: at(8, 45).toISOString(), finish: at(12, 0).toISOString() },
      { instanceId: "ASSEMBLY", name: "Sector 7 assembly", manager: "rude", rollMarked: false, priority: 1,
        start: at(9, 0).toISOString(), finish: at(9, 30).toISOString() },
      { instanceId: "PM-ROLL", name: "Seventh Heaven", manager: "cstrife", rollMarked: false, priority: 10,
        start: at(12, 40).toISOString(), finish: at(15, 0).toISOString() },
    ] }),
    GetRollPackage: (body) => ({ d: { success: true, data: { activityName: "Seventh Heaven", rollData: [],
      previousMarkings: body.instanceId === "AM-ROLL" ? [
        { n: "Tifa Lockhart (tlockhart)", dt: new Date(Date.UTC(2026, 9, 14, 0, 50)).toISOString(), isReset: false },
        { n: "Cloud Strife (cstrife)", dt: new Date(Date.UTC(2026, 9, 14, 3, 42)).toISOString(), isReset: false },
        { n: "Reno (reno)", dt: new Date(Date.UTC(2026, 9, 14, 4, 0)).toISOString(), isReset: true },
      ] : [] } } }),
  });
  const [am, pm] = await A.loadMarkings(7, WED, halves);
  assert.deepEqual([am.className, am.teacher, am.by, am.saves], ["Seventh Heaven", "cstrife (relief for tlockhart)", "Cloud Strife", 2]);
  assert.equal(am.at.getHours() * 60 + am.at.getMinutes(), 11 * 60 + 42); // 11:42am Perth
  assert.deepEqual([pm.by, pm.rollMarked], [undefined, false]);
  const summary = calls.find((c) => c.url.includes("GetDailySummaryForTimeline")).body;
  assert.deepEqual([summary.userId, summary.date], [7, new Date(2026, 9, 14).toISOString()]);
  // Cached: asking again sends no requests.
  const before = calls.length;
  await A.loadMarkings(7, WED, halves);
  assert.equal(calls.length, before);
});

test("order = last sorts each year group by surname", () => {
  const gap = ["pres", "abs", "pres"];
  const named = (id, name, lastName) => ({ ...student(id, name, gap), lastName });
  const days = [day([
    named(1, "Tifa Lockhart", "Lockhart"),
    named(2, "Barret Wallace", "Wallace"),
    named(3, "Aerith Gainsborough", "Gainsborough"),
    { ...student(4, "Vincent Valentine", gap) }, // no lastName: the last word of the name
  ])];
  assert.deepEqual(A.inconsistencies(days).map((r) => r.name), ["Aerith Gainsborough", "Barret Wallace", "Tifa Lockhart", "Vincent Valentine"]);
  assert.deepEqual(A.inconsistencies(days, { order: "last" }).map((r) => r.name), ["Aerith Gainsborough", "Tifa Lockhart", "Vincent Valentine", "Barret Wallace"]);
});
