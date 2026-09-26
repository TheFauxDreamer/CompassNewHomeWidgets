// Welcome card: shows on the homepage after a new install, while none of our widgets
// is on the homepage. It links to Compass's layout editor, where the widgets are added
// from the Add Widget menu. homepage.js decides when it shows.
globalThis.CompassWelcomeUI = (() => {
  const EDIT_URL = "/default.aspx?editing=true";

  // Material "dashboard customize" icon.
  const ADD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm15 0h-2v3h-3v2h3v3h2v-3h3v-2h-3z"/></svg>';

  const CSS_EXTRA = `
    .hello { display: flex; align-items: center; gap: 12px; margin: 2px 0 14px; }
    /* The hand waves for under 2 seconds, then rests; once every 30 seconds. */
    .wave { display: inline-block; font-size: 28px; line-height: 1; flex: none;
      transform-origin: 70% 70%; animation: wave 30s ease-in-out infinite; }
    @keyframes wave {
      0%, 5.6%, 100% { transform: rotate(0); }
      0.93%, 2.8% { transform: rotate(14deg); }
      1.87% { transform: rotate(-8deg); }
      3.73% { transform: rotate(-4deg); }
      4.67% { transform: rotate(10deg); }
    }
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
    /* A band of light slowly sweeps across the button once every 12 seconds. */
    .cta { position: relative; overflow: hidden; }
    .cta::after { content: ""; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%;
      background: linear-gradient(100deg, transparent, rgba(255,255,255,.18), transparent);
      transform: skewX(-20deg); animation: shimmer 12s ease-in-out infinite; pointer-events: none; }
    @keyframes shimmer {
      0% { left: -60%; }
      30%, 100% { left: 130%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .wave, .cta::after { animation: none; }
      .cta::after { display: none; }
      .cta, .cta:hover { transition: none; transform: none; }
    }
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
