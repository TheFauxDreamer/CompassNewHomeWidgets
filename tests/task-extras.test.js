// The due-date colours of Compass's My Tasks widget, in src/homepage/task-extras.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, msDate } = require("./load.js");
load("src/homepage/task-extras.js");
const { parseDue, dueLevel, dueText } = globalThis.CompassTaskExtras;

const THU = new Date(2026, 9, 15, 14, 30); // Thursday 15 Oct 2026, 2:30pm
const day = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()] : null);

test("parseDue reads the Compass and display formats as a local date", () => {
  assert.deepEqual(day(parseDue(msDate(new Date(2026, 9, 20, 0, 0)))), [2026, 10, 20, 0]);
  assert.deepEqual(day(parseDue("2026-10-20")), [2026, 10, 20, 0]);
  assert.deepEqual(day(parseDue("2026-10-20T00:00:00")), [2026, 10, 20, 0]); // never moves a day
  assert.deepEqual(day(parseDue("2026-10-19T16:00:00Z")), [2026, 10, 20, 0]); // midnight in Perth
  assert.deepEqual(day(parseDue("20/10/2026")), [2026, 10, 20, 0]);
  assert.deepEqual(day(parseDue("20/10/26")), [2026, 10, 20, 0]);
  assert.deepEqual(day(parseDue("Tue 20/10", THU)), [2026, 10, 20, 0]);
  assert.deepEqual(day(parseDue("20 Oct 2026")), [2026, 10, 20, 0]);
  assert.deepEqual(day(parseDue("20 October", THU)), [2026, 10, 20, 0]);
});

test("parseDue gives null for an empty cell or text that isn't a date", () => {
  for (const v of [null, undefined, "", " ", " ", "Midgar", "31/02/2026", "45 Oct", "Sector 7"]) assert.equal(parseDue(v), null, String(v));
});

test("dueLevel: overdue, today, the next 2 school days, or nothing", () => {
  const on = (m, d) => new Date(2026, m - 1, d);
  assert.equal(dueLevel(on(10, 14), THU), "overdue");
  assert.equal(dueLevel(on(10, 15), THU), "today");
  assert.equal(dueLevel(on(10, 16), THU), "soon");  // Friday
  assert.equal(dueLevel(on(10, 18), THU), "soon");  // Sunday, before the 2nd school day
  assert.equal(dueLevel(on(10, 19), THU), "soon");  // Monday: the 2nd school day, across the weekend
  assert.equal(dueLevel(on(10, 20), THU), null);    // Tuesday: the 3rd school day
  assert.equal(dueLevel(on(12, 1), THU), null);
  assert.equal(dueLevel(null, THU), null);
});

test("dueText says how late or how soon", () => {
  assert.equal(dueText(new Date(2026, 9, 13), THU), "Overdue by 2 days");
  assert.equal(dueText(new Date(2026, 9, 14), THU), "Overdue by 1 day");
  assert.equal(dueText(new Date(2026, 9, 15), THU), "Due today");
  assert.equal(dueText(new Date(2026, 9, 19), THU), "Due Mon 19 Oct");
  assert.equal(dueText(null, THU), "");
});
