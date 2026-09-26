// Welcome card: shows on the homepage after a new install, while none of our widgets
// is on the homepage. It links to Compass's layout editor, where the widgets are added
// from the Add Widget menu. homepage.js decides when it shows.
globalThis.CompassWelcomeUI = (() => {
  const EDIT_URL = "/default.aspx?editing=true";

  // Material "dashboard customize" icon.
  const ADD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm15 0h-2v3h-3v2h3v3h2v-3h3v-2h-3z"/></svg>';

  const CSS_EXTRA = `
    .hello { display: flex; align-items: center; gap: 12px; margin: 2px 0 14px; }
    .wave { font-size: 28px; line-height: 1; flex: none; }
    .hello p { margin: 0; color: #545F73; }
    .cta { display: flex; width: 100%; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 16px; border-radius: 999px; font-weight: 600; font-size: 14px;
      color: #fff; background: linear-gradient(135deg, #0E6CD9, #3d8ff0);
      box-shadow: 0 2px 6px rgba(14, 108, 217, .35);
      transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
    .cta:hover { background: linear-gradient(135deg, #0E6CD9, #3d8ff0); filter: brightness(1.06);
      transform: translateY(-1px); box-shadow: 0 4px 12px rgba(14, 108, 217, .45); }
    .cta:active { transform: none; box-shadow: 0 1px 3px rgba(14, 108, 217, .35); }
    .cta:focus-visible { outline: 2px solid #0E6CD9; outline-offset: 2px; }
    .cta svg { width: 18px; height: 18px; fill: currentColor; }
  `;

  // onDismiss(): called when the close button is clicked.
  function mount(host, { onDismiss } = {}) {
    const { CSS, ICONS } = globalThis.CompassTheme;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Welcome!</h1>
          <button id="close" title="Dismiss" aria-label="Dismiss">${ICONS.close}</button>
        </header>
        <div class="hello">
          <span class="wave" aria-hidden="true">👋</span>
          <p>Add custom widgets for attendance, rolls, weather and more.</p>
        </div>
        <button class="cta" id="edit">${ADD_ICON}Add custom widgets</button>
      </div>`;
    root.getElementById("edit").onclick = () => { location.href = EDIT_URL; };
    root.getElementById("close").onclick = () => onDismiss?.();
    return { stop() {} };
  }

  return { mount };
})();
