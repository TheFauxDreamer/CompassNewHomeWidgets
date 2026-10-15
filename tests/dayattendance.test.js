// The On site line in src/widgets/dayattendance.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");
load("src/widgets/dayattendance.js");
const D = globalThis.CompassDayAttendanceUI;

const at = (h, m = 0) => new Date(2026, 9, 15, h, m);
const periods = [{ start: at(8, 45) }, { start: at(12, 40) }];
const st = (am, pm) => ({ statuses: [am && { category: am }, pm && { category: pm }] });

test("students come on site at the first roll, with late arrivals and early departures", () => {
  const students = [
    { userId: 1, ...st("present", "present") },   // here all day
    { userId: 2, ...st("unapproved", "present") }, // arrives late at 10:00
    { userId: 3, ...st("present", "approved") },   // leaves at 11:00
    { userId: 4, ...st("offsite", "offsite") },    // excursion: never on site
    { userId: 5, ...st("approved", "present") },   // absent AM, no arrival recorded: on site from PM
  ];
  const moves = new Map([[2, [{ type: "arrival", time: at(10) }]], [3, [{ type: "departure", time: at(11) }]]]);
  const changes = D.onSiteChanges(students, periods, moves);
  const count = (t) => D.samples(changes, at(8, 45).getTime(), t.getTime()).pop().count;
  assert.equal(count(at(9)), 2);
  assert.equal(count(at(10, 30)), 3);
  assert.equal(count(at(11, 30)), 2);
  assert.equal(count(at(13)), 3);
});

test("samples gives one point every 5 minutes", () => {
  const pts = D.samples([], at(9).getTime(), at(9, 30).getTime());
  assert.equal(pts.length, 7);
  assert.equal(pts[1].time.getMinutes(), 5);
});
