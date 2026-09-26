// "Arrivals & Departures" widget: the late arrivals and early departures of today, for the whole school.
// It uses the same call as the "Arrivals & Departures" tab on the Attendance page.
globalThis.CompassMovements = (() => {
  const REFRESH_MINUTES = 5;
  const NEW_MINUTES = 30; // Rows younger than this get a "new" chip.
  const PAGE_SIZE = 100;
  const MAX_PAGES = 10;

  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    if (res.redirected || res.status === 401 || res.status === 403) {
      throw new Error("Compass didn't accept the request. Check you're still logged in.");
    }
    if (!res.ok) throw new Error(`Compass returned HTTP ${res.status}`);
    try { return await res.json(); }
    catch (_) { throw new Error("Compass returned something that wasn't JSON. Your session may have expired."); }
  }

  // "2026-09-25T05:49:00Z", or "/Date(1790279340000+1000)/" if the first value is not correct.
  function parseDate(iso, msDate) {
    const d = iso ? new Date(iso) : null;
    if (d && !isNaN(d)) return d;
    const m = /\/Date\((-?\d+)/.exec(msDate || "");
    return m ? new Date(Number(m[1])) : null;
  }

  // Compass sends "Last, First". The widget shows "First Last".
  function displayName(n) {
    const [last, first] = String(n || "").split(/,\s*/);
    return first ? `${first} ${last}` : last || "Unknown student";
  }

  // Compass puts "PA: " (partial absence) before the reason. Automatic entries have a long note.
  function reasonText(c) {
    const t = String(c || "").trim();
    if (/^automatically added/i.test(t)) return "Added automatically";
    return t.replace(/^PA:\s*/i, "");
  }

  // The year levels of the school (id -> name), fetched one time for each page.
  let yearNamesPromise = null;
  function fetchYearNames() {
    yearNamesPromise ||= post("/Services/User.svc/GetStudentYearLevels?sessionstate=readonly", { page: 1, start: 0, limit: 200 })
      .then((json) => new Map((Array.isArray(json?.d) ? json.d : []).map((y) => [y.id, String(y.n || "").trim()])))
      .catch(() => { yearNamesPromise = null; return new Map(); });
    return yearNamesPromise;
  }

  // Keeps the arrivals and departures of today (local time), newest first.
  // years: the year-level names to keep (null = all).
  function summarise(items, yearNames, now = new Date(), years = null) {
    const today = now.toDateString();
    let rows = items
      .map((it) => ({
        id: it.id,
        uid: it.uid,
        name: displayName(it.n),
        type: it.ct === 1 ? "arrival" : it.ct === 2 ? "departure" : "",
        time: parseDate(it.t, it.timestamp),
        reason: reasonText(it.c),
        minutesLate: typeof it.minutesLate === "number" ? it.minutesLate : null,
        form: String(it.formGroup || "").trim(),
        year: yearNames.get(it.yearLevelId) || "No YL",
        by: String(it.userCreatorName || "").trim(),
      }))
      .filter((r) => r.type && r.time && r.time.toDateString() === today);

    // A departure is "returned" when the same student has a later arrival today.
    for (const r of rows) {
      r.returned = r.type === "departure" && rows.some((a) => a.uid === r.uid && a.type === "arrival" && a.time > r.time);
    }
    const all = rows.length;
    if (years) {
      const keep = new Set(years);
      rows = rows.filter((r) => keep.has(r.year));
    }
    rows.sort((a, b) => b.time - a.time || b.id - a.id);
    return {
      rows,
      arrivals: rows.filter((r) => r.type === "arrival").length,
      departures: rows.filter((r) => r.type === "departure").length,
      otherYears: all - rows.length, // rows that the year-group filter removes
      updated: now,
    };
  }

  // Gets the raw rows and the year-level names. The widget runs summarise() itself, so a change
  // to the year filter does not send a new request to Compass.
  async function load(now = new Date()) {
    const yearNames = fetchYearNames();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const json = await post("/Services/Attendance.svc/GetArrivalsAndDepartures?sessionstate=readonly", {
        fromFilter: null, toFilter: null, typeFilter: null, filter: "[]", page, start: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE,
      });
      const d = json?.d;
      if (!d || !Array.isArray(d.data)) throw new Error("Couldn't read the arrivals and departures from Compass.");
      items.push(...d.data);
      // Compass sends the newest rows first. Stop at the first page that contains a row from before today.
      const last = d.data[d.data.length - 1];
      const lastTime = last && parseDate(last.t, last.timestamp);
      if (!d.data.length || !lastTime || lastTime < startOfToday || items.length >= (d.total ?? Infinity)) break;
    }
    return { items, now, yearNames: await yearNames };
  }

  return { load, summarise, displayName, reasonText, REFRESH_MINUTES, NEW_MINUTES };
})();

globalThis.CompassMovementsUI = (() => {
  const LIST_HEIGHT = 232; // Fixed, so that the card does not change size.

  const CSS_EXTRA = `
    .summary { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 8px; height: 36px; white-space: nowrap; overflow: hidden; }
    .summary .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .big { font-size: 2rem; line-height: 1; font-weight: 600; color: #203249; font-variant-numeric: tabular-nums; }
    .big.err { color: #b3261e; font-size: 1rem; font-weight: 600; }
    .what { font-size: 1rem; font-weight: 500; }
    .meta { color: #5f6368; margin-left: auto; font-size: 12px; white-space: nowrap; }
    .list { height: ${LIST_HEIGHT}px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
    .row { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid #EAEBEE; }
    .row:first-child { border-top: 0; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .who { flex: 1; min-width: 0; }
    .name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail { color: #5f6368; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .side { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 3px 4px; max-width: 120px; }
    .side .when { flex-basis: 100%; justify-content: flex-end; }
    .when { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums; }
    .when svg { width: 16px; height: 16px; fill: currentColor; }
    .when.arrival { color: #0072B2; }
    .when.departure { color: #B84A00; }
    .chip { border-radius: 12px; padding: 0 7px; font-size: 11px; white-space: nowrap; background: #F0F2F5; color: #3E4B62; }
    .chip.new { background: #E6F1FA; color: #005A8C; }
    .chip.back { background: #EEF5E9; color: #2E5E1E; }
    .empty { height: 100%; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; text-align: center; color: #5f6368; }
    .empty svg { width: 40px; height: 40px; fill: #9aa0a6; }
    .empty.err svg { fill: #b3261e; }
    .foot { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    .avatar.sk { border-radius: 50%; }
    .yrow { align-items: center; justify-content: space-between; gap: 8px; }
    .seg button { color: #3E4B62; }
    .seg button[aria-pressed="true"] { color: #fff; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;
  // Material "login" / "logout" / "swap_horiz" / "warning"
  const IN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8z"/></svg>';
  const OUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 7-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4z"/></svg>';
  const SWAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99zM21 9l-3.99-4v3H10v2h7.01v3z"/></svg>';
  const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>';

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function mount(host, { preview = false } = {}) {
    const { load, summarise, REFRESH_MINUTES, NEW_MINUTES } = globalThis.CompassMovements;
    const { CSS, ICONS } = globalThis.CompassAttendanceUI;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${globalThis.CompassYears.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Arrivals &amp; Departures</h1>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow" id="yrow">
          <div class="seg" id="view">
            <button data-v="all" title="Show arrivals and departures">All</button>
            <button data-v="arrival" title="Show late arrivals only">Arrivals</button>
            <button data-v="departure" title="Show early departures only">Departures</button>
          </div>
        </div>
        <div class="yarea" id="yarea">
          <div class="summary" id="summary"></div>
          <div class="list" id="list"></div>
        </div>
        <div class="foot" id="foot"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const footText = () => `Refreshes every ${REFRESH_MINUTES} min`;
    const setFoot = (text) => { $("foot").textContent = $("foot").title = text; }; // One line. The full text shows on hover.

    let lastLoaded = 0;
    let busy = false;
    let lastData = null; // { items, now, yearNames } from the last load
    const VIEW_KEY = "movementsView"; // "all" | "arrival" | "departure"
    let view = "all";

    // --- year-group filter (the same filter as the other widgets, with its own selection) ---
    const YEARS_KEY = "movementsYearGroups"; // array of year names; null = all
    let years = null;
    const { sort: sortYears, label: yearsLabel } = globalThis.CompassYears;

    // All the year levels that we know: the list of the school and the years in the rows.
    function yearOptions() {
      const set = new Set([...(lastData?.yearNames?.values() || [])].filter(Boolean));
      for (const it of lastData?.items || []) set.add(lastData.yearNames.get(it.yearLevelId) || "No YL");
      for (const y of years || []) set.add(y);
      return sortYears(set);
    }

    const yearFilter = globalThis.CompassYears.filter({ onChange: (next) => setYears(next, true) });
    $("yrow").prepend(yearFilter.chip);
    $("yarea").append(yearFilter.panel);
    const showYears = () => yearFilter.set(lastData ? yearOptions() : [], years);

    function setYears(next, save) {
      years = next === null ? null : sortYears(next);
      if (save) { try { chrome.storage.local.set({ [YEARS_KEY]: years }); } catch (_) {} }
      showYears();
      if (lastData) render();
    }
    showYears();

    function showView() {
      for (const b of root.querySelectorAll("#view button")) b.setAttribute("aria-pressed", String(b.dataset.v === view));
    }
    function setView(v, save) {
      if (!["all", "arrival", "departure"].includes(v)) v = "all";
      if (v === view) return;
      view = v;
      showView();
      if (save) { try { chrome.storage.local.set({ [VIEW_KEY]: view }); } catch (_) {} }
      if (lastData) render();
    }
    for (const b of root.querySelectorAll("#view button")) b.onclick = () => setView(b.dataset.v, true);
    showView();
    try {
      chrome.storage.local.get([VIEW_KEY, YEARS_KEY], (r) => {
        setView(r?.[VIEW_KEY], false);
        if (Array.isArray(r?.[YEARS_KEY])) setYears(r[YEARS_KEY], false);
      });
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area === "local" && VIEW_KEY in changes) setView(changes[VIEW_KEY].newValue, false);
        if (area === "local" && YEARS_KEY in changes) {
          const next = changes[YEARS_KEY].newValue ?? null;
          if (JSON.stringify(next) !== JSON.stringify(years)) setYears(next, false);
        }
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) {}

    function setSummary(big, what, meta, cls = "") {
      const s = $("summary");
      s.textContent = "";
      s.append(el("span", "big " + cls, big), el("span", "what", what), el("span", "meta", meta));
    }

    // Placeholder rows with the same height as the real list, so that nothing moves.
    function skeleton() {
      setSummary("", "", fmtDay(new Date()));
      $("summary").prepend(Object.assign(el("span", "sk"), { style: "width:150px;height:28px;display:inline-block" }));
      const list = $("list");
      list.textContent = "";
      for (let i = 0; i < 5; i++) {
        const row = el("div", "row");
        const who = el("div", "who");
        who.append(Object.assign(el("div", "sk"), { style: `height:14px;width:${60 - i * 7}%;margin:2px 0 6px` }));
        who.append(Object.assign(el("div", "sk"), { style: `height:11px;width:${75 - i * 5}%` }));
        row.append(el("div", "avatar sk"), who, Object.assign(el("div", "sk"), { style: "height:16px;width:52px" }));
        list.append(row);
      }
    }

    function message(big, what, text, { error = false } = {}) {
      setSummary(big, what, fmtDay(new Date()), error ? "err" : "");
      const list = $("list");
      list.textContent = "";
      const box = el("div", "empty" + (error ? " err" : ""));
      box.innerHTML = error ? WARN : SWAP;
      box.append(el("div", null, text));
      list.append(box);
    }

    function renderRows(rows, now) {
      const list = $("list");
      list.textContent = "";
      for (const r of rows) {
        const row = el("div", "row");
        const av = el("div", "avatar", initials(r.name));
        av.style.background = `hsl(${hue(String(r.uid ?? r.name))} 45% 42%)`;

        const who = el("div", "who");
        who.append(el("div", "name", r.name));
        const late = r.type === "arrival" && r.minutesLate ? `${r.minutesLate} min late` : "";
        const bits = [r.year, r.form, late, r.reason].filter(Boolean);
        const detail = el("div", "detail", bits.join(" · "));
        detail.title = [...bits, r.by && `recorded by ${r.by}`].filter(Boolean).join(" · ");
        who.append(detail);

        const side = el("div", "side");
        const when = el("span", "when " + r.type);
        when.innerHTML = r.type === "arrival" ? IN : OUT;
        when.append(fmtTime(r.time));
        when.title = r.type === "arrival" ? "Late arrival" : "Early departure";
        side.append(when);
        if (r.returned) side.append(el("span", "chip back", "returned"));
        if (now - r.time < NEW_MINUTES * 60 * 1000) side.append(el("span", "chip new", "new"));

        row.append(av, who, side);
        list.append(row);
      }
    }

    function render() {
      const res = summarise(lastData.items, lastData.yearNames, lastData.now, years);
      const now = new Date();
      const rows = view === "all" ? res.rows : res.rows.filter((r) => r.type === view);
      const what = view === "arrival" ? "late arrival" : view === "departure" ? "early departure" : "arrival or departure";
      const plural = view === "all" ? "arrivals & departures" : `${what}s`;
      const label = view === "all" ? "today" : rows.length === 1 ? what : plural; // "8 in · 12 out" is already in the meta text.
      const meta = `${res.arrivals} in · ${res.departures} out · ${fmtDay(res.updated)}`;
      if (!rows.length) {
        const which = years === null ? "" : ` for ${years.length ? yearsLabel(years) : "the selected year groups"}`;
        const others = res.otherYears ? ` · ${res.otherYears} in other year groups` : "";
        message("0", plural, `No ${plural} today${which}${others}`);
        $("summary").lastChild.textContent = meta;
      } else {
        setSummary(String(rows.length), label, meta);
        renderRows(rows, now);
      }
      setFoot(`Updated ${fmtTime(res.updated)} · ${footText().toLowerCase()}`);
    }

    // quiet: keep the current list on the screen while the widget loads (automatic refresh).
    async function refresh({ quiet = false } = {}) {
      if (busy) return;
      busy = true;
      if (!quiet || !lastData) skeleton();
      if (!lastLoaded) setFoot(footText());
      try {
        lastData = await load();
        render();
        showYears(); // The year list can have more years now.
      } catch (e) {
        if (quiet && lastData) {
          setFoot(`Couldn't refresh · trying again in ${REFRESH_MINUTES} min`);
          $("foot").title = e.message || String(e);
        } else {
          lastData = null;
          message("", "Couldn't load arrivals & departures", e.message || String(e), { error: true });
          setFoot(`Will try again in ${REFRESH_MINUTES} min`);
        }
      } finally {
        lastLoaded = Date.now();
        busy = false;
      }
    }

    if (preview) {
      skeleton();
      setFoot("Preview – the live list shows on the homepage");
      return {};
    }

    $("refresh").onclick = () => refresh();
    refresh();

    // Automatic refresh. Browsers slow the timers in background tabs, thus the widget also
    // refreshes when the user opens the tab again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due()) refresh({ quiet: true }); };
    const timer = setInterval(onVisible, 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); } };
  }

  return { mount };
})();
