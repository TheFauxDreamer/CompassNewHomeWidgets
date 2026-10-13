// The periods of a school day, for the Current Period widget.
//
// Two sources:
//   - Compass: the Period Structures of the school. In a primary school this is often
//     only AM and PM.
//   - Custom: a timetable that the user types in the widget. Use it when the teaching
//     timetable is different from the Compass structure (for example, a primary school
//     that marks AM/PM rolls but teaches Literacy, Recess, Numeracy, Lunch…).
// The custom timetable is for display only. Attendance never uses it.
//
// A period is { name, start: Date, finish: Date, kind: "class" | "break" }.
globalThis.CompassPeriods = (() => {
  // The Compass request for Period Structures is not known yet (it needs a HAR file).
  // Until then, only the custom timetable works.
  const COMPASS_AVAILABLE = false;

  const SOURCE_KEY = "periodSource";  // "compass" | "custom"
  const CUSTOM_KEY = "customPeriods"; // { all: [row], days: { "1": [row], … "5": [row] } }
  // A saved row: { name, start: "08:45", finish: "09:45", kind: "class" | "break" }.
  // `all` is for Monday to Friday. A weekday in `days` (1 = Monday) has its own timetable.

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

  const at = (day, hm) => {
    const m = HM.exec(hm || "");
    return m ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(m[1]), Number(m[2])) : null;
  };

  // A row with a name and a finish after its start.
  const validRow = (r) => !!(r && String(r.name || "").trim() && HM.test(r.start || "") && HM.test(r.finish || "") && r.finish > r.start);

  // The saved rows for the weekday of `date`: its own rows, or the Monday-to-Friday rows.
  function rowsFor(custom, date) {
    const d = date.getDay();
    const own = custom?.days?.[d];
    if (Array.isArray(own)) return own;
    return d >= 1 && d <= 5 && Array.isArray(custom?.all) ? custom.all : [];
  }

  function fromRows(rows, date) {
    return rows.filter(validRow)
      .map((r) => ({ name: String(r.name).trim(), start: at(date, r.start), finish: at(date, r.finish), kind: r.kind === "break" ? "break" : "class" }))
      .sort((a, b) => a.start - b.start);
  }

  async function compass(/* date */) {
    throw new Error("The Compass period structure isn't connected yet. Use a custom timetable.");
  }

  function settings() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get([SOURCE_KEY, CUSTOM_KEY], (r) => res({
          source: COMPASS_AVAILABLE && r?.[SOURCE_KEY] === "compass" ? "compass" : "custom",
          custom: r?.[CUSTOM_KEY] && typeof r[CUSTOM_KEY] === "object" ? r[CUSTOM_KEY] : { all: [], days: {} },
        }));
      } catch (_) { res({ source: "custom", custom: { all: [], days: {} } }); }
    });
  }

  // The periods to show for the day of `date`: { source, periods }.
  async function display(date) {
    const s = await settings();
    const periods = s.source === "compass" ? await compass(date) : fromRows(rowsFor(s.custom, date), date);
    return { source: s.source, periods };
  }

  // The next day after `date` that has periods (up to 2 weeks ahead), or null.
  async function nextDay(date) {
    for (let i = 1; i <= 14; i++) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
      const res = await display(d);
      if (res.periods.length) return { day: d, ...res };
    }
    return null;
  }

  // Where `now` is in the day: the period it is in, the next period and the one before.
  function current(periods, now = new Date()) {
    const cur = periods.find((p) => p.start <= now && now < p.finish) || null;
    const next = periods.find((p) => p.start > now) || null;
    const previous = [...periods].reverse().find((p) => p.finish <= now) || null;
    return { current: cur, next, previous };
  }

  const save = (values) => { try { chrome.storage.local.set(values); } catch (_) {} };
  const saveSource = (source) => save({ [SOURCE_KEY]: source });
  const saveCustom = (custom) => save({ [CUSTOM_KEY]: custom });

  // fn() runs when the source or the custom timetable changes. Gives a function that stops it.
  function onChange(fn) {
    const listener = (changes, area) => { if (area === "local" && (SOURCE_KEY in changes || CUSTOM_KEY in changes)) fn(); };
    try { chrome.storage.onChanged.addListener(listener); } catch (_) {}
    return () => { try { chrome.storage.onChanged.removeListener(listener); } catch (_) {} };
  }

  return {
    COMPASS_AVAILABLE, WEEKDAYS, display, nextDay, current, settings, saveSource, saveCustom, onChange,
    validRow, rowsFor, fromRows,
  };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassPeriods;
