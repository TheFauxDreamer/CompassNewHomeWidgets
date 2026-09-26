// Adds the attendance chart as a card on the Compass homepage, and as a movable
// card in "Edit Home Page Layout".
//
// Compass saves its own widget layout on its server, so our card can't join that
// list. Instead, dragging our card in the layout editor saves its position in the
// browser (per screen size, because Compass shows 1-4 columns depending on width).
// With no saved position it goes at the top of the leftmost column.
//
// The layout editor works like Compass's own: the delete button removes a card, and
// removed cards can be added again from Compass's "Add Widget" menu. Moves and removals
// are kept only when Compass's Save (or Save and Close) button is clicked.
(() => {
  const path = location.pathname.toLowerCase();
  const isHome = path === "/" || path === "/default.aspx";
  if (!isHome || window.__compassAttendanceWidget) return;
  window.__compassAttendanceWidget = true;

  const EDITING = new URLSearchParams(location.search).get("editing") === "true";
  const LAYOUT_SELECTOR = '[id="single-spa-application:HomePageLayout"]';
  // Our cards, in placement order. Each remembers its own position per screen size
  // as { "<columnCount>": { column, index } }. With no saved position a card goes
  // below `after` (if that card is on the page) or at the top of the leftmost column.
  const CARDS = [
    {
      id: "compass-attendance-widget",
      title: "Attendance (extension)",
      posKey: "attendanceWidgetPosition",
      after: null,
      mount: (host, preview) => globalThis.CompassAttendanceUI.mountSnapshot(host, { mode: "widget", preview }),
    },
    {
      id: "compass-unmarked-widget",
      title: "Unmarked rolls (extension)",
      posKey: "unmarkedWidgetPosition",
      after: "compass-attendance-widget",
      mount: (host, preview) => globalThis.CompassUnmarkedUI.mount(host, { preview }),
    },
    {
      id: "compass-movements-widget",
      title: "Arrivals & departures (extension)",
      posKey: "movementsWidgetPosition",
      after: "compass-unmarked-widget",
      mount: (host, preview) => globalThis.CompassMovementsUI.mount(host, { preview }),
    },
    {
      id: "compass-chronicle-widget",
      title: "Recent Chronicle (extension)",
      posKey: "chronicleWidgetPosition",
      after: "compass-movements-widget",
      mount: (host, preview) => globalThis.CompassChronicleUI.mount(host, { preview }),
    },
    {
      id: "compass-relief-widget",
      title: "Relief (extension)",
      posKey: "reliefWidgetPosition",
      after: "compass-chronicle-widget",
      mount: (host, preview) => globalThis.CompassReliefUI.mount(host, { preview }),
    },
    {
      id: "compass-weather-widget",
      title: "Weather (extension)",
      posKey: "weatherWidgetPosition",
      after: "compass-relief-widget",
      mount: (host, preview) => globalThis.CompassWeatherUI.mount(host, { preview }),
    },
  ].map((c) => ({ ...c, el: null, api: null, positions: {} }));

  const HIDDEN_KEY = "hiddenWidgets"; // ids of cards removed from the homepage
  let hidden = new Set();
  let ready = false; // don't draw anything until we know what's hidden

  let dragging = false;
  const isOurs = (el) => el?.dataset?.extCard === "1";

  // Material "delete", in case the editor has no Compass delete button to copy.
  const TRASH = '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/>';

  // --- saved positions and removed cards -----------------------------------------
  // In the editor, changes wait in memory until Save. Close (or leaving the page)
  // drops them, as it does for Compass's widgets.
  let dirty = false;
  try {
    chrome.storage.local.get([...CARDS.map((c) => c.posKey), HIDDEN_KEY], (r) => {
      for (const c of CARDS) c.positions = r?.[c.posKey] || {};
      hidden = new Set(r?.[HIDDEN_KEY] || []);
      ready = true;
      schedule();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || dirty) return; // keep unsaved editor changes
      for (const c of CARDS) if (c.posKey in changes) c.positions = changes[c.posKey].newValue || {};
      if (HIDDEN_KEY in changes) hidden = new Set(changes[HIDDEN_KEY].newValue || []);
      schedule();
    });
  } catch (_) { ready = true; }

  // Records where every card in the editor is now, not only the card that was dragged.
  // Other cards' old indexes don't count the dragged card, so they would disagree.
  function stagePositions(columns) {
    for (const c of CARDS) {
      const column = columns.indexOf(c.el?.parentElement);
      if (column < 0) continue;
      const index = [...columns[column].children].indexOf(c.el);
      c.positions = { ...c.positions, [columns.length]: { column, index } };
    }
    // The new indexes don't count removed cards, so their old places no longer apply.
    for (const c of CARDS) {
      if (!hidden.has(c.id) || !c.positions[columns.length]) continue;
      const { [columns.length]: _, ...rest } = c.positions;
      c.positions = rest;
    }
    dirty = true;
  }

  // Removes a card from the editor, or adds it back.
  function setHidden(def, hide) {
    if (hide) {
      hidden.add(def.id);
      // Close the gap it leaves (for every screen size), so the cards below it keep
      // their places. Then forget its place: added back, it goes to its first place.
      for (const [n, p] of Object.entries(def.positions)) {
        for (const c of CARDS) {
          const q = c.positions[n];
          if (c === def || !q || q.column !== p.column || q.index <= p.index) continue;
          c.positions = { ...c.positions, [n]: { ...q, index: q.index - 1 } };
        }
      }
      def.positions = {};
    } else {
      hidden.delete(def.id);
    }
    dirty = true;
    schedule();
  }

  // Writes the editor changes to the browser. Runs when Compass's Save button is clicked.
  function commit() {
    if (!dirty) return;
    const changes = { [HIDDEN_KEY]: [...hidden] };
    for (const c of CARDS) changes[c.posKey] = c.positions;
    try { chrome.storage.local.set(changes); } catch (_) {}
    dirty = false;
  }

  // Compass's toolbar buttons, found by their icons and text: Save and Save and Close
  // keep our changes; Add Widget opens the menu that our removed cards join.
  let addMenuAt = 0;
  if (EDITING) {
    document.addEventListener("click", (e) => {
      const button = e.target.closest?.("button");
      if (!button || isOurs(button.closest("[data-ext-card]"))) return;
      if (button.querySelector('[data-testid="SaveIcon"]')) commit();
      else if (/add widget/i.test(button.textContent)) addMenuAt = Date.now();
    }, true);
  }

  // Takes a card off the homepage and stops it refreshing in the background.
  function removeCard(def) {
    if (!def.el) return;
    def.api?.stop?.();
    def.el.remove();
    def.el = def.api = null;
  }

  // --- finding columns on the normal homepage ----------------------------------
  function topLevelPapers(layout) {
    return [...layout.querySelectorAll(".MuiPaper-root")].filter(
      (p) => !p.parentElement.closest(".MuiPaper-root") && !p.closest('[data-ext-card="1"]')
    );
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let anc = nodes[0].parentElement;
    while (anc && !nodes.every((n) => anc.contains(n))) anc = anc.parentElement;
    return anc;
  }

  function findViewColumns(layout) {
    const papers = topLevelPapers(layout);
    if (papers.length < 2) return null;
    const lca = commonAncestor(papers);
    if (!lca || !layout.contains(lca)) return null;
    const kids = [...lca.children].filter((k) => !isOurs(k));
    const kidsAreWrappers = kids.some((k) => [...k.children].some((c) => papers.includes(c)));
    // A column with none of Compass's widgets (for example, one that holds only our
    // cards) still counts, so the column count matches the layout editor's. Such a
    // column has the same tag and classes as the columns that have widgets.
    const sample = kidsAreWrappers ? lca : kids.find((k) => papers.some((p) => k.contains(p)));
    if (!sample) return null;
    const row = sample.parentElement;
    const columns = row && layout.contains(row)
      ? [...row.children].filter((k) => !isOurs(k) && (
        k === sample || papers.some((p) => k.contains(p)) ||
        (sample.className && k.tagName === sample.tagName && k.className === sample.className)))
      : [sample];
    const samplePaper = papers.find((p) => columns.includes(p.parentElement?.parentElement));
    return { columns, sampleWrapper: samplePaper?.parentElement, samplePaper };
  }

  // --- finding columns in the layout editor -------------------------------------
  // Editor widgets are <div id="sortable-NNN"> inside a bordered column box.
  function findEditorColumns(layout) {
    const first = layout.querySelector('[id^="sortable-"]');
    if (!first) return null;
    const column = first.parentElement;
    const level = column.parentElement;
    const columns = level.children.length === 1 && level.parentElement
      ? [...level.parentElement.children].map((c) => c.firstElementChild).filter(Boolean) // each column is wrapped
      : [...level.children];
    return { columns, sample: first };
  }

  const findColumns = (layout) => (EDITING ? findEditorColumns(layout) : findViewColumns(layout));
  const itemsOf = (column, el) => [...column.children].filter((c) => c !== el);

  // --- building the card ----------------------------------------------------------
  function buildViewCard(def, sampleWrapper, samplePaper) {
    const wrapper = document.createElement("div");
    wrapper.id = def.id;
    wrapper.dataset.extCard = "1";
    wrapper.className = sampleWrapper?.className || "";
    const paper = document.createElement("div");
    paper.className = samplePaper?.className || "";
    const host = document.createElement("div");
    host.dataset.extHost = "1";
    // Same sizing Compass gives its own widget content: its card boxes are flexboxes,
    // so without this our content shrinks to fit and sits centred with wide margins.
    host.style.cssText = "display:block;width:100%;min-width:0;max-width:100%;flex:1 1 auto;box-sizing:border-box;";
    paper.appendChild(host);
    wrapper.appendChild(paper);
    def.api = def.mount(host, false);
    return wrapper;
  }

  // Copies the structure/classes of a real editor widget so it looks the same.
  function buildEditorCard(def, sample, layout) {
    const samplePaper = sample.firstElementChild;              // Paper#widget-NNN
    const sampleInner = samplePaper?.firstElementChild;        // header + body box
    const sampleHead = sampleInner?.firstElementChild;         // title row
    const sampleBody = sampleInner?.children[1];

    const wrap = document.createElement("div");
    wrap.id = def.id;
    wrap.dataset.extCard = "1";
    wrap.setAttribute("style", sample.getAttribute("style") || "display:flex;width:100%;");
    const paper = document.createElement("div");
    paper.className = samplePaper?.className || "";
    paper.style.cssText = "width:100%;min-width:0;max-width:100%;height:fit-content;";
    const inner = document.createElement("div");
    inner.className = sampleInner?.className || "";

    const head = document.createElement("div");
    head.className = sampleHead?.className || "";
    const title = sampleHead?.querySelector("p")?.cloneNode(false) || document.createElement("p");
    title.textContent = def.title;
    const btns = document.createElement("div");
    btns.className = sampleHead?.lastElementChild?.className || "";

    let handle = sample.querySelector('[aria-roledescription="sortable"]')?.cloneNode(true);
    if (!handle) { handle = document.createElement("button"); handle.textContent = "✥"; }
    ["aria-describedby", "aria-roledescription", "aria-disabled", "role"].forEach((a) => handle.removeAttribute(a));
    handle.type = "button";
    handle.title = `Drag to move ${def.title.replace(" (extension)", "").toLowerCase()}`;
    handle.style.cursor = "grab";
    handle.style.touchAction = "none";

    // Delete button: a copy of Compass's own, or the drag handle's style with a bin icon.
    let remove = layout.querySelector('[id^="sortable-"] [data-testid="DeleteIcon"]')?.closest("button")?.cloneNode(true);
    if (!remove) {
      remove = handle.cloneNode(false);
      const svgClass = handle.querySelector("svg")?.getAttribute("class") || "";
      remove.innerHTML = `<svg class="${svgClass}" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${TRASH}</svg>`;
      remove.style.touchAction = "";
    }
    remove.type = "button";
    remove.style.cursor = "pointer";
    remove.title = `Remove ${def.title.replace(" (extension)", "").toLowerCase()} from the homepage`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a drag
    remove.addEventListener("keydown", (e) => e.stopPropagation());
    remove.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setHidden(def, true); };

    // Same order as Compass: drag handle, then delete.
    btns.append(handle, remove);
    head.append(title, btns);

    const bodyBox = document.createElement("div");
    bodyBox.className = sampleBody?.className || "";
    const innerPaper = document.createElement("div");
    const refPaper = layout.querySelector('[id^="widget-render-"]')?.parentElement;
    innerPaper.className = refPaper?.className || "";
    if (!refPaper) innerPaper.style.cssText = "background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.2);";
    const host = document.createElement("div");
    host.dataset.extHost = "1";
    // Same sizing Compass gives its own widget content: its card boxes are flexboxes,
    // so without this our content shrinks to fit and sits centred with wide margins.
    host.style.cssText = "display:block;width:100%;min-width:0;max-width:100%;flex:1 1 auto;box-sizing:border-box;";
    innerPaper.appendChild(host);
    bodyBox.appendChild(innerPaper);

    inner.append(head, bodyBox);
    paper.appendChild(inner);
    wrap.appendChild(paper);
    def.mount(host, true);

    enableDrag(def, handle, wrap);
    return wrap;
  }

  // --- dragging (editor only) -----------------------------------------------------
  function enableDrag(def, handle, wrap) {
    const moveTo = (x, y) => {
      const layout = document.querySelector(LAYOUT_SELECTOR);
      const found = layout && findEditorColumns(layout);
      if (!found) return;
      // Column under the pointer, otherwise the nearest one.
      let column = found.columns.find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x <= r.right; });
      if (!column) {
        column = found.columns.reduce((best, c) => {
          const r = c.getBoundingClientRect();
          const d = Math.abs(x - (r.left + r.right) / 2);
          return !best || d < best.d ? { c, d } : best;
        }, null)?.c;
      }
      if (!column) return;
      const before = itemsOf(column, wrap).find((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
      if (wrap.parentElement !== column || wrap.nextElementSibling !== before) column.insertBefore(wrap, before);

      // Scroll the page when dragging near the top or bottom edge.
      if (y < 80) window.scrollBy(0, -20);
      else if (y > window.innerHeight - 80) window.scrollBy(0, 20);
    };

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      wrap.style.opacity = "";
      handle.style.cursor = "grab";
      const layout = document.querySelector(LAYOUT_SELECTOR);
      const found = layout && findEditorColumns(layout);
      if (!found) return;
      if (!found.columns.includes(wrap.parentElement)) return;
      stagePositions(found.columns);
    };

    // Listen on the window: moving the card in the page drops pointer capture.
    const onMove = (e) => { if (dragging) moveTo(e.clientX, e.clientY); };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      finish();
    };
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation(); // keep Compass's own drag-and-drop out of it
      dragging = true;
      wrap.style.opacity = "0.6";
      handle.style.cursor = "grabbing";
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    });
    handle.addEventListener("keydown", (e) => e.stopPropagation());
  }

  // --- adding removed cards back (editor only) ---------------------------------------
  // Compass's Add Widget button opens a menu of its widgets (a MUI menu, drawn at the
  // end of the page). Our removed cards join the end of that menu. Each item copies
  // the look of Compass's last item.
  // Compass puts the menu items straight in the popover's paper, with no list around
  // them, so the menu is found by its items. Other MUI menus can stay in the page
  // while closed (hidden), so this takes the newest one that can be seen.
  function openMenu() {
    const items = [...document.querySelectorAll('.MuiPopover-root [role="menuitem"], .MuiPopper-root [role="menuitem"]')]
      .filter((i) => !i.closest('[aria-hidden="true"]') &&
        getComputedStyle(i.closest(".MuiPopover-root, .MuiPopper-root")).visibility !== "hidden");
    return items.pop()?.parentElement || null;
  }

  function addToMenu() {
    const menu = openMenu();
    if (!menu || menu.dataset.extAdded) return;
    menu.dataset.extAdded = "1";
    const sample = [...menu.querySelectorAll('[role="menuitem"], [role="option"], li')].pop();
    for (const def of CARDS.filter((c) => hidden.has(c.id))) {
      const item = sample ? sample.cloneNode(false) : document.createElement("li");
      item.removeAttribute("id");
      item.removeAttribute("aria-disabled");
      item.classList.remove("Mui-disabled", "Mui-selected", "Mui-focusVisible");
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
      item.textContent = def.title;
      item.style.cursor = "pointer";
      item.onclick = (e) => {
        e.stopPropagation();
        setHidden(def, false);
        // Close the menu the way a click outside it does.
        const backdrop = menu.closest(".MuiPopover-root, .MuiModal-root")?.querySelector(".MuiBackdrop-root");
        if (backdrop) backdrop.click();
        else menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      };
      menu.append(item);
    }
  }

  // --- placing the cards ---------------------------------------------------------
  // Works out where every card goes, then moves only the cards that are in the wrong
  // place. All cards are placed together. If each card was placed separately, two
  // cards with conflicting saved positions would swap on every redraw, and that stops
  // clicks from reaching the buttons inside them.
  function arrange(defs, columns) {
    const n = columns.length;
    const lists = columns.map((c) => [...c.children].filter((k) => !isOurs(k)));

    // Saved positions first, lowest index first, so each index counts the cards before it.
    const saved = defs.filter((d) => d.positions[n]).sort((a, b) => a.positions[n].index - b.positions[n].index);
    // Cards removed before a removal closed its gap may still have a place that other
    // cards' indexes count, so leave those out.
    for (const d of saved) {
      const { column, index } = d.positions[n];
      const gone = CARDS.filter((c) => hidden.has(c.id) && c.positions[n]?.column === column && c.positions[n].index < index).length;
      const list = lists[Math.min(column, n - 1)];
      list.splice(Math.min(index - gone, list.length), 0, d.el);
    }
    // Then the others: below `after` (skipping removed cards), or at the top of the
    // leftmost column (below the welcome banner if it's first).
    for (const d of defs) {
      if (d.positions[n]) continue;
      let after = d.after;
      while (after && hidden.has(after)) after = CARDS.find((c) => c.id === after)?.after;
      const anchor = after && defs.find((a) => a.id === after)?.el;
      const list = anchor && lists.find((l) => l.includes(anchor));
      if (list) list.splice(list.indexOf(anchor) + 1, 0, d.el);
      else lists[0].splice(lists[0][0]?.querySelector(".home-schoolName") ? 1 : 0, 0, d.el);
    }

    // Last card first, so each card's next sibling is already in place.
    lists.forEach((list, i) => {
      for (let j = list.length - 1; j >= 0; j--) {
        const el = list[j];
        if (!isOurs(el)) continue;
        const before = list[j + 1] || null;
        if (el.parentElement !== columns[i] || el.nextElementSibling !== before) columns[i].insertBefore(el, before);
      }
    });
  }

  // If Compass's classes didn't give us a card look, draw our own.
  function styleCard(el) {
    if (el.dataset.checked) return;
    el.dataset.checked = "1";
    const paper = el.firstElementChild;
    const cardLook = "background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.2);";
    if (getComputedStyle(paper).backgroundColor === "rgba(0, 0, 0, 0)") paper.style.cssText += cardLook;

    // Don't double up on padding: if Compass's card already pads its content,
    // our content sits flush with it (like the other widgets).
    const host = el.querySelector('[data-ext-host="1"]');
    const box = host?.parentElement;
    if (host && box) {
      const cs = getComputedStyle(box);
      if (parseFloat(cs.paddingLeft) >= 8) host.style.setProperty("--ext-pad-x", "0px");
      if (parseFloat(cs.paddingTop) >= 8) host.style.setProperty("--ext-pad-y", "0px");
    }
    if (EDITING) {
      const head = paper.firstElementChild?.firstElementChild;
      if (head && getComputedStyle(head).display !== "flex") {
        head.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;";
      }
    }
  }

  // Our saved places are numbers that count Compass's widgets. When Compass's widgets
  // are removed, added or moved in the editor, the numbers would point at the wrong
  // place, so record where our cards are now, before arrange() moves them by the old
  // numbers. Only when the column count is the same and all our cards are in the columns.
  let compassLayout = "";
  function noteCompassChanges(columns, shown) {
    const now = columns.length + ":" + columns.map((c) => [...c.children].filter((k) => !isOurs(k)).map((k) => k.id).join(",")).join("|");
    const before = compassLayout;
    compassLayout = now;
    if (!before || before === now || before.split(":")[0] !== String(columns.length)) return;
    if (shown.every((d) => !d.el || columns.includes(d.el.parentElement))) stagePositions(columns);
  }

  function place() {
    if (dragging || !ready) return;
    for (const def of CARDS) if (hidden.has(def.id)) removeCard(def);
    if (EDITING && Date.now() - addMenuAt < 3000) addToMenu();
    const layout = document.querySelector(LAYOUT_SELECTOR);
    if (!layout) return;
    const found = findColumns(layout);
    if (!found) return;
    const shown = CARDS.filter((def) => !hidden.has(def.id));
    if (EDITING) noteCompassChanges(found.columns, shown);
    for (const def of shown) {
      if (!def.el) {
        def.el = EDITING
          ? buildEditorCard(def, found.sample, layout)
          : buildViewCard(def, found.sampleWrapper, found.samplePaper);
      }
    }
    arrange(shown, found.columns);
    for (const def of shown) styleCard(def.el);
  }

  // The homepage is rendered by React after load and redrawn on resize and while
  // editing, so keep watching and put the card back where it belongs.
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { place(); } catch (e) { console.warn("[Attendance widget]", e); }
    });
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  schedule();
})();
