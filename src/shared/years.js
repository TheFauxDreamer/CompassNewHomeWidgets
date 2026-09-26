// Year-group functions that all the widgets use. This file sorts year groups,
// makes labels and shows the year-group filter. Each widget keeps its own selection.
globalThis.CompassYears = (() => {
  // Gives the school order: Kindy, Pre-Primary, Year 1 and higher, other names, Cross Year, no year level.
  function rank(y) {
    const t = y.toLowerCase();
    if (/kindy|kindergarten/.test(t)) return 0;
    if (/pre[\s-]?primary|^pp$/.test(t)) return 1;
    const m = t.match(/(?:year|yr)\s*(\d+)/);
    if (m) return 1 + Number(m[1]);
    if (/cross/.test(t)) return 900;
    if (/^no (yl|year level)$/.test(t)) return 1000;
    return 500;
  }

  const sort = (list) => [...list].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  // Makes a short label for a set of year groups in school order, for example "Kindy, Pre-Primary, Years 1–3, 6".
  function label(sel) {
    const nums = [], out = [];
    for (const y of sort(sel)) {
      const m = y.match(/^(?:year|yr)\s*(\d+)$/i);
      if (!m) { out.push(y); continue; }
      if (!nums.length) out.push(nums); // The numbered years go here. The code below changes them to ranges.
      nums.push(Number(m[1]));
    }
    const runs = [];
    for (const n of nums) {
      const last = runs[runs.length - 1];
      if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
    }
    const parts = runs.map(([a, b]) => (a === b ? String(a) : b === a + 1 ? `${a}, ${b}` : `${a}–${b}`));
    const years = (nums.length === 1 ? "Year " : "Years ") + parts.join(", ");
    return out.map((p) => (p === nums ? years : p)).join(", ");
  }

  // --- year-group filter --------------------------------------------------------------
  // All widgets use this filter, thus the filter operates the same in each widget.
  // The filter has a chip and a panel of checkboxes. To add the filter to a widget:
  //   1. Add CSS to the shadow root of the widget.
  //   2. Put `chip` immediately below the header.
  //   3. Put `panel` in a position:relative box (class "yarea") that contains all the content below the chip.
  const CSS = `
    .yrow { display: flex; margin: 0 0 8px; min-height: 22px; }
    .yrow > .ychip { flex: 0 1 auto; min-width: 0; }
    .yrow > :not(.ychip) { flex: none; }
    .ychip { display: inline-flex; align-items: center; max-width: 100%; padding: 2px 10px; border: 0; border-radius: 999px;
      background: rgba(14, 108, 217, .1); color: #0E6CD9; font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; }
    .ychip:hover { background: rgba(14, 108, 217, .18); }
    .ychip.all { background: #f1f3f4; color: #545F73; }
    .ychip.all:hover { background: #e3e5e8; }
    .ychip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .yarea { position: relative; }
    .ypanel { position: absolute; inset: 0; z-index: 2; background: #fff; overflow-y: auto; display: flex; flex-direction: column; }
    .ypanel[hidden] { display: none; }
    .ypanel .ygrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 2px 10px; margin: 4px 0 8px; }
    .ypanel.wide .ygrid { grid-template-columns: 1fr; }
    .ypanel label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .ypanel .yall { grid-column: 1 / -1; font-weight: 600; }
    .ypanel .ynote { grid-column: 1 / -1; color: #5f6368; }
    .ypanel .ydone { align-self: flex-start; }
  `;

  // onChange(next) gives an array of year-group names, or null for "all year groups".
  // With null, the widget also shows year groups that Compass adds later.
  // Call set(options, selected) when the options or the selection change.
  // Until the widget has the year groups, options is an empty array.
  // The other settings let a widget use the same filter for a different list, for example Chronicle types:
  //   allText, noneText, noun: the texts. sortFn, labelFn: the order and the chip label.
  //   wide: show one option on each line. onOpen: the widget closes its other filters here.
  //   iconFn(option): an element to show before the option's name, or null.
  function filter({
    onChange, allText = "All year groups", noneText = "No year groups", noun = "Year groups",
    sortFn = sort, labelFn = label, wide = false, onOpen = () => {}, iconFn = () => null,
  }) {
    let options = [], selected = null;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const chip = el("button", "ychip");
    chip.type = "button";
    chip.setAttribute("aria-expanded", "false");
    const panel = el("div", wide ? "ypanel wide" : "ypanel");
    panel.hidden = true;

    const choose = (next) => onChange(options.every((y) => next.includes(y)) ? null : sortFn(next));

    function box(text, checked, onToggle, cls, icon) {
      const label = el("label", cls);
      const cb = Object.assign(document.createElement("input"), { type: "checkbox", checked });
      cb.onchange = () => onToggle(cb.checked);
      label.append(cb);
      if (icon) label.append(icon);
      label.append(el("span", null, text));
      return label;
    }

    function drawPanel() {
      panel.textContent = "";
      const grid = el("div", "ygrid");
      if (!options.length) {
        grid.append(el("div", "ynote", `${noun} show once the data has loaded.`));
      } else {
        grid.append(box(allText, selected === null, (on) => onChange(on ? null : []), "yall"));
        for (const y of options) {
          grid.append(box(y, selected === null || selected.includes(y), (on) => {
            const cur = new Set(selected ?? options);
            on ? cur.add(y) : cur.delete(y);
            choose([...cur]);
          }, undefined, iconFn(y)));
        }
      }
      const done = el("button", "ydone", "Done");
      done.type = "button";
      done.onclick = () => { open(false); chip.focus(); };
      panel.append(grid, done);
    }

    function draw() {
      const all = selected === null;
      chip.className = all ? "ychip all" : "ychip";
      chip.textContent = "";
      chip.append(el("span", null, all ? allText : selected.length ? labelFn(selected) : noneText));
      chip.title = (all ? allText : selected.join(", ") || noneText) + " · click to change";
      if (!panel.hidden) drawPanel();
    }

    function open(on = panel.hidden) {
      if (on) { onOpen(); drawPanel(); }
      panel.hidden = !on;
      chip.setAttribute("aria-expanded", String(on));
    }

    chip.onclick = () => open();
    const onKey = (e) => { if (e.key === "Escape" && !panel.hidden) { open(false); chip.focus(); } };
    chip.addEventListener("keydown", onKey);
    panel.addEventListener("keydown", onKey);
    draw();

    return {
      chip, panel,
      set(opts, sel) { options = opts; selected = sel; draw(); },
      close: () => open(false),
    };
  }

  return { rank, sort, label, filter, CSS };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassYears;
