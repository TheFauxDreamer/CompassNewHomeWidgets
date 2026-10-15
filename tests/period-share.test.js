// The timetable share code in src/widgets/period.js ("Copy timetable code" / "Paste a code").
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");
load("src/widgets/period.js");
const { encodeShare, decodeShare } = globalThis.CompassPeriodUI;
const { validRow } = globalThis.CompassPeriods;

const timetable = {
  all: [
    { name: "Literacy", start: "08:45", finish: "09:45", kind: "class" },
    { name: "Recess", start: "10:45", finish: "11:05", kind: "break" },
  ],
  days: { 3: [{ name: "Assembly · Seventh Heaven", start: "08:45", finish: "09:15", kind: "class" }] },
};

test("a timetable survives the share code, with breaks, days and non-English text", () => {
  const code = encodeShare(timetable);
  assert.match(code, /^CPT1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(code, validRow), timetable);
});

test("spaces and line breaks in a pasted code are ignored", () => {
  const code = encodeShare(timetable);
  assert.deepEqual(decodeShare(`  ${code.slice(0, 10)}\n${code.slice(10)} `, validRow), timetable);
});

test("a bad code gives a message for the user", () => {
  assert.throws(() => decodeShare("", validRow), /Paste a code first/);
  assert.throws(() => decodeShare("hello", validRow), /isn't a timetable code/);
  assert.throws(() => decodeShare("CPT1.!!!", validRow), /damaged or incomplete/);
  assert.throws(() => decodeShare(encodeShare(timetable).slice(0, -6), validRow), /damaged or incomplete/);
  assert.throws(() => decodeShare(encodeShare({ all: [], days: {} }), validRow), /no periods/);
});
