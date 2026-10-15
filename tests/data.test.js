// The attendance counting in src/widgets/attendance/data.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, mockFetch, msDate } = require("./load.js");
load("src/widgets/attendance/data.js");
const A = globalThis.CompassAttendance;

// A student line of the half-day grid. days: { "2026/10/13": [amId, pmId] }; 470 = Not Marked.
function line(userId, year, days, extra = {}) {
  return {
    userId, isActive: true, yearLevelString: year, ...extra,
    days: Object.entries(days).map(([date, [am, pm]]) => ({
      date,
      amExtendedStatusIdRaw: am, amStatusPeriodCalcNotMarked: am === 470,
      pmExtendedStatusIdRaw: pm, pmStatusPeriodCalcNotMarked: pm === 470,
    })),
  };
}
const TUE = "2026/10/13";

test("tally puts each code in its group", () => {
  const students = [
    line(1, "Year 1", { [TUE]: [480, 480] }), // Present
    line(2, "Year 1", { [TUE]: [490, 480] }), // Late Explained: present
    line(3, "Year 2", { [TUE]: [520, 520] }), // Educational Activity: excursion
    line(4, "Year 2", { [TUE]: [590, 590] }), // Notified as Sick: approved
    line(5, "Year 3", { [TUE]: [510, 510] }), // Unexplained: unapproved
    line(6, "Year 3", { [TUE]: [470, 470] }), // Not marked
    line(7, "Year 3", { [TUE]: [530, 530] }), // Not required to attend: not counted
    line(8, "Year 3", { [TUE]: [999, 999] }), // a code we don't know
    line(9, "Kindergarten", {}),              // no record today (kindy day off)
  ];
  const r = A.tally(students, TUE, "am");
  assert.deepEqual(r.counts, { present: 2, offsite: 1, approved: 1, unapproved: 1, unmarked: 1, excluded: 1, unknown: 1 });
  assert.equal(r.total, 6);  // excluded, unknown and no record are left out
  assert.equal(r.marked, 5);
  assert.equal(r.unknownCodes.length, 1);
});

test("tally counts students in an unmarked roll as Not marked, but never a Q code", () => {
  const students = [line(1, "Year 1", { [TUE]: [480, 480] }), line(2, "Year 1", { [TUE]: [530, 530] })];
  const r = A.tally(students, TUE, "am", new Set([1, 2]));
  assert.equal(r.counts.unmarked, 1);
  assert.equal(r.counts.present, 0);
  assert.equal(r.counts.excluded, 1);
});

test("summarise shows today's AM until more than 100 students have a PM mark", () => {
  const now = new Date(2026, 9, 13, 13, 0);
  const few = Array.from({ length: 50 }, (_, i) => line(i, "Year 1", { [TUE]: [480, 480] }));
  assert.equal(A.summarise(few, now).half, "am");
  const many = Array.from({ length: 150 }, (_, i) => line(i, "Year 1", { [TUE]: [480, 480] }));
  assert.equal(A.summarise(many, now).half, "pm");
});

test("summarise falls back to the last session with marks", () => {
  const now = new Date(2026, 9, 17, 10, 0); // Saturday
  const students = [line(1, "Year 1", { "2026/10/16": [480, 470], "2026/10/15": [480, 480] })];
  assert.deepEqual([A.summarise(students, now).date, A.summarise(students, now).half], ["2026/10/16", "am"]);
});

test("instanceIds uses the UTC start time, and both dates when they differ", () => {
  assert.deepEqual(A.instanceIds(7, new Date(2026, 1, 2, 8, 30)), ["7020220260030"]);
  assert.deepEqual(A.instanceIds(7, new Date(2026, 1, 2, 7, 0)), ["7010220262300", "7020220262300"]);
});

// The AM unmarked bug: Compass sent the roll's start only as "/Date()/" in `start`, the
// timeline times in another format than the roll's, and no status for students in a roll
// that no one had opened. All of them must still count as Not marked.
test("unmarkedStudents finds the students in an unmarked AM roll", async () => {
  const now = new Date(2026, 9, 15, 10, 0);
  const am = new Date(2026, 9, 15, 8, 45), pm = new Date(2026, 9, 15, 12, 30), end = new Date(2026, 9, 15, 15, 0);
  const timeline = (amStatus) => [
    { name: "AM Roll", start: msDate(am), finish: msDate(pm), ...amStatus },
    { name: "PM Roll", start: msDate(pm), finish: msDate(end) },
  ];
  mockFetch({
    GetAllUnmarkedRolls: () => ({ d: { total: 2, data: [
      { id: "7151020260045", start: msDate(am) },                          // started: checked
      { id: "7151020260430", s: new Date(2026, 9, 15, 12, 30).toISOString() }, // not started yet
    ] } }),
    GetRollPackage: () => ({ d: { success: true, data: { start: am.toISOString(), rollData: [
      { uid: 11, userTimeLinePeriods: timeline({}) },                                   // no status at all
      { uid: 12, userTimeLinePeriods: timeline({ extendedStatus: { id: 470 } }) },       // Not Marked
      { uid: 13, userTimeLinePeriods: timeline({ extendedStatus: { id: 480 } }) },       // Present
    ] } } }),
  });
  const r = await A.unmarkedStudents(now);
  assert.deepEqual([...r.am].sort(), [11, 12]);
  assert.deepEqual([...r.pm], []);
  assert.deepEqual([r.rolls, r.opened, r.failed], [1, 1, 0]);
});

test("unmarkedStudents counts a roll that Compass can't open", async () => {
  mockFetch({
    GetAllUnmarkedRolls: () => ({ d: { total: 1, data: [{ id: "x", s: new Date(2026, 9, 15, 8, 45).toISOString() }] } }),
    GetRollPackage: () => ({ d: { success: false } }),
  });
  const r = await A.unmarkedStudents(new Date(2026, 9, 15, 10, 0));
  assert.deepEqual([r.rolls, r.opened, r.am.size], [1, 0, 0]);
});

test("loadRoster gives each active student's year, class and faction", async () => {
  mockFetch({
    GetUserIdsBySearchApiQuery: () => ({ d: { success: true, data: [1, 2, 3] } }),
    "/graphql/": () => ({ data: { currentOrganisation: { halfDaySummaryGridLinesByWeekStart: [
      line(1, "Year 1", {}, { formGroup: "Sector 7", houseGroup: "Red" }),
      line(2, "", {}, { formGroup: " Seventh Heaven ", houseGroup: "" }),
      line(3, "Year 2", {}, { isActive: false, formGroup: "Wutai", houseGroup: "Blue" }),
    ] } } }),
  });
  assert.deepEqual(await A.loadRoster(new Date(2026, 9, 15)), [
    { userId: 1, year: "Year 1", form: "Sector 7", house: "Red" },
    { userId: 2, year: "No year level", form: "Seventh Heaven", house: "" },
  ]);
});

test("enrolment explains the students who aren't counted", () => {
  const students = [
    line(1, "Year 1", { [TUE]: [480, 480] }),
    line(2, "Year 1", { [TUE]: [530, 530] }), // Q
    line(3, "Kindergarten", {}),              // day off: no record
    line(4, "Kindergarten", {}),
    line(5, "Year 2", { [TUE]: [999, 999] }), // unknown code
  ];
  const r = A.tally(students, TUE, "am");
  const e = A.enrolment(students.length, { ...r.counts, total: r.total });
  assert.deepEqual(e, { enrolled: 5, counted: 1, notExpected: 1, unmapped: 1, noRecord: 2 });
  assert.match(A.enrolmentNote(e), /^1 of 5 enrolled .*1 not expected.*2 with no record.*1 with a code/);
  assert.equal(A.enrolmentNote(A.enrolment(1, { total: 1 })), "");
});

test("trendSessions keeps marked past sessions, today's AM once marked, and today's PM past the threshold", () => {
  const now = new Date(2026, 9, 14, 13, 0); // Wednesday afternoon
  const students = Array.from({ length: 120 }, (_, i) => line(i, "Year 1", {
    "2026/10/12": [470, 470],        // Monday: no school, nothing marked
    [TUE]: [480, 510],
    "2026/10/14": [480, i < 50 ? 480 : 470], // today: only 50 PM marks so far
    "2026/10/15": [600, 600],        // tomorrow: a pre-entered vacation, never shown
  }));
  assert.deepEqual(A.trendSessions(students, now), [
    { date: TUE, half: "am" }, { date: TUE, half: "pm" }, { date: "2026/10/14", half: "am" },
  ]);
});

test("loadTrend merges this week and last week for each active student", async () => {
  const calls = mockFetch({
    GetUserIdsBySearchApiQuery: () => ({ d: { success: true, data: [1, 2] } }),
    "/graphql/": (body) => ({ data: { currentOrganisation: { halfDaySummaryGridLinesByWeekStart:
      body.variables.weekStart === "2026/10/12"
        ? [line(1, "Year 1", { [TUE]: [480, 480] }), line(2, "Year 1", { [TUE]: [510, 510] }, { isActive: false })]
        : [line(1, "Year 1", { "2026/10/09": [490, 480] }), line(2, "Year 1", { "2026/10/09": [480, 480] })] } } }),
  });
  const r = await A.loadTrend(new Date(2026, 9, 14, 9, 0));
  assert.deepEqual(calls.filter((c) => c.url.includes("graphql")).map((c) => c.body.variables.weekStart).sort(), ["2026/10/05", "2026/10/12"]);
  assert.equal(r.students.length, 1);
  assert.deepEqual(r.students[0].days.map((d) => d.date).sort(), ["2026/10/09", TUE]);
  assert.deepEqual(r.sessions.map((x) => x.date + x.half), ["2026/10/09am", "2026/10/09pm", "2026/10/13am", "2026/10/13pm"]);
});

test("a code that STATUSES doesn't list is grouped by the grid's colour, and marked auto", () => {
  const withColour = (id, uid, colour) => {
    const l = line(uid, "Year 1", { [TUE]: [id, id] });
    l.days[0].amStatus = colour;
    l.days[0].amStatusName = "Cosmo Canyon Camp";
    l.days[0].amStatusExportIdentifier = "J";
    return l;
  };
  const r = A.tally([withColour(901, 1, "GREEN"), withColour(902, 2, "ORANGE"), withColour(903, 3, null), withColour(510, 4, "ORANGE")], TUE, "am");
  // 510 is in STATUSES: its policy group (unapproved) wins over the colour.
  assert.deepEqual([r.counts.present, r.counts.approved, r.counts.unapproved, r.counts.unknown], [1, 1, 1, 1]);
  assert.deepEqual(r.autoCodes.map((a) => [a.group, a.count]).sort(), [["approved", 1], ["present", 1]]);
  assert.equal(r.unknownCodes.length, 1); // no colour: still unmapped
});

test("schoolCodeList gives the school's codes, with the group from STATUSES or null", async () => {
  mockFetch({
    "/graphql/": (body) => {
      assert.equal(body.operationName, "GetExtendedStatuses");
      return { data: { currentOrganisation: { extendedStatuses: [
        { id: "x1", extendedStatusIdRaw: "480", schoolSystemExportIdentifier: "/", name: "Present" },
        { id: "x2", extendedStatusIdRaw: "510", schoolSystemExportIdentifier: "U", name: "Not Present Unexplained" },
        { id: "x3", extendedStatusIdRaw: "901", schoolSystemExportIdentifier: "J", name: "Cosmo Canyon Camp" },
      ] } } };
    },
  });
  assert.deepEqual(await A.schoolCodeList(), [
    { id: 480, code: "/", name: "Present", group: "present" },
    { id: 510, code: "U", name: "Not Present Unexplained", group: "unapproved" },
    { id: 901, code: "J", name: "Cosmo Canyon Camp", group: null },
  ]);
  // Once loaded, the per-code chart uses the school's own names.
  const r = A.tally([line(1, "Year 1", { [TUE]: [510, 510] })], TUE, "am");
  assert.equal(r.byCode[0].name, "Not Present Unexplained");
});
