// Adds coloured dots to days with events in Compass's "Term Calendar" homepage
// widget, so you can see which days have something on without clicking each one.
//
// Events come from the same call the widget makes when you click a day
// (Calendar.svc/GetCalendarEventsByUserWeb), but asked for the whole visible
// term at once. The widget's cells only contain day numbers, so each cell's date
// is worked out from the "Term 3 - 2026" / "Jul - Sep" labels and then checked
// against every day number in the grid before any dots are added. Hovering a day
// shows a popout listing its events, each with its coloured dot.
(() => {
  const path = location.pathname.toLowerCase();
  if (!(path === "/" || path === "/default.aspx") || window.__compassCalendarDots) return;
  window.__compassCalendarDots = true;

  const MAX_DOTS = 3;
  const MAX_POPOUT_ROWS = 8;
  const CACHE_MINUTES = 30;
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const cache = new Map(); // "start|end" -> { at, promise }
  const dayEvents = new WeakMap(); // td -> [{ colour, label }]

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();

  // --- styles (dots drawn with CSS so React's own markup is left untouched) -------
  const style = document.createElement("style");
  style.textContent = `
    td[data-ext-events] { position: relative; }
    td[data-ext-events]::after {
      content: ""; position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%);
      width: calc(var(--ext-n, 1) * 8px - 2px); height: 6px; pointer-events: none;
      background: var(--ext-dots);
    }
    .ext-cal-pop {
      position: fixed; z-index: 2147483000; pointer-events: none; display: none;
      max-width: 280px; padding: 6px 10px; box-sizing: border-box;
      background: #fff; color: #222; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,.25);
      font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left;
    }
    .ext-cal-pop-row { display: flex; align-items: baseline; gap: 6px; padding: 1px 0; }
    .ext-cal-pop-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; transform: translateY(-1px); }
    .ext-cal-pop-more { color: #666; padding-left: 14px; }`;
  document.documentElement.appendChild(style);

  // --- hover popout: the day's events, each with its coloured dot --------------------
  let popout = null;
  let popoutFor = null;

  function showPopout(td) {
    const list = dayEvents.get(td);
    if (!list?.length) return hidePopout();
    if (!popout) {
      popout = document.createElement("div");
      popout.className = "ext-cal-pop";
      document.body.appendChild(popout);
    }
    if (popoutFor !== td) {
      popout.replaceChildren(...list.slice(0, MAX_POPOUT_ROWS).map((e) => {
        const row = document.createElement("div");
        row.className = "ext-cal-pop-row";
        const dot = document.createElement("span");
        dot.className = "ext-cal-pop-dot";
        dot.style.background = e.colour;
        const text = document.createElement("span");
        text.textContent = e.label;
        row.append(dot, text);
        return row;
      }));
      if (list.length > MAX_POPOUT_ROWS) {
        const more = document.createElement("div");
        more.className = "ext-cal-pop-more";
        more.textContent = `+${list.length - MAX_POPOUT_ROWS} more`;
        popout.appendChild(more);
      }
      popoutFor = td;
    }

    // Under the cell, centred; above it if there's no room below. Kept on screen.
    popout.style.display = "block";
    const cell = td.getBoundingClientRect();
    const w = popout.offsetWidth, h = popout.offsetHeight, gap = 4;
    const left = Math.max(4, Math.min(cell.left + cell.width / 2 - w / 2, innerWidth - w - 4));
    let top = cell.bottom + gap;
    if (top + h > innerHeight - 4 && cell.top - gap - h >= 4) top = cell.top - gap - h;
    popout.style.left = `${left}px`;
    popout.style.top = `${top}px`;
  }

  function hidePopout() {
    if (popout) popout.style.display = "none";
    popoutFor = null;
  }

  document.addEventListener("mouseover", (e) => {
    const td = e.target.closest?.("td[data-ext-events]");
    if (td && dayEvents.has(td)) showPopout(td);
    else hidePopout();
  });
  document.documentElement.addEventListener("mouseleave", hidePopout);
  addEventListener("scroll", hidePopout, true);

  // --- who is logged in -------------------------------------------------------------
  function currentUserId() {
    for (const s of document.scripts) {
      const m = /Compass\.organisationUserId\s*=\s*(\d+)/.exec(s.textContent || "");
      if (m) return Number(m[1]);
    }
    return null;
  }

  // --- finding the widget and working out the date of each cell --------------------
  function findCalendars() {
    const found = [];
    for (const table of document.querySelectorAll("table")) {
      const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      if (heads.join("") !== "MTWTF") continue; // week number column + Mon-Fri
      const box = table.closest(".MuiPaper-root") || table.parentElement?.parentElement;
      // Read each label on its own: joined together they run into each other ("2026Jul").
      const labels = box ? [...box.querySelectorAll("p, span, div")]
        .filter((e) => !e.closest("table") && e.children.length === 0)
        .map((e) => e.textContent.trim()) : [];
      const year = labels.map((t) => /^Term\s*\d+\s*-\s*(\d{4})$/i.exec(t)?.[1]).find(Boolean);
      // "Jul - Sep", "Jul – Sept", "July - September"...
      const firstMonth = labels.map((t) => /^([A-Za-z]{3,9})\.?\s*[-–—]\s*[A-Za-z]{3,9}\.?$/.exec(t)?.[1]).find(Boolean)?.slice(0, 3).toLowerCase();
      if (!year) continue;
      const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].slice(1)); // drop week no.
      if (!rows.length || !rows[0].length) continue;
      found.push({ table, box, rows, year: Number(year), month: firstMonth in MONTHS ? MONTHS[firstMonth] : null });
    }
    return found;
  }

  // Term start dates Compass puts in the page ("otherTermDates": "s":"20/07/2026").
  function termStarts() {
    const out = [];
    for (const sc of document.scripts) {
      const m = /otherTermDates\s*:\s*(\[[\s\S]*?\])\s*,\s*\n/.exec(sc.textContent || "");
      if (!m) continue;
      for (const t of m[1].matchAll(/"s"\s*:\s*"(\d{1,2})\\?\/(\d{1,2})\\?\/(\d{4})"/g)) {
        out.push(new Date(Number(t[3]), Number(t[2]) - 1, Number(t[1])));
      }
    }
    return out;
  }

  // Works out the date of every cell. Candidate first-Mondays come from the month
  // label (and the month before, for terms starting late in a month) and from
  // Compass's term start dates. A candidate is accepted only if every cell that
  // shows a number matches it; blank or non-numeric cells (e.g. a public holiday
  // drawn differently) are skipped rather than failing the whole grid.
  function dateCells(cal) {
    const flat = [];
    cal.rows.forEach((row, r) => row.forEach((td, c) => {
      const t = td.textContent.trim();
      flat.push({ td, i: r * 7 + c, n: /^\d{1,2}$/.test(t) ? Number(t) : null });
    }));
    const numbered = flat.filter((x) => x.n);
    if (numbered.length < Math.max(3, flat.length * 0.6)) return null;
    const anchor = numbered[0];

    const mondays = [];
    const addMonday = (d) => { const m = addDays(d, -((d.getDay() + 6) % 7)); if (!mondays.some((x) => +x === +m)) mondays.push(m); };
    if (cal.month != null) {
      for (const off of [0, -1]) addMonday(addDays(new Date(cal.year, cal.month + off, anchor.n), -anchor.i));
    }
    for (const t of termStarts()) if (t.getFullYear() === cal.year) addMonday(t);

    for (const start of mondays) {
      if (numbered.every((x) => addDays(start, x.i).getDate() === x.n)) {
        return flat.map((x) => ({ td: x.td, date: addDays(start, x.i) }));
      }
    }
    return null;
  }

  // --- events -----------------------------------------------------------------------
  function fetchEvents(userId, from, to) {
    const key = `${ymd(from)}|${ymd(to)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MINUTES * 60 * 1000) return hit.promise;
    const promise = fetch("/Services/Calendar.svc/GetCalendarEventsByUserWeb", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ userId, startDate: ymd(from), endDate: ymd(to), homePage: true }),
    })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((j) => (Array.isArray(j?.d) ? j.d : []))
      .catch((e) => { cache.delete(key); console.warn("[Calendar dots]", e); return null; });
    cache.set(key, { at: Date.now(), promise });
    return promise;
  }

  // date "YYYY-MM-DD" -> [{ colour, label }]. Multi-day events mark every day they cover.
  // Events on layers the user has turned off are left out.
  function byDay(events) {
    const days = new Map();
    for (const ev of events) {
      if (layers !== null && !layers.includes(layerOf(ev))) continue;
      const start = new Date(ev.start);
      if (isNaN(start)) continue;
      let finish = new Date(ev.finish);
      if (isNaN(finish) || finish < start) finish = start;
      const last = new Date(finish.getTime() - (finish > start ? 1 : 0)); // midnight finish = previous day
      const title = ev.longTitleWithoutTime || ev.title || "Event";
      const label = ev.allDay ? `All day: ${title}` : `${fmtTime(start)} ${title}`;
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()), n = 0;
           d <= last && n < 62; d = addDays(d, 1), n++) {
        const k = ymd(d);
        if (!days.has(k)) days.set(k, []);
        days.get(k).push({ colour: ev.backgroundColor || "#0E6CD9", label, sort: ev.allDay ? -1 : start.getTime() });
      }
    }
    for (const list of days.values()) list.sort((a, b) => a.sort - b.sort);
    return days;
  }

  function dotsCss(colours) {
    return colours.map((c, i) =>
      `radial-gradient(circle at 3px 3px, ${c} 2.9px, transparent 3.1px) ${i * 8}px 0 / 6px 6px no-repeat`
    ).join(", ");
  }

  function paint(cells, days) {
    for (const { td, date } of cells) {
      const list = days.get(ymd(date));
      if (!list?.length) {
        td.removeAttribute("data-ext-events");
        dayEvents.delete(td);
        if (td === popoutFor) hidePopout();
        continue;
      }
      const colours = [...new Set(list.map((e) => e.colour))].slice(0, MAX_DOTS);
      td.setAttribute("data-ext-events", String(list.length));
      td.style.setProperty("--ext-n", colours.length);
      td.style.setProperty("--ext-dots", dotsCss(colours));
      dayEvents.set(td, list);
      if (td === popoutFor) { popoutFor = null; showPopout(td); } // refresh what's showing
    }
  }

  // --- calendar layers filter ----------------------------------------------------------
  // Events only carry a calendarId, so the calendars' names ("School Calendar") come
  // from the list Compass's Calendar page loads. Events with no calendarId are grouped
  // by activity type (activities/events, classes...). Each layer shows its colour dot.
  const Y = globalThis.CompassYears;
  const LAYERS_KEY = "calendarDotsLayers"; // array of layer names; null = all
  // The request Compass's Calendar page makes for its layer list. Returns
  // { d: [{ id, name, scheduleBgColor, showOnHomePage, isHidden, ... }] }.
  const CALENDARS_URL = "/Services/Calendar.svc/GetActivityLayers?sessionstate=readonly";
  const TYPE_NAMES = { 1: "Classes", 2: "Events", 10: "Learning tasks" };
  let layers = null;
  let layersLoaded = false;
  const calendarNames = new Map(); // calendarId -> name
  const layerColours = new Map(); // layer name -> colour
  const filters = new Map();      // widget box -> { host, filter }

  function layerOf(ev) {
    if (ev.calendarId != null) return calendarNames.get(ev.calendarId) || `Calendar ${ev.calendarId}`;
    return TYPE_NAMES[ev.activityType] || ev.activityTypeName || `Type ${ev.activityType ?? "unknown"}`;
  }

  // Loads the calendars' names once. The calendars shown on the homepage are listed in
  // the filter straight away, even before any of their events load. If this fails,
  // calendars are shown by number instead.
  async function loadCalendarNames() {
    try {
      // Compass's services take POST; try GET too in case this one is read-only.
      let r = await fetch(CALENDARS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
      });
      if (!r.ok) r = await fetch(CALENDARS_URL, { credentials: "include", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const list = (await r.json())?.d;
      if (!Array.isArray(list)) return;
      for (const c of list) {
        const name = String(c?.name ?? "").trim();
        if (c?.id == null || !name) continue;
        calendarNames.set(c.id, name);
        if (c.showOnHomePage && !c.isHidden && !layerColours.has(name)) layerColours.set(name, c.scheduleBgColor || "#0E6CD9");
      }
    } catch (e) {
      console.warn("[Calendar dots] Couldn't load calendar names; showing numbers instead.", e);
    }
  }

  // Returns true if there's a layer the filter hasn't shown before.
  function noteLayers(events) {
    let added = false;
    for (const ev of events) {
      const name = layerOf(ev);
      if (!layerColours.has(name)) { layerColours.set(name, ev.backgroundColor || "#0E6CD9"); added = true; }
    }
    return added;
  }

  const byName = (list) => [...list].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const layerOptions = () => byName(new Set([...layerColours.keys(), ...(layers || [])]));
  const showFilters = () => {
    for (const { filter, wrap } of filters.values()) {
      wrap.classList.toggle("loading", !layersLoaded);
      filter.set(layerColours.size ? layerOptions() : [], layers);
    }
  };

  function setLayers(next, save) {
    layers = next;
    if (save) { try { chrome.storage.local.set({ [LAYERS_KEY]: next }); } catch (_) {} }
    showFilters();
    schedule();
  }

  // The same base look as the other widgets (src/shared/theme.js): Cabin text, Compass's colours,
  // grey rounded buttons (the panel's Done button).
  const FILTER_CSS = `
    :host { all: initial; display: block; }
    .wrap { color: #203249; font: 13px/1.4 Cabin, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
      box-sizing: border-box; padding: 8px 0 12px; }
    button { border: 0; background: #f1f3f4; border-radius: 6px; padding: 4px 8px; cursor: pointer; font: inherit; color: inherit; }
    button:hover { background: #e3e5e8; }
    .yrow { margin: 0; }
    /* The panel opens upwards from the chip, over the calendar, as tall as its options.
       It's placed against the widget card, so .yarea mustn't be the positioned box.
       A pale blue tint sets it apart from the calendar behind it. */
    .yarea { position: static; }
    .ypanel { padding: 8px 12px; box-sizing: border-box; border-radius: 6px; background: #F2F6FC;
      border: 1px solid #D5E1F0; box-shadow: 0 2px 8px rgba(0,0,0,.18); }
    .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
    /* Until the saved choice and the calendar names load, the chip is a same-size
       placeholder, so the widget doesn't change height when they arrive. */
    .loading .ychip { color: transparent; pointer-events: none;
      background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }`;

  // Lines the chip up with the widget's heading ("Term Calendar"), and places the panel
  // just above the chip, no taller than the calendar. The calendar table itself
  // can run to the card's edges, so it isn't used for the side padding.
  function fitFilter(box, host, panel, chip) {
    const table = box.querySelector("table");
    if (!table) return;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    const b = box.getBoundingClientRect(), t = table.getBoundingClientRect(), c = chip.getBoundingClientRect();
    const heading = [...box.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, div")]
      .find((e) => !e.closest("table") && e.children.length === 0 && /\S/.test(e.textContent));
    const inset = heading ? heading.getBoundingClientRect().left - b.left : 0;
    const pad = inset >= 8 && inset <= 40 ? inset : 16;
    host.style.paddingLeft = host.style.paddingRight = `${pad}px`;
    Object.assign(panel.style, {
      top: "auto", bottom: `${b.bottom - c.top + 4}px`, left: `${pad}px`, right: `${pad}px`,
      maxHeight: `${Math.max(80, c.top - t.top - 4)}px`,
    });
  }

  // Adds the layers chip to the bottom of the widget, after Compass's own content, so
  // React's markup is left alone.
  function ensureFilter(box) {
    if (!box || !Y) return;
    const had = filters.get(box);
    if (had?.host.isConnected && had.host.parentElement === box) return;
    const host = had?.host || document.createElement("ext-calendar-layers");
    if (!had) {
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = Y.CSS + FILTER_CSS;
      const wrap = document.createElement("div");
      wrap.className = layersLoaded ? "wrap" : "wrap loading";
      const area = document.createElement("div");
      area.className = "yarea";
      const row = document.createElement("div");
      row.className = "yrow";
      const filter = Y.filter({
        onChange: (next) => setLayers(next, true),
        onOpen: () => fitFilter(box, host, filter.panel, filter.chip),
        allText: "All calendars", noneText: "No calendars", noun: "Calendars", sortFn: byName, wide: true,
        labelFn: (sel) => (sel.length === 1 ? sel[0] : `${sel.length} calendars`),
        iconFn: (name) => {
          const dot = document.createElement("span");
          dot.className = "dot";
          dot.style.background = layerColours.get(name) || "#bbb";
          return dot;
        },
      });
      row.append(filter.chip);
      area.append(filter.panel);
      wrap.append(area, row);
      root.append(style, wrap);
      filters.set(box, { host, filter, wrap });
      showFilters();
    }
    box.appendChild(host);
    const { filter } = filters.get(box);
    fitFilter(box, host, filter.panel, filter.chip);
  }

  // --- keep up with the widget (it redraws when you change term) ---------------------
  function clearDots(table) {
    for (const td of table.querySelectorAll("td[data-ext-events]")) {
      td.removeAttribute("data-ext-events");
      dayEvents.delete(td);
    }
    if (popoutFor && (!popoutFor.isConnected || table.contains(popoutFor))) hidePopout();
  }

  // Changing term redraws the grid, sometimes in several steps and while the new
  // term's events are still loading. So: wipe the old term's dots straight away,
  // never skip a redraw that arrives mid-load (run again afterwards), and only
  // paint if the grid still shows the dates the events were loaded for.
  let running = false;
  let again = false;
  async function update() {
    if (!layersLoaded) { // add the placeholder chip now; the dots wait for the saved layers
      for (const cal of findCalendars()) ensureFilter(cal.box);
      return;
    }
    if (running) { again = true; return; }
    running = true;
    try {
      const userId = currentUserId();
      if (!userId) return;
      for (const cal of findCalendars()) {
        ensureFilter(cal.box);
        const cells = dateCells(cal);
        if (!cells) {
          clearDots(cal.table);
          delete cal.table.dataset.extRange;
          const sig = cal.rows.map((r) => r.map((td) => td.textContent.trim()).join(",")).join("/");
          if (cal.table.dataset.extWarned !== sig) {
            cal.table.dataset.extWarned = sig;
            console.info("[Calendar dots] Couldn't work out the dates for this term's grid; no dots shown.",
              { year: cal.year, month: cal.month, firstRow: cal.rows[0].map((td) => td.textContent.trim()) });
          }
          continue;
        }
        const from = cells[0].date, to = cells[cells.length - 1].date;
        const range = `${ymd(from)}|${ymd(to)}`;
        if (cal.table.dataset.extRange !== range) { clearDots(cal.table); cal.table.dataset.extRange = range; }

        const events = await fetchEvents(userId, from, to);
        if (!events || !cal.table.isConnected) continue;
        if (noteLayers(events)) showFilters();

        // The grid may have changed while we waited: re-read it before painting.
        const fresh = findCalendars().find((c) => c.table === cal.table);
        const now = fresh && dateCells(fresh);
        if (!now || `${ymd(now[0].date)}|${ymd(now[now.length - 1].date)}` !== range) { again = true; continue; }
        paint(now, byDay(events));
      }
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  }

  let scheduled = null;
  const schedule = () => { clearTimeout(scheduled); scheduled = setTimeout(update, 250); };
  new MutationObserver((muts) => {
    // Ignore our own attribute changes; react to the widget drawing or changing term.
    if (muts.some((m) => m.type === "childList" || m.type === "characterData")) schedule();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // Read the saved layers and the calendars' names before the first paint, so hidden
  // layers never flash up and events are never filed under a calendar's number.
  try {
    const saved = new Promise((res) => chrome.storage.local.get(LAYERS_KEY, res));
    Promise.all([saved, loadCalendarNames()]).then(([r]) => {
      layers = Array.isArray(r?.[LAYERS_KEY]) ? r[LAYERS_KEY] : null;
      layersLoaded = true;
      showFilters();
      schedule();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(LAYERS_KEY in changes)) return;
      const next = changes[LAYERS_KEY].newValue ?? null;
      if (JSON.stringify(next) !== JSON.stringify(layers)) setLayers(next, false);
    });
  } catch (_) { layersLoaded = true; schedule(); }
})();
