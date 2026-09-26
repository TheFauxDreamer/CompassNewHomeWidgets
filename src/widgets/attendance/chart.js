// Shared attendance snapshot UI. mountSnapshot(host, { mode, onClose }) renders the
// chart, legend and year-group filter into a shadow root on `host`.
//   mode "panel"  - floating panel (toolbar icon)
//   mode "widget" - card on the Compass homepage
globalThis.CompassAttendanceUI = (() => {
  const STORAGE_KEY = "selectedYearGroups"; // saved per browser profile
  const VIEW_KEY = "chartView";             // "groups" | "codes"
  const REFRESH_MINUTES = 15;

  // Stripes laid over hatched groups (see CATEGORIES), so they don't rely on colour alone.
  const HATCH_CSS = "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 2px, transparent 2px 5px)";

  // Shades of a group's colour for the per-code chart, darkest first.
  function shades(hex, n) {
    if (n <= 1) return [hex];
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, sat = 0;
    if (d) {
      sat = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const lo = Math.max(0.2, l - 0.15), hi = Math.min(0.85, l + 0.22);
    return Array.from({ length: n }, (_, i) => `hsl(${h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${((lo + (hi - lo) * i / (n - 1)) * 100).toFixed(0)}%)`);
  }

  // Chart-only rule; the base look comes from CompassTheme.CSS (src/shared/theme.js).
  const CHART_CSS = `
    .sw.hatch { background-image: ${HATCH_CSS}; }
  `;

  const { CSS, ICONS } = globalThis.CompassTheme;

  function mountSnapshot(host, { mode = "panel", onClose, preview = false } = {}) {
    const { load, tally, yearLevels, filterByYears, filterByUsers, CATEGORIES } = globalThis.CompassAttendance;
    const G = globalThis.CompassGroups;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${CHART_CSS}${globalThis.CompassYears.CSS}</style>
      <div class="wrap ${mode}">
        <header>
          <h1>Attendance</h1>
          <button id="info" title="What's in each group?" aria-expanded="false">${ICONS.info}</button>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
          ${onClose ? `<button id="close" title="Close">${ICONS.close}</button>` : ""}
        </header>
        <div class="yrow" id="yrow"></div>
        <div class="yarea" id="yarea"><div id="body"></div></div>
        <div class="infopanel" id="infopanel" hidden></div>
      </div>`;

    const $ = (id) => root.getElementById(id);
    const body = $("body");
    if (onClose) $("close").onclick = onClose;
    if (!preview) $("refresh").onclick = () => refresh();

    // --- (i) code list: covers the chart instead of growing the card ------------
    const infoBtn = $("info"), infoPanel = $("infopanel");
    function buildInfo() {
      const { STATUSES } = globalThis.CompassAttendance;
      const groups = [...CATEGORIES, { key: "excluded", label: "Not counted (not expected at school)", color: "#fff" }];
      infoPanel.innerHTML = '<p class="intro">Compass codes in each group of the chart:</p>';
      for (const g of groups) {
        const seen = new Set();
        const rows = STATUSES.filter(([, code, name, group]) => {
          const key = code + "|" + name;
          if (group !== g.key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (!rows.length) continue;
        const h = document.createElement("h2");
        const sw = document.createElement("span");
        sw.className = g.hatch ? "sw hatch" : "sw";
        sw.style.backgroundColor = g.color;
        if (g.key === "excluded") sw.style.border = "1px solid #9aa0a6";
        h.append(sw, document.createTextNode(g.label));
        const table = document.createElement("table");
        for (const [, code, name] of rows) {
          const tr = table.insertRow();
          const c = tr.insertCell(); c.className = "code"; c.textContent = code;
          tr.insertCell().textContent = name;
        }
        infoPanel.append(h, table);
      }
    }
    infoBtn.onclick = () => {
      const open = infoPanel.hidden;
      if (open) {
        buildInfo();
        const header = root.querySelector("header");
        infoPanel.style.setProperty("--info-top", header.offsetTop + header.offsetHeight + 4 + "px");
      }
      infoPanel.hidden = !open;
      infoBtn.setAttribute("aria-expanded", String(open));
      infoBtn.title = open ? "Back to the chart" : "What's in each group?";
    };

    let data = null;       // { date, half, students } from Compass
    let allYears = [];
    let selected = null;   // array of year names; null = all year groups; or a group selection (groups.js)
    let view = "groups";   // "groups" | "codes"
    let lastSkeleton = null;
    const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
    let lastUpdated = null;  // when `data` was fetched
    let refreshError = "";   // last auto-refresh failure, shown under the chart we still have
    let lastLoaded = 0;      // last attempt, for the auto-refresh timer
    let busy = false;

    // --- saved selection (shared between panel and widget) --------------------
    const loadSaved = () => new Promise((res) => {
      try { chrome.storage.local.get(STORAGE_KEY, (r) => res(r?.[STORAGE_KEY] ?? null)); }
      catch (_) { res(null); }
    });
    const save = () => { try { chrome.storage.local.set({ [STORAGE_KEY]: selected }); } catch (_) {} };

    // Keep the panel and the homepage widget in step if both are open.
    try {
      const onChanged = (changes, area) => {
        if (!host.isConnected) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area === "local" && VIEW_KEY in changes) {
          const v = changes[VIEW_KEY].newValue || "groups";
          if (v !== view) { view = v; redraw(); }
        }
        if (area !== "local" || !(STORAGE_KEY in changes) || !data) return;
        const next = changes[STORAGE_KEY].newValue ?? null;
        if (JSON.stringify(next) === JSON.stringify(selected)) return;
        selected = G.validSelection(next);
        showYears();
        renderChart();
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) {}

    const currentSelection = () =>
      selected ? allYears.filter((y) => selected.includes(y)) : allYears.slice();

    // --- year-group or Compass group filter (all widgets use this filter) -----------
    const yearFilter = globalThis.CompassYears.filter({ onChange: (next) => setSelection(next), groups: G });
    $("yrow").append(yearFilter.chip);
    $("yarea").append(yearFilter.panel);
    const showYears = () => yearFilter.set(allYears, data && Array.isArray(selected) ? currentSelection() : selected);
    const groupMembers = G.tracker(() => { if (data) renderChart(); });

    function setSelection(next) {
      selected = next;
      save();
      showYears();
      if (data) renderChart();
    }

    // --- chart ----------------------------------------------------------------
    function pieSvg(slices, total, size = 170) {
      const r = size / 2, cx = r, cy = r;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", size); svg.setAttribute("height", size);
      svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

      const nonZero = slices.filter((s) => s.value > 0);
      if (!total || nonZero.length === 0) {
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r - 1);
        c.setAttribute("fill", "#f1f3f4");
        c.setAttribute("stroke", "#dadce0");
        c.setAttribute("stroke-width", "1.5");
        svg.appendChild(c);
        return svg;
      }
      if (nonZero.some((s) => s.hatch)) {
        const defs = document.createElementNS(ns, "defs");
        defs.innerHTML = '<pattern id="hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">' +
          '<rect width="2" height="5" fill="rgba(255,255,255,.5)"/></pattern>';
        svg.appendChild(defs);
      }
      let angle = -Math.PI / 2;
      for (const s of nonZero) {
        let el;
        if (nonZero.length === 1) {
          el = document.createElementNS(ns, "circle");
          el.setAttribute("cx", cx); el.setAttribute("cy", cy); el.setAttribute("r", r);
        } else {
          const sweep = (s.value / total) * Math.PI * 2;
          const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
          angle += sweep;
          const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
          el = document.createElementNS(ns, "path");
          el.setAttribute("d", `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`);
        }
        el.setAttribute("fill", s.color);
        el.setAttribute("stroke", "#fff");
        el.setAttribute("stroke-width", "1.5");
        const t = document.createElementNS(ns, "title");
        t.textContent = `${s.label}: ${s.value}`;
        el.appendChild(t);
        svg.appendChild(el);
        if (s.hatch) {
          const stripes = el.cloneNode(false);
          stripes.setAttribute("fill", "url(#hatch)");
          stripes.setAttribute("pointer-events", "none");
          svg.appendChild(stripes);
        }
      }
      return svg;
    }

    function sessionLabel(date, half) {
      const [y, m, d] = date.split("/").map(Number);
      const day = new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
      return `${day} · ${half.toUpperCase()} roll`;
    }

    // Draws the header line, pie and legend. Used for real data AND for the
    // loading/error placeholder, so the card is the same size in every state.
    // Grouped: one slice per group. Per code: one slice per Compass code, in
    // shades of its group's colour, ordered by group then largest first.
    function buildSlices(res) {
      if (view === "groups" || !res) {
        return CATEGORIES.map((c) => ({ ...c, value: res ? res.counts[c.key] : 0, title: c.label }));
      }
      const out = [];
      for (const c of CATEGORIES) {
        const rows = res.byCode.filter((r) => r.group === c.key).sort((x, y) => y.count - x.count);
        const cols = shades(c.color, rows.length);
        rows.forEach((r, i) => out.push({
          label: `${r.code} – ${r.name}`, value: r.count, color: cols[i], hatch: c.hatch, title: `${c.label}: ${r.code} – ${r.name}`,
        }));
      }
      return out;
    }

    function viewToggle() {
      const seg = document.createElement("div");
      seg.className = "seg";
      for (const [v, text, tip] of [["groups", "Groups", "One slice per group"], ["codes", "Codes", "One slice per attendance code"]]) {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.title = tip;
        btn.setAttribute("aria-pressed", String(view === v));
        btn.onclick = () => {
          if (view === v) return;
          view = v;
          try { chrome.storage.local.set({ [VIEW_KEY]: view }); } catch (_) {}
          redraw();
        };
        seg.appendChild(btn);
      }
      return seg;
    }

    // Draws the header line, pie and legend. Used for real data AND for the
    // loading/error placeholder, so the card is the same size in every state.
    // lines: [session, counts] (an error is one message clamped to the same two lines).
    function drawChart(lines, res, { isError = false } = {}) {
      body.textContent = "";
      const row = document.createElement("div");
      row.className = "subrow";
      const sub = document.createElement("div");
      sub.className = isError ? "sub err" : "sub";
      if (isError) sub.textContent = sub.title = lines.join(" ");
      else for (const text of lines) {
        const line = document.createElement("div");
        line.className = "line";
        line.textContent = text || "\u00a0";
        line.title = text;
        sub.appendChild(line);
      }
      row.append(sub, viewToggle());
      body.appendChild(row);

      const total = res ? res.total : 0;
      const slices = buildSlices(res);
      const chart = document.createElement("div");
      chart.className = "chart";
      chart.appendChild(pieSvg(slices, total)); // grey circle when there's nothing to show

      const ul = document.createElement("ul");
      for (const s of slices) {
        const li = document.createElement("li");
        li.title = s.title;
        li.innerHTML = `<span class="sw"></span><span class="lbl"></span><span class="pct"></span><span class="n"></span>`;
        const sw = li.querySelector(".sw");
        sw.style.backgroundColor = s.color;
        if (s.hatch) sw.classList.add("hatch");
        li.querySelector(".lbl").textContent = s.label;
        li.querySelector(".pct").textContent = res && total ? ((s.value / total) * 100).toFixed(1) + "%" : "–";
        li.querySelector(".n").textContent = res ? s.value : "–";
        ul.appendChild(li);
      }
      chart.appendChild(ul);
      body.appendChild(chart);

      // One status line in every state (also keeps the height steady).
      const status = document.createElement("div");
      status.className = "note status";
      if (refreshError) {
        status.classList.add("err");
        status.textContent = `Couldn't refresh · trying again in ${REFRESH_MINUTES} min`;
        status.title = refreshError;
      } else {
        status.textContent = lastUpdated && res
          ? `Updated ${fmtTime(lastUpdated)} · refreshes every ${REFRESH_MINUTES} min`
          : `Refreshes every ${REFRESH_MINUTES} min`;
      }
      body.appendChild(status);
    }

    function redraw() {
      if (data) renderChart();
      else if (lastSkeleton) drawChart([lastSkeleton[0], ""], null, { isError: lastSkeleton[1] });
    }

    function renderSkeleton(message, isError = false) {
      lastSkeleton = [message, isError];
      drawChart([message, ""], null, { isError });
    }

    function renderChart() {
      let students = null; // null: nothing selected
      if (G.isGroups(selected)) {
        let members;
        try { members = groupMembers.get(selected); }
        catch (e) { drawChart([`Couldn't load the members of ${G.label(selected)}: ${e.message || e}`], null, { isError: true }); return; }
        if (!members) { drawChart([sessionLabel(data.date, data.half), `Loading ${G.label(selected)}…`], null); return; }
        students = filterByUsers(data.students, members);
      } else {
        const sel = currentSelection();
        if (sel.length) students = filterByYears(data.students, sel);
      }

      const none = !students;
      const res = tally(none ? [] : students, data.date, data.half);
      const notCounted = none ? 0 : res.counts.excluded;
      drawChart([
        sessionLabel(data.date, data.half),
        none ? "No year groups selected" : `${res.total} students` + (notCounted ? ` (+${notCounted} not counted)` : ""),
      ], res);
      if (notCounted) {
        root.querySelector(".subrow .sub .line:last-child").title =
          `${notCounted} student(s) weren't expected at school (not required to attend, school closure or unscheduled), so they're left out of the chart. See (i) for the codes.`;
      }

      const notes = [];
      if (res.unknownCodes.length) {
        notes.push(["Unmapped codes, left out: " + res.unknownCodes.map(([k, n]) => `${k} ×${n}`).join(", ") + ". Add them to src/widgets/attendance/data.js."]);
      }
      for (const [text] of notes) {
        const p = document.createElement("div");
        p.className = "note";
        p.textContent = text;
        body.appendChild(p);
      }
    }

    // quiet: keep the current chart on screen while reloading (auto-refresh).
    async function refresh({ quiet = false } = {}) {
      if (busy) return;
      busy = true;
      if (!quiet || !data) renderSkeleton("Loading…");
      try {
        const [result, saved] = await Promise.all([load(), loadSaved()]);
        if (!result) { data = null; renderSkeleton("No marked roll sessions found for this week or last week."); return; }
        data = result;
        lastUpdated = new Date();
        refreshError = "";
        allYears = yearLevels(data.students);
        selected = G.validSelection(saved);
        groupMembers.reset(); // ask for the group members again (cached for a few minutes)
        showYears();
        renderChart();
      } catch (e) {
        if (quiet && data) { refreshError = e.message || String(e); renderChart(); }
        else { data = null; renderSkeleton(e.message || String(e), true); }
      } finally {
        lastLoaded = Date.now();
        busy = false;
      }
    }

    try {
      chrome.storage.local.get(VIEW_KEY, (r) => {
        const v = r?.[VIEW_KEY] || "groups";
        if (v !== view) { view = v; redraw(); }
      });
    } catch (_) {}
    if (preview) { renderSkeleton("Preview – the live chart shows on the homepage"); return { refresh }; }

    // Show the saved selection in the chip straight away, before Compass answers.
    loadSaved().then((s) => { const v = G.validSelection(s); if (!data && v) { selected = v; showYears(); } });
    refresh();

    // Auto-refresh. Browsers slow timers in background tabs, so also catch up
    // as soon as the tab is looked at again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due()) refresh({ quiet: true }); };
    const stop = () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
    const timer = setInterval(() => (host.isConnected ? onVisible() : stop()), 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop };
  }

  return { mountSnapshot };
})();
