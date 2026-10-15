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
    /* Loading: a ring turns around the grey circle; the count shows in the middle. */
    .spin { transform-box: fill-box; transform-origin: center; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 3s; } }
    .spin-count { font: 600 20px Cabin, Roboto, system-ui, sans-serif; fill: #203249; }
    .spin-label { font: 11px Cabin, Roboto, system-ui, sans-serif; fill: #5f6368; }
    .infopanel label.mode { display: flex; gap: 6px; align-items: flex-start; margin: 4px 0; font-size: 12px; cursor: pointer; }
    .infopanel label.mode input { margin: 2px 0 0; flex: none; }
    .infopanel label.mode ~ .intro { margin-top: 12px; }
    .pagelink { display: block; margin: 10px 0 0; padding: 0; background: none; color: #0E6CD9; font-weight: 600; font-size: 12px; }
    .pagelink:hover { background: none; text-decoration: underline; }
    .infopanel .auto { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: #FFF4E5; color: #8A4B00; font-size: 11px; font-weight: 600; }
  `;

  const { CSS, ICONS } = globalThis.CompassTheme;

  function mountSnapshot(host, { mode = "panel", onClose, preview = false } = {}) {
    const { load, tally, yearLevels, filterByYears, filterByUsers, enrolment, enrolmentNote, CATEGORIES, SESSION_KEY } = globalThis.CompassAttendance;
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
        ${mode === "panel" ? '<button class="pagelink" id="inconsistencies" title="Students marked present and absent on the same day. Opens in a new tab.">Period inconsistencies ↗</button>' : ""}
        <div class="infopanel" id="infopanel" hidden></div>
      </div>`;

    const $ = (id) => root.getElementById(id);
    const body = $("body");
    globalThis.CompassNames.attach(root);
    if (onClose) $("close").onclick = onClose;
    if (!preview) $("refresh").onclick = () => refresh();
    if (mode === "panel") $("inconsistencies").onclick = () => window.open(location.origin + globalThis.CompassAttendance.INCONSISTENCY_PAGE, "_blank", "noopener");

    // --- (i) code list: covers the chart instead of growing the card ------------
    const infoBtn = $("info"), infoPanel = $("infopanel");
    // The school's codes from Compass ([{ id, code, name, group }]), or null until they load
    // (or when Compass doesn't give them): then the panel shows the STATUSES list.
    let schoolCodes = null;
    function buildInfo() {
      const { STATUSES } = globalThis.CompassAttendance;
      const groups = [...CATEGORIES, { key: "excluded", label: "Not counted (not expected at school)", color: "#fff" }];
      infoPanel.textContent = "";
      // Opt-in: count by period, from every class roll. First, so it is easy to find.
      const modeHead = document.createElement("h2");
      modeHead.textContent = "Count attendance";
      infoPanel.append(modeHead);
      for (const [m, text] of [
        ["halfday", "By the AM or PM roll (the default)"],
        ["period", "By period, from each class roll. The chart follows the current period. It opens every class roll, so it loads more slowly."],
      ]) {
        const label = document.createElement("label");
        label.className = "mode";
        const radio = Object.assign(document.createElement("input"), { type: "radio", name: "mode", checked: sessionMode === m });
        radio.onchange = () => setMode(m, true);
        label.append(radio, document.createTextNode(" " + text));
        infoPanel.append(label);
      }
      const intro = document.createElement("p");
      intro.className = "intro";
      intro.textContent = schoolCodes
        ? "Your school's Compass codes in each group of the chart:"
        : "Compass codes in each group of the chart:";
      infoPanel.append(intro);
      // [code, name, group, auto]. A code that STATUSES doesn't list (auto) shows at the end:
      // the chart groups it by the colour of each mark (see GROUP_BY_COLOUR in data.js).
      const list = schoolCodes
        ? schoolCodes.map((c) => [c.code, c.name, c.group || "other", !c.group])
        : STATUSES.map(([, code, name, group]) => [code, name, group, false]);
      const other = { key: "other", label: "Other codes (grouped by Compass's colour)", color: "#fff" };
      for (const g of [...groups, other]) {
        const seen = new Set();
        const rows = list.filter(([code, name, group]) => {
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
        if (g.key === "excluded" || g.key === "other") sw.style.border = "1px solid #9aa0a6";
        h.append(sw, document.createTextNode(g.label));
        const table = document.createElement("table");
        for (const [code, name, , auto] of rows) {
          const tr = table.insertRow();
          const c = tr.insertCell(); c.className = "code"; c.textContent = code;
          const n = tr.insertCell();
          n.textContent = name;
          if (auto) {
            const tag = Object.assign(document.createElement("span"), { className: "auto", textContent: "auto" });
            tag.title = "This code isn't in the extension's list. The chart groups it by the colour Compass gives it " +
              "(green: Present, red: Unapproved, orange: Approved). Add it to STATUSES in src/widgets/attendance/data.js to choose its group.";
            n.append(tag);
          }
        }
        infoPanel.append(h, table);
      }
    }
    infoBtn.onclick = () => {
      const open = infoPanel.hidden;
      if (open) {
        buildInfo();
        if (!schoolCodes) {
          globalThis.CompassAttendance.schoolCodeList()
            .then((codes) => { schoolCodes = codes; if (!infoPanel.hidden) buildInfo(); })
            .catch(() => {}); // the panel keeps the STATUSES list
        }
        const header = root.querySelector("header");
        infoPanel.style.setProperty("--info-top", header.offsetTop + header.offsetHeight + 4 + "px");
      }
      infoPanel.hidden = !open;
      infoBtn.setAttribute("aria-expanded", String(open));
      infoBtn.title = open ? "Back to the chart" : "What's in each group?";
    };

    let data = null;       // { date, half, students } from Compass; half "period" also has periodName and rolls
    let sessionMode = "halfday";  // "halfday" | "period" (SESSION_KEY)
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
        if (area === "local" && SESSION_KEY in changes && (changes[SESSION_KEY].newValue || "halfday") !== sessionMode) {
          setMode(changes[SESSION_KEY].newValue || "halfday", false);
        }
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
    const offNames = globalThis.CompassNames.onChange(() => { showYears(); redraw(); }); // group names in the chip

    function setSelection(next) {
      selected = next;
      save();
      showYears();
      if (data) renderChart();
    }

    // --- chart ----------------------------------------------------------------
    // spinning: the loading look, with the progress count in the middle (see showProgress).
    function pieSvg(slices, total, size = 170, spinning = false) {
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
        if (spinning) {
          const ring = document.createElementNS(ns, "circle");
          const rr = r - 8;
          ring.setAttribute("cx", cx); ring.setAttribute("cy", cy); ring.setAttribute("r", rr);
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", "#0E6CD9");
          ring.setAttribute("stroke-width", "6");
          ring.setAttribute("stroke-linecap", "round");
          ring.setAttribute("stroke-dasharray", `${(2 * Math.PI * rr) / 4} ${2 * Math.PI * rr}`);
          ring.setAttribute("class", "spin");
          svg.appendChild(ring);
          for (const [cls, y] of [["spin-count", cy + 2], ["spin-label", cy + 20]]) {
            const t = document.createElementNS(ns, "text");
            t.setAttribute("class", cls);
            t.setAttribute("x", cx); t.setAttribute("y", y);
            t.setAttribute("text-anchor", "middle");
            svg.appendChild(t);
          }
        }
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

    function setMode(m, save) {
      sessionMode = m === "period" ? "period" : "halfday";
      if (save) { try { chrome.storage.local.set({ [SESSION_KEY]: sessionMode }); } catch (_) {} }
      if (!preview) refresh();
    }

    // The session, without the date (the date is in the status line at the bottom).
    function sessionLabel(date, half) {
      if (half === "period") return `${data.periodName} · ${data.rolls} class roll${data.rolls === 1 ? "" : "s"}`;
      return `${half.toUpperCase()} roll`;
    }
    function dayLabel(date) {
      const [y, m, d] = date.split("/").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
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
    // lines: [session, counts], shown as one line ("PM roll · 475 students"). The full text
    // shows on hover. An error is one message on the same line.
    function drawChart(lines, res, { isError = false, spinning = false } = {}) {
      body.textContent = "";
      const row = document.createElement("div");
      row.className = "subrow";
      const sub = document.createElement("div");
      sub.className = isError ? "sub err" : "sub";
      const text = lines.filter(Boolean).join(isError ? " " : " · ");
      const line = document.createElement("div");
      line.className = "line";
      line.textContent = text || "\u00a0";
      line.title = text;
      sub.appendChild(line);
      row.append(sub, viewToggle());
      body.appendChild(row);

      const total = res ? res.total : 0;
      const slices = buildSlices(res);
      const chart = document.createElement("div");
      chart.className = "chart";
      chart.appendChild(pieSvg(slices, total, 170, spinning)); // grey circle when there's nothing to show

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
        status.textContent = lastUpdated && res && data
          ? `${dayLabel(data.date)} · updated ${fmtTime(lastUpdated)} · refreshes every ${REFRESH_MINUTES} min`
          : `Refreshes every ${REFRESH_MINUTES} min`;
        status.title = status.textContent;
      }
      body.appendChild(status);
      if (spinning) showProgress(progress);
    }

    function redraw() {
      if (data) renderChart();
      else if (lastSkeleton) drawChart([lastSkeleton[0], ""], null, { isError: lastSkeleton[1], spinning: lastSkeleton[2] });
    }

    function renderSkeleton(message, isError = false, spinning = false) {
      lastSkeleton = [message, isError, spinning];
      drawChart([message, ""], null, { isError, spinning });
    }

    // The count while class rolls load: in the middle of the turning ring, or (when the old
    // chart stays on screen during an automatic refresh) in the status line.
    let progress = null; // { done, total, label } or null
    function showProgress(p) {
      progress = p;
      const count = root.querySelector(".spin-count"), label = root.querySelector(".spin-label");
      if (count) {
        count.textContent = p ? `${p.done} / ${p.total}` : "";
        label.textContent = p ? p.label : "";
        return;
      }
      const status = root.querySelector(".status");
      if (status && p && busy) status.textContent = `Checking ${p.label.replace(" checked", "")}… ${p.done} / ${p.total}`;
    }

    function renderChart() {
      // pick(list): the students of `list` in the filter, or null when nothing is selected.
      let pick;
      if (G.isGroups(selected)) {
        let members;
        try { members = groupMembers.get(selected); }
        catch (e) { drawChart([`Couldn't load the members of ${G.label(selected)}: ${e.message || e}`], null, { isError: true }); return; }
        if (!members) { drawChart([sessionLabel(data.date, data.half), `Loading ${G.label(selected)}…`], null); return; }
        pick = (list) => filterByUsers(list, members);
      } else {
        const sel = currentSelection();
        pick = (list) => (sel.length ? filterByYears(list, sel) : null);
      }
      const students = pick(data.students);

      const none = !students;
      const res = tally(none ? [] : students, data.date, data.half, data.notMarked);
      // Enrolled: every active student in the filter. By period, the rolls have only the
      // students with a class, so the roster gives the rest.
      const enrol = none ? null : enrolment((pick(data.roster || data.students) || []).length, res.counts && { ...res.counts, total: res.total });
      drawChart([
        sessionLabel(data.date, data.half),
        none ? "No year groups selected" : enrol.enrolled > res.total ? `${res.total} of ${enrol.enrolled} enrolled` : `${res.total} students`,
      ], res);
      const gap = enrol ? enrolmentNote(enrol) : "";
      if (gap) {
        const line = root.querySelector(".subrow .sub .line");
        line.title += `\n${gap} The chart shows the counted students. See (i) for the codes.`;
      }

      const notes = [];
      // The check of today's unmarked rolls (data.js): say when it failed or found no students.
      const uc = data.unmarkedCheck;
      if (data.notMarkedError) notes.push([`Couldn't check today's unmarked rolls, so students in them may show with the half-day mark: ${data.notMarkedError}`]);
      else if (uc && uc.rolls && !uc.students) {
        notes.push([`${uc.rolls} unmarked roll${uc.rolls === 1 ? " has" : "s have"} started, but no not-marked students were found in them ` +
          `(${uc.opened} opened${uc.failed ? `, ${uc.failed} failed` : ""}).`]);
      }
      if (uc?.students) {
        const line = root.querySelector(".subrow .sub .line");
        line.title += `\nIncludes ${uc.students} student(s) in ${uc.rolls} unmarked roll(s) as Not marked.`;
      }
      if (sessionMode === "period" && data.periodError) notes.push([`By period isn't available now, so the chart shows the ${data.half.toUpperCase()} roll: ${data.periodError}`]);
      if (res.autoCodes?.length) {
        notes.push(["New code" + (res.autoCodes.length === 1 ? "" : "s") + ", grouped by Compass's colour: " +
          res.autoCodes.map((a) => `${a.label} ×${a.count} as ${CATEGORIES.find((c) => c.key === a.group)?.label || a.group}`).join(", ") +
          ". Check the group in src/widgets/attendance/data.js."]);
      }
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
    let again = false; // the setting changed during a load: load again after it
    async function refresh({ quiet = false } = {}) {
      if (busy) { if (!quiet) again = true; return; }
      busy = true;
      progress = null;
      if (!quiet || !data) renderSkeleton("Loading…", false, true);
      try {
        const savedMode = await new Promise((res) => {
          try { chrome.storage.local.get(SESSION_KEY, (r) => res(r?.[SESSION_KEY])); } catch (_) { res(null); }
        });
        sessionMode = savedMode === "period" ? "period" : "halfday";
        const [result, saved] = await Promise.all([load(new Date(), { mode: sessionMode, onProgress: showProgress }), loadSaved()]);
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
        if (again) { again = false; refresh(); }
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
    const stop = () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); offNames(); };
    const timer = setInterval(() => (host.isConnected ? onVisible() : stop()), 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop };
  }

  return { mountSnapshot };
})();
