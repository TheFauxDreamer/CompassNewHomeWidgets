// Lets each of Compass's Countdown homepage widgets have its own colour. Pointing at a
// countdown shows a small colour button at its top right. The button opens a list of
// colours. The colour is kept in the browser, by the countdown's title, so it follows
// the countdown when it moves.
//
// Colours are drawn with CSS (a variable on the card), so React's own markup is left
// untouched. In the layout editor the colours show, but the button doesn't.
(() => {
  const path = location.pathname.toLowerCase();
  if (!(path === "/" || path === "/default.aspx") || window.__compassCountdownColours) return;
  window.__compassCountdownColours = true;

  const EDITING = new URLSearchParams(location.search).get("editing") === "true";
  const KEY = "countdownColours"; // { "<countdown title>": "#rrggbb" }
  // Distinct from each other, and dark enough to show on a white card.
  const COLOURS = [
    ["Blue", "#1565C0"], ["Teal", "#00897B"], ["Green", "#2E7D32"], ["Orange", "#EF6C00"],
    ["Red", "#C62828"], ["Pink", "#E91E63"], ["Purple", "#6A1B9A"], ["Grey", "#546E7A"],
  ];
  let colours = {};

  // --- styles on the page: the bar colour, and where the button sits ----------------
  const style = document.createElement("style");
  style.textContent = `
    [data-ext-countdown] { position: relative; }
    [data-ext-countdown="custom"] .MuiLinearProgress-root {
      background-color: color-mix(in srgb, var(--ext-cd) 25%, white) !important; }
    [data-ext-countdown="custom"] .MuiLinearProgress-bar { background-color: var(--ext-cd) !important; }
    [data-ext-countdown] > .ext-cd-host { position: absolute; top: 6px; right: 6px; z-index: 2;
      opacity: 0; transition: opacity .15s; }
    [data-ext-countdown]:hover > .ext-cd-host, .ext-cd-host:focus-within, .ext-cd-host[data-open] { opacity: 1; }
    @media (hover: none) { [data-ext-countdown] > .ext-cd-host { opacity: 1; } }`;
  document.documentElement.appendChild(style);

  // Material "check" icon, next to the countdown's colour in the list.
  const TICK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

  // Shown in the button while a countdown has Compass's own colour.
  const RAINBOW = "conic-gradient(#C62828, #EF6C00, #2E7D32, #00897B, #1565C0, #6A1B9A, #C62828)";

  const BUTTON_CSS = `
    :host { all: initial; }
    button { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,.9);
      box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    button:hover { background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
    button:focus-visible { outline: 2px solid #0E6CD9; outline-offset: 2px; }
    .sw { width: 16px; height: 16px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }`;

  const MENU_CSS = `
    :host { all: initial; }
    .menu { position: fixed; z-index: 2147483000; min-width: 150px; padding: 4px; box-sizing: border-box;
      background: #fff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.2);
      font: 13px/1.4 Cabin, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; color: #203249; }
    .menu[hidden] { display: none; }
    .item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0;
      border-radius: 6px; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .item:hover, .item:focus-visible { background: #f1f3f4; outline: none; }
    .sw { flex: none; width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
    .name { flex: 1; }
    .tick { width: 16px; height: 16px; color: #0E6CD9; }`;

  // --- finding the countdowns --------------------------------------------------------
  // A countdown is a card with a progress bar and a big number ("48 teaching days!").
  function findCountdowns() {
    const papers = [...document.querySelectorAll('.MuiLinearProgress-determinate[role="progressbar"]')]
      .map((bar) => bar.closest(".MuiPaper-root"))
      .filter((p) => p && !p.closest('[data-ext-card="1"]') && p.querySelector(".MuiTypography-headerLg"));
    return [...new Set(papers)];
  }

  const titleOf = (paper) => paper.querySelector(".MuiTypography-headerMd")?.textContent.trim() || "";

  // --- the colour list (one, shared by every countdown) -------------------------------
  let menuHost = null, menu = null, menuFor = null; // menuFor: { paper, button }

  function ensureMenu() {
    if (menu) return;
    menuHost = document.createElement("div");
    const root = menuHost.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${MENU_CSS}</style><div class="menu" role="menu" aria-label="Countdown colour" hidden></div>`;
    menu = root.querySelector(".menu");
    document.body.appendChild(menuHost);

    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll(".item")];
      const i = items.indexOf(root.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
      else if (e.key === "Tab") closeMenu(false);
    });
    // Close on a click anywhere else, or when the page moves under the list.
    document.addEventListener("pointerdown", (e) => {
      if (menuFor && !e.composedPath().includes(menuHost) && !e.composedPath().includes(menuFor.button)) closeMenu(false);
    }, true);
    window.addEventListener("resize", () => closeMenu(false));
    window.addEventListener("scroll", () => closeMenu(false), true);
  }

  function openMenu(paper, button) {
    ensureMenu();
    const title = titleOf(paper);
    const current = colours[title] || "";
    const options = [["Compass default", ""], ...COLOURS];
    menu.replaceChildren(...options.map(([name, hex]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "item";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(hex === current));
      item.innerHTML = `<span class="sw"></span><span class="name"></span><span class="tick">${hex === current ? TICK : ""}</span>`;
      item.querySelector(".sw").style.background = hex || RAINBOW;
      item.querySelector(".name").textContent = name;
      item.onclick = () => { setColour(title, hex); closeMenu(true); };
      return item;
    }));
    menu.hidden = false;
    menuFor = { paper, button };
    button.setAttribute("aria-expanded", "true");
    button.getRootNode().host.dataset.open = "1";

    // Below the button, right edges lined up. Above it only when it doesn't fit below
    // and there's more room above. Always inside the window.
    const r = button.getBoundingClientRect(), m = menu.getBoundingClientRect();
    const below = window.innerHeight - r.bottom, above = r.top;
    const top = below < m.height + 8 && above > below ? r.top - 4 - m.height : r.bottom + 4;
    menu.style.top = `${Math.max(4, Math.min(top, window.innerHeight - m.height - 4))}px`;
    menu.style.left = `${Math.max(4, Math.min(r.right - m.width, window.innerWidth - m.width - 4))}px`;
    (menu.querySelector('[aria-checked="true"]') || menu.firstElementChild).focus();
  }

  function closeMenu(refocus) {
    if (!menuFor) return;
    const { button } = menuFor;
    menuFor = null;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    delete button.getRootNode().host.dataset.open;
    if (refocus) button.focus();
  }

  function setColour(title, hex) {
    const next = { ...colours };
    if (hex) next[title] = hex; else delete next[title];
    colours = next;
    try { chrome.storage.local.set({ [KEY]: next }); } catch (_) {}
    update();
  }

  // --- the button on each countdown ---------------------------------------------------
  function makeButton(paper) {
    const host = document.createElement("div");
    host.className = "ext-cd-host";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${BUTTON_CSS}</style>
      <button type="button" title="Countdown colour" aria-label="Countdown colour" aria-haspopup="menu" aria-expanded="false">
        <span class="sw"></span></button>`;
    const button = root.querySelector("button");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menuFor?.button === button) closeMenu(true); else { closeMenu(false); openMenu(paper, button); }
    });
    return host;
  }

  function update() {
    for (const paper of findCountdowns()) {
      const title = titleOf(paper);
      if (!title) continue;
      const hex = colours[title];
      if (hex) { paper.style.setProperty("--ext-cd", hex); paper.dataset.extCountdown = "custom"; }
      else { paper.style.removeProperty("--ext-cd"); paper.dataset.extCountdown = "1"; }
      if (EDITING) continue;
      let host = paper.querySelector(":scope > .ext-cd-host");
      if (!host) { host = makeButton(paper); paper.append(host); }
      host.shadowRoot.querySelector(".sw").style.background = hex || RAINBOW;
    }
  }

  // --- start ---------------------------------------------------------------------
  // The homepage is rendered by React after load, and redrawn while it's open.
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try { update(); } catch (e) { console.warn("[Countdown colours]", e); }
    });
  }

  try {
    chrome.storage.local.get(KEY, (r) => {
      colours = r?.[KEY] || {};
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
      schedule();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(KEY in changes)) return;
      colours = changes[KEY].newValue || {};
      schedule();
    });
  } catch (_) {}
})();
