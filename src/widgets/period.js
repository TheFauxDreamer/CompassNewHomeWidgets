// "Current period" widget: a timeline of the school day with a playhead at the current
// time, the period that is on now and the next one. The periods come from
// src/shared/periods.js: the Compass structure, or a custom timetable that the user
// sets up with the gear button (for example, a primary school's teaching timetable).
// A custom timetable can be shared: "Copy timetable code" puts it on the clipboard as one
// line of text, and "Paste a code" in a colleague's widget loads it for them to Save.
globalThis.CompassPeriodUI = (() => {
  const AREA_HEIGHT = 170; // Fixed, so that the card does not change size.
  const TICK_SECONDS = 30;
  const TICKS_KEY = "periodTicks"; // the labels under the timeline: "hours" (default) | "starts"
  const MIN_TICK_GAP = 9;          // % of the width between two period-start labels

  const CSS_EXTRA = `
    .yarea { height: ${AREA_HEIGHT}px; }
    .summary { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 2px; height: 32px; white-space: nowrap; overflow: hidden; }
    .now { font-size: 1.4rem; line-height: 1.2; font-weight: 600; color: #203249; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .now.quiet { color: #5f6368; }
    .now.err { color: #b3261e; font-size: 1rem; }
    .meta { color: #5f6368; margin-left: auto; font-size: 12px; white-space: nowrap; }
    .left { font-weight: 600; color: #0E6CD9; }
    .nextline { color: #3E4B62; font-size: 13px; height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
    .nextline b { font-weight: 600; }
    .tl { position: relative; padding-top: 22px; }
    .tl.faded { opacity: .55; }
    .track { position: relative; height: 34px; border-radius: 6px; background: #F7F8FA; }
    .blk { position: absolute; top: 0; bottom: 0; box-sizing: border-box; border: 1px solid #fff; border-radius: 6px;
      background: #E8F0FE; color: #1A56B0; font-size: 11px; font-weight: 600; padding: 0 4px;
      display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; }
    .blk span { overflow: hidden; text-overflow: ellipsis; }
    .blk.break { background: #F0F2F5 repeating-linear-gradient(45deg, rgba(255,255,255,.7) 0 2px, transparent 2px 6px); color: #5f6368; }
    .blk.past { opacity: .5; }
    .blk.cur { background: #0E6CD9; color: #fff; }
    .blk.cur.break { background: #545F73; color: #fff; }
    .ticks { position: relative; height: 16px; margin-top: 3px; }
    .tick { position: absolute; transform: translateX(-50%); font-size: 10px; color: #5f6368; white-space: nowrap; }
    .tick:first-child { transform: none; }
    .tick:last-child { transform: translateX(-100%); }
    .head { position: absolute; top: 0; bottom: 19px; width: 0; border-left: 2px solid #B3261E; margin-left: -1px; pointer-events: none; }
    .head::after { content: ""; position: absolute; top: 18px; left: -5px; border: 4px solid transparent; border-top-color: #B3261E; }
    .bubble { position: absolute; top: 0; left: 0; transform: translateX(-50%); background: #B3261E; color: #fff; font-size: 11px;
      font-weight: 600; border-radius: 999px; padding: 1px 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .head.start .bubble { transform: translateX(-2px); }
    .head.end .bubble { transform: translateX(calc(-100% + 2px)); }
    .empty { height: 100px; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; text-align: center; color: #5f6368; }
    .primary { background: #0E6CD9; color: #fff; font-weight: 600; border-radius: 999px; padding: 4px 12px; }
    .primary:hover { background: #0B5AB5; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    #setup[aria-expanded="true"] { background: rgba(14, 108, 217, .12); color: #0E6CD9; }
    /* Setup panel (covers the timeline, like the year-group filter). */
    .setup { gap: 4px; padding-bottom: 4px; }
    /* The panel is a flex column: keep the switches and links at their own width, on the left. */
    .setup > .seg, .setup > .link, .setup > .actions { align-self: flex-start; }
    .setup .seg button { color: #3E4B62; }
    .setup .seg button[aria-pressed="true"] { color: #fff; }
    .setup .ynote { color: #5f6368; font-size: 12px; }
    .prow { display: grid; grid-template-columns: minmax(60px, 1fr) 82px 82px auto 24px; gap: 4px; align-items: center; }
    .prow input[type="text"], .prow input[type="time"] { box-sizing: border-box; width: 100%; min-width: 0; padding: 2px 4px;
      border: 1px solid #dadce0; border-radius: 6px; font: inherit; font-size: 12px; color: inherit; }
    .prow.bad input { border-color: #b3261e; }
    .prow label { display: flex; align-items: center; gap: 3px; font-size: 12px; cursor: pointer; }
    .prow .x { width: 24px; height: 24px; padding: 0; border-radius: 50%; background: transparent; color: #545F73; font-size: 16px; line-height: 1; }
    .prow .x:hover { background: rgba(32, 50, 73, .08); }
    .phead { font-size: 11px; color: #5f6368; }
    .actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
    .actions .err { font-size: 12px; }
    .link { background: none; padding: 0; color: #0E6CD9; text-decoration: underline; font-size: 12px; }
    .link:hover { background: none; }
    .share { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 2px; }
    .share .ok { color: #1E7B34; font-size: 12px; }
    .share .err { color: #b3261e; font-size: 12px; }
    .share input { flex: 1 1 160px; min-width: 0; box-sizing: border-box; padding: 2px 6px; border: 1px solid #dadce0;
      border-radius: 6px; font: inherit; font-size: 12px; font-family: ui-monospace, monospace; color: inherit; }
  `;
  // Material "settings"
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6"/></svg>';

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const fmtHour = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric" }).replace(/\s/g, "").toLowerCase();
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // 12 min, 1 h, 1 h 5 min
  function duration(ms) {
    const m = Math.max(1, Math.ceil(ms / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  }
  const addMinutes = (t, n) => { const [h, m] = t.split(":").map(Number); const v = Math.min(23 * 60 + 59, h * 60 + m + n); return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; };

  // --- share codes ------------------------------------------------------------------------
  // A custom timetable packed into one line of text, so that a colleague can paste it into
  // their own widget instead of typing every period again. Format: "CPT1." + base64url of
  // {a: rows, d: {"1": rows, …}}, where each row is [name, "0845", "0930", 1 if break].
  const CODE_PREFIX = "CPT1.";
  const packRow = (r) => [r.name.trim(), r.start.replace(":", ""), r.finish.replace(":", ""), ...(r.kind === "break" ? [1] : [])];
  const unpackTime = (t) => (typeof t === "string" && /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : "");
  const unpackRow = (a) => {
    if (!Array.isArray(a)) throw new Error("bad row");
    return { name: String(a[0] ?? ""), start: unpackTime(a[1]), finish: unpackTime(a[2]), kind: a[3] ? "break" : "class" };
  };
  function encodeShare(custom) {
    const data = { a: custom.all.map(packRow) };
    const days = Object.entries(custom.days);
    if (days.length) data.d = Object.fromEntries(days.map(([d, rows]) => [d, rows.map(packRow)]));
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return CODE_PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  // Returns { all, days } or throws an Error with a message for the user.
  function decodeShare(text, validRow) {
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
  // Clipboard API first; fall back to a selected textarea (works without clipboard permission).
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }

  function mount(host, { preview = false } = {}) {
    const P = globalThis.CompassPeriods;
    const { CSS } = globalThis.CompassTheme;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${globalThis.CompassYears.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Current Period</h1>
          ${preview ? "" : `<button id="setup" title="Set up the timetable" aria-expanded="false">${GEAR}</button>`}
        </header>
        <div class="yarea" id="yarea">
          <div class="summary" id="summary"></div>
          <div class="nextline" id="nextline"></div>
          <div id="timeline"></div>
          <div class="ypanel setup" id="panel" hidden></div>
        </div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    globalThis.CompassNames.attach(root);

    // { day, periods, source, other } from the last load. other: the day is not today.
    let shown = null;
    let error = "";
    let tickMode = "hours";

    function setSummary(text, meta = [], cls = "") {
      const s = $("summary");
      s.textContent = "";
      const m = el("span", "meta");
      for (const part of [].concat(meta)) m.append(part);
      s.append(el("span", "now " + cls, text), m);
    }
    function setNext(...parts) {
      const n = $("nextline");
      n.textContent = "";
      n.append(...parts);
      n.title = n.textContent;
    }

    function skeleton() {
      setSummary("");
      $("summary").prepend(Object.assign(el("span", "sk"), { style: "width:140px;height:24px;display:inline-block" }));
      setNext("");
      const tl = $("timeline");
      tl.textContent = "";
      const t = el("div", "tl");
      t.append(Object.assign(el("div", "track sk")), el("div", "ticks"));
      tl.append(t);
    }

    // The bar of periods, the hour labels below it and the playhead (only for today).
    function drawTimeline(periods, now, { faded = false } = {}) {
      const tl = $("timeline");
      tl.textContent = "";
      const from = periods[0].start, to = periods.reduce((m, p) => (p.finish > m ? p.finish : m), periods[0].finish);
      const pct = (d) => ((d - from) / (to - from)) * 100;
      const wrap = el("div", "tl" + (faded ? " faded" : ""));
      const track = el("div", "track");
      for (const p of periods) {
        const state = faded ? "" : p.finish <= now ? " past" : p.start <= now ? " cur" : "";
        const blk = el("div", "blk" + (p.kind === "break" ? " break" : "") + state);
        blk.style.left = pct(p.start) + "%";
        blk.style.width = pct(p.finish) - pct(p.start) + "%";
        blk.append(el("span", null, p.name));
        blk.title = `${p.name} · ${fmtTime(p.start)}–${fmtTime(p.finish)}`;
        track.append(blk);
      }
      const ticks = el("div", "ticks");
      let labels;
      if (tickMode === "starts") {
        // The start of each period, and the finish of the last one. A start too close to the
        // label before it is left out, so that the labels don't overlap.
        const starts = [...new Set(periods.map((p) => p.start.getTime()))].map((t) => new Date(t)).filter((d) => d > from);
        labels = [[from, fmtTime(from)]];
        for (const d of starts) if (pct(d) - pct(labels[labels.length - 1][0]) >= MIN_TICK_GAP) labels.push([d, fmtTime(d)]);
        labels.push([to, fmtTime(to)]);
      } else {
        const hours = [];
        for (let h = new Date(from); h < to; h = new Date(h.getFullYear(), h.getMonth(), h.getDate(), h.getHours() + 1)) {
          if (h.getMinutes() === 0 && h > from) hours.push(h);
        }
        const step = hours.length > 7 ? 2 : 1;
        labels = [[from, fmtTime(from)], ...hours.filter((_, i) => i % step === step - 1).map((h) => [h, fmtHour(h)]), [to, fmtTime(to)]];
      }
      for (const [d, text] of labels) {
        const p = pct(d);
        if (d !== from && d !== to && (p < 8 || p > 92)) continue; // keep clear of the end labels
        const t = el("span", "tick", text);
        t.style.left = p + "%";
        ticks.append(t);
      }
      wrap.append(track, ticks);
      if (!faded && now >= from && now <= to) {
        const head = el("div", "head");
        const p = pct(now);
        head.style.left = p + "%";
        if (p < 10) head.classList.add("start");
        else if (p > 90) head.classList.add("end");
        head.append(el("span", "bubble", fmtTime(now)));
        wrap.append(head);
      }
      tl.append(wrap);
    }

    function drawEmpty() {
      setSummary("No timetable", [], "quiet");
      setNext("Set up the periods of your school day.");
      const tl = $("timeline");
      tl.textContent = "";
      const box = el("div", "empty");
      if (!preview) {
        const b = el("button", "primary", "Set up timetable");
        b.type = "button";
        b.onclick = () => openSetup(true);
        box.append(b);
      }
      tl.append(box);
    }

    function draw(now = new Date()) {
      if (error) {
        setSummary("Couldn't load the periods", [], "err");
        setNext(error);
        const tl = $("timeline");
        tl.textContent = "";
        if (!preview) {
          const box = el("div", "empty");
          const b = el("button", "primary", "Use a custom timetable");
          b.type = "button";
          b.onclick = () => openSetup(true);
          box.append(b);
          tl.append(box);
        }
        return;
      }
      if (!shown) return;
      const { day, periods, other } = shown;
      if (!periods.length) { drawEmpty(); return; }
      if (other) {
        setSummary(shown.note || "No classes today", fmtDay(now), "quiet");
        setNext("Next school day: ", el("b", null, fmtDay(day)), ` · starts ${fmtTime(periods[0].start)}`);
        drawTimeline(periods, now, { faded: true });
        return;
      }
      const { current, next } = P.current(periods, now);
      const first = periods[0], last = periods[periods.length - 1];
      if (current) {
        setSummary(current.name, [`${fmtTime(current.start)}–${fmtTime(current.finish)} · `, el("span", "left", `${duration(current.finish - now)} left`)]);
        if (next) setNext("Next: ", el("b", null, next.name), ` at ${fmtTime(next.start)}`);
        else setNext("Last period of the day");
      } else if (now < first.start) {
        setSummary("Before school", fmtDay(now), "quiet");
        setNext(el("b", null, first.name), ` starts at ${fmtTime(first.start)} · in ${duration(first.start - now)}`);
      } else if (now >= last.finish) {
        setSummary("School day over", fmtDay(now), "quiet");
        setNext(`The last period finished at ${fmtTime(last.finish)}`);
      } else {
        setSummary("Between periods", fmtDay(now), "quiet");
        setNext("Next: ", el("b", null, next.name), ` at ${fmtTime(next.start)} · in ${duration(next.start - now)}`);
      }
      drawTimeline(periods, now);
    }

    let loadId = 0;
    async function load() {
      const id = ++loadId;
      try {
        const now = new Date();
        let res = await P.display(now);
        let day = now, other = false;
        const note = res.note; // the name Compass gives today when there's no school
        if (!res.periods.length) {
          const next = await P.nextDay(now);
          if (next) { res = next; day = next.day; other = true; }
        }
        if (id !== loadId) return;
        error = "";
        shown = { day, periods: res.periods, source: res.source, other, note };
      } catch (e) {
        if (id !== loadId) return;
        error = e.message || String(e);
      }
      draw();
    }

    // --- setup panel: the source and the custom timetable ---------------------------------
    const panel = $("panel");
    let draft = null;       // the custom timetable that is being edited
    let source = "custom";
    let editDay = "all";    // "all" (Monday to Friday) or "1" … "5"
    let tried = false;      // Save was clicked with a row that isn't valid
    let share = null;       // null, or { mode: "copy"|"paste", text, msg, ok } for the share row
    let ticksDraft = "hours";

    const rowsOf = () => (editDay === "all" ? draft.all : draft.days[editDay]);

    function segOf(items, value, onPick) {
      const seg = el("div", "seg");
      for (const [v, text, tip] of items) {
        const b = el("button", null, text);
        b.type = "button";
        if (tip) b.title = tip;
        b.setAttribute("aria-pressed", String(v === value));
        b.onclick = () => onPick(v);
        seg.append(b);
      }
      return seg;
    }

    function rowEditor(rows, r, i) {
      const row = el("div", "prow" + (tried && !P.validRow(r) ? " bad" : ""));
      const name = Object.assign(el("input"), { type: "text", value: r.name || "", placeholder: "Name" });
      name.setAttribute("aria-label", "Period name");
      const start = Object.assign(el("input"), { type: "time", value: r.start || "" });
      start.setAttribute("aria-label", "Start");
      const finish = Object.assign(el("input"), { type: "time", value: r.finish || "" });
      finish.setAttribute("aria-label", "Finish");
      const brk = el("label");
      const cb = Object.assign(el("input"), { type: "checkbox", checked: r.kind === "break" });
      brk.append(cb, "Break");
      brk.title = "A break (for example, recess or lunch) shows in grey";
      const x = el("button", "x", "×");
      x.type = "button";
      x.title = "Remove this period";
      name.oninput = () => { r.name = name.value; };
      start.onchange = () => { r.start = start.value; };
      finish.onchange = () => { r.finish = finish.value; };
      cb.onchange = () => { r.kind = cb.checked ? "break" : "class"; };
      x.onclick = () => { rows.splice(i, 1); drawSetup(); };
      row.append(name, start, finish, brk, x);
      return row;
    }

    function drawSetup() {
      panel.textContent = "";
      if (P.COMPASS_AVAILABLE) {
        panel.append(segOf([["compass", "Compass periods"], ["custom", "Custom timetable"]], source, (v) => { source = v; drawSetup(); }));
      }
      if (source === "compass") {
        panel.append(el("div", "ynote", "The widget shows the school's default period structure from Compass (Configure > Period Structures). " +
          "Use a custom timetable when your teaching day is different, for example a primary school that marks AM/PM rolls."));
      } else {
        const days = [["all", "Mon–Fri", "The timetable for every school day"],
          ...[1, 2, 3, 4, 5].map((d) => [String(d), P.WEEKDAYS[d].slice(0, 3), `${P.WEEKDAYS[d]} only`])];
        panel.append(segOf(days, editDay, (v) => { editDay = v; drawSetup(); }));
        const rows = rowsOf();
        if (!rows) {
          const dayName = P.WEEKDAYS[Number(editDay)];
          panel.append(el("div", "ynote", `${dayName} uses the Mon–Fri timetable.`));
          const b = el("button", "link", `Give ${dayName} its own timetable`);
          b.type = "button";
          b.onclick = () => { draft.days[editDay] = draft.all.map((r) => ({ ...r })); drawSetup(); };
          panel.append(b);
        } else {
          if (rows.length) {
            const head = el("div", "prow phead");
            head.append(el("span", null, "Name"), el("span", null, "Start"), el("span", null, "Finish"), el("span"), el("span"));
            panel.append(head);
          }
          rows.forEach((r, i) => panel.append(rowEditor(rows, r, i)));
          const add = el("button", "link", "+ Add a period");
          add.type = "button";
          add.onclick = () => {
            const start = rows.length ? rows[rows.length - 1].finish || "09:00" : "08:45";
            rows.push({ name: "", start, finish: addMinutes(start, 60), kind: "class" });
            drawSetup();
            [...panel.querySelectorAll(".prow")].pop()?.querySelector("input")?.focus();
          };
          panel.append(add);
          if (editDay !== "all") {
            const back = el("button", "link", "Use the Mon–Fri timetable again");
            back.type = "button";
            back.onclick = () => { delete draft.days[editDay]; drawSetup(); };
            panel.append(back);
          }
        }
      }
      if (source === "custom") panel.append(shareRow());
      panel.append(el("div", "ynote", "Times on the timeline"));
      panel.append(segOf([["hours", "Hours", "A label on each hour"], ["starts", "Period starts", "A label at the start of each period, and at the end of the day"]],
        ticksDraft, (v) => { ticksDraft = v; drawSetup(); }));
      const actions = el("div", "actions");
      const save = el("button", "primary", "Save");
      save.type = "button";
      save.onclick = saveSetup;
      const cancel = el("button", null, "Cancel");
      cancel.type = "button";
      cancel.onclick = () => openSetup(false);
      actions.append(save, cancel);
      if (tried) actions.append(el("span", "err", "Each period needs a name, and a finish after its start."));
      panel.append(actions);
    }

    // Copy this timetable as a code for colleagues, or paste a colleague's code.
    function shareRow() {
      const box = el("div", "share");
      const status = () => share?.msg ? el("span", share.ok ? "ok" : "err", share.msg) : null;
      if (share?.mode === "paste") {
        const input = Object.assign(el("input"), { type: "text", value: share.text || "", placeholder: "Paste the code here (CPT1.…)" });
        input.setAttribute("aria-label", "Timetable code");
        input.oninput = () => { share.text = input.value; };
        const load = el("button", "primary", "Load");
        load.type = "button";
        const apply = () => {
          try {
            const t = decodeShare(input.value, P.validRow);
            draft = t;
            editDay = "all";
            tried = false;
            share = { mode: null, msg: "Loaded. Check the periods, then Save.", ok: true };
          } catch (e) {
            share = { mode: "paste", text: input.value, msg: e.message, ok: false };
          }
          drawSetup();
        };
        load.onclick = apply;
        input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } };
        const back = el("button", "link", "Cancel");
        back.type = "button";
        back.onclick = () => { share = null; drawSetup(); };
        box.append(input, load, back);
        const st = status();
        if (st) box.append(st);
        queueMicrotask(() => input.focus());
        return box;
      }
      if (share?.mode === "copy") {
        // The clipboard was blocked: show the code so it can be copied by hand.
        const input = Object.assign(el("input"), { type: "text", value: share.text, readOnly: true });
        input.setAttribute("aria-label", "Timetable code");
        input.onfocus = () => input.select();
        const done = el("button", "link", "Done");
        done.type = "button";
        done.onclick = () => { share = null; drawSetup(); };
        box.append(input, done, el("span", "ok", "Select the code and copy it (Ctrl+C)."));
        queueMicrotask(() => { input.focus(); input.select(); });
        return box;
      }
      const copy = el("button", "link", "Copy timetable code");
      copy.type = "button";
      copy.title = "Copy this timetable as a code that colleagues can paste into their widget";
      copy.onclick = async () => {
        const lists = [draft.all, ...Object.values(draft.days)];
        if (!lists.some((rows) => rows.length)) { share = { mode: null, msg: "Add some periods first.", ok: false }; drawSetup(); return; }
        if (lists.some((rows) => rows.some((r) => !P.validRow(r)))) { tried = true; share = null; drawSetup(); return; }
        const text = encodeShare(draft);
        share = (await copyText(text))
          ? { mode: null, msg: "Code copied. Colleagues paste it with “Paste a code”.", ok: true }
          : { mode: "copy", text };
        drawSetup();
      };
      const paste = el("button", "link", "Paste a code");
      paste.type = "button";
      paste.title = "Set up this widget from a colleague's timetable code";
      paste.onclick = () => { share = { mode: "paste", text: "" }; drawSetup(); };
      box.append(copy, el("span", "ynote", "·"), paste);
      const st = status();
      if (st) box.append(st);
      return box;
    }

    function saveSetup() {
      const lists = [draft.all, ...Object.values(draft.days)];
      if (source === "custom" && lists.some((rows) => rows.some((r) => !P.validRow(r)))) { tried = true; drawSetup(); return; }
      const clean = (rows) => rows.map((r) => ({ name: r.name.trim(), start: r.start, finish: r.finish, kind: r.kind === "break" ? "break" : "class" }))
        .sort((a, b) => a.start.localeCompare(b.start));
      const days = {};
      for (const [d, rows] of Object.entries(draft.days)) days[d] = clean(rows);
      P.saveCustom({ all: clean(draft.all), days });
      P.saveSource(source);
      setTicks(ticksDraft, true);
      openSetup(false);
      load(); // the storage change also loads; this covers a browser without storage events
    }

    async function openSetup(on) {
      const btn = $("setup");
      if (on) {
        const s = await P.settings();
        source = s.source;
        draft = { all: (s.custom.all || []).map((r) => ({ ...r })), days: {} };
        for (const [d, rows] of Object.entries(s.custom.days || {})) if (Array.isArray(rows)) draft.days[d] = rows.map((r) => ({ ...r }));
        const today = new Date().getDay();
        editDay = draft.days[today] ? String(today) : "all";
        tried = false;
        share = null;
        ticksDraft = tickMode;
        drawSetup();
      }
      panel.hidden = !on;
      btn?.setAttribute("aria-expanded", String(on));
      if (!on) btn?.focus();
    }
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") openSetup(false); });

    if (preview) {
      skeleton();
      setNext("Preview – the timeline shows on the homepage");
      return {};
    }

    function setTicks(v, save) {
      v = v === "starts" ? "starts" : "hours";
      if (save) { try { chrome.storage.local.set({ [TICKS_KEY]: v }); } catch (_) {} }
      if (v === tickMode) return;
      tickMode = v;
      draw();
    }
    let onTicks = null;
    try {
      chrome.storage.local.get([TICKS_KEY], (r) => setTicks(r?.[TICKS_KEY], false));
      onTicks = (changes, area) => { if (area === "local" && TICKS_KEY in changes) setTicks(changes[TICKS_KEY].newValue, false); };
      chrome.storage.onChanged.addListener(onTicks);
    } catch (_) {}

    $("setup").onclick = () => openSetup(panel.hidden);
    skeleton();
    load();

    // Move the playhead. On a new day, load the new day's periods.
    let lastDay = new Date().toDateString();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const now = new Date();
      if (now.toDateString() !== lastDay) { lastDay = now.toDateString(); load(); } else draw(now);
    };
    const timer = setInterval(tick, TICK_SECONDS * 1000);
    document.addEventListener("visibilitychange", tick);
    const off = P.onChange(load);
    return { refresh: load, stop: () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      off();
      try { if (onTicks) chrome.storage.onChanged.removeListener(onTicks); } catch (_) {}
    } };
  }

  return { mount, encodeShare, decodeShare };
})();
