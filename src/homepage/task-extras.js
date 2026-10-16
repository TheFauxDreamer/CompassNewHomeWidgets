// Adds three things to Compass's "My Tasks" widget on the homepage:
//   - Hover: a task name that is cut off shows in full when you point at it.
//   - Sub-tasks: a task named "Seventh Heaven newsletter | print | laminate" shows as
//     "Seventh Heaven newsletter" with two sub-tasks below it. Each sub-task has its own tick box.
//     A tick is kept in this browser only, and it never ticks, opens or changes the main task.
//     " | " separates the parts because task names often use " - " as normal punctuation.
//   - Due dates: the row of a task that isn't done is red when it is overdue, orange when it is
//     due today and yellow when it is due in the next 2 school days. The Due Date cell's hover
//     text says how late or how soon.
//
// The widget is an ExtJS grid (.home-mytasks). Each task is a row with the task ID in
// data-recordid; the name is in the first cell that isn't the tick box or the delete button,
// and the due date is in the cell after it. ExtJS draws a row again when its task changes, so a
// MutationObserver applies the changes again. Compass keeps the full name, so its row editor
// still shows the " | " parts. The due dates come from the same call as the widget
// (TaskService.svc/GetTaskItems), or else from the Due Date cell's text.
// ExtJS sizes the widget before the sub-tasks are added, so when the rows' height changes this
// fires "ext-task-relayout" and task-relayout.js (in the page's world) has ExtJS size it again.

// --- due dates (no page needed, so the tests can load these) ------------------------------
globalThis.CompassTaskExtras = (() => {
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // A real date only (no 31 February).
  const ymd = (y, m, d) => {
    const out = new Date(y, m, d);
    return out.getFullYear() === y && out.getMonth() === m && out.getDate() === d ? out : null;
  };

  // A due date as a local date at midnight, or null. now gives the year when the text has none.
  //   "/Date(1792022400000+0800)/", "2026-10-20", "2026-10-20T00:00:00" (read as local time),
  //   an ISO time with a zone, "20/10/2026", "20/10/26", "Tue 20/10", "20 Oct 2026", "20 Oct".
  function parseDue(value, now = new Date()) {
    if (value == null) return null;
    const t = String(value).replace(/ /g, " ").trim();
    if (!t) return null;
    let m = /\/Date\((-?\d+)/.exec(t);
    if (m) return midnight(new Date(Number(m[1])));
    m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?)?$/.exec(t);
    if (m) return ymd(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { const d = new Date(t); return isNaN(d) ? null : midnight(d); }
    m = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?:\s|$)/.exec(t);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
      return ymd(y, Number(m[2]) - 1, Number(m[1]));
    }
    m = /(?:^|\s)(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?(?:\s|$)/.exec(t);
    if (m && m[2].toLowerCase() in MONTHS) return ymd(m[3] ? Number(m[3]) : now.getFullYear(), MONTHS[m[2].toLowerCase()], Number(m[1]));
    return null;
  }

  const SOON_SCHOOL_DAYS = 2;
  // "overdue" (before today), "today", "soon" (in the next 2 school days, Monday to Friday) or null.
  function dueLevel(due, now = new Date()) {
    if (!due) return null;
    const today = midnight(now), day = midnight(due);
    if (day < today) return "overdue";
    if (day.getTime() === today.getTime()) return "today";
    let schoolDays = 0;
    for (let d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1); schoolDays < SOON_SCHOOL_DAYS || d <= day;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      if (d.getDay() >= 1 && d.getDay() <= 5) schoolDays++;
      if (d.getTime() === day.getTime()) return schoolDays <= SOON_SCHOOL_DAYS ? "soon" : null;
      if (schoolDays > SOON_SCHOOL_DAYS) return null;
    }
    return null;
  }

  // The Due Date cell's hover text: "Overdue by 2 days", "Due today", "Due Mon 20 Oct".
  function dueText(due, now = new Date()) {
    if (!due) return "";
    const days = Math.round((midnight(now) - midnight(due)) / 86400000);
    if (days > 0) return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
    if (days === 0) return "Due today";
    return "Due " + due.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  }

  return { parseDue, dueLevel, dueText };
})();

(() => {
  if (typeof location === "undefined" || typeof document === "undefined") return; // loaded by the tests
  const path = location.pathname.toLowerCase();
  if (!(path === "/" || path === "/default.aspx") || window.__compassTaskExtras) return;
  window.__compassTaskExtras = true;
  const { parseDue, dueLevel, dueText } = globalThis.CompassTaskExtras;

  const SEP = /\s+\|\s+/;
  const CHECKS_KEY = "taskSubChecks"; // { "<task id>": ["<ticked sub-task text>", …] }
  const ROWS = ".home-mytasks tr.x-grid-data-row[data-recordid]";
  const NAME_CELL = "td.x-grid-cell:not(.x-grid-cell-checkcolumn):not(.x-action-col-cell) > .x-grid-cell-inner";
  const LEVELS = ["overdue", "today", "soon"];
  const RELOAD_SECONDS = 5; // at most one task-list request in this time

  const style = document.createElement("style");
  style.textContent = `
    .ext-subtasks { list-style: none; margin: 0 0 4px; padding: 0 6px 0 14px; font-size: 12px; line-height: 1.4; cursor: default; }
    .ext-subtasks li { display: flex; align-items: flex-start; gap: 6px; padding: 1px 0; }
    .ext-subtasks input { margin: 2px 0 0; flex: none; cursor: pointer; }
    .ext-subtasks label { cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
    .ext-subtasks li.done label { text-decoration: line-through; color: #5f6368; }
    /* Due dates: soft tints, so the task text stays easy to read. ExtJS colours rows too. */
    tr.ext-due-overdue > td { background: #FDECEA !important; }
    tr.ext-due-today > td { background: #FFF1E0 !important; }
    tr.ext-due-soon > td { background: #FFF8D6 !important; }
    tr.ext-due-overdue.x-grid-row-over > td, tr.ext-due-overdue.x-grid-row-selected > td { background: #F9D9D5 !important; }
    tr.ext-due-today.x-grid-row-over > td, tr.ext-due-today.x-grid-row-selected > td { background: #FDE3C4 !important; }
    tr.ext-due-soon.x-grid-row-over > td, tr.ext-due-soon.x-grid-row-selected > td { background: #FCEFB4 !important; }
  `;
  document.head.append(style);

  const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
  let checks = {};
  const saveChecks = () => { try { chrome.storage.local.set({ [CHECKS_KEY]: checks }); } catch (_) {} };

  // --- the task list from Compass: id -> { due, done } ----------------------------------
  let tasks = new Map();
  let loadedAt = 0, loading = null, lastSignature = "", lastHeight = 0;
  function loadTasks() {
    loading ||= fetch("/Services/TaskService.svc/GetTaskItems?sessionstate=readonly", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ page: 1, start: 0, limit: 100 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!Array.isArray(json?.d)) return;
        tasks = new Map(json.d.map((t) => [String(t.id), { due: t.dueDate, done: t.status === true }]));
      })
      .catch(() => {}) // the Due Date cells still work
      .finally(() => { loadedAt = Date.now(); loading = null; });
    return loading;
  }

  // --- sub-tasks -----------------------------------------------------------------------
  function subList(id, subs) {
    const ul = document.createElement("ul");
    ul.className = "ext-subtasks";
    const ticked = new Set(checks[id] || []);
    subs.forEach((text, i) => {
      const li = document.createElement("li");
      const cbId = `ext-sub-${id}-${i}`;
      const cb = Object.assign(document.createElement("input"), { type: "checkbox", id: cbId, checked: ticked.has(text) });
      const label = Object.assign(document.createElement("label"), { htmlFor: cbId, textContent: text });
      li.classList.toggle("done", cb.checked);
      cb.onchange = () => {
        const now = new Set(checks[id] || []);
        if (cb.checked) now.add(text); else now.delete(text);
        checks = { ...checks, [id]: [...now] };
        li.classList.toggle("done", cb.checked);
        ul.dataset.key = checks[id].join("\u0001"); // up to date, so the list isn't drawn again
        saveChecks();
      };
      li.append(cb, label);
      ul.append(li);
    });
    // Keep every click inside the list away from the grid (it would open the row editor).
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown"]) {
      ul.addEventListener(type, (e) => e.stopPropagation());
    }
    return ul;
  }

  function applySubtasks(id, inner) {
    const text = norm(inner.textContent);
    const done = inner.dataset.extId === id && inner.dataset.extMain === text; // ExtJS hasn't drawn the row again
    if (done) {
      const ul = inner.nextElementSibling;
      if (!inner.dataset.extSubs) return;
      if (ul?.classList.contains("ext-subtasks") && ul.dataset.key === (checks[id] || []).join("\u0001")) return;
    }
    const full = done ? inner.dataset.extFull : text;
    const [main, ...rest] = full.split(SEP);
    const subs = rest.filter(Boolean);
    inner.title = subs.length ? `${main}\n${subs.map((s) => `• ${s}`).join("\n")}` : full;
    inner.dataset.extId = id;
    inner.dataset.extFull = full;
    inner.dataset.extMain = subs.length ? main : full;
    inner.dataset.extSubs = subs.length ? "1" : "";
    if (inner.nextElementSibling?.classList.contains("ext-subtasks")) inner.nextElementSibling.remove();
    if (!subs.length) return;
    if (text !== main) inner.textContent = main;
    const ul = subList(id, subs);
    ul.dataset.key = (checks[id] || []).join("\u0001");
    inner.after(ul);
  }

  // --- due dates -----------------------------------------------------------------------
  // The Due Date cell: the first cell after the name cell that isn't the delete button.
  function dueCellOf(inner) {
    for (let td = inner.closest("td")?.nextElementSibling; td; td = td.nextElementSibling) {
      if (!td.classList.contains("x-action-col-cell")) return td;
    }
    return null;
  }

  function applyDue(row, id, inner, now) {
    const cell = dueCellOf(inner);
    const task = tasks.get(id);
    const done = !!row.querySelector("img.x-grid-checkcolumn-checked, .x-grid-checkcolumn-checked") || task?.done;
    const due = parseDue(task?.due, now) || parseDue(cell?.textContent, now);
    const level = done ? null : dueLevel(due, now);
    for (const l of LEVELS) row.classList.toggle(`ext-due-${l}`, l === level);
    const inside = cell?.querySelector(".x-grid-cell-inner") || cell;
    if (inside) inside.title = !done && due ? dueText(due, now) : "";
  }

  function apply() {
    const now = new Date();
    const rows = [...document.querySelectorAll(ROWS)];
    // Load the task list again when the grid's tasks change (Compass loads it again after each
    // add, edit or tick), at most once every RELOAD_SECONDS.
    const signature = rows.map((r) => `${r.dataset.recordid}:${norm(r.textContent)}`).join("|");
    if (rows.length && signature !== lastSignature && !loading) {
      if (Date.now() - loadedAt >= RELOAD_SECONDS * 1000) {
        lastSignature = signature;
        loadTasks().then(apply);
      } else if (!reloadTimer) {
        // Its own timer, so the rows are still done again within 100ms of each redraw.
        reloadTimer = setTimeout(() => { reloadTimer = 0; apply(); }, RELOAD_SECONDS * 1000);
      }
    }
    for (const row of rows) {
      const id = row.dataset.recordid;
      const inner = row.querySelector(NAME_CELL);
      if (!inner) continue;
      applySubtasks(id, inner);
      applyDue(row, id, inner, now);
    }
    for (const row of rows) rowSizes?.observe(row);
    checkHeight(rows);
  }

  // Only when the rows' height changes, so the new layout (which can draw rows again) can't loop.
  // The ResizeObserver catches rows that grow later, e.g. when a sub-task wraps onto a new line.
  function checkHeight(rows = [...document.querySelectorAll(ROWS)]) {
    const height = rows.reduce((sum, r) => sum + r.offsetHeight, 0);
    if (rows.length && height !== lastHeight) {
      lastHeight = height;
      document.dispatchEvent(new CustomEvent("ext-task-relayout"));
    }
  }
  const rowSizes = typeof ResizeObserver === "function" ? new ResizeObserver(() => checkHeight()) : null;

  let pending = 0, reloadTimer = 0;
  function schedule(ms = 100) { if (!pending) pending = setTimeout(() => { pending = 0; apply(); }, ms); }
  const observer = new MutationObserver((list) => {
    // Ignore the changes this script makes inside its own lists.
    if (list.every((m) => m.target.nodeType === 1 && m.target.closest?.(".ext-subtasks"))) return;
    schedule();
  });

  try {
    chrome.storage.local.get([CHECKS_KEY], (r) => {
      checks = r?.[CHECKS_KEY] && typeof r[CHECKS_KEY] === "object" ? r[CHECKS_KEY] : {};
      apply();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      // Once a minute, so a task turns orange or red at midnight without a reload.
      setInterval(() => { if (document.visibilityState === "visible") apply(); }, 60 * 1000);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(CHECKS_KEY in changes)) return;
      checks = changes[CHECKS_KEY].newValue || {};
      schedule();
    });
  } catch (_) {}
})();
