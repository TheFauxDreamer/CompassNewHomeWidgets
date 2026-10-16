// The periods of a school day, for the Current Period widget.
//
// Three sources:
//   - Compass (the default): the school's default Period Structure for the year, from
//     Configure > Period Structures. In a primary school this is often only AM and PM.
//   - Custom: a timetable that the user types in the widget. Use it when the teaching
//     timetable is different from the Compass structure (for example, a primary school
//     that marks AM/PM rolls but teaches Literacy, Recess, Numeracy, Lunch…).
//   - News: the school's timetable, shared by an admin as a timetable code in a Compass
//     News post (docs/SCHOOL_TIMETABLE_POST.md). Staff get the same timetable and see
//     the admin's changes without pasting a new code.
// The custom and News timetables are for display only. Attendance never uses them.
//
// A period is { name, start: Date, finish: Date, kind: "class" | "break" }.
globalThis.CompassPeriods = (() => {
  const COMPASS_AVAILABLE = true;

  const SOURCE_KEY = "periodSource";  // "compass" | "custom" | "news"
  const CUSTOM_KEY = "customPeriods"; // { all: [row], days: { "1": [row], … "5": [row] } }
  const NEWS_KEY = "newsPeriods";     // { custom: { all, days }, title, checked: ms }: the last News timetable
  const NEWS_MAX_AGE = 6 * 60 * 60 * 1000; // read the News post again after this long
  const NEWS_PAGE = 500;                   // the same page size as Compass's News page
  const NEWS_PAGES = 4;                    // look through up to 2,000 expired posts
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

  // --- timetable codes ------------------------------------------------------------------
  // A custom timetable packed into one line of text ("Copy timetable code" in the widget,
  // and the body of the News post). Format: "CPT1." + base64url of
  // {a: rows, d: {"1": rows, …}}, where each row is [name, "0845", "0930", 1 if break].
  const CODE_PREFIX = "CPT1.";
  const CODE_IN_TEXT = /CPT1\.[A-Za-z0-9_-]+/;
  const packRow = (r) => [r.name.trim(), r.start.replace(":", ""), r.finish.replace(":", ""), ...(r.kind === "break" ? [1] : [])];
  const unpackTime = (t) => (typeof t === "string" && /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : "");
  const unpackRow = (a) => {
    if (!Array.isArray(a)) throw new Error("bad row");
    return { name: String(a[0] ?? ""), start: unpackTime(a[1]), finish: unpackTime(a[2]), kind: a[3] ? "break" : "class" };
  };
  function encodeCode(custom) {
    const data = { a: custom.all.map(packRow) };
    const days = Object.entries(custom.days);
    if (days.length) data.d = Object.fromEntries(days.map(([d, rows]) => [d, rows.map(packRow)]));
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return CODE_PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  // Returns { all, days } or throws an Error with a message for the user.
  function decodeCode(text) {
    const code = String(text || "").replace(/\s+/g, "");
    if (!code) throw new Error("Paste a code first.");
    if (!code.startsWith(CODE_PREFIX)) throw new Error("That isn't a timetable code.");
    let data;
    try {
      const b64 = code.slice(CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
      data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    } catch {
      throw new Error("The code is damaged or incomplete. Copy it again.");
    }
    try {
      if (!data || !Array.isArray(data.a)) throw 0;
      const all = data.a.map(unpackRow);
      const days = {};
      for (const [d, rows] of Object.entries(data.d || {})) {
        if (!/^[1-5]$/.test(d) || !Array.isArray(rows)) throw 0;
        days[d] = rows.map(unpackRow);
      }
      if (![all, ...Object.values(days)].every((rows) => rows.every(validRow))) throw 0;
      if (!all.length && !Object.keys(days).length) throw new Error("That code has no periods in it.");
      return { all, days };
    } catch (e) {
      throw e instanceof Error ? e : new Error("The code is damaged or incomplete. Copy it again.");
    }
  }

  // --- Compass period structure (the same calls as Configure > Period Structures) ------
  const DENIED = "Compass didn't give the period structure. Check you're still logged in, or use a custom timetable.";
  async function post(path, body, denied = DENIED) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    if (res.redirected || res.status === 401 || res.status === 403) {
      throw new Error(denied);
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

  // --- the school timetable in a Compass News post ------------------------------------
  // The admin gives the post a finish date in the past, so it's an expired post and never
  // shows in the feed. Expired posts come newest first; the newest one with a timetable
  // code wins, so a second post replaces the first.
  const NEWS_DENIED = "Compass didn't give the News posts. Check you're still logged in, or use a custom timetable.";
  const codeIn = (html) => CODE_IN_TEXT.exec(String(html || "").replace(/<[^>]*>/g, " "))?.[0] || "";

  async function findNewsPost() {
    for (let page = 0; page < NEWS_PAGES; page++) {
      const res = await post("/Services/Newsfeed.svc/GetAllExpiredNewsItems",
        { start: page * NEWS_PAGE, limit: NEWS_PAGE, sort: "string", filterOptions: {} }, NEWS_DENIED);
      const items = Array.isArray(res?.d?.data) ? res.d.data : null;
      if (!items) throw new Error("Couldn't read the News posts from Compass.");
      const item = items.find((x) => codeIn(x.Content1) || codeIn(x.Content2));
      if (item) {
        let custom;
        try { custom = decodeCode(codeIn(item.Content1) || codeIn(item.Content2)); }
        catch (e) { throw new Error(`The timetable code in the News post "${String(item.Title || "").trim()}" doesn't work: ${e.message}`); }
        return { custom, title: String(item.Title || "").trim() };
      }
      if (items.length < NEWS_PAGE || (page + 1) * NEWS_PAGE >= Number(res.d.total || 0)) break;
    }
    throw new Error("Compass News has no post with a timetable code. Ask a Compass admin to share the timetable, or use a custom timetable.");
  }

  const stored = (key) => new Promise((res) => {
    try { chrome.storage.local.get([key], (r) => res(r?.[key] ?? null)); } catch (_) { res(null); }
  });

  // The News timetable: { custom, title, checked }. It's kept for NEWS_MAX_AGE; when
  // Compass can't be read, the last one is used. `fresh` reads the post again now.
  let news = null; // { at: ms, promise }
  function newsTimetable({ fresh = false } = {}) {
    if (fresh || !news || Date.now() - news.at > NEWS_MAX_AGE) {
      const promise = (async () => {
        const last = await stored(NEWS_KEY);
        const usable = last?.custom && typeof last.custom === "object";
        if (!fresh && usable && Date.now() - Number(last.checked || 0) < NEWS_MAX_AGE) return last;
        try {
          const found = { ...(await findNewsPost()), checked: Date.now() };
          save({ [NEWS_KEY]: found });
          return found;
        } catch (e) {
          if (usable && !fresh) return last;
          throw e;
        }
      })();
      news = { at: Date.now(), promise };
      promise.catch(() => { if (news?.promise === promise) news = null; }); // ask again after an error
    }
    return news.promise;
  }

  function settings() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get([SOURCE_KEY, CUSTOM_KEY], (r) => res({
          // Compass by default; "custom" or "news" once the user saves that source.
          source: r?.[SOURCE_KEY] === "news" ? "news" : COMPASS_AVAILABLE && r?.[SOURCE_KEY] !== "custom" ? "compass" : "custom",
          custom: r?.[CUSTOM_KEY] && typeof r[CUSTOM_KEY] === "object" ? r[CUSTOM_KEY] : { all: [], days: {} },
        }));
      } catch (_) { res({ source: COMPASS_AVAILABLE ? "compass" : "custom", custom: { all: [], days: {} } }); }
    });
  }

  // The periods to show for the day of `date`: { source, periods }.
  async function display(date) {
    const s = await settings();
    const periods = s.source === "compass" ? await compass(date)
      : fromRows(rowsFor(s.source === "news" ? (await newsTimetable()).custom : s.custom, date), date);
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
    validRow, rowsFor, fromRows, encodeCode, decodeCode, newsTimetable,
  };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassPeriods;
