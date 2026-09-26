// "Recent Chronicle" widget: the newest Chronicle entries of the school (today or the last 7 days).
// It uses the same call as the Chronicle page. Compass sends only the entries that the user can see.
globalThis.CompassChronicle = (() => {
  const REFRESH_MINUTES = 5;
  const NEW_MINUTES = 30; // Entries younger than this get a "new" chip.
  const PAGE_SIZE = 100;
  const MAX_PAGES = 10;   // A maximum of 1000 entries for each load.

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

  const pad = (n) => String(n).padStart(2, "0");
  // Compass reads the date filter as local time without a time zone: "2026-09-25T21:49:01".
  const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  function parseDate(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d : null;
  }

  // "Yuffie Kisaragi (YUFFIE.KISARAGI), Cait Sith (CAIT.SITH)" -> ["Yuffie Kisaragi", "Cait Sith"]
  function studentNames(text) {
    return String(text || "")
      .split(/\)\s*,\s*/)
      .map((s) => s.replace(/\s*\([^)]*\)?\s*$/, "").trim())
      .filter(Boolean);
  }

  // The year levels of the school (id -> name), fetched one time for each page.
  let yearNamesPromise = null;
  function fetchYearNames() {
    yearNamesPromise ||= post("/Services/User.svc/GetStudentYearLevels?sessionstate=readonly", { page: 1, start: 0, limit: 200 })
      .then((json) => new Map((Array.isArray(json?.d) ? json.d : []).map((y) => [y.id, String(y.n || "").trim()])))
      .catch(() => { yearNamesPromise = null; return new Map(); });
    return yearNamesPromise;
  }

  // days: 1 = today, 7 = today and the 6 days before. years: year-level names (null = all).
  // The year filter operates in Compass, thus a change to it sends a new request.
  async function load({ days = 1, years = null, now = new Date() } = {}) {
    const yearNames = await fetchYearNames();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
    const ids = years ? [...yearNames].filter(([, n]) => years.includes(n)).map(([id]) => id) : [];
    if (years && !ids.length) return { items: [], total: 0, capped: false, now, yearNames };

    const items = [];
    let total = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const json = await post("/Services/ChronicleV2.svc/GetAllEntriesThin?sessionstate=readonly", {
        filter: {
          createdByFilter: [], categoryFilter: [], templateFilter: [], ratingFilter: [], formGroupFilter: [],
          yearLevelFilter: ids, houseFilter: [], campusFilter: [], rollFlagFilter: [],
          pointsStart: null, pointsFinish: null, entryIdFilter: null, showAppendedEntries: false, importedFilter: 1,
          entryCreatedStart: localStamp(start), entryCreatedFinish: localStamp(now), studentFilter: [], needsApprovalFilter: 3,
        },
        page, start: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE,
        sort: JSON.stringify([{ property: "createdTimestamp", direction: "DESC" }]),
      });
      const d = json?.d;
      if (!d || !Array.isArray(d.data)) throw new Error("Couldn't read the Chronicle entries from Compass.");
      items.push(...d.data);
      total = typeof d.total === "number" ? d.total : items.length;
      if (!d.data.length || items.length >= total) break;
    }
    return { items, total, capped: items.length < total, now, yearNames };
  }

  // Makes the rows for the widget. types: template names to keep (null = all).
  function summarise(items, now = new Date(), types = null) {
    let rows = items.map((it) => ({
      id: it.id,
      students: studentNames(it.attendeeNames),
      type: String(it.templateName || "Chronicle entry").trim(),
      by: String(it.creatorName || it.userNameCreated || "").trim(),
      created: parseDate(it.createdTimestamp),
      occurred: parseDate(it.occurredTimestamp) || parseDate(it.createdTimestamp),
    })).filter((r) => r.created);
    const all = rows.length;
    const typeCounts = new Map();
    for (const r of rows) typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
    if (types) {
      const keep = new Set(types);
      rows = rows.filter((r) => keep.has(r.type));
    }
    rows.sort((a, b) => b.created - a.created || b.id - a.id);
    return { rows, typeCounts, otherTypes: all - rows.length, updated: now };
  }

  // DISABLED: the details dialog did not show all entries correctly. The View button opens the
  // Chronicle page instead. The code stays here for a later version.
//   // --- one entry, for the details dialog ---------------------------------------------------
//   // "/Date(1790279340000+1000)/" or an ISO date.
//   function parseAny(v) {
//     const m = /\/Date\((-?\d+)/.exec(String(v || ""));
//     return m ? new Date(Number(m[1])) : parseDate(v);
//   }
//
//   // The staff and location lists change the ids in some fields to names. The widget gets
//   // each list one time, and only when an entry has a field that needs the list.
//   const lists = {};
//   function lookup(key, path, body, toName) {
//     lists[key] ||= (body ? post(path, body) : fetch(path, { credentials: "include" }).then((r) => r.json()))
//       .then((json) => new Map((Array.isArray(json?.d) ? json.d : json?.d?.data || []).map((x) => [x.id, toName(x)])))
//       .catch(() => { lists[key] = null; return new Map(); });
//     return lists[key];
//   }
//   const staffNames = () => lookup("staff", "/Services/User.svc/GetAllStaff?sessionstate=readonly", { page: 1, start: 0, limit: 5000 },
//     (s) => s.FormattedNameFirstLast || [s.fn, s.ln].filter(Boolean).join(" ") || s.n);
//   const locationNames = () => lookup("locations", "/Services/ReferenceDataCache.svc/GetAllLocations?sessionstate=readonly&page=1&start=0&limit=5000", null,
//     (l) => l.longName || l.n);
//
//   // Field types of Compass (Compass.enums.ChronicleFieldType).
//   const FT = { Date: 3, Time: 4, Checkbox: 5, Location: 6, GroupCheckbox: 8, DisplayField: 9, TeachingStaff: 10, Bundle: 12, MultiSelect: 13 };
//
//   function fieldText(f, staff, locations) {
//     let v = f.value;
//     if (v == null || v === "") return "";
//     v = String(v);
//     if (v === "true") return "Yes";
//     if (v === "false") return f.type === FT.Checkbox ? "No" : v;
//     const d = f.type === FT.Date || f.type === FT.Time ? parseAny(v) : null;
//     if (d) {
//       return f.type === FT.Time
//         ? d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
//         : d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
//     }
//     if (f.type === FT.TeachingStaff) return staff.get(Number(v)) || v;
//     if (f.type === FT.Location) {
//       try { const o = JSON.parse(v); return locations.get(o?.id) || o?.customValue || (typeof o === "number" ? locations.get(o) : "") || v; }
//       catch (_) { return locations.get(Number(v)) || v; }
//     }
//     if (f.type === FT.GroupCheckbox || f.type === FT.MultiSelect) {
//       try { const a = JSON.parse(v); if (Array.isArray(a)) return a.join(", "); } catch (_) {}
//     }
//     return v;
//   }
//
//   // Gets one entry with the same call as the Chronicle page, and makes the text for the dialog.
//   async function loadEntry(id) {
//     const json = await post("/Services/ChronicleV2.svc/GetEntry?sessionstate=readonly", { id, archived: true });
//     const e = json?.d;
//     if (!e || typeof e !== "object") throw new Error("Couldn't read this Chronicle entry from Compass.");
//     const fields = (Array.isArray(e.inputFields) ? e.inputFields : [])
//       .filter((f) => f.type !== FT.Bundle)
//       .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
//     const staff = fields.some((f) => f.type === FT.TeachingStaff && f.value) ? await staffNames() : new Map();
//     const locations = fields.some((f) => f.type === FT.Location && f.value) ? await locationNames() : new Map();
//     return {
//       id: e.id ?? id,
//       type: String(e.templateName || "Chronicle entry").trim(),
//       category: String(e.categoryName || "").trim(),
//       occurred: parseAny(e.occurredTimestamp),
//       created: parseAny(e.createdTimestamp),
//       by: String(e.creatorName || e.userNameCreated || "").trim(),
//       points: typeof e.points === "number" ? e.points : 0,
//       fields: fields
//         .map((f) => ({ name: String(f.name || "").trim(), text: fieldText(f, staff, locations), long: f.type === 2 }))
//         .filter((f) => f.text),
//     };
//   }
//
  return { load, summarise, studentNames, REFRESH_MINUTES, NEW_MINUTES }; // loadEntry is disabled (see above).
})();

globalThis.CompassChronicleUI = (() => {
  const LIST_HEIGHT = 232; // Fixed, so that the card does not change size.

  const CSS_EXTRA = `
    .summary { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 8px; height: 36px; white-space: nowrap; overflow: hidden; }
    .summary .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .big { font-size: 2rem; line-height: 1; font-weight: 600; color: #203249; font-variant-numeric: tabular-nums; }
    .big.err { color: #b3261e; font-size: 1rem; font-weight: 600; }
    .what { font-size: 1rem; font-weight: 500; }
    .meta { color: #5f6368; margin-left: auto; font-size: 12px; white-space: nowrap; }
    .list { height: ${LIST_HEIGHT}px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
    .row { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid #EAEBEE; }
    .row:first-child { border-top: 0; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .who { flex: 1; min-width: 0; }
    .name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail { color: #5f6368; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .type { font-weight: 600; color: #3E4B62; }
    .type.pos { color: #0072B2; }
    .type.neg { color: #B84A00; }
    .side { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 3px 4px; max-width: 90px; }
    .when { flex-basis: 100%; text-align: right; font-weight: 600; font-size: 13px; color: #3E4B62; font-variant-numeric: tabular-nums; }
    .row.clickable { cursor: pointer; border-radius: 6px; }
    .row.clickable:hover { background: #F5F8FC; }
    .view { flex: none; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #0E6CD9; background: #fff; color: #0E6CD9;
      border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none; }
    .view svg { width: 14px; height: 14px; fill: currentColor; }
    .view:hover, .row.clickable:hover .view { background: #0E6CD9; color: #fff; }
    .view:focus-visible { outline: 2px solid #0E6CD9; outline-offset: 2px; }
    .chip { border-radius: 12px; padding: 0 7px; font-size: 11px; white-space: nowrap; background: #E6F1FA; color: #005A8C; }
    .empty { height: 100%; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; text-align: center; color: #5f6368; }
    .empty svg { width: 40px; height: 40px; fill: #9aa0a6; }
    .empty.err svg { fill: #b3261e; }
    .foot { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    .avatar.sk { border-radius: 50%; }
    .yrow { align-items: center; gap: 6px; }
    .yrow .seg { margin-left: auto; }
    .seg button { color: #3E4B62; }
    .seg button[aria-pressed="true"] { color: #fff; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;
  // Material "open_in_new" / "close"
//   const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z"/></svg>';
  // The same address that the "View on Chronicle Page" action of Compass opens.
  const entryUrl = (id) => `/Organise/Chronicle/Default.aspx?entryId=${encodeURIComponent(id)}`;
  // Material "description" / "warning"
  const DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm4 18H6V4h7v5h5z"/></svg>';
  const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>';

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const byName = (list) => [...list].sort((a, b) => a.replace(/^[+-]\s*/, "").localeCompare(b.replace(/^[+-]\s*/, "")));

  // DISABLED: see the note above loadEntry.
//   // --- details dialog -------------------------------------------------------------------------
//   // The dialog shows one entry over the homepage. It has its own element on <body>, thus the
//   // cards of the homepage cannot cut it. There is one dialog for the page.
//   const DIALOG_CSS = `
//     :host { all: initial; }
//     .backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(15, 23, 42, .45);
//       display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
//     .backdrop[hidden] { display: none; }
//     .dialog { width: min(560px, 100%); max-height: min(80vh, 720px); display: flex; flex-direction: column; background: #fff;
//       border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.3); color: #203249;
//       font: 13px/1.45 Cabin, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; }
//     .head { display: flex; align-items: flex-start; gap: 8px; padding: 14px 16px 10px; border-bottom: 1px solid #EAEBEE; }
//     .titles { flex: 1; min-width: 0; }
//     h2 { margin: 0; font-size: 16px; font-weight: 600; }
//     h2.pos { color: #0072B2; } h2.neg { color: #B84A00; }
//     .sub { color: #5f6368; font-size: 12px; margin-top: 2px; }
//     .x { flex: none; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: #545F73; cursor: pointer;
//       display: inline-flex; align-items: center; justify-content: center; }
//     .x:hover { background: rgba(32, 50, 73, .08); }
//     .x svg { width: 20px; height: 20px; fill: currentColor; }
//     .body { padding: 12px 16px; overflow-y: auto; }
//     .students { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
//     dl { margin: 0; display: grid; grid-template-columns: minmax(110px, 35%) 1fr; gap: 6px 12px; }
//     dt { color: #5f6368; }
//     dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
//     dt.long, dd.long { grid-column: 1 / -1; }
//     dd.long { background: #F7F8FA; border-radius: 6px; padding: 6px 8px; margin-top: -2px; }
//     .note { color: #5f6368; }
//     .err { color: #b3261e; }
//     .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid #EAEBEE; }
//     .foot .meta { color: #5f6368; font-size: 12px; }
//     a.btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 12px; background: #0E6CD9; color: #fff;
//       text-decoration: none; font-weight: 600; font-size: 12px; white-space: nowrap; }
//     a.btn:hover { background: #0B5AB5; }
//     a.btn svg { width: 16px; height: 16px; fill: currentColor; }
//     .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
//       animation: shimmer 1.2s linear infinite; border-radius: 6px; height: 14px; margin: 8px 0; }
//     @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
//   `;
//   const entryDialog = (() => {
//     let root = null, backdrop, dialog, returnFocus = null, current = 0;
//     const typeClass = (t) => (/^\+/.test(t) ? "pos" : /^-/.test(t) ? "neg" : "");
//     const when = (d) => (d ? `${fmtDay(d)} ${fmtTime(d)}` : "");
//
//     function build() {
//       const host = document.createElement("div");
//       host.id = "compass-chronicle-dialog";
//       document.body.appendChild(host);
//       root = host.attachShadow({ mode: "open" });
//       root.innerHTML = `<style>${DIALOG_CSS}</style>
//         <div class="backdrop" hidden><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="t"></div></div>`;
//       backdrop = root.querySelector(".backdrop");
//       dialog = root.querySelector(".dialog");
//       backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
//       root.addEventListener("keydown", (e) => {
//         if (e.key === "Escape") { e.stopPropagation(); close(); }
//         if (e.key === "Tab") { // Keep the focus in the dialog.
//           const items = [...dialog.querySelectorAll("button, a[href]")];
//           if (!items.length) return;
//           const first = items[0], last = items[items.length - 1], active = root.activeElement;
//           if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
//           else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
//         }
//       });
//     }
//
//     function close() {
//       if (!root || backdrop.hidden) return;
//       backdrop.hidden = true;
//       current = 0;
//       returnFocus?.focus?.();
//     }
//
//     // row: the row from summarise(), so that the dialog shows the student and the type immediately.
//     function draw(row, entry, error) {
//       dialog.textContent = "";
//       const type = entry?.type || row.type;
//       const head = el("div", "head");
//       const titles = el("div", "titles");
//       const h2 = el("h2", typeClass(type), type);
//       h2.id = "t";
//       const bits = [entry?.category, `Occurred ${when(entry?.occurred || row.occurred)}`, (entry?.by || row.by) && `by ${entry?.by || row.by}`];
//       titles.append(h2, el("div", "sub", bits.filter(Boolean).join(" · ")));
//       const x = el("button", "x");
//       x.type = "button";
//       x.title = "Close";
//       x.setAttribute("aria-label", "Close");
//       x.innerHTML = CLOSE;
//       x.onclick = close;
//       head.append(titles, x);
//
//       const body = el("div", "body");
//       body.append(el("div", "students", row.students.join(", ") || "No student"));
//       if (error) {
//         body.append(el("div", "err", error));
//       } else if (!entry) {
//         for (const w of [40, 90, 60, 80]) body.append(Object.assign(el("div", "sk"), { style: `width:${w}%` }));
//       } else if (!entry.fields.length) {
//         body.append(el("div", "note", "This entry has no details that you can see."));
//       } else {
//         const dl = el("dl");
//         for (const f of entry.fields) {
//           const long = f.long || f.text.length > 60;
//           dl.append(el("dt", long ? "long" : "", f.name), el("dd", long ? "long" : "", f.text));
//         }
//         body.append(dl);
//       }
//
//       const foot = el("div", "foot");
//       const meta = [`Entry #${row.id}`, entry?.points ? `${entry.points > 0 ? "+" : ""}${entry.points} points` : "",
//         entry?.created && `recorded ${when(entry.created)}`].filter(Boolean).join(" · ");
//       const open = el("a", "btn");
//       open.href = entryUrl(row.id);
//       open.target = "_blank";
//       open.rel = "noopener";
//       open.innerHTML = OPEN;
//       open.append("Open in Chronicle");
//       open.title = "Open this entry on the Chronicle page, in a new tab (to edit it or to see more)";
//       foot.append(el("span", "meta", meta), open);
//
//       dialog.append(head, body, foot);
//     }
//
//     async function show(row, from) {
//       if (!root) build();
//       returnFocus = from || null;
//       current = row.id;
//       draw(row, null);
//       backdrop.hidden = false;
//       dialog.querySelector(".x").focus();
//       try {
//         const entry = await globalThis.CompassChronicle.loadEntry(row.id);
//         if (current === row.id) { draw(row, entry); dialog.querySelector(".x").focus(); }
//       } catch (e) {
//         if (current === row.id) { draw(row, null, e.message || String(e)); dialog.querySelector(".x").focus(); }
//       }
//     }
//
//     return { show, close };
//   })();

  function mount(host, { preview = false } = {}) {
    const { load, summarise, REFRESH_MINUTES, NEW_MINUTES } = globalThis.CompassChronicle;
    const { CSS, ICONS } = globalThis.CompassAttendanceUI;
    const Y = globalThis.CompassYears;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${Y.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Recent Chronicle</h1>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${ICONS.refresh}</button>`}
        </header>
        <div class="yrow" id="yrow">
          <div class="seg" id="view">
            <button data-v="1" title="Entries made today">Today</button>
            <button data-v="7" title="Entries made in the last 7 days">7 days</button>
          </div>
        </div>
        <div class="yarea" id="yarea">
          <div class="summary" id="summary"></div>
          <div class="list" id="list"></div>
        </div>
        <div class="foot" id="foot"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const footText = () => `Refreshes every ${REFRESH_MINUTES} min`;
    const setFoot = (text) => { $("foot").textContent = $("foot").title = text; }; // One line. The full text shows on hover.

    let lastLoaded = 0;
    let busy = false;
    let again = false;   // A filter changed during a load. Load again after it.
    let lastData = null; // { items, total, capped, now, yearNames } from the last load
    const DAYS_KEY = "chronicleDays";        // 1 | 7
    const YEARS_KEY = "chronicleYearGroups"; // array of year names; null = all
    const TYPES_KEY = "chronicleTypes";      // array of template names; null = all
    let days = 1, years = null, types = null;
    const save = (key, value) => { try { chrome.storage.local.set({ [key]: value }); } catch (_) {} };

    // --- filters: year groups (the same filter as the other widgets) and entry types ---------
    const yearFilter = Y.filter({ onChange: (next) => setYears(next, true), onOpen: () => typeFilter.close() });
    const typeFilter = Y.filter({
      onChange: (next) => setTypes(next, true), onOpen: () => yearFilter.close(),
      allText: "All types", noneText: "No types", noun: "Entry types", sortFn: byName, wide: true,
      labelFn: (sel) => (sel.length === 1 ? sel[0] : `${sel.length} types`),
    });
    $("yrow").prepend(yearFilter.chip, typeFilter.chip);
    $("yarea").append(yearFilter.panel, typeFilter.panel);

    function yearOptions() {
      const set = new Set([...(lastData?.yearNames?.values() || [])].filter(Boolean));
      for (const y of years || []) set.add(y);
      return Y.sort(set);
    }
    // The types in the loaded entries, and the types that the user selected before.
    function typeOptions() {
      const set = new Set((lastData?.items || []).map((it) => String(it.templateName || "Chronicle entry").trim()));
      for (const t of types || []) set.add(t);
      return byName(set);
    }
    const showFilters = () => {
      yearFilter.set(lastData ? yearOptions() : [], years);
      typeFilter.set(lastData ? typeOptions() : [], types);
    };

    function setYears(next, fromUser) {
      years = next === null ? null : Y.sort(next);
      if (fromUser) save(YEARS_KEY, years);
      showFilters();
      if (lastData || fromUser) refresh(); // Compass does the year filter, thus load again.
    }
    function setTypes(next, fromUser) {
      types = next === null ? null : byName(next);
      if (fromUser) save(TYPES_KEY, types);
      showFilters();
      if (lastData) render();
    }
    function showDays() {
      for (const b of root.querySelectorAll("#view button")) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === days));
    }
    function setDays(v, fromUser) {
      v = Number(v) === 7 ? 7 : 1;
      if (v === days) return;
      days = v;
      showDays();
      if (fromUser) save(DAYS_KEY, days);
      if (lastData || fromUser) refresh();
    }
    for (const b of root.querySelectorAll("#view button")) b.onclick = () => setDays(b.dataset.v, true);
    showDays();
    showFilters();

    function setSummary(big, what, meta, cls = "") {
      const s = $("summary");
      s.textContent = "";
      s.append(el("span", "big " + cls, big), el("span", "what", what), el("span", "meta", meta));
    }
    const rangeText = () => (days === 1 ? `Today · ${fmtDay(new Date())}` : "Last 7 days");

    // Placeholder rows with the same height as the real list, so that nothing moves.
    function skeleton() {
      setSummary("", "", rangeText());
      $("summary").prepend(Object.assign(el("span", "sk"), { style: "width:150px;height:28px;display:inline-block" }));
      const list = $("list");
      list.textContent = "";
      for (let i = 0; i < 5; i++) {
        const row = el("div", "row");
        const who = el("div", "who");
        who.append(Object.assign(el("div", "sk"), { style: `height:14px;width:${60 - i * 7}%;margin:2px 0 6px` }));
        who.append(Object.assign(el("div", "sk"), { style: `height:11px;width:${75 - i * 5}%` }));
        row.append(el("div", "avatar sk"), who, Object.assign(el("div", "sk"), { style: "height:16px;width:52px" }));
        list.append(row);
      }
    }

    function message(big, what, text, { error = false } = {}) {
      setSummary(big, what, rangeText(), error ? "err" : "");
      const list = $("list");
      list.textContent = "";
      const box = el("div", "empty" + (error ? " err" : ""));
      box.innerHTML = error ? WARN : DOC;
      box.append(el("div", null, text));
      list.append(box);
    }

    function renderRows(rows, now) {
      const list = $("list");
      list.textContent = "";
      for (const r of rows) {
        const first = r.students[0] || "No student";
        const row = el("div", "row");
        const av = el("div", "avatar", initials(first));
        av.style.background = `hsl(${hue(first)} 45% 42%)`;

        const who = el("div", "who");
        const more = r.students.length > 1 ? ` +${r.students.length - 1}` : "";
        const name = el("div", "name", first + more);
        name.title = r.students.join(", ");
        who.append(name);
        const detail = el("div", "detail");
        const type = el("span", "type" + (/^\+/.test(r.type) ? " pos" : /^-/.test(r.type) ? " neg" : ""), r.type);
        detail.append(type);
        if (r.by) detail.append(` · ${r.by}`);
        detail.title = [r.type, r.by && `by ${r.by}`, `occurred ${fmtDay(r.occurred)} ${fmtTime(r.occurred)}`].filter(Boolean).join(" · ");
        who.append(detail);

        const side = el("div", "side");
        const sameDay = r.created.toDateString() === now.toDateString();
        side.append(el("span", "when", sameDay ? fmtTime(r.created) : r.created.toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })));
        if (now - r.created < NEW_MINUTES * 60 * 1000) side.append(el("span", "chip", "new"));

        // Opens the entry on the Chronicle page in a new tab, as the "View on Chronicle Page" action of Compass does.
        const view = el("a", "view");
        view.href = entryUrl(r.id);
        view.target = "_blank";
        view.rel = "noopener";
        view.innerHTML = OPEN;
        view.append("View");
        view.title = `Open entry #${r.id} on the Chronicle page (new tab)`;
        view.setAttribute("aria-label", `Open the ${r.type} entry for ${first} on the Chronicle page`);
        view.onclick = (e) => e.stopPropagation();
        row.classList.add("clickable");
        row.onclick = () => window.open(view.href, "_blank", "noopener");

        row.append(av, who, side, view);
        list.append(row);
      }
    }

    function render() {
      const res = summarise(lastData.items, lastData.now, types);
      const now = new Date();
      const n = res.rows.length;
      if (!n) {
        const others = res.otherTypes ? ` · ${res.otherTypes} of other types` : "";
        message("0", "entries", `No Chronicle entries ${days === 1 ? "today" : "in the last 7 days"}${others}`);
      } else {
        setSummary(String(n), n === 1 ? "entry" : "entries", rangeText());
      }
      if (n) renderRows(res.rows, now);
      const capped = lastData.capped ? ` · showing the newest ${lastData.items.length} of ${lastData.total}` : "";
      setFoot(`Updated ${fmtTime(res.updated)} · ${footText().toLowerCase()}${capped}`);
    }

    // quiet: keep the current list on the screen while the widget loads (automatic refresh).
    async function refresh({ quiet = false } = {}) {
      if (busy) { if (!quiet) again = true; return; }
      busy = true;
      if (!quiet || !lastData) skeleton();
      if (!lastLoaded) setFoot(footText());
      try {
        lastData = await load({ days, years });
        render();
        showFilters(); // The lists of year groups and types can change after a load.
      } catch (e) {
        if (quiet && lastData) {
          setFoot(`Couldn't refresh · trying again in ${REFRESH_MINUTES} min`);
          $("foot").title = e.message || String(e);
        } else {
          lastData = null;
          message("", "Couldn't load Chronicle", e.message || String(e), { error: true });
          setFoot(`Will try again in ${REFRESH_MINUTES} min`);
        }
      } finally {
        lastLoaded = Date.now();
        busy = false;
        if (again) { again = false; refresh(); }
      }
    }

    if (preview) {
      skeleton();
      setFoot("Preview – the live list shows on the homepage");
      return {};
    }

    // Read the saved settings before the first load, so that the widget loads only one time.
    let started = false;
    const start = () => { if (!started) { started = true; refresh(); } };
    try {
      chrome.storage.local.get([DAYS_KEY, YEARS_KEY, TYPES_KEY], (r) => {
        days = Number(r?.[DAYS_KEY]) === 7 ? 7 : 1;
        years = Array.isArray(r?.[YEARS_KEY]) ? r[YEARS_KEY] : null;
        types = Array.isArray(r?.[TYPES_KEY]) ? r[TYPES_KEY] : null;
        showDays();
        showFilters();
        start();
      });
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area !== "local") return;
        if (DAYS_KEY in changes && Number(changes[DAYS_KEY].newValue) !== days) setDays(changes[DAYS_KEY].newValue, false);
        const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        if (YEARS_KEY in changes && !same(changes[YEARS_KEY].newValue, years)) setYears(changes[YEARS_KEY].newValue ?? null, false);
        if (TYPES_KEY in changes && !same(changes[TYPES_KEY].newValue, types)) setTypes(changes[TYPES_KEY].newValue ?? null, false);
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) { start(); }

    $("refresh").onclick = () => refresh();

    // Automatic refresh. Browsers slow the timers in background tabs, thus the widget also
    // refreshes when the user opens the tab again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (started && document.visibilityState === "visible" && due()) refresh({ quiet: true }); };
    const timer = setInterval(onVisible, 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); } };
  }

  return { mount };
})();
