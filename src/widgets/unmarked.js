// "Unmarked rolls" widget: rolls that have started today but haven't been marked,
// grouped by the teacher currently responsible (relief teacher if there is one).
// Uses the same call as the Unmarked Rolls tab on the Attendance page.
globalThis.CompassUnmarked = (() => {
  const REFRESH_MINUTES = 15;
  // Each roll is judged by its own start time from Compass (period, session, AM/PM
  // or excursion alike), so any timetable works. A roll is only listed once it has
  // been running for GRACE_MINUTES, giving the teacher time to mark it.
  const GRACE_MINUTES = 10;
  const PAGE_SIZE = 200;

  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;

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

  // "2026-09-25T03:50:00Z", falling back to "/Date(1790272200000+1000)/"
  function parseDate(iso, msDate) {
    const d = iso ? new Date(iso) : null;
    if (d && !isNaN(d)) return d;
    const m = /\/Date\((-?\d+)/.exec(msDate || "");
    return m ? new Date(Number(m[1])) : null;
  }

  // --- teacher field ----------------------------------------------------------------
  // Normally "(cstrife) Cloud STRIFE". With a relief teacher Compass sends HTML:
  //   "<s>(cstrife) Cloud STRIFE</s>&nbsp; (bwallace) Barret WALLACE"
  // Struck-through names are the teachers being covered. Parsed as text only; the
  // HTML is never put on the page.
  const decode = (t) => t
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  const toText = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const STRUCK = /<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;

  function people(text) {
    const out = [];
    const re = /\(([^)]*)\)\s*([^(]*)/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[2].replace(/[,;&]+\s*$/, "").trim();
      if (m[1].trim() || name) out.push({ code: m[1].trim(), name: name || m[1].trim() });
    }
    if (!out.length && text) out.push({ code: "", name: text });
    return out;
  }

  function parseTeacher(raw) {
    const html = String(raw || "");
    const struck = people(toText([...html.matchAll(STRUCK)].map((m) => m[2]).join(" ")));
    const current = people(toText(html.replace(STRUCK, " ")));
    if (!current.length) {
      // Everyone struck through and no replacement named: show the original teacher.
      const t = struck[0] || { code: "", name: "No teacher listed" };
      return { code: t.code, name: t.name, covering: [] };
    }
    return {
      code: current.map((p) => p.code).join("+"),
      name: current.map((p) => p.name).join(" & "),
      covering: struck,
    };
  }

  // Keeps rolls that started today (local time) at least GRACE_MINUTES ago, grouped by teacher.
  // years: year-level names to keep (null = all). Rolls with no year level count as "No YL",
  // matching Compass's own name for it.
  function summarise(items, now = new Date(), graceMinutes = GRACE_MINUTES, years = null) {
    const today = now.toDateString();
    const cutoff = new Date(now.getTime() - graceMinutes * 60 * 1000);
    let rolls = items
      .map((it) => ({
        id: it.id,
        start: parseDate(it.s, it.start),
        finish: parseDate(it.f, it.finish),
        className: toText(String(it.n || "")),
        period: toText(String(it.p || "")),
        location: toText(String(it.l || "")),
        teacher: parseTeacher(it.m),
        year: toText(String(it.yl || "")) || "No YL",
      }))
      .filter((r) => r.start && r.start.toDateString() === today && r.start <= cutoff);
    const due = rolls.length;
    if (years) {
      const keep = new Set(years);
      rolls = rolls.filter((r) => keep.has(r.year));
    }

    const byTeacher = new Map();
    for (const r of rolls) {
      const key = r.teacher.code || r.teacher.name;
      if (!byTeacher.has(key)) byTeacher.set(key, { code: r.teacher.code, name: r.teacher.name, rolls: [], covering: new Map() });
      const t = byTeacher.get(key);
      t.rolls.push(r);
      for (const c of r.teacher.covering) t.covering.set(c.code || c.name, c);
    }
    const teachers = [...byTeacher.values()].map((t) => ({ ...t, covering: [...t.covering.values()] }));
    teachers.forEach((t) => t.rolls.sort((a, b) => a.start - b.start));
    teachers.sort((a, b) => b.rolls.length - a.rolls.length || a.name.localeCompare(b.name));
    // otherYears: unmarked rolls left out by the year-group filter
    return { teachers, total: rolls.length, otherYears: due - rolls.length, updated: now };
  }

  // The school's year levels (for the filter), fetched once per page.
  let yearLevelsPromise = null;
  function fetchYearLevels() {
    yearLevelsPromise ||= post("/Services/User.svc/GetStudentYearLevels?sessionstate=readonly", { page: 1, start: 0, limit: 200 })
      .then((json) => (Array.isArray(json?.d) ? json.d.map((y) => toText(String(y.n || ""))).filter(Boolean) : []))
      .catch(() => { yearLevelsPromise = null; return []; }); // the list still works from the rolls' own years
    return yearLevelsPromise;
  }

  // Raw rolls plus the year-level list; the widget runs summarise() itself so the
  // year filter can change without asking Compass again.
  async function load(now = new Date()) {
    const yearLevels = fetchYearLevels();
    // Ask for a slightly wider window than today (in case Compass reads the
    // dates as UTC), then keep only today's rolls ourselves.
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const filter = JSON.stringify([
      { property: "start", value: stamp(from), type: ">=" },
      { property: "finish", value: stamp(to), type: "<=" },
    ]);

    const items = [];
    let total = Infinity;
    for (let page = 1; items.length < total && page <= 10; page++) {
      const json = await post("/Services/Attendance.svc/GetAllUnmarkedRolls?sessionstate=readonly", {
        unifiedUserIds: null, page, start: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, filter,
      });
      const d = json?.d;
      if (!d || !Array.isArray(d.data)) throw new Error("Couldn't read the unmarked rolls from Compass.");
      total = typeof d.total === "number" ? d.total : d.data.length;
      items.push(...d.data);
      if (!d.data.length) break;
    }
    return { items, now, yearLevels: await yearLevels };
  }

  // --- email the teachers -------------------------------------------------------------
  // The same calls as "Email staff with unmarked rolls" on Attendance > Unmarked Rolls.
  // Compass chooses the recipients by staff member and date range, not by roll, so the
  // widget asks for today and then keeps only the teachers that it shows.
  const EMAIL_SUBJECT = "You have unmarked rolls in Compass";
  // Compass's own wording for this email.
  const emailBody = () => "Hello,<br />\nThis is a reminder that you have Unmarked Roll/s. It is important that all rolls are marked " +
    "in a timely manner to support our approach to maximise student engagement and learning. Please review and mark your " +
    "unmarked rolls as soon as possible. Thank you.<br />\nPlease, click <a href=\"" + location.origin +
    "/Records/User.aspx?#attendance-unmarked-rolls\" style=\"color:blue; text-decoration: underline;\">here</a> to mark these rolls.";

  // Today, local time, as Compass's page sends it (UTC timestamps).
  function dayRange(now) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, -1);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  // The staff with unmarked rolls today: [{ id, name, code, info }].
  // Compass sends each name as "Cloud Strife - cstrife"; info is like "2 unmarked rolls".
  async function emailRecipients(now = new Date()) {
    const range = dayRange(now);
    const staff = await post("/Services/Attendance.svc/GetUnmarkedRollStaff?sessionstate=readonly", {
      activity: "", yearLevel: "", ...range, location: "", staff: "", layer: "", unifiedUserIds: [],
    });
    if (!Array.isArray(staff?.d)) throw new Error("Couldn't read the staff with unmarked rolls from Compass.");
    if (!staff.d.length) return [];
    const json = await post("/Services/Communications.svc/GetEmailWithUnmarkedRolls?sessionstate=readonly", {
      userIds: staff.d.map(String), activityId: null, subjectUserId: null, ...range, excludeInactiveStudents: false,
    });
    if (!Array.isArray(json?.d)) throw new Error("Couldn't read the email recipients from Compass.");
    return json.d.map((r) => {
      const m = /^(.*)\s-\s(\S+)$/.exec(String(r.name || ""));
      return { id: r.id, name: m ? m[1].trim() : String(r.name || ""), code: m ? m[2].toLowerCase() : "", info: String(r.additionalInfo || "") };
    });
  }

  // Sends Compass's unmarked-rolls email to these staff user IDs. Real emails.
  async function sendEmail(ids) {
    const userIds = ids.map(String);
    const allowed = await post("/Services/Communications.svc/CheckCompassAllowEmailFlagForUserIds?sessionstate=readonly",
      { userIds, alumniMode: false });
    if (allowed?.d !== true) throw new Error("Compass doesn't allow email to some of these staff. Use Attendance > Unmarked Rolls instead.");
    const sent = await post("/Services/Communications.svc/SendEmail?sessionstate=readonly", {
      subject: EMAIL_SUBJECT, templateBcc: "", includeContext: true, maskEmail: true, body: emailBody(),
      recipients: userIds, activityId: null, subjectUserId: null, emailAttachments: [],
      includeLeftParents: false, includeLeftStudents: false, enablePlaceHolders: false, additionalPlaceHolderArguments: [],
      customSource: null, templateContext: "2", usesCustomisableTemplate: false, usesAdvancedEditor: false, chronicleEntryUserIds: [],
    });
    if (sent?.d !== true) throw new Error("Compass didn't send the email.");
  }

  return { load, summarise, parseTeacher, emailRecipients, sendEmail, REFRESH_MINUTES, GRACE_MINUTES };
})();

globalThis.CompassUnmarkedUI = (() => {
  const LIST_HEIGHT = 232; // fixed so the card never changes size

  const CSS_EXTRA = `
    .summary { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 8px; height: 36px; white-space: nowrap; overflow: hidden; }
    .summary .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .big { font-size: 2rem; line-height: 1; font-weight: 600; color: #203249; font-variant-numeric: tabular-nums; }
    .big.ok { color: #2e7d32; }
    .big.err { color: #b3261e; font-size: 1rem; font-weight: 600; }
    .what { font-size: 1rem; font-weight: 500; }
    .meta { color: #5f6368; margin-left: auto; font-size: 12px; white-space: nowrap; }
    .list { height: ${LIST_HEIGHT}px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
    .row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid #EAEBEE; }
    .row:first-child { border-top: 0; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .who { flex: 1; min-width: 0; }
    .name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cover { color: #5f6368; font-size: 12px; margin-top: 1px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .chip { background: #F0F2F5; color: #3E4B62; border-radius: 12px; padding: 1px 8px; font-size: 12px; white-space: nowrap; }
    .chip.live { background: #FFF4E5; color: #8A4B00; }
    .count { flex: none; min-width: 24px; height: 24px; border-radius: 12px; background: #FDECEA; color: #B3261E;
      font-weight: 600; font-size: 12px; display: flex; align-items: center; justify-content: center; padding: 0 6px; box-sizing: border-box; margin-top: 4px; }
    .empty { height: 100%; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; text-align: center; color: #5f6368; }
    .empty svg { width: 40px; height: 40px; fill: #2e7d32; }
    .empty.err svg { fill: #b3261e; }
    .foot { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    .avatar.sk { border-radius: 50%; }
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
    #email[aria-expanded="true"] { background: rgba(14, 108, 217, .12); color: #0E6CD9; }
    #email:disabled { opacity: .4; cursor: default; }
    .mail { gap: 6px; padding-bottom: 4px; }
    .mail .q { font-weight: 600; font-size: 14px; margin-top: 2px; }
    .mail .who { display: flex; flex-direction: column; gap: 2px; font-size: 12px; overflow-y: auto; }
    .mail .who div { display: flex; justify-content: space-between; gap: 8px; }
    .mail .who span:last-child { color: #5f6368; white-space: nowrap; }
    .mail .ynote { color: #5f6368; font-size: 12px; }
    .mail .err { color: #b3261e; }
    .mail .actions { display: flex; gap: 6px; margin-top: 2px; }
    .mail .send { background: #0E6CD9; color: #fff; font-weight: 600; border-radius: 999px; padding: 4px 12px; }
    .mail .send:hover { background: #0B5AB5; }
    .mail .send:disabled { opacity: .6; cursor: default; }
    .sent { position: absolute; left: 0; right: 0; top: 0; z-index: 3; display: flex; align-items: center; gap: 8px;
      background: #E6F4EA; color: #1E7B34; border: 1px solid #A8DAB5; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
    .sent b { font-weight: 600; }
    .sent span { flex: 1; min-width: 0; }
    .sent button { background: none; color: #1E7B34; padding: 0 4px; font-size: 16px; line-height: 1; }
    .sent[hidden] { display: none; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;
  // Material "mail"
  const MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 4-8 5-8-5V6l8 5 8-5z"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>';
  const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>';

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function mount(host, { preview = false } = {}) {
    const { load, summarise, emailRecipients, sendEmail, REFRESH_MINUTES, GRACE_MINUTES } = globalThis.CompassUnmarked;
    const { CSS, ICONS } = globalThis.CompassTheme;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${globalThis.CompassYears.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Unmarked Rolls</h1>
          ${preview ? "" : `<button id="email" title="Email the teachers with unmarked rolls" aria-expanded="false" disabled>${MAIL}</button>`}
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow" id="yrow">
          <div class="seg" id="view">
            <button data-v="teacher" title="Group by teacher">Teacher</button>
            <button data-v="time" title="Order by period / roll start time">Time</button>
            <button data-v="year" title="Group by year group">Year</button>
          </div>
        </div>
        <div class="yarea" id="yarea">
          <div class="summary" id="summary"></div>
          <div class="list" id="list"></div>
          <div class="ypanel mail" id="mail" hidden></div>
          <div class="sent" id="sent" role="status" hidden></div>
        </div>
        <div class="foot" id="foot"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const N = globalThis.CompassNames;
    N.attach(root);
    const footText = () => `Refreshes every ${REFRESH_MINUTES} min · rolls show ${GRACE_MINUTES} min after they start`;
    const setFoot = (text) => { $("foot").textContent = $("foot").title = text; }; // one line; full text on hover

    let lastLoaded = 0;
    let busy = false;
    let lastData = null; // { items, now, yearLevels } from the last load
    const VIEW_KEY = "unmarkedView"; // "teacher" | "time" | "year", shared with other open cards
    let view = "teacher";

    // --- year-group filter (this widget's own; the attendance chart has a separate one)
    const YEARS_KEY = "unmarkedYearGroups"; // array of year names; null = all
    let years = null;
    const { sort: sortYears, label: yearsLabel } = globalThis.CompassYears;

    // Every year level we know of: the school's list plus any the rolls mention.
    function yearOptions() {
      const set = new Set(lastData?.yearLevels || []);
      for (const it of lastData?.items || []) set.add(String(it.yl || "").trim() || "No YL");
      for (const y of years || []) set.add(y);
      return sortYears(set);
    }

    // This filter is the same as the filter in the attendance chart. The two widgets keep different selections.
    const yearFilter = globalThis.CompassYears.filter({ onChange: (next) => setYears(next, true), onOpen: () => openMail(false) });
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
      if (!["teacher", "time", "year"].includes(v)) v = "teacher";
      if (v === view) return;
      view = v;
      showView();
      if (save) { try { chrome.storage.local.set({ [VIEW_KEY]: view }); } catch (_) {} }
      if (lastData) render(); // no need to ask Compass again
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

    // Placeholder rows the same height as the real list, so nothing moves.
    function skeleton() {
      setSummary("", "", fmtDay(new Date()));
      const s = $("summary");
      s.prepend(Object.assign(el("span", "sk"), { style: "width:150px;height:28px;display:inline-block" }));
      const list = $("list");
      list.textContent = "";
      for (let i = 0; i < 4; i++) {
        const row = el("div", "row");
        const av = el("div", "avatar sk");
        const who = el("div", "who");
        who.append(Object.assign(el("div", "sk"), { style: `height:14px;width:${55 - i * 8}%;margin-top:2px` }));
        const chips = el("div", "chips");
        for (let c = 0; c < 2 + (i % 2); c++) chips.append(Object.assign(el("span", "sk"), { style: "height:18px;width:64px;border-radius:12px" }));
        who.append(chips);
        row.append(av, who);
        list.append(row);
      }
    }

    function message(big, what, text, { ok = false, error = false } = {}) {
      setSummary(big, what, fmtDay(new Date()), error ? "err" : ok ? "ok" : "");
      const list = $("list");
      list.textContent = "";
      const box = el("div", "empty" + (error ? " err" : ""));
      box.innerHTML = error ? WARN : CHECK;
      box.append(el("div", null, text));
      list.append(box);
    }

    function avatarFor(name, code, cls = "avatar") {
      const av = el("div", cls, initials(name));
      av.style.background = `hsl(${hue(code || name)} 45% 42%)`;
      return av;
    }

    function renderByTeacher(res, now) {
        const list = $("list");
        list.textContent = "";
        for (const t of res.teachers) {
          const row = el("div", "row");
          const av = avatarFor(t.name, t.code);
          const who = el("div", "who");
          const name = el("div", "name", t.name);
          if (t.code) name.title = t.code;
          who.append(name);
          if (t.covering.length) who.append(el("div", "cover", `Relief for ${t.covering.map((c) => c.name).join(", ")}`));

          const chips = el("div", "chips");
          for (const r of t.rolls) {
            const live = r.finish && r.finish > now;
            const label = [r.period ? `P${r.period}` : r.className, fmtTime(r.start)].filter(Boolean).join(" · ");
            const chip = el("span", "chip" + (live ? " live" : ""), label);
            chip.title = [
              r.className,
              r.finish ? `${fmtTime(r.start)}–${fmtTime(r.finish)}` : fmtTime(r.start),
              r.location && `Room ${r.location}`,
              r.teacher.covering.length && `covering ${r.teacher.covering.map((c) => c.name).join(", ")}`,
              live && "in progress",
            ].filter(Boolean).join(" · ");
            chips.append(chip);
          }
          who.append(chips);
          row.append(av, who, el("span", "count", String(t.rolls.length)));
          list.append(row);
        }
    }

    // One section per start time (period), earliest first; teachers listed inside.
    function renderByTime(res, now) {
      const slots = new Map();
      for (const t of res.teachers) {
        for (const r of t.rolls) {
          const key = r.start.getTime();
          if (!slots.has(key)) slots.set(key, { start: r.start, finish: r.finish, periods: new Set(), rows: [] });
          const slot = slots.get(key);
          if (r.period) slot.periods.add(r.period);
          if (r.finish && (!slot.finish || r.finish > slot.finish)) slot.finish = r.finish;
          slot.rows.push({ t, r });
        }
      }
      const list = $("list");
      list.textContent = "";
      for (const slot of [...slots.values()].sort((a, b) => a.start - b.start)) {
        const periods = [...slot.periods].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const head = el("div", "slot");
        head.append(
          el("span", null, periods.length ? periods.map((p) => `P${p}`).join(" / ") : fmtTime(slot.start)),
          el("span", "when", slot.finish ? `${fmtTime(slot.start)}–${fmtTime(slot.finish)}` : fmtTime(slot.start)),
          el("span", "count", String(slot.rows.length)),
        );
        list.append(head);
        slot.rows.sort((a, b) => a.t.name.localeCompare(b.t.name));
        for (const { t, r } of slot.rows) {
          const row = el("div", "srow");
          const who = el("div", "who");
          const name = el("div", "name", t.name);
          if (t.code) name.title = t.code;
          who.append(name);
          const bits = [r.className, r.location && `Room ${r.location}`];
          if (r.teacher.covering.length) bits.push(`relief for ${r.teacher.covering.map((c) => c.name).join(", ")}`);
          who.append(el("div", "detail", bits.filter(Boolean).join(" · ")));
          row.append(avatarFor(t.name, t.code), who);
          if (r.finish && r.finish > now) row.append(el("span", "chip live", "in progress"));
          list.append(row);
        }
      }
    }

    // Shows one section for each year group, in school order. Each section shows its rolls in start-time order.
    function renderByYear(res, now) {
      const groups = new Map();
      for (const t of res.teachers) {
        for (const r of t.rolls) {
          if (!groups.has(r.year)) groups.set(r.year, []);
          groups.get(r.year).push({ t, r });
        }
      }
      const list = $("list");
      list.textContent = "";
      for (const year of sortYears(groups.keys())) {
        const rows = groups.get(year).sort((a, b) => a.r.start - b.r.start || a.t.name.localeCompare(b.t.name));
        const head = el("div", "slot");
        head.append(el("span", null, year), el("span", "count", String(rows.length)));
        list.append(head);
        for (const { t, r } of rows) {
          const row = el("div", "srow");
          const who = el("div", "who");
          const name = el("div", "name", t.name);
          if (t.code) name.title = t.code;
          who.append(name);
          const bits = [[r.period && `P${r.period}`, fmtTime(r.start)].filter(Boolean).join(" "), r.className, r.location && `Room ${r.location}`];
          if (r.teacher.covering.length) bits.push(`relief for ${r.teacher.covering.map((c) => c.name).join(", ")}`);
          who.append(el("div", "detail", bits.filter(Boolean).join(" · ")));
          row.append(avatarFor(t.name, t.code), who);
          if (r.finish && r.finish > now) row.append(el("span", "chip live", "in progress"));
          list.append(row);
        }
      }
    }

    // Test names (names.js): the teachers' names and codes on the screen.
    function disguise(res) {
      if (!N.on()) return res;
      const teacher = (t) => ({ ...N.staff(t), covering: t.covering.map(N.staff) });
      return { ...res, teachers: res.teachers.map((t) => ({ ...teacher(t), rolls: t.rolls.map((r) => ({ ...r, teacher: teacher(r.teacher) })) })) };
    }

    function render() {
      const res = disguise(summarise(lastData.items, lastData.now, GRACE_MINUTES, years));
      const now = new Date();
      if (!res.total) {
        const which = years === null ? "All rolls" : `All ${years.length ? yearsLabel(years) : "selected"} rolls`;
        const others = res.otherYears ? ` · ${res.otherYears} unmarked in other year groups` : "";
        message("0", "unmarked rolls", `${which} that started more than ${GRACE_MINUTES} min ago are marked${others}`, { ok: true });
      } else {
        setSummary(String(res.total), `unmarked roll${res.total === 1 ? "" : "s"}`,
          `${res.teachers.length} teacher${res.teachers.length === 1 ? "" : "s"} · ${fmtDay(now)}`);
        if (view === "time") renderByTime(res, now);
        else if (view === "year") renderByYear(res, now);
        else renderByTeacher(res, now);
      }
      if (!preview) $("email").disabled = !res.total;
      setFoot(`${mailNote ? mailNote + " · " : ""}Updated ${fmtTime(res.updated)} · ${footText().toLowerCase()}`);
    }

    // --- email the teachers (Compass's "Email staff with unmarked rolls") ---------------
    // Sends real emails, so it always asks first. Before it asks, it loads the list again
    // so the counts are current, and it emails only the teachers that the list shows.
    const mail = $("mail");
    let mailNote = "";  // the footer note after an email today, e.g. "Reminder sent 9:41am"
    let mailId = 0;     // ignores a check that finishes after the panel was closed

    function mailPanel(...parts) {
      mail.textContent = "";
      mail.append(...parts.filter(Boolean));
    }
    function mailButtons(sendText, onSend) {
      const row = el("div", "actions");
      if (onSend) {
        const send = el("button", "send", sendText);
        send.type = "button";
        send.onclick = () => { send.disabled = true; onSend(); };
        row.append(send);
      }
      const cancel = el("button", null, onSend ? "Cancel" : "Close");
      cancel.type = "button";
      cancel.onclick = () => openMail(false);
      row.append(cancel);
      return row;
    }

    function openMail(on) {
      if (preview) return;
      mail.hidden = !on;
      $("email").setAttribute("aria-expanded", String(on));
      if (!on) { mailId++; return; }
      yearFilter.close();
      checkMail();
    }

    async function checkMail() {
      const id = ++mailId;
      mailPanel(el("div", "ynote", "Checking the unmarked rolls…"));
      try {
        await refresh();
        const recipients = lastData ? await emailRecipients() : [];
        if (id !== mailId) return;
        const res = summarise(lastData?.items || [], lastData?.now, GRACE_MINUTES, years);
        // A roll with more than one current teacher has codes like "cstrife+tlockhart".
        const byCode = new Map(recipients.filter((r) => r.code).map((r) => [r.code, r]));
        const matched = [], missing = [];
        for (const t of res.teachers) {
          const found = t.code.split("+").map((c) => byCode.get(c.toLowerCase())).filter(Boolean);
          if (found.length) matched.push({ t, found }); else missing.push(t);
        }
        const ids = [...new Set(matched.flatMap((m) => m.found.map((r) => r.id)))];
        if (!ids.length) {
          mailPanel(el("div", "q", "No teachers to email"),
            el("div", "ynote", res.total ? "Compass has none of the teachers in this list as having unmarked rolls today." : "All the rolls in this list are marked."),
            mailButtons());
          return;
        }
        const rolls = matched.reduce((n, m) => n + m.t.rolls.length, 0);
        const who = el("div", "who");
        for (const { t } of matched) {
          const row = el("div");
          row.append(el("span", null, N.staff(t).name), el("span", null, `${t.rolls.length} roll${t.rolls.length === 1 ? "" : "s"}`));
          who.append(row);
        }
        const left = [
          res.otherYears && years !== null && "teachers whose rolls are only in other year groups",
          `rolls that started less than ${GRACE_MINUTES} min ago`,
        ].filter(Boolean);
        mailPanel(
          el("div", "q", `Email ${ids.length} teacher${ids.length === 1 ? "" : "s"} about ${rolls} unmarked roll${rolls === 1 ? "" : "s"}?`),
          who,
          el("div", "ynote", `Compass sends its "You have unmarked rolls" email. Not included: ${left.join(" and ")}.`),
          missing.length && el("div", "ynote err", `Compass has no email match for: ${missing.map((t) => N.staff(t).name).join(", ")}.`),
          mailButtons("Send email", () => doSend(ids)),
        );
      } catch (e) {
        if (id !== mailId) return;
        mailPanel(el("div", "q err", "Couldn't check the email"), el("div", "ynote", e.message || String(e)), mailButtons());
      }
    }

    // The emails sent today stay in the footer all day, also after a reload and in other tabs:
    // { date: "2026-10-15", sends: [{ at: ms, teachers: n }] }. A log from another day is ignored.
    const LOG_KEY = "unmarkedEmailLog";
    const SENT_SECONDS = 20;
    const todayKey = () => new Date().toDateString();
    let sendsToday = [];
    function showLog(log) {
      sendsToday = log?.date === todayKey() && Array.isArray(log.sends) ? log.sends : [];
      const times = sendsToday.map((x) => fmtTime(new Date(x.at)));
      mailNote = times.length ? `Reminder${times.length === 1 ? "" : "s"} sent ${times.join(", ")}` : "";
      if (lastData && !busy) render();
    }
    function logSend(teachers) {
      const sends = [...sendsToday, { at: Date.now(), teachers }];
      showLog({ date: todayKey(), sends });
      try { chrome.storage.local.set({ [LOG_KEY]: { date: todayKey(), sends } }); } catch (_) {}
    }
    try {
      chrome.storage.local.get([LOG_KEY], (r) => showLog(r?.[LOG_KEY]));
      const onLog = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onLog); return; }
        if (area === "local" && LOG_KEY in changes) showLog(changes[LOG_KEY].newValue);
      };
      chrome.storage.onChanged.addListener(onLog);
    } catch (_) {}

    // The confirmation banner: shows for SENT_SECONDS, or until it is closed.
    let sentTimer = 0;
    function showSent(teachers) {
      const box = $("sent");
      box.textContent = "";
      const close = el("button", null, "×");
      close.type = "button";
      close.title = "Close";
      close.onclick = () => { box.hidden = true; };
      box.append(el("span"), close);
      box.firstChild.append(el("b", null, "Unmarked reminder sent"), ` to ${teachers} teacher${teachers === 1 ? "" : "s"} at ${fmtTime(new Date())}`);
      box.hidden = false;
      clearTimeout(sentTimer);
      sentTimer = setTimeout(() => { box.hidden = true; }, SENT_SECONDS * 1000);
    }

    async function doSend(ids) {
      const id = mailId;
      mailPanel(el("div", "ynote", "Sending…"));
      try {
        await sendEmail(ids);
        logSend(ids.length);
        if (id === mailId) openMail(false);
        showSent(ids.length);
        refresh();
      } catch (e) {
        if (id !== mailId) return;
        mailPanel(el("div", "q err", "The email wasn't sent"), el("div", "ynote", e.message || String(e)), mailButtons());
      }
    }
    mail.addEventListener("keydown", (e) => { if (e.key === "Escape") { openMail(false); $("email").focus(); } });

    let loading = null; // the load in progress, so a caller can wait for it
    function refresh() {
      if (busy) return loading;
      return (loading = doRefresh());
    }

    async function doRefresh() {
      busy = true;
      skeleton();
      if (!lastLoaded) setFoot(footText());
      try {
        lastData = await load();
        render();
        showYears(); // the year list may have grown
      } catch (e) {
        message("", "Couldn't load unmarked rolls", e.message || String(e), { error: true });
        setFoot(`Will try again in ${REFRESH_MINUTES} min`);
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
    $("email").onclick = () => openMail(mail.hidden);
    refresh();
    const offNames = N.onChange(() => { if (lastData && !busy) render(); });

    // Auto-refresh. Browsers slow timers in background tabs, so also catch up
    // as soon as the tab is looked at again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due()) refresh(); };
    const timer = setInterval(onVisible, 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop: () => { clearInterval(timer); clearTimeout(sentTimer); document.removeEventListener("visibilitychange", onVisible); offNames(); } };
  }

  return { mount };
})();
