// The custom timetable and the period helpers in src/shared/periods.js.
const test = require("node:test");
const assert = require("node:assert/strict");
require("./load.js");
const P = globalThis.CompassPeriods;

const row = (name, start, finish, kind = "class") => ({ name, start, finish, kind });

test("validRow needs a name and a finish after the start", () => {
  assert.equal(P.validRow(row("Literacy", "08:45", "09:45")), true);
  assert.equal(P.validRow(row(" ", "08:45", "09:45")), false);
  assert.equal(P.validRow(row("Literacy", "09:45", "09:45")), false);
  assert.equal(P.validRow(row("Literacy", "9:45", "")), false);
});

test("rowsFor uses a day's own timetable, else Mon–Fri, and nothing at the weekend", () => {
  const custom = { all: [row("Literacy", "08:45", "09:45")], days: { 3: [row("Assembly", "08:45", "09:15")] } };
  assert.equal(P.rowsFor(custom, new Date(2026, 9, 13))[0].name, "Literacy"); // Tuesday
  assert.equal(P.rowsFor(custom, new Date(2026, 9, 14))[0].name, "Assembly"); // Wednesday
  assert.deepEqual(P.rowsFor(custom, new Date(2026, 9, 17)), []);            // Saturday
});

test("fromRows sorts by start, drops rows that aren't valid and keeps breaks", () => {
  const day = new Date(2026, 9, 13);
  const out = P.fromRows([row("Recess", "10:45", "11:05", "break"), row("Literacy", "08:45", "09:45"), row("", "12:00", "13:00")], day);
  assert.deepEqual(out.map((p) => [p.name, p.kind, p.start.getHours(), p.start.getMinutes()]), [["Literacy", "class", 8, 45], ["Recess", "break", 10, 45]]);
});

test("current finds the period on now, the next one and the one before", () => {
  const day = new Date(2026, 9, 13);
  const periods = P.fromRows([row("AM", "08:45", "12:00"), row("PM", "12:40", "15:00")], day);
  const at = (h, m) => new Date(2026, 9, 13, h, m);
  const names = (r) => [r.current?.name ?? null, r.next?.name ?? null, r.previous?.name ?? null];
  assert.deepEqual(names(P.current(periods, at(8, 0))), [null, "AM", null]);
  assert.deepEqual(names(P.current(periods, at(10, 0))), ["AM", "PM", null]);
  assert.deepEqual(names(P.current(periods, at(12, 20))), [null, "PM", "AM"]);
  assert.deepEqual(names(P.current(periods, at(15, 30))), [null, null, "PM"]);
});
