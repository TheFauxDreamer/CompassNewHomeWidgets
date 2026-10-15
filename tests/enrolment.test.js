// The Enrolment widget's counts in src/widgets/enrolment.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");
load("src/widgets/enrolment.js");
const E = globalThis.CompassEnrolmentUI;

test("countBy sorts classes in natural order and puts students with no class last", () => {
  const roster = [{ form: "Room 10" }, { form: "Room 2" }, { form: "" }, { form: "Room 2" }];
  assert.deepEqual(E.countBy(roster, "form", "No class"), [
    { name: "Room 2", count: 2 }, { name: "Room 10", count: 1 }, { name: "No class", count: 1 },
  ]);
});

test("countBy sorts year groups in school order", () => {
  const roster = ["Year 2", "Kindergarten", "Year 10", "Pre Primary"].map((year) => ({ year }));
  assert.deepEqual(E.countBy(roster, "year", "No year level").map((g) => g.name), ["Kindergarten", "Pre Primary", "Year 2", "Year 10"]);
});

test("each faction gets the colour in its name, and the others a fixed colour each", () => {
  const c = E.factionColours(["Blue", "Cosmo Canyon", "Red Lions", "Wutai"]);
  assert.equal(c.get("Blue"), "#2A6FD6");
  assert.equal(c.get("Red Lions"), "#D63B3B");
  assert.notEqual(c.get("Cosmo Canyon"), c.get("Wutai"));
});
