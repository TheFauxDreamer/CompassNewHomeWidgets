// The Unmarked Rolls list in src/widgets/unmarked.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");
load("src/widgets/unmarked.js");
const U = globalThis.CompassUnmarked;

test("parseTeacher reads a teacher, a relief teacher, and a roll with everyone struck through", () => {
  assert.deepEqual(U.parseTeacher("(cstrife) Cloud STRIFE"), { code: "cstrife", name: "Cloud STRIFE", covering: [] });
  assert.deepEqual(U.parseTeacher("<s>(cstrife) Cloud STRIFE</s>&nbsp; (bwallace) Barret WALLACE"),
    { code: "bwallace", name: "Barret WALLACE", covering: [{ code: "cstrife", name: "Cloud STRIFE" }] });
  assert.deepEqual(U.parseTeacher("<s>(tlockhart) Tifa LOCKHART</s>"), { code: "tlockhart", name: "Tifa LOCKHART", covering: [] });
});

test("summarise lists rolls 10 minutes after they start, by teacher, with the year filter", () => {
  const now = new Date(2026, 9, 15, 9, 0);
  const roll = (id, h, m, teacher, yl) => ({ id, s: new Date(2026, 9, 15, h, m).toISOString(), f: new Date(2026, 9, 15, h + 1, m).toISOString(), n: "Sector 7", p: "1", m: teacher, yl });
  const items = [
    roll(1, 8, 30, "(cstrife) Cloud STRIFE", "Year 1"),
    roll(2, 8, 40, "(cstrife) Cloud STRIFE", "Year 2"),
    roll(3, 8, 45, "(bwallace) Barret WALLACE", "Year 1"),
    roll(4, 8, 55, "(tlockhart) Tifa LOCKHART", "Year 1"), // started 5 min ago: not yet
    { ...roll(5, 8, 0, "(reno) Reno", "Year 1"), s: new Date(2026, 9, 14, 8, 0).toISOString() }, // yesterday
  ];
  const all = U.summarise(items, now);
  assert.equal(all.total, 3);
  assert.deepEqual(all.teachers.map((t) => [t.code, t.rolls.length]), [["cstrife", 2], ["bwallace", 1]]);
  const y1 = U.summarise(items, now, 10, ["Year 1"]);
  assert.deepEqual([y1.total, y1.otherYears], [2, 1]);
});
