// "Enrolment" widget: how many students are enrolled, by faction (Compass house), by class
// (Compass form group) or by year group. "By faction" splits each year group or class into its
// factions. Each faction has its own colour. Counts only: the card never shows a student's name.
// Data: CompassAttendance.loadRoster (src/widgets/attendance/data.js), the same half-day grid
// as the attendance widgets, which also gives each student's form group and house.
globalThis.CompassEnrolmentUI = (() => {
  const REFRESH_MINUTES = 60; // enrolment changes slowly
  const LIST_HEIGHT = 232;    // fixed, so the card never changes size

  const CSS_EXTRA = `
    .yrow { align-items: center; justify-content: flex-end; gap: 8px; }
    .seg button { color: #3E4B62; }
    .seg button[aria-pressed="true"] { color: #fff; }
    .summary { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 8px; height: 36px; white-space: nowrap; overflow: hidden; }
    .big { font-size: 2rem; line-height: 1; font-weight: 600; color: #203249; font-variant-numeric: tabular-nums; }
    .big.err { color: #b3261e; font-size: 1rem; }
    .what { font-size: 1rem; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .meta { color: #5f6368; margin-left: auto; font-size: 12px; white-space: nowrap; }
    .list { height: ${LIST_HEIGHT}px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
    .grow { display: grid; grid-template-columns: minmax(0, 1fr) 40px 36px; gap: 2px 8px; align-items: center; padding: 5px 0;
      border-top: 1px solid #EAEBEE; font-size: 13px; }
    .grow:first-child { border-top: 0; }
    .grow .gname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #203249; }
    .grow .n { text-align: right; font-weight: 600; color: #203249; font-variant-numeric: tabular-nums; }
    .grow .p { text-align: right; color: #5f6368; font-size: 12px; font-variant-numeric: tabular-nums; }
    .grow .bar { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: #F0F2F5; overflow: hidden; }
    .grow .bar span { display: block; height: 100%; border-radius: 2px; background: #0E6CD9; }
    .grow.split { grid-template-columns: minmax(0, 1fr) 40px; }
    .grow .stack { grid-column: 1 / -1; display: flex; gap: 2px; height: 8px; }
    .grow .stack span { height: 100%; border-radius: 2px; min-width: 2px; }
    .grow .fc { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 12px; color: #3E4B62; font-variant-numeric: tabular-nums; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
    .flegend { position: sticky; top: 0; z-index: 1; background: #fff; display: flex; flex-wrap: wrap; gap: 0 12px; padding: 0 0 4px;
      font-size: 12px; color: #3E4B62; border-bottom: 1px solid #EAEBEE; }
    .flegend + .grow { border-top: 0; }
    #split[aria-pressed="true"] { background: #203249; color: #fff; }
    #split { border: 1px solid #dadce0; border-radius: 6px; padding: 2px 8px; font-size: 12px; background: #fff; color: #3E4B62; }
    #split[hidden] { display: none; }
    .empty { height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; color: #5f6368; padding: 0 16px; }
    .foot { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;
  const VIEWS = {
    house: { label: "Faction", tip: "Students in each faction (Compass house)", none: "No faction", plural: "factions" },
    form: { label: "Class", tip: "Students in each class (Compass form group)", none: "No class", plural: "classes" },
    year: { label: "Year", tip: "Students in each year group", none: "No year level", plural: "year groups" },
  };

  // A faction's colour: the colour in its name (most factions are named after one), or else the
  // next colour of a fixed list, in faction-name order.
  const NAMED = {
    red: "#D63B3B", blue: "#2A6FD6", green: "#2E9D4F", yellow: "#F2B800", gold: "#D4A017", orange: "#EB6834",
    purple: "#6250D6", violet: "#6250D6", pink: "#E87BA4", maroon: "#8C1C2B", navy: "#1F3A93", teal: "#138D90",
    aqua: "#1BAFB0", silver: "#A8A9AD", grey: "#8A8F98", gray: "#8A8F98", black: "#333333", white: "#E6E6E6", brown: "#8B5A2B",
  };
  const OTHER = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const NO_FACTION = "#C4C7CC";
  function factionColours(names) {
    const out = new Map();
    let next = 0;
    for (const name of names) {
      const word = String(name).toLowerCase().match(/[a-z]+/g)?.find((w) => w in NAMED);
      out.set(name, word ? NAMED[word] : OTHER[next++ % OTHER.length]);
    }
    return out;
  }

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

  // [{ name, count }] for one view, in a sensible order. Students with no value come last.
  function countBy(roster, key, none) {
    const counts = new Map();
    for (const s of roster) {
      const name = s[key] || none;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    let names = [...counts.keys()].filter((n) => n !== none);
    names = key === "year" ? globalThis.CompassYears.sort(names) : names.sort(natural);
    if (counts.has(none)) names.push(none);
    return names.map((name) => ({ name, count: counts.get(name) }));
  }

  function mount(host, { preview = false } = {}) {
    const A = globalThis.CompassAttendance;
    const N = globalThis.CompassNames;
    const { CSS, ICONS } = globalThis.CompassTheme;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${globalThis.CompassYears.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Enrolment</h1>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow" id="yrow">
          <button id="split" type="button" title="Show the factions in each year group or class" aria-pressed="false" hidden>By faction</button>
          <div class="seg" id="view">
            ${Object.entries(VIEWS).map(([v, x]) => `<button data-v="${v}" title="${x.tip}">${x.label}</button>`).join("")}
          </div>
        </div>
        <div class="summary" id="summary"></div>
        <div class="list" id="list"></div>
        <div class="foot" id="foot"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    N.attach(root);

    const VIEW_KEY = "enrolmentView";   // "house" | "form" | "year"
    const SPLIT_KEY = "enrolmentSplit"; // true: year groups and classes split by faction
    let view = "house", split = false;
    let roster = null, error = "", lastUpdated = null, lastLoaded = 0, busy = false;

    function showView() {
      for (const b of root.querySelectorAll("#view button")) b.setAttribute("aria-pressed", String(b.dataset.v === view));
      $("split").hidden = view === "house";
      $("split").setAttribute("aria-pressed", String(split));
    }
    function setSplit(v, save) {
      split = !!v;
      if (save) { try { chrome.storage.local.set({ [SPLIT_KEY]: split }); } catch (_) {} }
      showView();
      draw();
    }
    $("split").onclick = () => setSplit(!split, true);
    function setView(v, save) {
      view = v in VIEWS ? v : "house";
      showView();
      if (save) { try { chrome.storage.local.set({ [VIEW_KEY]: view }); } catch (_) {} }
      draw();
    }
    for (const b of root.querySelectorAll("#view button")) b.onclick = () => setView(b.dataset.v, true);
    showView();

    function setSummary(big, what, meta = "", cls = "") {
      const s = $("summary");
      s.textContent = "";
      s.append(el("span", "big " + cls, big), el("span", "what", what), el("span", "meta", meta));
    }
    const setFoot = (text) => { $("foot").textContent = $("foot").title = text; };

    function skeleton() {
      setSummary("", "");
      $("summary").prepend(Object.assign(el("span", "sk"), { style: "width:150px;height:28px;display:inline-block" }));
      const list = $("list");
      list.textContent = "";
      for (let i = 0; i < 5; i++) {
        const row = el("div", "grow");
        row.append(Object.assign(el("span", "sk"), { style: `height:14px;width:${70 - i * 9}%` }), el("span"), el("span"));
        list.append(row);
      }
    }

    function draw() {
      if (busy && !roster) { skeleton(); return; }
      const list = $("list");
      if (error && !roster) {
        setSummary("", "Couldn't load the enrolment", "", "err");
        list.textContent = "";
        list.append(el("div", "empty", error));
        return;
      }
      if (!roster) return;
      const v = VIEWS[view];
      const groups = countBy(roster, view, v.none);
      const total = roster.length;
      const named = groups.filter((g) => g.name !== v.none).length;
      setSummary(String(total), `student${total === 1 ? "" : "s"} enrolled`, `${named} ${named === 1 ? v.label.toLowerCase() : v.plural}`);
      list.textContent = "";
      if (!named) {
        list.append(el("div", "empty", `Compass has no ${v.label.toLowerCase()} for these students.`));
        return;
      }
      const max = Math.max(...groups.map((g) => g.count));
      const factions = countBy(roster, "house", VIEWS.house.none);
      const colours = factionColours(factions.map((f) => f.name).filter((n) => n !== VIEWS.house.none));
      colours.set(VIEWS.house.none, NO_FACTION);
      const label = (key, name) => (key === "year" || name === VIEWS[key].none ? name : N.group(name));
      const plural = (n) => `${n} student${n === 1 ? "" : "s"}`;

      if (view !== "house" && split) {
        // A legend of the factions (with the school's total for each) above the rows.
        const legend = el("div", "flegend");
        for (const f of factions) {
          const item = el("span");
          const dot = el("span", "dot");
          dot.style.background = colours.get(f.name);
          item.append(dot, `${label("house", f.name)} ${f.count}`);
          legend.append(item);
        }
        list.append(legend);
      }

      for (const g of groups) {
        const name = label(view, g.name);
        if (view !== "house" && split) {
          // Faction by year group or class: a bar in the faction colours, and each faction's count.
          const members = roster.filter((s) => (s[view] || v.none) === g.name);
          const parts = countBy(members, "house", VIEWS.house.none).sort((a, b) =>
            factions.findIndex((f) => f.name === a.name) - factions.findIndex((f) => f.name === b.name));
          const row = el("div", "grow split");
          row.title = `${name}: ${plural(g.count)}\n` + parts.map((p) => `${label("house", p.name)}: ${p.count}`).join("\n");
          const stack = el("div", "stack");
          stack.style.width = `${(g.count / max) * 100}%`;
          const fc = el("div", "fc");
          for (const p of parts) {
            const seg = el("span");
            seg.style.background = colours.get(p.name);
            seg.style.flex = `${p.count} 1 0`;
            stack.append(seg);
            const c = el("span");
            const dot = el("span", "dot");
            dot.style.background = colours.get(p.name);
            c.append(dot, String(p.count));
            c.title = label("house", p.name);
            fc.append(c);
          }
          row.append(el("span", "gname", name), el("span", "n", String(g.count)), stack, fc);
          list.append(row);
          continue;
        }
        // One bar for each group. Factions show their share of the school and their colour.
        const row = el("div", view === "house" ? "grow" : "grow split");
        const share = total ? Math.round((g.count / total) * 100) : 0;
        row.title = view === "house" ? `${name}: ${plural(g.count)} (${share}% of ${total})` : `${name}: ${plural(g.count)}`;
        const bar = el("div", "bar");
        const fill = el("span");
        fill.style.width = `${(g.count / max) * 100}%`;
        if (view === "house") fill.style.background = colours.get(g.name);
        bar.append(fill);
        row.append(el("span", "gname", name), el("span", "n", String(g.count)));
        if (view === "house") row.append(el("span", "p", `${share}%`));
        row.append(bar);
        list.append(row);
      }
    }

    function drawFoot() {
      if (error && roster) setFoot(`Couldn't refresh · trying again in ${REFRESH_MINUTES} min`);
      else if (lastUpdated) setFoot(`Active students · updated ${fmtTime(lastUpdated)} · refreshes every ${REFRESH_MINUTES} min`);
      else setFoot(`Refreshes every ${REFRESH_MINUTES} min`);
    }

    async function refresh() {
      if (busy) return;
      busy = true;
      if (!roster) skeleton();
      try {
        roster = await A.loadRoster();
        error = "";
        lastUpdated = new Date();
      } catch (e) {
        error = e.message || String(e);
      } finally {
        lastLoaded = Date.now();
        busy = false;
        draw();
        drawFoot();
      }
    }

    if (preview) {
      skeleton();
      setFoot("Preview – the counts show on the homepage");
      return {};
    }

    try {
      chrome.storage.local.get([VIEW_KEY, SPLIT_KEY], (r) => { split = !!r?.[SPLIT_KEY]; setView(r?.[VIEW_KEY], false); });
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area === "local" && VIEW_KEY in changes && changes[VIEW_KEY].newValue !== view) setView(changes[VIEW_KEY].newValue, false);
        if (area === "local" && SPLIT_KEY in changes && !!changes[SPLIT_KEY].newValue !== split) setSplit(changes[SPLIT_KEY].newValue, false);
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) {}
    $("refresh").onclick = () => refresh();
    refresh();
    const offNames = N.onChange(() => draw());

    // Auto-refresh. Browsers slow timers in background tabs, so also catch up
    // as soon as the tab is looked at again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due()) refresh(); };
    const timer = setInterval(onVisible, 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); offNames(); } };
  }

  return { mount, countBy, factionColours };
})();
