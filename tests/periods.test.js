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

// --- the school timetable in a Compass News post -------------------------------------------
{
  const { mockFetch, store } = require("./load.js");
  const timetable = { all: [row("Literacy", "08:45", "09:45"), row("Recess", "10:45", "11:05", "break")], days: {} };
  const newsItem = (Title, Content1) => ({ NewsItemId: Title, Title, Content1, Content2: "" });

  test("the News timetable comes from the newest expired post with a code, with HTML around it", async () => {
    const code = P.encodeCode(timetable);
    const calls = mockFetch({
      "Newsfeed.svc/GetAllExpiredNewsItems": () => ({ d: { total: 3, data: [
        newsItem("Sports carnival at Midgar Academy", "<p>Bring a hat.</p>"),
        newsItem("Period timetable", `<p>For the widget:</p><p>${code}</p><p>Thanks, Tifa Lockhart</p>`),
        newsItem("Period timetable (old)", `<p>${P.encodeCode({ all: [row("AM", "08:45", "12:00")], days: {} })}</p>`),
      ] } }),
    });
    const t = await P.newsTimetable({ fresh: true });
    assert.equal(t.title, "Period timetable");
    assert.deepEqual(t.custom, timetable);
    assert.equal(calls.length, 1);
    assert.deepEqual(store.get("newsPeriods").custom, timetable);
  });

  test("the News source shows the post's timetable, and keeps it when Compass can't be read", async () => {
    store.set("periodSource", "news");
    const res = await P.display(new Date(2026, 9, 13)); // Tuesday
    assert.equal(res.source, "news");
    assert.deepEqual(res.periods.map((p) => p.name), ["Literacy", "Recess"]);
    mockFetch({ "Newsfeed.svc": () => { throw new Error("offline"); } });
    store.set("newsPeriods", { ...store.get("newsPeriods"), checked: 0 }); // too old: ask again
    const t = await P.newsTimetable({ fresh: false });
    assert.deepEqual(t.custom, timetable);
    store.delete("periodSource");
  });

  test("the News lookup pages through expired posts, then says when there is no post", async () => {
    const calls = mockFetch({
      "Newsfeed.svc/GetAllExpiredNewsItems": (body) => ({ d: { total: 600, data: body.start === 0
        ? Array.from({ length: 500 }, (_, i) => newsItem(`Post ${i}`, "<p>Kalm excursion</p>"))
        : [newsItem("Rocket Town visit", "<p>No code here</p>")] } }),
    });
    await assert.rejects(P.newsTimetable({ fresh: true }), /no post with a timetable code/);
    assert.deepEqual(calls.map((c) => c.body.start), [0, 500]);
  });

  test("a damaged code in the News post gives a message", async () => {
    mockFetch({ "Newsfeed.svc/GetAllExpiredNewsItems": () => ({ d: { total: 1, data: [newsItem("Period timetable", "<p>CPT1.abc</p>")] } }) });
    await assert.rejects(P.newsTimetable({ fresh: true }), /"Period timetable" doesn't work: The code is damaged/);
  });
}
