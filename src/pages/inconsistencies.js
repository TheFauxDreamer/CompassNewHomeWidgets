// The "Period inconsistencies" page: the students who are marked present and absent on the
// same day (for example P1 present, P2 present, P3 absent, P4 present). It opens from the
// toolbar panel (chart.js) in a new tab at CompassAttendance.INCONSISTENCY_PAGE, a Compass
// address, so its requests use the user's Compass login. The page covers Compass's own app.
//   Rule:     "Between presents" (an absence with a present mark before and after it) or
//             "Any mix" (any day with both).
//   Absences: unapproved only, or all absences. Excursions count as present.
//   Range:    today, the last 2 weeks or the last month (loaded only when asked: at a school with periods it
//             opens many class rolls).
// Data: CompassAttendance.loadInconsistencyRange and inconsistencies (attendance/data.js).
(() => {
  const PARAM = new URLSearchParams(CompassAttendance.INCONSISTENCY_PAGE.split("?")[1]).get("ext");
  if (new URLSearchParams(location.search).get("ext") !== PARAM || window.__compassInconsistencies) return;
  window.__compassInconsistencies = true;

  const TITLE = "Period inconsistencies";
  // The ranges: [label, days back]. "month" is one calendar month back from today (null here).
  const RANGES = { today: ["today", 1], history: ["the last 2 weeks", 14], month: ["the last month", null] };
  const RULE_KEY = "inconsistencyRule";         // "between" | "any"
  const ABSENCES_KEY = "inconsistencyAbsences"; // "unapproved" | "all"
  const GROUP_KEY = "inconsistencyGroup";       // "day" | "student": how several days show
  const ORDER_KEY = "inconsistencyOrder";       // "first" | "last": sort by first name or surname
  const YEARS_KEY = "inconsistencyYears";       // array of year names; null = all; or a group selection (groups.js)

  const A = globalThis.CompassAttendance;
  const G = globalThis.CompassGroups;
  const Y = globalThis.CompassYears;
  const N = globalThis.CompassNames;
  const { CSS, ICONS } = globalThis.CompassTheme;

  const PAGE_CSS = `
    :host { position: fixed; inset: 0; z-index: 2147483646; overflow-y: auto; background: #F4F5F7; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 40px; }
    .card { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(32, 50, 73, .12); padding: 16px 20px; margin-bottom: 16px; }
    header h1 { font-size: 1.375rem; }
    a.back { display: inline-block; margin: 0 0 10px; color: #0E6CD9; text-decoration: none; font-weight: 600; font-size: 13px; }
    a.back:hover { text-decoration: underline; }
    .intro { color: #3E4B62; margin: 4px 0 12px; max-width: 760px; }
    .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
    .tools .group { display: inline-flex; align-items: center; gap: 6px; color: #5f6368; font-size: 12px; }
    .tools .group[hidden] { display: none; }
    .seg button { color: #3E4B62; padding: 3px 10px; }
    .seg button[aria-pressed="true"] { color: #fff; }
    .yrow { margin: 0; }
    .yarea { position: relative; }
    .yarea .ypanel { inset: auto; top: 6px; left: 0; width: min(480px, 100%); max-height: 60vh; padding: 10px 14px;
      border-radius: 10px; box-shadow: 0 6px 24px rgba(0, 0, 0, .2); box-sizing: border-box; }
    .summary { font-size: 14px; color: #3E4B62; margin: 0 0 4px; }
    .summary b { color: #203249; }
    .status { color: #5f6368; font-size: 12px; white-space: normal; }
    .status.err, .note.err { color: #b3261e; }
    .note { color: #5f6368; font-size: 12px; margin: 6px 0 0; }
    /* Loading: the overall bar, the time, and the steps and days beside each other. */
    .loader { margin: 10px 0 4px; }
    .ltop { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; color: #3E4B62; }
    .ltop b { color: #203249; font-size: 15px; font-variant-numeric: tabular-nums; }
    .ltop .time { font-variant-numeric: tabular-nums; }
    .ltop button { margin-left: auto; }
    .progress { height: 8px; background: #EAEBEE; border-radius: 4px; overflow: hidden; margin: 8px 0 10px; }
    .progress div { height: 100%; width: 0; background: #0E6CD9; transition: width .3s; }
    .lgrid { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(280px, 2fr); gap: 4px 32px; }
    @media (max-width: 640px) { .lgrid { grid-template-columns: 1fr; } }
    .lgrid h3 { font-size: 12px; font-weight: 600; color: #545F73; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .03em; }
    .step { display: flex; align-items: baseline; gap: 6px; color: #9aa0a6; font-size: 12px; line-height: 1.7; }
    .step .ic { width: 14px; text-align: center; flex: none; font-weight: 700; }
    .step .nm { white-space: nowrap; }
    .step .dt { color: #5f6368; font-variant-numeric: tabular-nums; min-width: 0; }
    .step.busy { color: #203249; font-weight: 600; }
    .step.busy .ic { color: #0E6CD9; }
    .step.busy .dt { font-weight: 400; color: #203249; }
    .step.done, .step.skip { color: #3E4B62; }
    .step.done .ic { color: #2e7d32; }
    .step.skip, .step.skip .dt { color: #9aa0a6; }
    .step.fail, .step.fail .ic, .step.fail .dt { color: #b3261e; }
    h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; display: flex; gap: 8px; align-items: baseline; }
    h2 .n { color: #5f6368; font-weight: 400; font-size: 13px; text-align: left; }
    /* A fixed layout with the same column widths on every day, so the columns line up between days. */
    table { border-collapse: collapse; width: 100%; table-layout: fixed; font: inherit; color: inherit; }
    col.year { width: 160px; }
    col.p { width: 64px; }
    col.date { width: 220px; }
    td.date { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.date .who { color: #5f6368; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.date .who b { color: #3E4B62; font-weight: 600; }
    td.date .who.err { color: #b3261e; }
    td.name .days { color: #5f6368; font-size: 12px; }
    td.name[rowspan] { vertical-align: top; }
    tbody.stu tr:last-child td, tbody.stu td[rowspan] { border-bottom: 2px solid #dadce0; }
    td.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.name .who { color: #5f6368; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.name .who b { color: #3E4B62; font-weight: 600; }
    td.name .who.err { color: #b3261e; }
    th { text-align: left; font-weight: 600; color: #545F73; font-size: 12px; padding: 4px 8px; border-bottom: 1px solid #dadce0; white-space: nowrap; }
    td { padding: 4px 8px; border-bottom: 1px solid #EAEBEE; vertical-align: middle; }
    tr:hover td { background: #F8F9FA; }
    td.name a { color: #0E6CD9; text-decoration: none; font-weight: 600; }
    td.name a:hover { text-decoration: underline; }
    td.year { color: #5f6368; white-space: nowrap; }
    th.p, td.p { text-align: center; overflow: hidden; text-overflow: ellipsis; }
    .mark { display: inline-block; min-width: 26px; padding: 1px 6px; border-radius: 4px; font-weight: 600; font-size: 12px;
      box-sizing: border-box; font-family: ui-monospace, Consolas, monospace; }
    .mark.none { color: #9aa0a6; font-family: inherit; font-weight: 400; }
    .mark.flag { outline: 2px solid #B3261E; outline-offset: 1px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: #3E4B62; margin-top: 10px; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend .sw { width: 12px; height: 12px; border-radius: 3px; }
    .legend .sw.flag { outline: 2px solid #B3261E; outline-offset: 1px; background: #fff; }
    .empty { color: #5f6368; text-align: center; padding: 24px 0; }
  `;
  // Printing: only the results, with a heading that says what was printed. The codes keep
  // their colours, and a row or a day's heading never splits across pages.
  const PRINT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3m-3 11H8v-5h8zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-1-9H6v4h12z"/></svg>';
  const PRINT_CSS = `
    .printonly { display: none; }
    @media print {
      :host { position: static; overflow: visible; background: #fff; }
      .wrap { max-width: none; padding: 0; }
      a.back, .controls, .loader, #status:empty, .noprint { display: none !important; }
      .printonly { display: block; }
      .card { box-shadow: none; border: 1px solid #dadce0; padding: 10px 12px; margin-bottom: 10px; break-inside: auto; }
      #head { border: 0; padding: 0 0 6px; }
      .printhead h1 { font-size: 18px; margin: 0 0 2px; }
      .printhead p { margin: 0; color: #3E4B62; font-size: 12px; }
      h2 { break-after: avoid; }
      tr, tbody.stu { break-inside: avoid; }
      thead { display: table-header-group; }
      td.name a { color: #203249; }
      td.name, td.date, td.name .who, td.date .who { white-space: normal; }
      .mark, .legend .sw { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr:hover td { background: none; }
    }
  `;
  // Text colour for each category's background (CATEGORIES colours), for contrast.
  const INK = { present: "#fff", offsite: "#203249", approved: "#203249", unapproved: "#fff", unmarked: "#203249" };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split("/").map(Number); return new Date(y, m - 1, d); };
  const fmtLong = (s) => parseDate(s).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = (s) => parseDate(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const save = (key, value) => { try { chrome.storage.local.set({ [key]: value }); } catch (_) {} };

  // --- the page --------------------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "compass-inconsistencies-page";
  document.documentElement.append(host);
  document.body.style.overflow = "hidden"; // only our page scrolls
  const printStyle = document.createElement("style");
  printStyle.textContent = `@media print {
    body { display: none !important; }
    html, #compass-inconsistencies-page { overflow: visible !important; height: auto !important; }
    @page { margin: 12mm; }
  }`;
  document.head.append(printStyle);
  const setTitle = () => { if (document.title !== `${TITLE} | Compass`) document.title = `${TITLE} | Compass`; };
  setTitle();
  setTimeout(setTitle, 2000); // Compass sets its own title as it starts

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${CSS}${Y.CSS}${PAGE_CSS}${PRINT_CSS}</style>
    <div class="wrap">
      <a class="back" href="/">← Back to Compass</a>
      <div class="card controls">
        <header>
          <h1>${TITLE}</h1>
          <button id="print" title="Print the results">${PRINT_ICON}</button>
          <button id="refresh" title="Load again">${ICONS.refresh}</button>
        </header>
        <p class="intro">Students who are marked both present and absent on the same day across the rolls,
          for example present in P1, P2, P4 and P5 but absent in P3. Excursions count as present; Not marked
          and Not required to attend are skipped.</p>
        <div class="tools">
          <div class="yrow" id="yrow"></div>
          <span class="group">Days <span class="seg" id="range">
            <button data-v="today" title="Today's rolls">Today</button>
            <button data-v="history" title="Every school day of the last 2 weeks. At a school with periods this opens many class rolls, so it is slow.">Last 2 weeks</button>
            <button data-v="month" title="Every school day since this date last month. At a school with periods this opens very many class rolls, so it can take a long time.">Last month</button>
          </span></span>
          <span class="group">Show <span class="seg" id="rule">
            <button data-v="between" title="An absence with a present mark before it and after it on the same day">Absent between presents</button>
            <button data-v="any" title="Any day with both a present mark and an absent mark (also late arrivals and early departures)">Any mix</button>
          </span></span>
          <span class="group" id="groupWrap">Group <span class="seg" id="groupBy">
            <button data-v="day" title="One table for each day">By day</button>
            <button data-v="student" title="One table for each year group, with each student's days together">By student</button>
          </span></span>
          <span class="group">Sort <span class="seg" id="order">
            <button data-v="first" title="Within each year group, by first name">First name</button>
            <button data-v="last" title="Within each year group, by surname">Surname</button>
          </span></span>
          <span class="group">Absences <span class="seg" id="absences">
            <button data-v="unapproved" title="Only unapproved absences (for example Unexplained or Truant)">Unapproved</button>
            <button data-v="all" title="Approved absences too (for example Notified as Sick)">All</button>
          </span></span>
        </div>
        <div class="yarea" id="yarea"></div>
      </div>
      <div class="card" id="head">
        <div class="printonly printhead"><h1>${TITLE}</h1><p id="printinfo"></p></div>
        <div class="summary" id="summary">Loading…</div>
        <div class="loader" id="loader" hidden>
          <div class="ltop"><b id="lpct">0%</b><span id="lrolls"></span><span class="time" id="ltime"></span>
            <button id="stop" title="Stop loading. The days already loaded stay on the page.">Stop</button></div>
          <div class="progress" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" id="lbar"><div></div></div>
          <div class="lgrid">
            <div><h3>Setting up</h3><div id="lsteps"></div></div>
            <div><h3>Days</h3><div id="ldays"></div></div>
          </div>
        </div>
        <div class="status" id="status"></div>
        <div class="note" id="note" hidden></div>
        <div class="legend" id="legend"></div>
      </div>
      <div id="results"></div>
    </div>`;
  const $ = (id) => root.getElementById(id);
  N.attach(root);

  // --- state ---------------------------------------------------------------------------------
  let range = "today", rule = "between", absences = "unapproved", order = "first", groupBy = "day", years = null;
  const loaded = new Map();   // "yyyy/mm/dd" -> day from loadInconsistencyRange
  const failed = new Map();   // "yyyy/mm/dd" -> error text
  let busy = false, again = false, error = "", lastUpdated = null;
  let stopRequested = false;
  // Who saved the rolls of each shown row: "uid|date" -> { state: "busy" | "done" | "fail", list, error }.
  const marks = new Map();
  const MARK_REQUESTS_AT_ONCE = 4;
  let markQueue = [], markRunning = 0;
  // The load on screen: { started (ms), steps: { key: { name, state, detail } }, days: Map(date ->
  // { state, detail, frac, rolls }), finished (ms), stopped }. Kept after the load for the status line.
  let run = null;

  // --- filters (the same year group / Custom groups filter as the widgets) ---------------------
  const yearFilter = Y.filter({ onChange: (next) => setYears(next, true), groups: G });
  $("yrow").append(yearFilter.chip);
  $("yarea").append(yearFilter.panel);
  const groupMembers = G.tracker(() => draw());
  const allStudents = () => [...loaded.values()].flatMap((d) => d.students);
  const showYears = () => yearFilter.set(loaded.size ? A.yearLevels(allStudents()) : [], years);
  function setYears(next, fromUser) {
    next = G.validSelection(next);
    years = Array.isArray(next) ? Y.sort(next) : next;
    if (fromUser) save(YEARS_KEY, years);
    showYears();
    draw();
  }

  function seg(id, get, set) {
    const show = () => { for (const b of root.querySelectorAll(`#${id} button`)) b.setAttribute("aria-pressed", String(b.dataset.v === get())); };
    for (const b of root.querySelectorAll(`#${id} button`)) b.onclick = () => { set(b.dataset.v, true); show(); };
    show();
    return show;
  }
  const showRule = seg("rule", () => rule, (v, fromUser) => { rule = v === "any" ? "any" : "between"; if (fromUser) save(RULE_KEY, rule); draw(); });
  const showAbsences = seg("absences", () => absences, (v, fromUser) => { absences = v === "all" ? "all" : "unapproved"; if (fromUser) save(ABSENCES_KEY, absences); draw(); });
  const showOrder = seg("order", () => order, (v, fromUser) => { order = v === "last" ? "last" : "first"; if (fromUser) save(ORDER_KEY, order); draw(); });
  const showGroup = seg("groupBy", () => groupBy, (v, fromUser) => { groupBy = v === "student" ? "student" : "day"; if (fromUser) save(GROUP_KEY, groupBy); draw(); });
  seg("range", () => range, (v) => { range = v in RANGES ? v : "today"; load(); draw(); });

  // The dates of the range, oldest first. Days with no school are dropped as they load.
  function rangeDates(now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (RANGES[range][1] - 1));
    if (range === "month") {
      // The day after this date last month (a short month keeps its last day: 31 Mar -> 1 Mar).
      first = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate() + 1);
      if (first.getMonth() === today.getMonth()) first = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    const out = [];
    for (const d = first; d <= today; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }

  // The students after the year or group filter, or null while a group's members load.
  function keep(list) {
    if (G.isGroups(years)) {
      let members;
      try { members = groupMembers.get(years); } catch (e) { error = `Couldn't load the group: ${e.message || e}`; return []; }
      return members ? A.filterByUsers(list, members) : null;
    }
    return Array.isArray(years) ? A.filterByYears(list, years) : list;
  }

  // --- drawing ---------------------------------------------------------------------------------
  // The hover text for one period: the code, then the class and who saved its roll, when known.
  function markTitle(st, period, cat, flagged, who) {
    const lines = [`${period.name} (${fmtTime(period.start)}–${fmtTime(period.finish)}) · ${[st.code, st.name].filter(Boolean).join(" ") || "No code"}${cat ? ` (${cat.label})` : ""}${flagged ? " · flagged" : ""}`];
    if (who === undefined) lines.push("Loading the class and who marked it…");
    else if (who === null) lines.push("No class roll found for this period.");
    else {
      if (who.className) lines.push(`Class: ${who.className}${who.teacher ? ` · ${who.teacher}` : ""}`);
      if (who.by) lines.push(`Roll last saved by ${N.person(who.by)} at ${fmtTime(who.at)}${fmtDay(who.at) !== fmtDay(period.start) ? ` on ${fmtDay(who.at)}` : ""}${who.saves > 1 ? ` (saved ${who.saves} times)` : ""}`);
      else lines.push(who.rollMarked ? "Roll marked, but Compass doesn't say by whom." : "The roll hasn't been saved.");
    }
    return lines.join("\n");
  }

  function mark(st, period, flagged, who) {
    if (!st) return el("span", "mark none", "–");
    const cat = A.CATEGORIES.find((c) => c.key === st.category);
    const m = el("span", "mark" + (flagged ? " flag" : ""), st.code || "?");
    if (cat) { m.style.background = cat.color; m.style.color = INK[cat.key]; }
    else { m.style.background = "#EAEBEE"; m.style.color = "#203249"; }
    if (cat?.hatch) m.style.backgroundImage = "repeating-linear-gradient(45deg, rgba(255,255,255,.3) 0 2px, transparent 2px 5px)";
    m.title = markTitle(st, period, cat, flagged, who);
    return m;
  }

  function drawLegend() {
    const legend = $("legend");
    legend.textContent = "";
    for (const c of A.CATEGORIES) {
      const item = el("span");
      const sw = el("span", "sw");
      sw.style.background = c.color;
      item.append(sw, c.label);
      legend.append(item);
    }
    const f = el("span");
    f.append(el("span", "sw flag"), "Flagged absence");
    legend.append(f);
  }

  function draw() {
    const results = $("results");
    const wanted = rangeDates().map(fmt);
    const days = wanted.map((d) => loaded.get(d)).filter(Boolean);
    const students = keep(days.flatMap((d) => d.students));
    if (students === null) { $("summary").textContent = `Loading ${G.label(years)}…`; return; }
    const allowed = new Set(students);
    const shown = days.map((d) => ({ ...d, students: d.students.filter((s) => allowed.has(s)) }));
    const rows = A.inconsistencies(shown, { rule, absences, order, groupBy: byStudent() ? "student" : "day" }).map((r) => ({ ...r, name: N.person(r.name) || `Student ${r.userId}` }));

    // Summary: students and student-days found.
    const s = $("summary");
    s.textContent = "";
    const people = new Set(rows.map((r) => r.userId)).size;
    const scope = range === "today" ? "today" : `in ${RANGES[range][0]} (${plural(days.length, "school day")} loaded)`;
    if (busy && !days.length) s.textContent = run?.days.size > 1 ? `Loading ${run.days.size} days…` : "Loading today…";
    else if (!days.length && !busy) s.textContent = error ? "Couldn't load attendance" : range === "today" ? "No rolls today yet" : `No school days in ${RANGES[range][0]}`;
    else { s.append(el("b", null, plural(people, "student")), ` · ${plural(rows.length, "day")} ${scope}`); }

    // Note: the "between" rule can't flag anything with only AM and PM.
    const note = $("note");
    const amPmOnly = days.length && days.every((d) => d.mode === "halfday");
    note.hidden = !(amPmOnly && rule === "between");
    note.textContent = note.hidden ? "" : "This school marks only AM and PM rolls, so no absence can be between two presents. Use \"Any mix\" to see students present for one half and absent for the other.";

    $("groupWrap").hidden = range === "today";
    results.textContent = "";
    if (!rows.length && days.length) {
      const card = el("div", "card");
      card.append(el("div", "empty", "No inconsistencies for these students and settings."));
      results.append(card);
    }
    if (byStudent()) drawByStudent(rows);
    else drawByDay(rows);
    queueMarks(rows);
    drawStatus();
  }

  // --- the tables ------------------------------------------------------------------------------
  const byStudent = () => range !== "today" && groupBy === "student";

  // Rows grouped by a key, in their order: [[key, [rows]]].
  function groupRows(rows, keyOf) {
    const groups = new Map();
    for (const r of rows) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    return [...groups];
  }

  // A table with a fixed layout: firstCols = [[header, col class]], then one column per period.
  function table(firstCols, periods) {
    const t = el("table");
    const cols = el("colgroup");
    cols.append(...firstCols.map(([, cls]) => el("col", cls)), ...periods.map(() => el("col", "p")));
    const head = el("tr");
    for (const [text] of firstCols) head.append(el("th", null, text));
    for (const p of periods) {
      const th = el("th", "p", p.name);
      th.title = `${p.name} · ${fmtTime(p.start)}–${fmtTime(p.finish)}`;
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    t.append(cols, thead);
    return t;
  }

  function studentLink(r) {
    const link = el("a", null, r.name);
    link.href = `/Records/User.aspx?userId=${encodeURIComponent(r.userId)}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Open the student's profile in Compass";
    return link;
  }

  // One cell for each of `count` columns: the row's marks, then empty cells (a day with fewer periods).
  function markCells(tr, r, count) {
    const flagged = new Set(r.flagged);
    const known = marks.get(markKey(r));
    for (let i = 0; i < count; i++) {
      const td = el("td", "p");
      const p = r.periods[i];
      if (p) td.append(mark(r.statuses[i], p, flagged.has(i), known?.state === "done" ? known.list[i] ?? null : known?.state === "fail" ? null : undefined));
      tr.append(td);
    }
  }

  // By day: one card for each day, newest first.
  function drawByDay(rows) {
    for (const [date, list] of groupRows(rows, (r) => r.date)) {
      const card = el("div", "card");
      const h = el("h2", null, fmtLong(date));
      h.append(el("span", "n", plural(list.length, "student")));
      const periods = list[0].periods;
      const t = table([["Student"], ["Year", "year"]], periods);
      const tbody = el("tbody");
      for (const r of list) {
        const tr = el("tr");
        const name = el("td", "name");
        name.append(studentLink(r), whoLine(r));
        tr.append(name, el("td", "year", r.yearLevelString || "No year level"));
        markCells(tr, r, periods.length);
        tbody.append(tr);
      }
      t.append(tbody);
      card.append(h, t);
      $("results").append(card);
    }
  }

  // By student: one card for each year group; each student once, with their days stacked.
  // The period columns come from the day with the most periods in the card.
  function drawByStudent(rows) {
    for (const [year, list] of groupRows(rows, (r) => r.yearLevelString || "No year level")) {
      const card = el("div", "card");
      const people = groupRows(list, (r) => r.userId);
      const h = el("h2", null, year);
      h.append(el("span", "n", `${plural(people.length, "student")} · ${plural(list.length, "day")}`));
      const periods = list.reduce((a, r) => (r.periods.length > a.length ? r.periods : a), []);
      const t = table([["Student"], ["Day", "date"]], periods);
      for (const [, mine] of people) {
        const tbody = el("tbody", "stu");
        mine.forEach((r, n) => {
          const tr = el("tr");
          if (!n) {
            const name = el("td", "name");
            name.rowSpan = mine.length;
            name.append(studentLink(r), el("div", "days", plural(mine.length, "day")));
            tr.append(name);
          }
          const date = el("td", "date", fmtShort(r.date));
          date.append(whoLine(r));
          tr.append(date);
          markCells(tr, r, periods.length);
          tbody.append(tr);
        });
        t.append(tbody);
      }
      card.append(h, t);
      $("results").append(card);
    }
  }

  // --- who marked the flagged periods ----------------------------------------------------------
  const markKey = (r) => `${r.userId}|${r.date}`;

  // The small line under a student's name: who saved the roll of each flagged period, and when.
  function whoLine(r) {
    const known = marks.get(markKey(r));
    const line = el("div", "who");
    if (!known || known.state === "busy") { line.textContent = "Checking who marked the rolls…"; return line; }
    if (known.state === "fail") { line.className = "who err"; line.textContent = `Couldn't check who marked the rolls: ${known.error}`; return line; }
    r.flagged.forEach((i, n) => {
      const w = known.list[i], p = r.periods[i];
      if (n) line.append(" · ");
      line.append(el("b", null, `${p.name} ${r.statuses[i]?.code || ""}`.trim()), " ");
      line.append(!w ? "no class roll found" : w.by ? `by ${N.person(w.by)} at ${fmtTime(w.at)}${w.className ? ` (${w.className})` : ""}` : "roll not saved");
    });
    line.title = line.textContent;
    return line;
  }

  // Loads who marked the rolls of the rows on screen, MARK_REQUESTS_AT_ONCE at a time.
  function queueMarks(rows) {
    for (const r of rows) {
      const k = markKey(r);
      if (marks.has(k)) continue;
      marks.set(k, { state: "busy" });
      markQueue.push(r);
    }
    while (markRunning < MARK_REQUESTS_AT_ONCE && markQueue.length) {
      const r = markQueue.shift();
      markRunning++;
      A.loadMarkings(r.userId, r.date, r.periods)
        .then((list) => marks.set(markKey(r), { state: "done", list }),
          (e) => marks.set(markKey(r), { state: "fail", error: e.message || String(e) }))
        .finally(() => { markRunning--; drawSoon(); queueMarks([]); });
    }
  }
  let drawFrame = 0;
  const drawSoon = () => { if (!drawFrame) drawFrame = requestAnimationFrame(() => { drawFrame = 0; draw(); }); };

  // --- loading progress ------------------------------------------------------------------------
  const num = (n) => Number(n || 0).toLocaleString("en-AU");
  const clock = (ms) => { const t = Math.round(ms / 1000); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
  const ICON = { wait: "○", busy: "●", done: "✓", skip: "–", fail: "✕" };

  function newRun(dates) {
    return {
      started: Date.now(), finished: 0, stopped: false,
      steps: {
        students: { name: "Student list", state: "wait", detail: "" },
        grid: { name: "Attendance grid (names)", state: "wait", detail: "" },
        classes: { name: "Class list", state: "wait", detail: "", hidden: true }, // only at schools with periods
      },
      days: new Map(dates.map((d) => [fmt(d), { state: "wait", detail: "", frac: 0, rolls: 0 }])),
    };
  }

  // One progress event from loadInconsistencyRange (see data.js for the shapes).
  function track(p) {
    if (!run) return;
    const st = run.steps;
    if (p.phase === "students") {
      st.students.state = p.count == null ? "busy" : "done";
      st.students.detail = p.count == null ? "" : `${num(p.count)} students`;
    } else if (p.phase === "grid") {
      st.grid.state = p.done >= p.total ? "done" : "busy";
      st.grid.detail = `${p.done} / ${plural(p.total, "week")}`;
    } else if (p.phase === "classes") {
      st.classes.hidden = false;
      st.classes.state = p.done >= p.total ? "done" : "busy";
      st.classes.detail = p.done >= p.total ? `${num(p.total)} subjects` : `${num(p.done)} / ${num(p.total)} subjects`;
      const d = run.days.get(p.date);
      if (d) d.detail = "Loading the class list…";
    } else if (p.phase === "rolls") {
      st.classes.hidden = false;
      if (st.classes.state !== "done") { st.classes.state = "done"; st.classes.detail ||= "loaded"; }
      const d = run.days.get(p.date);
      if (!d) return;
      d.rolls = p.rolls || 0;
      const parts = [];
      if (p.period) parts.push(p.periods > 1 ? `${p.period} (period ${p.periodNo} of ${p.periods})` : p.period);
      parts.push(`${num(p.done)} / ${num(p.total)} class rolls checked`);
      if (p.expected) parts.push(`${num(p.found)} of ${num(p.expected)} students found`);
      d.detail = parts.join(" · ");
      d.frac = p.expected ? Math.min(1, p.found / p.expected) : p.total ? p.done / p.total : 0;
    } else if (p.phase === "day") {
      const d = run.days.get(p.date);
      if (!d) return;
      d.state = p.state;
      if (p.state === "busy") { d.detail = "Loading the period structure…"; d.frac = 0; }
      else if (p.state === "skip") d.detail = p.note;
      else if (p.state === "fail") d.detail = p.error;
      else if (p.state === "done") {
        d.rolls = p.rolls || 0;
        d.detail = p.mode === "halfday" ? `${num(p.students)} students · AM/PM grid`
          : `${num(p.students)} students · ${num(p.rolls)} class rolls opened${p.stoppedAfter ? ` · everyone found by ${p.stoppedAfter}, the later periods were skipped` : ""}`;
      }
    }
    drawLoaderSoon();
  }

  // The share of the load that is done: the days that are finished, plus the part of the current day.
  function overall() {
    if (!run?.days.size) return 0;
    let done = 0;
    for (const d of run.days.values()) done += d.state === "wait" ? 0 : d.state === "busy" ? d.frac : 1;
    return done / run.days.size;
  }

  let frame = 0;
  const drawLoaderSoon = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawLoader(); }); };

  function stepRow(name, state, detail) {
    const row = el("div", `step ${state}`);
    row.append(el("span", "ic", ICON[state]), el("span", "nm", name));
    if (detail) row.append(el("span", "dt", `· ${detail}`));
    return row;
  }

  function drawLoader() {
    const box = $("loader");
    box.hidden = !busy || !run;
    if (box.hidden) return;
    const f = overall();
    const pct = Math.floor(f * 100);
    $("lpct").textContent = `${pct}%`;
    $("lbar").firstElementChild.style.width = `${pct}%`;
    $("lbar").setAttribute("aria-valuenow", String(pct));
    const rolls = [...run.days.values()].reduce((n, d) => n + d.rolls, 0);
    $("lrolls").textContent = rolls ? `${num(rolls)} class rolls opened` : "";
    // The time so far, and a rough estimate once there is enough to go on.
    const elapsed = Date.now() - run.started;
    let time = `${clock(elapsed)} so far`;
    if (stopRequested) time += " · stopping after the current requests…";
    else if (f > 0.02 && elapsed > 5000 && f < 1) {
      const left = (elapsed * (1 - f)) / f;
      time += left < 60000 ? " · less than a minute left" : ` · about ${Math.round(left / 60000)} min left`;
    }
    $("ltime").textContent = time;
    $("stop").disabled = stopRequested;

    const steps = $("lsteps");
    steps.textContent = "";
    for (const st of Object.values(run.steps)) if (!st.hidden) steps.append(stepRow(st.name, st.state, st.detail));
    const days = $("ldays");
    days.textContent = "";
    for (const [date, d] of run.days) days.append(stepRow(fmtShort(date), d.state, d.detail));
  }

  function drawStatus() {
    drawLoader();
    const st = $("status");
    if (busy) { st.textContent = ""; st.className = "status"; return; }
    const wanted = new Set(rangeDates().map(fmt));
    const errs = [...failed].filter(([d]) => wanted.has(d));
    if (error) { st.textContent = error; st.className = "status err"; }
    else if (errs.length) { st.textContent = `Couldn't load ${errs.map(([d, e]) => `${fmtShort(d)} (${e})`).join(" · ")}`; st.className = "status err"; }
    else if (run?.stopped) {
      const n = [...run.days.values()].filter((d) => d.state === "done").length;
      st.textContent = `Stopped · ${plural(n, "school day")} loaded of ${run.days.size} days. Click the reload button, or the same Days button again, to load the rest.`;
      st.className = "status";
    } else if (lastUpdated && run) {
      const rolls = [...run.days.values()].reduce((n, d) => n + d.rolls, 0);
      st.textContent = `Updated ${fmtTime(lastUpdated)} · loaded in ${clock(run.finished - run.started)}${rolls ? ` · ${num(rolls)} class rolls opened` : ""}`;
      st.className = "status";
    } else { st.textContent = ""; st.className = "status"; }
  }

  // --- loading -------------------------------------------------------------------------------
  // Loads the range's days that aren't loaded yet; fresh: load them all again. Today is always
  // loaded again, as its rolls can still change.
  async function load({ fresh = false } = {}) {
    if (busy) { again = true; return; }
    busy = true;
    error = "";
    stopRequested = false;
    const today = fmt(new Date());
    if (fresh) { loaded.clear(); failed.clear(); marks.clear(); markQueue = []; }
    A.forgetMarkings(fresh ? null : today);
    const dates = rangeDates().filter((d) => fresh || fmt(d) === today || !loaded.has(fmt(d)));
    for (const d of dates) loaded.delete(fmt(d));
    for (const k of [...marks.keys()]) if (k.endsWith(`|${today}`) && marks.get(k).state !== "busy") marks.delete(k); // today's rolls can still change
    run = newRun(dates);
    const ticker = setInterval(drawLoader, 1000); // the clock
    draw();
    try {
      const res = await A.loadInconsistencyRange(dates, {
        onProgress: track,
        onDay: (day) => { loaded.set(day.date, day); failed.delete(day.date); groupMembers.reset(); showYears(); draw(); },
        stopped: () => stopRequested,
      });
      for (const { date, error: e } of res.errors) failed.set(date, e);
      run.stopped = res.stopped;
      lastUpdated = new Date();
    } catch (e) {
      error = e.message || String(e);
    } finally {
      clearInterval(ticker);
      run.finished = Date.now();
      busy = false;
      stopRequested = false;
      showYears();
      draw();
      if (again) { again = false; load(); }
    }
  }

  $("stop").onclick = () => { stopRequested = true; again = false; drawLoader(); };
  // The print heading: what was printed (range, settings and filter) and when.
  function printInfo() {
    const dates = rangeDates();
    const span = range === "today" ? `Today, ${fmtLong(fmt(dates[0]))}` : `${RANGES[range][0][0].toUpperCase()}${RANGES[range][0].slice(1)} (${fmtShort(fmt(dates[0]))} to ${fmtShort(fmt(dates[dates.length - 1]))})`;
    const filter = G.isGroups(years) ? G.label(years) : Array.isArray(years) ? (years.length ? Y.label(years) : "No year groups") : "All year groups";
    const parts = [span, filter, rule === "any" ? "Any mix" : "Absent between presents", absences === "all" ? "All absences" : "Unapproved absences"];
    if (busy) parts.push("Still loading: some days may be missing");
    parts.push(`Printed ${new Date().toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`);
    $("printinfo").textContent = parts.join(" · ");
  }
  window.addEventListener("beforeprint", printInfo); // also for the browser's own Print command
  $("print").onclick = () => { printInfo(); window.print(); };
  $("refresh").onclick = () => load({ fresh: true });
  drawLegend();
  const offNames = N.onChange(() => draw());
  window.addEventListener("pagehide", offNames);

  try {
    chrome.storage.local.get([RULE_KEY, ABSENCES_KEY, ORDER_KEY, GROUP_KEY, YEARS_KEY], (r) => {
      groupBy = r?.[GROUP_KEY] === "student" ? "student" : "day";
      showGroup();
      order = r?.[ORDER_KEY] === "last" ? "last" : "first";
      showOrder();
      rule = r?.[RULE_KEY] === "any" ? "any" : "between";
      absences = r?.[ABSENCES_KEY] === "all" ? "all" : "unapproved";
      years = G.validSelection(r?.[YEARS_KEY] ?? null);
      showRule();
      showAbsences();
      showYears();
      load();
    });
  } catch (_) { load(); }
})();
