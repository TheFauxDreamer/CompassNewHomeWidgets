// "Relief" widget: the classes of one day whose teacher has been replaced, with the
// teacher who is away and the relief teacher for each class.
// Uses the same call as Organise > Daily Org.
globalThis.CompassRelief = (() => {
  const REFRESH_MINUTES = 15;
  const LIMIT = 500; // more classes than one school day has

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

  const parseDate = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d : null; };

  // --- teacher field ----------------------------------------------------------------
  // Each class has a list of teachers. Each teacher's "t" is HTML with staff codes:
  //   "<s>cstrife</s>&nbsp; bwallace"
  // Struck-through staff are away; the others are the relief teachers. The
  // "(cstrife) Cloud STRIFE" form (as in the unmarked rolls) also works. Parsed as
  // text only; the HTML is never put on the page.
  const decode = (t) => t
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  const toText = (html) => decode(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const STRUCK = /<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const keyOf = (p) => p.code || p.name;
  const uniq = (ps) => [...new Map(ps.map((p) => [keyOf(p), p])).values()];

  function people(text) {
    if (!text) return [];
    if (text.includes("(")) {
      const out = [];
      const re = /\(([^)]*)\)\s*([^(]*)/g;
      let m;
      while ((m = re.exec(text))) {
        const name = m[2].replace(/[,;&]+\s*$/, "").trim();
        if (m[1].trim() || name) out.push({ code: m[1].trim(), name: name || m[1].trim() });
      }
      if (out.length) return out;
    }
    return text.split(/[\s,;&+]+/).filter(Boolean).map((code) => ({ code, name: code }));
  }

  function parseTeachers(list) {
    const away = [], relief = [];
    for (const t of Array.isArray(list) ? list : []) {
      const html = String(t?.t || "");
      for (const m of html.matchAll(STRUCK)) away.push(...people(toText(m[2])));
      relief.push(...people(toText(html.replace(STRUCK, " "))));
    }
    return { away: uniq(away), relief: uniq(relief) };
  }

  // Staff code -> name, fetched once per page. Daily Org sends only codes. Each row:
  //   { displayCode: "bwallace", n: "Barret Wallace", ... }
  // The body this call needs isn't known yet, so try an empty POST, then a GET.
  // With no list, the widget shows the codes.
  const STAFF_PATH = "/Services/ChronicleV2.svc/GetStaff?sessionstate=readonly";
  let staffPromise = null;
  function fetchStaff() {
    staffPromise ||= post(STAFF_PATH, {})
      .catch(() => fetch(STAFF_PATH, { credentials: "include", headers: { Accept: "application/json" } }).then((r) => r.json()))
      .then((json) => {
        const map = new Map((Array.isArray(json?.d) ? json.d : [])
          .filter((st) => st?.displayCode && st.n)
          .map((st) => [String(st.displayCode).toLowerCase(), toText(st.n)]));
        if (!map.size) staffPromise = null; // try again next load
        return map;
      })
      .catch(() => { staffPromise = null; return new Map(); });
    return staffPromise;
  }

  // Gives a bare staff code its name from the staff list.
  const named = (staff) => (p) => (p.name === p.code && staff?.has(p.code.toLowerCase()) ? { ...p, name: staff.get(p.code.toLowerCase()) } : p);

  // Keeps only the classes with a teacher who is away (Daily Org also lists other
  // class changes), earliest first.
  function summarise(items, now = new Date(), staff = null) {
    const classes = items
      .map((it) => ({
        id: it.id,
        start: parseDate(it.s),
        finish: parseDate(it.f),
        className: toText(it.n),
        period: toText(it.p),
        room: (Array.isArray(it.ls) ? it.ls : []).map((l) => toText(l?.l)).filter(Boolean).join(", "),
        ...parseTeachers(it.teachers),
      }))
      .map((c) => ({ ...c, away: c.away.map(named(staff)), relief: c.relief.map(named(staff)) }))
      .filter((c) => c.start && c.away.length);
    classes.sort((a, b) => a.start - b.start || a.className.localeCompare(b.className));
    return {
      classes,
      away: new Set(classes.flatMap((c) => c.away.map(keyOf))).size,
      relief: new Set(classes.flatMap((c) => c.relief.map(keyOf))).size,
      uncovered: classes.filter((c) => !c.relief.length).length,
      updated: now,
    };
  }

  // The next weekday after `now`.
  function nextSchoolDay(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  }

  // Classes of the local day that contains `day`.
  async function load(day) {
    const staff = fetchStaff();
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, -1);
    // The same body as the Daily Org page. That page sends page 0 and a negative
    // start, so copy it rather than guess how Compass pages this list.
    const json = await post(`/Services/Instance.svc/GetClassManagerLinesForClassChanges?_dc=${Date.now()}`, {
      startTime: from.toISOString(), finishTime: to.toISOString(),
      activityName: "", teacherId: null, runningStatus: 1, yearLevelId: null,
      page: 0, start: -LIMIT, limit: LIMIT,
    });
    const d = json?.d;
    if (!d || !Array.isArray(d.data)) throw new Error("Couldn't read the class changes from Compass.");
    const total = typeof d.total === "number" ? d.total : d.data.length;
    return { items: d.data, day: from, now: new Date(), missing: Math.max(0, total - d.data.length), staff: await staff };
  }

  return { load, summarise, nextSchoolDay, keyOf, REFRESH_MINUTES };
})();

globalThis.CompassReliefUI = (() => {
  const LIST_HEIGHT = 232; // fixed so the card never changes size
  // DEBUG: a date box in the header to load any day (e.g. in the school holidays).
  // Set to false (or delete the DEBUG lines) before release.
  const DEBUG_DATE = true;

  const CSS_EXTRA = `
    .summary { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 8px; height: 36px; white-space: nowrap; overflow: hidden; }
    .summary .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .big { font-size: 2rem; line-height: 1; font-weight: 600; color: #203249; font-variant-numeric: tabular-nums; }
    .big.ok { color: #2e7d32; }
    .big.err { color: #b3261e; font-size: 1rem; font-weight: 600; }
    .what { font-size: 1rem; font-weight: 500; }
    .meta { color: #5f6368; margin-left: auto; font-size: 12px; white-space: nowrap; }
    .meta .warn { color: #b3261e; font-weight: 600; }
    .list { height: ${LIST_HEIGHT}px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
    .row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid #EAEBEE; }
    .row:first-child { border-top: 0; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .avatar.none { background: #B3261E; }
    .who { flex: 1; min-width: 0; }
    .name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rname { color: #1A56B0; font-weight: 600; }
    .rname.none { color: #B3261E; }
    .sub { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin-top: 4px; font-size: 13px; }
    .sub .chips { margin-top: 0; }
    .sub .arrow { color: #9aa0a6; }
    .sub .for { color: #5f6368; }
    .avatar.mini { width: 20px; height: 20px; font-size: 9px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .chip { background: #F0F2F5; color: #3E4B62; border-radius: 12px; padding: 1px 8px; font-size: 12px; white-space: nowrap; }
    .chip.live { background: #FFF4E5; color: #8A4B00; }
    .chip.warn { background: #FDECEA; color: #B3261E; }
    .chip.done, .srow.done { opacity: .55; }
    .count { flex: none; min-width: 24px; height: 24px; border-radius: 12px; background: #E8F0FE; color: #1A56B0;
      font-weight: 600; font-size: 12px; display: flex; align-items: center; justify-content: center; padding: 0 6px; box-sizing: border-box; margin-top: 4px; }
    .empty { height: 100%; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; text-align: center; color: #5f6368; }
    .empty svg { width: 40px; height: 40px; fill: #2e7d32; }
    .empty.err svg { fill: #b3261e; }
    .foot { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    .avatar.sk { border-radius: 50%; }
    .dbgdate { font: inherit; font-size: 12px; color: #3E4B62; border: 1px dashed #B3261E; border-radius: 6px; padding: 1px 4px; } /* DEBUG */
    .yrow { align-items: center; justify-content: space-between; gap: 8px; }
    .seg button { color: #3E4B62; }
    .seg button[aria-pressed="true"] { color: #fff; }
    .slot { display: flex; align-items: center; gap: 8px; padding: 8px 0 2px; font-weight: 600; font-size: 13px; color: #203249;
      border-top: 1px solid #EAEBEE; position: sticky; top: 0; background: #fff; z-index: 1; }
    .slot:first-child { border-top: 0; }
    .slot .when { color: #5f6368; font-weight: 400; }
    .slot .count { margin: 0 0 0 auto; }
    .srow { display: flex; gap: 8px; align-items: center; padding: 4px 0 4px 2px; }
    .srow .avatar { width: 24px; height: 24px; font-size: 10px; }
    .srow .name { font-size: 13px; }
    .srow .detail { color: #5f6368; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .srow .chip { margin-left: auto; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>';
  const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>';
  const NO_RELIEF = "No relief yet";

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const names = (ps) => ps.map((p) => p.name).join(", ");
  const sameDay = (a, b) => a.toDateString() === b.toDateString();

  function mount(host, { preview = false } = {}) {
    const { load, summarise, nextSchoolDay, keyOf, REFRESH_MINUTES } = globalThis.CompassRelief;
    const { CSS, ICONS } = globalThis.CompassAttendanceUI;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${globalThis.CompassYears.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Relief</h1>
          ${DEBUG_DATE && !preview ? `<input type="date" class="dbgdate" id="dbgdate" title="Debug: load another day">` : ""}
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow">
          <div class="seg" id="day">
            <button data-d="today" title="Today's relief">Today</button>
            <button data-d="next" id="next" title="The next school day's relief">Tomorrow</button>
          </div>
          <div class="seg" id="view">
            <button data-v="away" title="Group by the teacher who is away">Away</button>
            <button data-v="relief" title="Group by the relief teacher">Relief</button>
            <button data-v="time" title="Order by period / class start time">Time</button>
          </div>
        </div>
        <div class="summary" id="summary"></div>
        <div class="list" id="list"></div>
        <div class="foot" id="foot"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const footText = () => `Refreshes every ${REFRESH_MINUTES} min`;
    const setFoot = (text) => { $("foot").textContent = $("foot").title = text; }; // one line; full text on hover

    let lastLoaded = 0;
    let busy = false;
    let lastData = null; // { items, day, now, missing, staff } from the last load
    let dayChoice = "today"; // "today" | "next"; always starts on today
    const VIEW_KEY = "reliefView"; // "away" | "relief" | "time", shared with other open cards
    let view = "away";

    let debugDay = null; // DEBUG: the day picked in the date box, or null
    const chosenDay = () => debugDay || (dayChoice === "next" ? nextSchoolDay() : new Date());
    function showDay() {
      const next = nextSchoolDay();
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      $("next").textContent = sameDay(next, tomorrow) ? "Tomorrow" : next.toLocaleDateString("en-AU", { weekday: "short" });
      for (const b of root.querySelectorAll("#day button")) b.setAttribute("aria-pressed", String(!debugDay && b.dataset.d === dayChoice));
    }
    for (const b of root.querySelectorAll("#day button")) {
      b.onclick = () => {
        if (!debugDay && b.dataset.d === dayChoice) return;
        dayChoice = b.dataset.d;
        if (debugDay) { debugDay = null; $("dbgdate").value = ""; } // DEBUG
        showDay();
        if (!preview) refresh(); // a different day needs a new request
      };
    }
    showDay();
    // DEBUG: load the day picked in the date box. Clearing it goes back to the buttons.
    if (DEBUG_DATE && !preview) {
      $("dbgdate").onchange = (e) => {
        const [y, m, d] = e.target.value.split("-").map(Number);
        debugDay = y ? new Date(y, m - 1, d) : null;
        showDay();
        refresh();
      };
    }

    function showView() {
      for (const b of root.querySelectorAll("#view button")) b.setAttribute("aria-pressed", String(b.dataset.v === view));
    }
    function setView(v, save) {
      if (!["away", "relief", "time"].includes(v)) v = "away";
      if (v === view) return;
      view = v;
      showView();
      if (save) { try { chrome.storage.local.set({ [VIEW_KEY]: view }); } catch (_) {} }
      if (lastData) render(); // no need to ask Compass again
    }
    for (const b of root.querySelectorAll("#view button")) b.onclick = () => setView(b.dataset.v, true);
    showView();
    try {
      chrome.storage.local.get([VIEW_KEY], (r) => setView(r?.[VIEW_KEY], false));
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area === "local" && VIEW_KEY in changes) setView(changes[VIEW_KEY].newValue, false);
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) {}

    function setSummary(big, what, meta, cls = "") {
      const s = $("summary");
      s.textContent = "";
      const m = el("span", "meta");
      for (const part of [].concat(meta)) m.append(part);
      s.append(el("span", "big " + cls, big), el("span", "what", what), m);
    }

    // Placeholder rows the same height as the real list, so nothing moves.
    function skeleton() {
      setSummary("", "", fmtDay(chosenDay()));
      $("summary").prepend(Object.assign(el("span", "sk"), { style: "width:150px;height:28px;display:inline-block" }));
      const list = $("list");
      list.textContent = "";
      for (let i = 0; i < 4; i++) {
        const row = el("div", "row");
        const who = el("div", "who");
        who.append(Object.assign(el("div", "sk"), { style: `height:14px;width:${55 - i * 8}%;margin-top:2px` }));
        const chips = el("div", "chips");
        for (let c = 0; c < 2 + (i % 2); c++) chips.append(Object.assign(el("span", "sk"), { style: "height:18px;width:64px;border-radius:12px" }));
        who.append(chips);
        row.append(el("div", "avatar sk"), who);
        list.append(row);
      }
    }

    function message(big, what, text, { ok = false, error = false } = {}) {
      setSummary(big, what, fmtDay(chosenDay()), error ? "err" : ok ? "ok" : "");
      const list = $("list");
      list.textContent = "";
      const box = el("div", "empty" + (error ? " err" : ""));
      box.innerHTML = error ? WARN : CHECK;
      box.append(el("div", null, text));
      list.append(box);
    }

    function avatarFor(p, cls = "avatar") {
      if (!p) return el("div", cls + " none", "!");
      const av = el("div", cls, initials(p.name));
      av.style.background = `hsl(${hue(keyOf(p))} 45% 42%)`;
      if (p.code) av.title = p.code;
      return av;
    }

    const state = (c, now) => (c.finish && c.finish <= now ? "done" : c.start <= now && (!c.finish || c.finish > now) ? "live" : "");
    const timeRange = (c) => (c.finish ? `${fmtTime(c.start)}–${fmtTime(c.finish)}` : fmtTime(c.start));

    function classChip(c, now) {
      const st = state(c, now);
      const chip = el("span", "chip" + (!c.relief.length ? " warn" : st ? " " + st : ""),
        [c.period ? `P${c.period}` : fmtTime(c.start), c.className].filter(Boolean).join(" · "));
      chip.title = [c.className, timeRange(c), c.room && `Room ${c.room}`, st === "live" && "in progress"].filter(Boolean).join(" · ");
      return chip;
    }

    // One row per person, then one line for each person on the other side (the
    // relief teachers of a teacher who is away, or the reverse), with their classes.
    // So when several staff cover one teacher, each line shows whose classes are whose.
    function renderNested(outer, innerOf, now, { reliefOuter }) {
      const list = $("list");
      list.textContent = "";
      for (const g of groupBy(outer)) {
        const row = el("div", "row");
        const who = el("div", "who");
        const name = el("div", "name" + (reliefOuter ? (g.person ? " rname" : " rname none") : ""), g.person ? g.person.name : NO_RELIEF);
        if (g.person?.code) name.title = g.person.code;
        who.append(name);
        for (const sub of groupBy(g.classes.map((c) => ({ c, ps: innerOf(c) })))) {
          const line = el("div", "sub");
          if (reliefOuter) {
            line.append(el("span", "for", `for ${sub.person.name}`));
          } else {
            line.append(el("span", "arrow", "↳"), avatarFor(sub.person, "avatar mini"),
              el("span", "rname" + (sub.person ? "" : " none"), sub.person ? sub.person.name : NO_RELIEF));
          }
          if (sub.person?.code) line.lastChild.title = sub.person.code;
          const chips = el("span", "chips");
          for (const c of sub.classes) chips.append(classChip(c, now));
          line.append(chips);
          who.append(line);
        }
        row.append(avatarFor(g.person), who, el("span", "count", String(g.classes.length)));
        list.append(row);
      }
    }

    // entries: [{ c: class, ps: people }]. A class with nobody goes in a "no one" group.
    function groupBy(entries) {
      const map = new Map();
      for (const { c, ps } of entries) {
        for (const p of ps.length ? ps : [null]) {
          const k = p ? keyOf(p) : "";
          if (!map.has(k)) map.set(k, { person: p, classes: [] });
          map.get(k).classes.push(c);
        }
      }
      // Classes with no relief first, then the busiest people.
      return [...map.values()].sort((a, b) => !!a.person - !!b.person
        || b.classes.length - a.classes.length || a.person.name.localeCompare(b.person.name));
    }

    // One row per teacher who is away; a line for each relief teacher under it.
    function renderByAway(res, now) {
      renderNested(res.classes.map((c) => ({ c, ps: c.away })), (c) => c.relief, now, { reliefOuter: false });
    }

    // One row per relief teacher; a line for each teacher they cover under it.
    function renderByRelief(res, now) {
      renderNested(res.classes.map((c) => ({ c, ps: c.relief })), (c) => c.away, now, { reliefOuter: true });
    }

    // One section per start time (period), earliest first.
    function renderByTime(res, now) {
      const slots = new Map();
      for (const c of res.classes) {
        const key = c.start.getTime();
        if (!slots.has(key)) slots.set(key, { start: c.start, finish: c.finish, periods: new Set(), classes: [] });
        const slot = slots.get(key);
        if (c.period) slot.periods.add(c.period);
        if (c.finish && (!slot.finish || c.finish > slot.finish)) slot.finish = c.finish;
        slot.classes.push(c);
      }
      const list = $("list");
      list.textContent = "";
      for (const slot of slots.values()) {
        const periods = [...slot.periods].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const head = el("div", "slot");
        head.append(
          el("span", null, periods.length ? periods.map((p) => `P${p}`).join(" / ") : fmtTime(slot.start)),
          el("span", "when", timeRange(slot)),
          el("span", "count", String(slot.classes.length)),
        );
        list.append(head);
        for (const c of slot.classes) {
          const st = state(c, now);
          const row = el("div", "srow" + (st === "done" ? " done" : ""));
          const who = el("div", "who");
          who.append(el("div", "name rname" + (c.relief.length ? "" : " none"), c.relief.length ? names(c.relief) : NO_RELIEF));
          who.append(el("div", "detail", [`for ${names(c.away)}`, c.className, c.room && `Room ${c.room}`].filter(Boolean).join(" · ")));
          row.append(avatarFor(c.relief[0]), who);
          if (!c.relief.length) row.append(el("span", "chip warn", "not covered"));
          else if (st === "live") row.append(el("span", "chip live", "in progress"));
          list.append(row);
        }
      }
    }

    function render() {
      const res = summarise(lastData.items, lastData.now, lastData.staff);
      const now = new Date();
      const when = sameDay(lastData.day, now) ? "today" : `on ${fmtDay(lastData.day)}`;
      if (!res.classes.length) {
        message("0", "classes", `No classes have a relief teacher ${when}`, { ok: true });
      } else {
        const meta = [`${res.away} away · ${res.relief} relief · `];
        if (res.uncovered) meta.push(el("span", "warn", `${res.uncovered} not covered`), " · ");
        meta.push(fmtDay(lastData.day));
        setSummary(String(res.classes.length), `class${res.classes.length === 1 ? "" : "es"}`, meta);
        if (view === "relief") renderByRelief(res, now);
        else if (view === "time") renderByTime(res, now);
        else renderByAway(res, now);
      }
      const missing = lastData.missing ? ` · Compass sent only part of the list (${lastData.missing} missing)` : "";
      setFoot(`Updated ${fmtTime(res.updated)} · ${footText().toLowerCase()}${missing}`);
    }

    let loadId = 0; // ignores an older load that finishes after the day was changed
    async function refresh() {
      const id = ++loadId;
      busy = true;
      skeleton();
      if (!lastLoaded) setFoot(footText());
      try {
        const data = await load(chosenDay());
        if (id !== loadId) return;
        lastData = data;
        render();
      } catch (e) {
        if (id !== loadId) return;
        lastData = null;
        message("", "Couldn't load relief", e.message || String(e), { error: true });
        setFoot(`Will try again in ${REFRESH_MINUTES} min`);
      } finally {
        if (id === loadId) { lastLoaded = Date.now(); busy = false; }
      }
    }

    if (preview) {
      skeleton();
      setFoot("Preview – the live list shows on the homepage");
      return {};
    }

    $("refresh").onclick = () => { if (!busy) refresh(); };
    refresh();

    // Auto-refresh. Browsers slow timers in background tabs, so also catch up
    // as soon as the tab is looked at again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due() && !busy) { showDay(); refresh(); } };
    const timer = setInterval(onVisible, 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); } };
  }

  return { mount };
})();
