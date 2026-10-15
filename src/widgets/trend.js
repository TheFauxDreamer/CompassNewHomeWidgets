// "Attendance Trend" widget: the % present of each roll session (AM and PM) of this week and
// last week, as one line, oldest to newest. It has its own year-group or Custom Group filter.
// Counts only: the card never shows a student's name.
// Data: CompassAttendance.loadTrend (src/widgets/attendance/data.js), the same half-day grid
// as the Attendance widget, for two weeks.
globalThis.CompassTrendUI = (() => {
  const REFRESH_MINUTES = 60;
  const CHART_HEIGHT = 150;
  const LINE = "#0072B2"; // the Present colour of the attendance widgets

  const CSS_EXTRA = `
    .summary { color: #3E4B62; font-size: 13px; height: 20px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary b { color: #203249; }
    .summary .up { color: #1E7B34; font-weight: 600; }
    .summary .down { color: #B3261E; font-weight: 600; }
    .plot { position: relative; height: ${CHART_HEIGHT}px; }
    .plot svg { display: block; width: 100%; height: ${CHART_HEIGHT}px; overflow: visible; }
    .plot .msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center;
      color: #5f6368; font-size: 13px; padding: 0 16px; }
    .axis { font: 10px Cabin, Roboto, system-ui, sans-serif; fill: #5f6368; }
    .grid { stroke: #EAEBEE; stroke-width: 1; }
    .week { stroke: #dadce0; stroke-width: 1; stroke-dasharray: 3 3; }
    .hit { fill: transparent; }
    .hit:hover { fill: rgba(32, 50, 73, .06); }
    .status { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status.err { color: #b3261e; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function svgEl(tag, attrs = {}, title) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (title) { const t = document.createElementNS(NS, "title"); t.textContent = title; e.append(t); }
    return e;
  }
  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const dateOf = (s) => { const [y, m, d] = s.split("/").map(Number); return new Date(y, m - 1, d); };
  const fmtDay = (s) => dateOf(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  function mount(host, { preview = false } = {}) {
    const A = globalThis.CompassAttendance;
    const G = globalThis.CompassGroups;
    const Y = globalThis.CompassYears;
    const { CSS, ICONS } = globalThis.CompassTheme;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${Y.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Attendance Trend</h1>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow" id="yrow"></div>
        <div class="yarea" id="yarea">
          <div class="summary" id="summary"></div>
          <div class="plot" id="plot"></div>
        </div>
        <div class="status" id="status"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    globalThis.CompassNames.attach(root);

    const YEARS_KEY = "trendYearGroups"; // array of year names; null = all; or a group selection (groups.js)
    let data = null, years = null, error = "", busy = false, lastLoaded = 0, lastUpdated = null;

    // --- filter (the same as the other widgets, with its own selection) ----------------------
    const yearFilter = Y.filter({ onChange: (next) => setYears(next, true), groups: G });
    $("yrow").append(yearFilter.chip);
    $("yarea").append(yearFilter.panel);
    const groupMembers = G.tracker(() => draw());
    const showYears = () => yearFilter.set(data ? A.yearLevels(data.students) : [], years);
    function setYears(next, save) {
      next = G.validSelection(next);
      years = Array.isArray(next) ? Y.sort(next) : next;
      if (save) { try { chrome.storage.local.set({ [YEARS_KEY]: years }); } catch (_) {} }
      showYears();
      draw();
    }
    // The students after the filter, or null while a group's members load.
    function filtered() {
      if (G.isGroups(years)) {
        let members;
        try { members = groupMembers.get(years); } catch (e) { error = `Couldn't load the group: ${e.message || e}`; return []; }
        return members ? A.filterByUsers(data.students, members) : null;
      }
      return Array.isArray(years) ? A.filterByYears(data.students, years) : data.students;
    }

    function setStatus(text, err = false) {
      const s = $("status");
      s.textContent = s.title = text;
      s.className = err ? "status err" : "status";
    }
    function message(text) {
      const plot = $("plot");
      plot.textContent = "";
      plot.append(el("div", "msg", text));
    }
    function skeleton() {
      $("summary").textContent = "";
      $("summary").append(Object.assign(el("span", "sk"), { style: "width:180px;height:16px;display:inline-block" }));
      const plot = $("plot");
      plot.textContent = "";
      plot.append(Object.assign(el("div", "sk"), { style: `height:${CHART_HEIGHT - 20}px;margin-top:10px` }));
    }

    function draw() {
      if (!data) {
        if (busy) skeleton();
        else if (error) { $("summary").textContent = "Couldn't load attendance"; message(error); }
        return;
      }
      const students = filtered();
      if (students === null) { $("summary").textContent = `Loading ${G.label(years)}…`; skeleton(); return; }
      if (Array.isArray(years) && !years.length) { $("summary").textContent = "No year groups selected"; message("Select year groups with the chip above."); return; }
      const points = data.sessions.map(({ date, half }) => {
        const t = A.tally(students, date, half);
        return { date, half, present: t.counts.present, total: t.total, value: t.total ? t.counts.present / t.total : null };
      }).filter((p) => p.value != null);
      if (!points.length) { $("summary").textContent = "No marked roll sessions"; message("No marked roll sessions this week or last week."); return; }

      // Summary: the latest session, and the change from the session before.
      const last = points[points.length - 1], before = points[points.length - 2];
      const s = $("summary");
      s.textContent = "";
      s.append(el("b", null, `${fmtDay(last.date)} ${last.half.toUpperCase()}`), ` · ${pct(last.present, last.total)}% present`);
      if (before) {
        const diff = pct(last.present, last.total) - pct(before.present, before.total);
        s.append(" · ", diff ? el("span", diff > 0 ? "up" : "down", `${diff > 0 ? "▲" : "▼"}${Math.abs(diff)} pts`) : "no change",
          ` from ${before.date === last.date ? before.half.toUpperCase() : `${fmtDay(before.date)} ${before.half.toUpperCase()}`}`);
      }
      s.title = s.textContent;

      // Geometry: sessions evenly spaced; the % axis from a round number below the lowest point to 100%.
      const plot = $("plot");
      plot.textContent = "";
      const W = plot.clientWidth || 320, H = CHART_HEIGHT;
      const m = { l: 32, r: 8, t: 8, b: 28 };
      const low = Math.max(0, Math.floor((Math.min(...points.map((p) => p.value)) * 100 - 5) / 10) * 10) / 100;
      const step = points.length > 1 ? (W - m.l - m.r) / (points.length - 1) : 0;
      const x = (i) => (points.length > 1 ? m.l + i * step : (W + m.l - m.r) / 2);
      const y = (v) => m.t + (1 - (v - low) / (1 - low)) * (H - m.t - m.b);
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Present: ${points.map((p) => `${fmtDay(p.date)} ${p.half.toUpperCase()} ${pct(p.present, p.total)}%`).join(", ")}` });
      for (const v of [low, (low + 1) / 2, 1]) {
        svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid" }));
        svg.append(Object.assign(svgEl("text", { x: m.l - 4, y: y(v) + 3, "text-anchor": "end", class: "axis" }), { textContent: `${Math.round(v * 100)}%` }));
      }
      // Day labels under each day's sessions, and a dashed line where a new week starts.
      const days = [];
      points.forEach((p, i) => { if (!days.length || days[days.length - 1].date !== p.date) days.push({ date: p.date, from: i, to: i }); else days[days.length - 1].to = i; });
      days.forEach((d, k) => {
        const cx = (x(d.from) + x(d.to)) / 2;
        const dt = dateOf(d.date);
        svg.append(Object.assign(svgEl("text", { x: cx, y: H - 15, "text-anchor": "middle", class: "axis" }), { textContent: dt.toLocaleDateString("en-AU", { weekday: "short" }).slice(0, 2) }));
        svg.append(Object.assign(svgEl("text", { x: cx, y: H - 4, "text-anchor": "middle", class: "axis" }), { textContent: String(dt.getDate()) }));
        if (k && dt.getDay() < dateOf(days[k - 1].date).getDay()) {
          const wx = (x(days[k - 1].to) + x(d.from)) / 2;
          svg.append(svgEl("line", { x1: wx, x2: wx, y1: m.t, y2: H - m.b, class: "week" }));
        }
      });
      // The line, the points (with a ring of the card colour) and a hover column for each point.
      svg.append(svgEl("path", { d: points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(""),
        fill: "none", stroke: LINE, "stroke-width": 2, "stroke-linejoin": "round" }));
      // Each hover column runs from the midpoint with the point before to the midpoint with the
      // point after, and stops at the plot's edges, so it never goes outside the card.
      points.forEach((p, i) => {
        svg.append(svgEl("circle", { cx: x(i), cy: y(p.value), r: 4, fill: LINE, stroke: "#fff", "stroke-width": 2 }));
        const x0 = i ? (x(i - 1) + x(i)) / 2 : m.l, x1 = i < points.length - 1 ? (x(i) + x(i + 1)) / 2 : W - m.r;
        svg.append(svgEl("rect", { x: x0, y: m.t, width: Math.max(0, x1 - x0), height: H - m.t - m.b, class: "hit" },
          `${fmtDay(p.date)} · ${p.half.toUpperCase()} · ${pct(p.present, p.total)}% present (${p.present} of ${p.total})`));
      });
      plot.append(svg);
    }

    function drawStatus() {
      if (error && data) setStatus(`Couldn't refresh · trying again in ${REFRESH_MINUTES} min`, true);
      else if (data && lastUpdated) setStatus(`This week and last week · updated ${fmtTime(lastUpdated)} · refreshes every ${REFRESH_MINUTES} min`);
      else setStatus(`Refreshes every ${REFRESH_MINUTES} min`);
    }

    async function refresh() {
      if (busy) return;
      busy = true;
      if (!data) skeleton();
      try {
        data = await A.loadTrend(new Date());
        error = "";
        lastUpdated = new Date();
        groupMembers.reset();
        showYears();
      } catch (e) {
        error = e.message || String(e);
      } finally {
        lastLoaded = Date.now();
        busy = false;
        draw();
        drawStatus();
      }
    }

    if (preview) {
      skeleton();
      setStatus("Preview – the trend shows on the homepage");
      return {};
    }

    try {
      chrome.storage.local.get([YEARS_KEY], (r) => {
        years = G.validSelection(r?.[YEARS_KEY] ?? null);
        showYears();
        refresh();
      });
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area === "local" && YEARS_KEY in changes && JSON.stringify(changes[YEARS_KEY].newValue ?? null) !== JSON.stringify(years)) {
          setYears(changes[YEARS_KEY].newValue ?? null, false);
        }
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) { refresh(); }
    $("refresh").onclick = () => refresh();

    // Redraw when the card's width changes; reload every REFRESH_MINUTES (also when the tab is
    // opened again, as browsers slow background timers).
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due()) refresh(); };
    const timer = setInterval(onVisible, 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    const resize = new ResizeObserver(() => { if (data && !busy) draw(); });
    resize.observe($("plot"));
    return { refresh, stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); resize.disconnect(); } };
  }

  return { mount };
})();
