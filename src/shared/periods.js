// The periods of a school day, for the Current Period widget.
//
// Two sources:
//   - Compass (the default): the school's default Period Structure for the year, from
//     Configure > Period Structures. In a primary school this is often only AM and PM.
//   - Custom: a timetable that the user types in the widget. Use it when the teaching
//     timetable is different from the Compass structure (for example, a primary school
//     that marks AM/PM rolls but teaches Literacy, Recess, Numeracy, Lunch…).
// The custom timetable is for display only. Attendance never uses it.
//
// A period is { name, start: Date, finish: Date, kind: "class" | "break" }.
globalThis.CompassPeriods = (() => {
  const COMPASS_AVAILABLE = true;

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

  // --- Compass period structure (the same calls as Configure > Period Structures) ------
  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    if (res.redirected || res.status === 401 || res.status === 403) {
      throw new Error("Compass didn't give the period structure. Check you're still logged in, or use a custom timetable.");
    }
    if (!res.ok) throw new Error(`Compass returned HTTP ${res.status}`);
    try { return await res.json(); }
    catch (_) { throw new Error("Compass returned something that wasn't JSON. Your session may have expired."); }
  }

  // "2025-01-01T00:30:00Z" -> "08:30" in local time. Compass keeps only the time of day
  // and puts it on a fixed date.
  const hm = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // The school's default structure for a year:
  //   { name, cycleLength, days: Map(cycle day -> rows), byPdid: Map(period day id -> rows),
  //     calendar: Map("20261014" -> { teaching, pdid, name }) or null }
  // Rows are like the custom rows, so fromRows() reads both. The calendar (Configure >
  // Period Structures > calendar) gives each date's cycle day and the days with no school.
  const structures = new Map(); // year -> promise
  function structure(year) {
    if (!structures.has(year)) {
      const promise = (async () => {
        const list = await post("/Services/ReferenceData.svc/GetAllActivePeriodStructures?sessionstate=readonly",
          { year, page: 1, start: 0, limit: 25 });
        const all = Array.isArray(list?.d) ? list.d : [];
        const s = all.find((x) => x.isDefault) || all[0];
        if (!s) throw new Error(`Compass has no period structure for ${year}.`);
        const [days, periods, cal] = await Promise.all([
          post("/Services/ReferenceData.svc/GetPeriodDaysBySelectedPeriodStructure", { year: String(year), periodStructureId: String(s.id) }),
          post("/Services/ReferenceData.svc/GetAllPeriodsForStructure", { structureId: s.id, year, page: 1, start: 0, limit: 500 }),
          // Without the calendar the widget can still work out simple structures (see compass()).
          post("/Services/ReferenceData.svc/GetCalendarDataForPeriodStructure", { year: String(year), periodStructureId: String(s.id) }).catch(() => null),
        ]);
        if (!Array.isArray(days?.d) || !Array.isArray(periods?.d)) throw new Error("Couldn't read the period structure from Compass.");
        const dayOf = new Map(days.d.map((x) => [x.id, Number(x.d)])); // period day id -> cycle day 1, 2, …
        const byDay = new Map(), byPdid = new Map();
        for (const p of [...periods.d].sort((a, b) => (a.pn ?? 0) - (b.pn ?? 0))) {
          const row = { name: String(p.n || `P${p.pn}`).trim(), start: hm(p.s), finish: hm(p.f), kind: "class" };
          if (!byPdid.has(p.pdid)) byPdid.set(p.pdid, []);
          byPdid.get(p.pdid).push(row);
          const day = dayOf.get(p.pdid);
          if (!day) continue;
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push(row);
        }
        const rows = Array.isArray(cal?.d?.d) ? cal.d.d : null;
        const calendar = rows && new Map(rows.map((r) => [String(r.dateEqualityProperty),
          { teaching: !!r.td, pdid: r.pdid, name: String(r.n || "").trim() }]));
        return { name: String(s.name || "Default"), cycleLength: Number(s.cycleLength) || byDay.size, days: byDay, byPdid, calendar };
      })();
      promise.catch(() => structures.delete(year)); // ask again after an error
      structures.set(year, promise);
    }
    return structures.get(year);
  }

  const dateKey = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  // The Compass periods for the day of `date`. A day with no school has none; when Compass
  // names the day (for example "School Development Day"), the list has that name as `note`.
  async function compass(date) {
    const s = await structure(date.getFullYear());
    if (s.calendar) {
      const day = s.calendar.get(dateKey(date));
      if (!day || !day.teaching || !s.byPdid.has(day.pdid)) return Object.assign([], { note: day?.name || "" });
      return fromRows(s.byPdid.get(day.pdid), date);
    }
    // No calendar: when every cycle day has the same periods (for example AM and PM) the
    // cycle day doesn't matter, and a 5-day cycle follows the weekdays. Holidays can't be told.
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) return [];
    const lists = [...s.days.values()];
    if (!lists.length) return [];
    const key = (rows) => JSON.stringify(rows);
    let rows;
    if (lists.every((l) => key(l) === key(lists[0]))) rows = lists[0];
    else if (s.cycleLength === 5) rows = s.days.get(weekday) || [];
    else throw new Error(`The Compass structure "${s.name}" has a ${s.cycleLength}-day cycle with different days, and the widget can't tell today's cycle day yet. Use a custom timetable.`);
    return fromRows(rows, date);
  }

  function settings() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get([SOURCE_KEY, CUSTOM_KEY], (r) => res({
          // Compass by default; "custom" once the user saves a custom timetable.
          source: COMPASS_AVAILABLE && r?.[SOURCE_KEY] !== "custom" ? "compass" : "custom",
          custom: r?.[CUSTOM_KEY] && typeof r[CUSTOM_KEY] === "object" ? r[CUSTOM_KEY] : { all: [], days: {} },
        }));
      } catch (_) { res({ source: COMPASS_AVAILABLE ? "compass" : "custom", custom: { all: [], days: {} } }); }
    });
  }

  // The periods to show for the day of `date`: { source, periods }.
  async function display(date) {
    const s = await settings();
    const periods = s.source === "compass" ? await compass(date) : fromRows(rowsFor(s.custom, date), date);
    return { source: s.source, periods, note: periods.note || "" };
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
    COMPASS_AVAILABLE, WEEKDAYS, compass, display, nextDay, current, settings, saveSource, saveCustom, onChange,
    validRow, rowsFor, fromRows,
  };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassPeriods;
