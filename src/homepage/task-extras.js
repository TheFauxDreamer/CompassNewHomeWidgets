// Adds two things to Compass's "My Tasks" widget on the homepage:
//   - Hover: a task name that is cut off shows in full when you point at it.
//   - Sub-tasks: a task named "Seventh Heaven newsletter | print | laminate" shows as
//     "Seventh Heaven newsletter" with two sub-tasks below it. Each sub-task has its own tick box.
//     A tick is kept in this browser only, and it never ticks, opens or changes the main task.
//     " | " separates the parts because task names often use " - " as normal punctuation.
//
// The widget is an ExtJS grid (.home-mytasks). Each task is a row with the task ID in
// data-recordid; the name is in the first cell that isn't the tick box or the delete button.
// ExtJS draws a row again when its task changes, so a MutationObserver applies the changes
// again. Compass keeps the full name, so its row editor still shows the " | " parts.
(() => {
  const path = location.pathname.toLowerCase();
  if (!(path === "/" || path === "/default.aspx") || window.__compassTaskExtras) return;
  window.__compassTaskExtras = true;

  const SEP = /\s+\|\s+/;
  const CHECKS_KEY = "taskSubChecks"; // { "<task id>": ["<ticked sub-task text>", …] }
  const ROWS = ".home-mytasks tr.x-grid-data-row[data-recordid]";
  const NAME_CELL = "td.x-grid-cell:not(.x-grid-cell-checkcolumn):not(.x-action-col-cell) > .x-grid-cell-inner";

  const style = document.createElement("style");
  style.textContent = `
    .ext-subtasks { list-style: none; margin: 0 0 4px; padding: 0 6px 0 14px; font-size: 12px; line-height: 1.4; cursor: default; }
    .ext-subtasks li { display: flex; align-items: flex-start; gap: 6px; padding: 1px 0; }
    .ext-subtasks input { margin: 2px 0 0; flex: none; cursor: pointer; }
    .ext-subtasks label { cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
    .ext-subtasks li.done label { text-decoration: line-through; color: #5f6368; }
  `;
  document.head.append(style);

  const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
  let checks = {};
  const saveChecks = () => { try { chrome.storage.local.set({ [CHECKS_KEY]: checks }); } catch (_) {} };

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

  function apply() {
    for (const row of document.querySelectorAll(ROWS)) {
      const id = row.dataset.recordid;
      const inner = row.querySelector(NAME_CELL);
      if (!inner) continue;
      const text = norm(inner.textContent);
      const done = inner.dataset.extId === id && inner.dataset.extMain === text; // ExtJS hasn't drawn the row again
      if (done) {
        const ul = inner.nextElementSibling;
        if (!inner.dataset.extSubs) continue;
        if (ul?.classList.contains("ext-subtasks") && ul.dataset.key === (checks[id] || []).join("\u0001")) continue;
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
      if (!subs.length) continue;
      if (text !== main) inner.textContent = main;
      const ul = subList(id, subs);
      ul.dataset.key = (checks[id] || []).join("\u0001");
      inner.after(ul);
    }
  }

  let pending = 0;
  const schedule = () => { if (!pending) pending = setTimeout(() => { pending = 0; apply(); }, 100); };
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
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(CHECKS_KEY in changes)) return;
      checks = changes[CHECKS_KEY].newValue || {};
      schedule();
    });
  } catch (_) {}
})();
