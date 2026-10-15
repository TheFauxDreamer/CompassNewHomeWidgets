// "Attendance today" widget: attendance across the school day, on one time axis.
//   Periods: one stacked bar for each period (present, excursion, approved, unapproved,
//            not marked). Periods that haven't started show as empty outlines.
//   On site: the share of students at school through the day. It starts from the first
//            roll, goes up with late arrivals and down with early departures.
// The user picks the view; a playhead marks the current time in both. Counts only: the
// card never shows a student's name.
// Data: CompassAttendance.loadDay (src/widgets/attendance/data.js) and
// CompassMovements.load (src/widgets/movements.js).
globalThis.CompassDayAttendanceUI = (() => {
  const REFRESH_MINUTES = 15;
  const SAMPLE_MINUTES = 5;   // the on-site line has one point every 5 minutes
  const CHART_HEIGHT = 150;
  // On site, by year: one line for each year group. Eight colour-blind-checked hues in a fixed
  // order. A year group's colour comes from its place among all the school's year groups, so a
  // filter never repaints the others. Year groups past the eighth are not drawn (the legend says so).
  const YEAR_COLOURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const TOTAL_COLOUR = "#203249";

  const CSS_EXTRA = `
    .yrow { align-items: center; justify-content: space-between; gap: 8px; }
    .seg button { color: #3E4B62; }
    .seg button[aria-pressed="true"] { color: #fff; }
    .summary { color: #3E4B62; font-size: 13px; height: 20px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary b { color: #203249; }
    .plot { position: relative; height: ${CHART_HEIGHT}px; }
    .plot svg { display: block; width: 100%; height: ${CHART_HEIGHT}px; overflow: visible; }
    .plot .msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center;
      color: #5f6368; font-size: 13px; padding: 0 16px; }
    .legend { display: flex; flex-wrap: wrap; gap: 2px 12px; height: 36px; overflow: hidden; margin-top: 6px; font-size: 12px; color: #3E4B62; }
    .legend span.item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    .legend .sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    .legend .sw.line { height: 3px; border-radius: 2px; }
    .legend .n { color: #5f6368; min-width: 0; }
    .legend .seg button { padding: 0 8px; font-size: 11px; line-height: 18px; }
    .status { color: #5f6368; font-size: 12px; margin-top: 2px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status.err { color: #b3261e; }
    .axis { font: 10px Cabin, Roboto, system-ui, sans-serif; fill: #5f6368; }
    .grid { stroke: #EAEBEE; stroke-width: 1; }
    .head { stroke: #B3261E; stroke-width: 2; }
    .bubble { font: 600 10px Cabin, Roboto, system-ui, sans-serif; fill: #fff; }
    .spin { transform-box: fill-box; transform-origin: center; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 3s; } }
    .spin-count { font: 600 16px Cabin, Roboto, system-ui, sans-serif; fill: #203249; }
    /* Loading: the ring (with the overall %) and a list of the steps beside it. */
    .loading { display: flex; align-items: center; justify-content: center; gap: 16px; height: 100%; }
    .loading svg { width: 96px; height: 96px; flex: none; }
    .steps { display: flex; flex-direction: column; gap: 3px; font-size: 12px; min-width: 0; }
    .step { display: flex; align-items: center; gap: 6px; color: #9aa0a6; white-space: nowrap; }
    .step .ic { width: 14px; text-align: center; flex: none; font-weight: 700; }
    .step .dt { color: #5f6368; font-variant-numeric: tabular-nums; }
    .step.busy { color: #203249; font-weight: 600; }
    .step.busy .ic { color: #0E6CD9; }
    .step.done { color: #3E4B62; }
    .step.done .ic { color: #2e7d32; }
    .step.fail, .step.fail .ic { color: #b3261e; }
    .hit { fill: transparent; }
    .hit:hover { fill: rgba(32, 50, 73, .06); }
  `;
  const NS = "http://www.w3.org/2000/svg";
  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const fmtHour = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric" }).replace(/\s/g, "").toLowerCase();
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function svgEl(tag, attrs = {}, title) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (title) { const t = document.createElementNS(NS, "title"); t.textContent = title; e.append(t); }
    return e;
  }

  // --- students on site --------------------------------------------------------------------
  // For each student, the times they arrive (+1) and leave (-1), from the first roll and the
  // arrivals and departures of today:
  //   - present at the first period that has a mark, and no arrival before any departure:
  //     on site from the start of that period;
  //   - an arrival brings them on site, a departure takes them off (and a later arrival back);
  //   - absent at the start and no arrival: on site from the first later period where they
  //     are present.
  // Excursion students are off site.
  function onSiteChanges(students, periods, moves) {
    const changes = [];
    for (const s of students) {
      const evs = moves.get(s.userId) || [];
      const first = s.statuses.findIndex((x) => x && x.category !== "excluded" && x.category !== "unknown");
      if (first < 0) continue;
      let on = s.statuses[first].category === "present" && evs[0]?.type !== "arrival";
      if (on) changes.push([periods[first].start.getTime(), 1]);
      for (const ev of evs) {
        if (ev.type === "arrival" && !on) { changes.push([ev.time.getTime(), 1]); on = true; }
        else if (ev.type === "departure" && on) { changes.push([ev.time.getTime(), -1]); on = false; }
      }
      if (!evs.length && !on) {
        const later = s.statuses.findIndex((x, i) => i > first && x?.category === "present");
        if (later > 0) changes.push([periods[later].start.getTime(), 1]);
      }
    }
    return changes.sort((a, b) => a[0] - b[0]);
  }

  // [{ time, count }] every SAMPLE_MINUTES from the first period's start until `until`.
  function samples(changes, from, until) {
    const out = [];
    let i = 0, count = 0;
    for (let t = from; t <= until; t += SAMPLE_MINUTES * 60000) {
      while (i < changes.length && changes[i][0] <= t) count += changes[i++][1];
      out.push({ time: new Date(t), count });
    }
    return out;
  }

  function mount(host, { preview = false } = {}) {
    const A = globalThis.CompassAttendance;
    const G = globalThis.CompassGroups;
    const Y = globalThis.CompassYears;
    const { CSS, ICONS } = globalThis.CompassTheme;
    const CATS = A.CATEGORIES;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${Y.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Attendance Today</h1>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow" id="yrow">
          <div class="seg" id="view">
            <button data-v="periods" title="One bar for each period">Periods</button>
            <button data-v="onsite" title="Students at school through the day">On site</button>
          </div>
        </div>
        <div class="yarea" id="yarea">
          <div class="summary" id="summary"></div>
          <div class="plot" id="plot"></div>
          <div class="legend" id="legend"></div>
        </div>
        <div class="status" id="status"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    globalThis.CompassNames.attach(root);

    let day = null;        // loadDay() result
    let moves = new Map(); // uid -> [{ type, time }] of today, oldest first
    let movesError = "";
    let lastLoaded = 0, lastUpdated = null, busy = false, again = false, error = "";
    const VIEW_KEY = "dayAttendanceView";   // "periods" | "onsite"
    const YEARS_KEY = "dayYearGroups";      // array of year names; null = all; or a group selection (groups.js)
    const SPLIT_KEY = "dayOnsiteSplit";     // "total" | "years": the On site view's lines
    const SCALE_KEY = "dayOnsiteScale";     // "full" (0–100%) | "fit": the On site view's % axis
    let view = "periods", years = null, split = "total", scale = "full";
    const save = (key, value) => { try { chrome.storage.local.set({ [key]: value }); } catch (_) {} };

    // --- filter (the same as the other widgets, with its own selection) ----------------------
    const yearFilter = Y.filter({ onChange: (next) => setYears(next, true), groups: G });
    $("yrow").prepend(yearFilter.chip);
    $("yarea").append(yearFilter.panel);
    const groupMembers = G.tracker(() => draw());
    const showYears = () => yearFilter.set(day ? A.yearLevels(day.students) : [], years);
    function setYears(next, fromUser) {
      next = G.validSelection(next);
      years = Array.isArray(next) ? Y.sort(next) : next;
      if (fromUser) save(YEARS_KEY, years);
      showYears();
      draw();
    }

    function showView() { for (const b of root.querySelectorAll("#view button")) b.setAttribute("aria-pressed", String(b.dataset.v === view)); }
    function setView(v, fromUser) {
      view = v === "onsite" ? "onsite" : "periods";
      showView();
      if (fromUser) save(VIEW_KEY, view);
      draw();
    }
    for (const b of root.querySelectorAll("#view button")) b.onclick = () => setView(b.dataset.v, true);
    showView();
    function setScale(v, fromUser) {
      scale = v === "fit" ? "fit" : "full";
      if (fromUser) save(SCALE_KEY, scale);
      draw();
    }
    function setSplit(v, fromUser) {
      split = v === "years" ? "years" : "total";
      if (fromUser) save(SPLIT_KEY, split);
      draw();
    }

    // The students after the filter, or null while a group's members load (then draw() runs again).
    // list: day.students (default), or day.roster (every active student, for the enrolled count).
    function filtered(list = day?.students) {
      if (!day) return [];
      if (G.isGroups(years)) {
        let members;
        try { members = groupMembers.get(years); } catch (e) { error = `Couldn't load the group: ${e.message || e}`; return []; }
        return members ? A.filterByUsers(list, members) : null;
      }
      return Array.isArray(years) ? A.filterByYears(list, years) : list;
    }

    // --- drawing -------------------------------------------------------------------------------
    function setStatus(text, err = false) {
      const s = $("status");
      s.textContent = s.title = text;
      s.className = err ? "status err" : "status";
    }
    function message(text) {
      const plot = $("plot");
      plot.textContent = "";
      plot.append(el("div", "msg", text));
      $("legend").textContent = "";
    }

    // --- loading progress ----------------------------------------------------------------------
    // The steps of a load, in order. "classes" shows only for schools with more periods than
    // AM and PM; "moves" (Arrivals & Departures) loads beside the others.
    const STEPS = [
      ["periods", "Period structure"],
      ["students", "Student list"],
      ["grid", "Attendance"],
      ["classes", "Class list"],
      ["rolls", "Rolls"],
      ["moves", "Arrivals & departures"],
    ];
    const ORDER = ["periods", "students", "grid", "classes", "rolls"]; // loadDay's steps, one after another
    let steps = null; // key -> { state: "wait" | "busy" | "done" | "fail", detail, name }

    function resetSteps() {
      steps = Object.fromEntries(STEPS.map(([k, name]) => [k, { state: "wait", detail: "", name }]));
    }
    // loadDay's progress: { step } when a step starts; { done, total, label } while rolls load.
    function onProgress(p) {
      if (!steps) return;
      const key = p.step || "rolls";
      for (const k of ORDER.slice(0, ORDER.indexOf(key))) if (steps[k].state === "busy") steps[k].state = "done";
      const st = steps[key];
      if (p.label) st.name = p.label[0].toUpperCase() + p.label.slice(1);
      if (p.total != null) {
        st.detail = `${p.done} / ${p.total}`;
        st.state = p.done >= p.total ? "done" : "busy";
      } else st.state = "busy";
      showSteps();
    }
    // At the end of loadDay: the steps still open are done (a school with nothing to check
    // never starts "rolls").
    function finishSteps(failed) {
      for (const k of ORDER) {
        const st = steps[k];
        if (st.state === "busy") st.state = failed ? "fail" : "done";
        else if (st.state === "wait" && k === "rolls" && !failed) { st.state = "done"; st.detail = "none to check"; }
      }
      showSteps();
    }
    const visibleSteps = () => STEPS.filter(([k]) => k !== "classes" || steps[k].state !== "wait");
    // The share of the load that is done: whole steps, plus the part of the rolls step.
    function overall() {
      const list = visibleSteps();
      let done = 0;
      for (const [k] of list) {
        const st = steps[k];
        if (st.state === "done" || st.state === "fail") done++;
        else if (k === "rolls" && st.detail.includes("/")) {
          const [a, b] = st.detail.split("/").map(Number);
          if (b) done += a / b;
        }
      }
      return Math.round((done / list.length) * 100);
    }

    // The loading look: a turning ring, and the steps beside it while data loads.
    function drawLoading() {
      const plot = $("plot");
      plot.textContent = "";
      const box = el("div", "loading");
      const r = 40, c = 48;
      const svg = svgEl("svg", { viewBox: "0 0 96 96" });
      svg.append(svgEl("circle", { cx: c, cy: c, r, fill: "#f1f3f4", stroke: "#dadce0", "stroke-width": 1.5 }));
      svg.append(svgEl("circle", { cx: c, cy: c, r: r - 6, fill: "none", stroke: "#0E6CD9", "stroke-width": 5, "stroke-linecap": "round",
        "stroke-dasharray": `${(Math.PI * 2 * (r - 6)) / 4} ${Math.PI * 2 * (r - 6)}`, class: "spin" }));
      svg.append(svgEl("text", { x: c, y: c + 6, "text-anchor": "middle", class: "spin-count" }));
      box.append(svg);
      if (busy && steps) box.append(el("div", "steps"));
      plot.append(box);
      $("legend").textContent = "";
      showSteps();
    }

    function showSteps() {
      if (!steps) return;
      const list = root.querySelector(".steps");
      const count = root.querySelector(".spin-count");
      if (list) {
        if (count) count.textContent = `${overall()}%`;
        list.textContent = "";
        for (const [k] of visibleSteps()) {
          const st = steps[k];
          const row = el("div", `step ${st.state}`);
          row.append(el("span", "ic", { wait: "○", busy: "●", done: "✓", fail: "✕" }[st.state]), st.name);
          if (st.detail) row.append(el("span", "dt", st.detail));
          list.append(row);
        }
        return;
      }
      // An automatic refresh keeps the graph: the status line names the current step.
      if (busy) {
        const now = visibleSteps().map(([k]) => steps[k]).find((st) => st.state === "busy");
        if (now) setStatus(`Refreshing · ${now.name}${now.detail ? ` ${now.detail}` : "…"}`);
      }
    }

    // Counts of each category for one period: { present: n, …, total, excluded, unknown }.
    // total counts only the chart's categories (not "excluded" or "unknown").
    function countsFor(students, i) {
      const c = Object.fromEntries(CATS.map((k) => [k.key, 0]));
      let total = 0, excluded = 0, unknown = 0;
      for (const s of students) {
        const cat = s.statuses[i]?.category;
        if (cat in c) { c[cat]++; total++; }
        else if (cat === "excluded") excluded++;
        else if (cat === "unknown") unknown++;
      }
      return { ...c, total, excluded, unknown };
    }

    function draw() {
      if (busy && !day) { drawLoading(); return; }
      if (error && !day) { $("summary").textContent = "Couldn't load attendance"; message(error); return; }
      if (!day) return;
      const now = new Date();
      if (!day.periods.length) {
        $("summary").textContent = day.note || "No school today";
        message(day.note ? `${day.note} · no attendance today` : "No school today");
        return;
      }
      const students = filtered();
      if (students === null) { $("summary").textContent = `Loading ${G.label(years)}…`; drawLoading(); return; }
      const { periods } = day;
      const startedIdx = periods.map((p, i) => (p.start <= now ? i : -1)).filter((i) => i >= 0);
      const latest = startedIdx.length ? startedIdx[startedIdx.length - 1] : -1;

      // Geometry: one time axis for both views.
      const plot = $("plot");
      plot.textContent = "";
      const W = plot.clientWidth || 320, H = CHART_HEIGHT;
      const m = { l: 30, r: 6, t: 6, b: 18 };
      const from = periods[0].start.getTime(), to = Math.max(...periods.map((p) => p.finish.getTime()));
      const x = (t) => m.l + ((t - from) / (to - from)) * (W - m.l - m.r);
      // The % axis runs from `low` to 100%. low is 0, except in the On site view with "Fit" (the
      // bars always start at 0%, because each bar is a whole split into parts).
      let low = 0;
      const y = (p) => m.t + (1 - (p - low) / (1 - low)) * (H - m.t - m.b);
      const bottom = H - m.b;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
      const defs = svgEl("defs");
      defs.innerHTML = '<pattern id="dhatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">' +
        '<rect width="2" height="5" fill="rgba(255,255,255,.5)"/></pattern>';
      svg.append(defs);
      const drawGrid = () => {
        for (const p of [low, (low + 1) / 2, 1]) {
          svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(p), y2: y(p), class: "grid" }));
          svg.append(Object.assign(svgEl("text", { x: m.l - 4, y: y(p) + 3, "text-anchor": "end", class: "axis" }), { textContent: `${Math.round(p * 100)}%` }));
        }
      };

      const legend = $("legend");
      legend.textContent = "";
      legend.title = "";
      const legendItem = (color, text, n, { line = false, hatch = false } = {}) => {
        const item = el("span", "item");
        if (color) {
          const sw = el("span", "sw" + (line ? " line" : ""));
          sw.style.background = color;
          if (hatch) sw.style.backgroundImage = "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 2px, transparent 2px 5px)";
          item.append(sw);
        }
        item.append(text);
        if (n != null) item.append(el("span", "n", String(n)));
        legend.append(item);
      };

      let summary, summaryNote = "";
      if (view === "periods") {
        drawGrid();
        // One stacked column for each period, across its start–finish time; 2px gaps.
        periods.forEach((p, i) => {
          const x0 = x(p.start.getTime()) + 1, x1 = x(p.finish.getTime()) - 1, bw = Math.max(2, x1 - x0);
          if (p.start > now) {
            svg.append(svgEl("rect", { x: x0, y: y(1), width: bw, height: y(0) - y(1), rx: 4, fill: "none", stroke: "#dadce0",
              "stroke-dasharray": "3 3" }, `${p.name} · starts ${fmtTime(p.start)}`));
          } else {
            const c = countsFor(students, i);
            let acc = 0;
            for (const k of CATS) {
              const n = c[k.key];
              if (!n || !c.total) continue;
              const y1 = y(acc / c.total), y2 = y((acc + n) / c.total);
              const tip = `${p.name} · ${k.label} ${n} (${pct(n, c.total)}%) of ${c.total}`;
              const seg = svgEl("rect", { x: x0, y: y2, width: bw, height: Math.max(0, y1 - y2 - 2), rx: 3, fill: k.color }, tip);
              svg.append(seg);
              if (k.hatch) svg.append(svgEl("rect", { x: x0, y: y2, width: bw, height: Math.max(0, y1 - y2 - 2), rx: 3, fill: "url(#dhatch)", "pointer-events": "none" }));
              acc += n;
            }
            // "% present", inside the bottom (Present) segment when it has room.
            if (c.total && bw > 26 && y(0) - y(c.present / c.total) > 16) {
              const t = svgEl("text", { x: x0 + bw / 2, y: y(0) - 6, "text-anchor": "middle", class: "bubble" });
              t.textContent = `${pct(c.present, c.total)}%`;
              svg.append(t);
            }
          }
          const label = svgEl("text", { x: x0 + bw / 2, y: H - 4, "text-anchor": "middle", class: "axis" });
          label.textContent = p.name;
          svg.append(label);
        });
        if (latest >= 0) {
          const c = countsFor(students, latest);
          for (const k of CATS) legendItem(k.color, k.label, c[k.key], { hatch: k.hatch });
          const enrolled = (day.roster ? filtered(day.roster) || [] : students).length;
          const enrol = A.enrolment(enrolled, c);
          summary = [{ b: periods[latest].name }, enrolled > c.total ? `${c.total} of ${enrolled} enrolled` : `${c.total} students`, `${pct(c.present, c.total)}% present`];
          summaryNote = A.enrolmentNote(enrol);
        } else {
          for (const k of CATS) legendItem(k.color, k.label, null, { hatch: k.hatch });
          summary = [`School starts at ${fmtTime(periods[0].start)}`];
        }
      } else {
        // The on-site line, as a share of the students with a mark today.
        const counted = students.filter((s) => s.statuses.some((x) => x && x.category !== "excluded" && x.category !== "unknown"));
        const total = counted.length;
        const until = Math.min(now.getTime(), to);
        const pts = until >= from ? samples(onSiteChanges(counted, periods, moves), from, until) : [];
        for (const t of hourTicks(from, to)) {
          const lab = svgEl("text", { x: x(t), y: H - 4, "text-anchor": "middle", class: "axis" });
          lab.textContent = fmtHour(new Date(t));
          svg.append(lab);
        }
        // By year: each year group's own share on site, from the same samples.
        const byYear = [];
        let notDrawn = [];
        if (split === "years" && until >= from) {
          const school = A.yearLevels(day.students);
          for (const yr of A.yearLevels(counted)) {
            const slot = school.indexOf(yr);
            if (slot < 0 || slot >= YEAR_COLOURS.length) { notDrawn.push(yr); continue; }
            const ys = A.filterByYears(counted, [yr]);
            byYear.push({ year: yr, colour: YEAR_COLOURS[slot], total: ys.length, pts: samples(onSiteChanges(ys, periods, moves), from, until) });
          }
        }
        // Fit: from a round number below the lowest point of any line to 100%, as in Attendance Trend.
        if (scale === "fit") {
          const values = [...pts.map((p) => (total ? p.count / total : 1)),
            ...byYear.flatMap((g) => (g.total ? g.pts.map((p) => p.count / g.total) : []))];
          if (values.length) low = Math.min(0.9, Math.max(0, Math.floor((Math.min(...values) * 100 - 5) / 10) * 10 / 100));
        }
        drawGrid();
        const path = (list, tot) => list.map((p, i) => `${i ? "L" : "M"}${x(p.time.getTime()).toFixed(1)},${y(p.count / tot).toFixed(1)}`).join("");
        if (pts.length && total) {
          const line = path(pts, total);
          const colour = byYear.length ? TOTAL_COLOUR : "#0072B2";
          if (!byYear.length) svg.append(svgEl("path", { d: `${line}L${x(pts[pts.length - 1].time.getTime()).toFixed(1)},${bottom}L${x(from)},${bottom}Z`, fill: colour, "fill-opacity": 0.12 }));
          for (const g of byYear) {
            if (g.total) svg.append(svgEl("path", { d: path(g.pts, g.total), fill: "none", stroke: g.colour, "stroke-width": 2, "stroke-linejoin": "round" }));
          }
          // The total on top, thicker, so it reads as the main line.
          svg.append(svgEl("path", { d: line, fill: "none", stroke: colour, "stroke-width": byYear.length ? 3 : 2, "stroke-linejoin": "round" }));
          // Hover: one column for each point, wider than the line. By year, it lists every year group.
          const step = (x(from + SAMPLE_MINUTES * 60000) - x(from));
          pts.forEach((p, i) => {
            let tip = `${fmtTime(p.time)} · ${p.count} of ${total} on site (${pct(p.count, total)}%)`;
            for (const g of byYear) tip += `\n${g.year}: ${g.pts[i]?.count ?? 0} of ${g.total} (${pct(g.pts[i]?.count ?? 0, g.total)}%)`;
            // Kept inside the plot, so the first and last columns don't stick out of the card.
            const x0 = Math.max(m.l, x(p.time.getTime()) - step / 2), x1 = Math.min(W - m.r, x(p.time.getTime()) + step / 2);
            svg.append(svgEl("rect", { x: x0, y: m.t, width: Math.max(0, x1 - x0), height: H - m.t - m.b, class: "hit" }, tip));
          });
        }
        const nowCount = pts.length ? pts[pts.length - 1].count : 0;
        const arrivals = [...moves.values()].flat().filter((e) => e.type === "arrival").length;
        const departures = [...moves.values()].flat().filter((e) => e.type === "departure").length;
        // Total / By year, at the start of the legend.
        const seg = el("div", "seg");
        for (const [v, text, tip] of [["total", "Total", "One line for all students"], ["years", "By year", "A line for each year group, and the total"]]) {
          const b = el("button", null, text);
          b.type = "button";
          b.title = tip;
          b.setAttribute("aria-pressed", String(split === v));
          b.onclick = () => setSplit(v, true);
          seg.append(b);
        }
        legend.append(seg);
        // 0–100% / Fit: the range of the % axis.
        const fit = el("div", "seg");
        for (const [v, text, tip] of [["full", "0–100%", "The % axis from 0% to 100%"], ["fit", "Fit", "The % axis fits the lines, so small changes are easier to see"]]) {
          const b = el("button", null, text);
          b.type = "button";
          b.title = tip;
          b.setAttribute("aria-pressed", String(scale === v));
          b.onclick = () => setScale(v, true);
          fit.append(b);
        }
        legend.append(fit);
        if (byYear.length) {
          legendItem(TOTAL_COLOUR, "All", `${pct(nowCount, total)}%`, { line: true });
          for (const g of byYear) {
            const n = g.pts.length ? g.pts[g.pts.length - 1].count : 0;
            legendItem(g.colour, g.year, `${pct(n, g.total)}%`, { line: true });
          }
          if (notDrawn.length) legendItem(null, `Not drawn: ${notDrawn.join(", ")}`);
        } else {
          legendItem("#0072B2", "On site", null, { line: true });
          legendItem(null, `${arrivals} late arrival${arrivals === 1 ? "" : "s"} · ${departures} early departure${departures === 1 ? "" : "s"}`);
        }
        if (movesError) legendItem(null, "Arrivals & departures didn't load");
        // The full legend on hover, in case some year groups don't fit.
        legend.title = [...legend.querySelectorAll(".item")].map((i) => [...i.childNodes].map((n) => n.textContent).filter(Boolean).join(" ")).join(" · ");
        summary = pts.length ? [{ b: String(nowCount), after: ` of ${total} on site now` }, `${pct(nowCount, total)}%`] : [`School starts at ${fmtTime(periods[0].start)}`];
      }

      // Playhead: the current time.
      if (now.getTime() >= from && now.getTime() <= to) {
        const px = x(now.getTime());
        svg.append(svgEl("line", { x1: px, x2: px, y1: m.t, y2: bottom, class: "head" }, `Now · ${fmtTime(now)}`));
      }
      plot.append(svg);
      // Text only (period names come from Compass), joined with " · ". A { b, after } part has
      // a bold start.
      const s = $("summary");
      s.textContent = "";
      summary.forEach((part, i) => {
        if (i) s.append(" · ");
        if (typeof part === "string") s.append(part);
        else s.append(el("b", null, part.b), part.after || "");
      });
      s.title = s.textContent + (summaryNote ? `\n${summaryNote}` : "");
    }

    // The whole hours between the first start and the last finish.
    function hourTicks(from, to) {
      const out = [];
      const d = new Date(from);
      d.setMinutes(0, 0, 0);
      for (d.setHours(d.getHours() + 1); d.getTime() < to; d.setHours(d.getHours() + 1)) out.push(d.getTime());
      return out.length > 6 ? out.filter((_, i) => i % 2 === 0) : out;
    }

    function drawStatus() {
      if (error && day) setStatus(`Couldn't refresh · trying again in ${REFRESH_MINUTES} min`, true);
      else if (day?.unmarkedError) setStatus(`Couldn't check the unmarked rolls: ${day.unmarkedError}`, true);
      else if (day?.unmarkedCheck?.rolls && !day.unmarkedCheck.students) {
        const u = day.unmarkedCheck;
        setStatus(`${u.rolls} unmarked roll${u.rolls === 1 ? "" : "s"}, but no not-marked students found (${u.opened} opened${u.failed ? `, ${u.failed} failed` : ""})`, true);
      }
      else if (day && lastUpdated) setStatus(`${fmtDay(lastUpdated)} · updated ${fmtTime(lastUpdated)} · refreshes every ${REFRESH_MINUTES} min`);
      else setStatus(`Refreshes every ${REFRESH_MINUTES} min`);
    }

    // --- loading ---------------------------------------------------------------------------------
    async function loadMoves() {
      const M = globalThis.CompassMovements;
      const out = new Map();
      if (!M) return out;
      const raw = await M.load();
      const res = M.summarise(raw.items, raw.yearNames, raw.now);
      for (const r of [...res.rows].sort((a, b) => a.time - b.time)) {
        const uid = Number(r.uid);
        if (!out.has(uid)) out.set(uid, []);
        out.get(uid).push({ type: r.type, time: r.time });
      }
      return out;
    }

    async function refresh({ quiet = false } = {}) {
      if (busy) { if (!quiet) again = true; return; }
      busy = true;
      resetSteps();
      steps.moves.state = "busy";
      if (!quiet || !day) { day = null; error = ""; $("summary").textContent = "Loading…"; drawLoading(); }
      else showSteps();
      try {
        const [d, m] = await Promise.all([
          A.loadDay(new Date(), { onProgress }).then((x) => { finishSteps(false); return x; }, (e) => { finishSteps(true); throw e; }),
          loadMoves().then((x) => { movesError = ""; steps.moves.state = "done"; showSteps(); return x; },
            (e) => { movesError = e.message || String(e); steps.moves.state = "fail"; showSteps(); return new Map(); }),
        ]);
        day = d;
        moves = m;
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
        if (again) { again = false; refresh(); }
      }
    }

    if (preview) {
      $("summary").textContent = "Preview – the graph shows on the homepage";
      drawLoading();
      setStatus("");
      return {};
    }

    try {
      chrome.storage.local.get([VIEW_KEY, YEARS_KEY, SPLIT_KEY, SCALE_KEY], (r) => {
        split = r?.[SPLIT_KEY] === "years" ? "years" : "total";
        scale = r?.[SCALE_KEY] === "fit" ? "fit" : "full";
        view = r?.[VIEW_KEY] === "onsite" ? "onsite" : "periods";
        showView();
        years = G.validSelection(r?.[YEARS_KEY] ?? null);
        showYears();
        refresh();
      });
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area !== "local") return;
        const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        if (VIEW_KEY in changes && changes[VIEW_KEY].newValue !== view) setView(changes[VIEW_KEY].newValue, false);
        if (SPLIT_KEY in changes && changes[SPLIT_KEY].newValue !== split) setSplit(changes[SPLIT_KEY].newValue, false);
        if (SCALE_KEY in changes && changes[SCALE_KEY].newValue !== scale) setScale(changes[SCALE_KEY].newValue, false);
        if (YEARS_KEY in changes && !same(changes[YEARS_KEY].newValue, years)) setYears(changes[YEARS_KEY].newValue ?? null, false);
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) { refresh(); }

    $("refresh").onclick = () => refresh();

    // Redraw for the playhead every minute and when the card's width changes; reload every
    // REFRESH_MINUTES (also when the tab is opened again, as browsers slow background timers).
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (due()) refresh({ quiet: true });
      else if (day && !busy) draw();
    };
    const timer = setInterval(tick, 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    const resize = new ResizeObserver(() => { if (day && !busy) draw(); });
    resize.observe($("plot"));
    return {
      refresh,
      stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); resize.disconnect(); },
    };
  }

  return { mount, onSiteChanges, samples };
})();
