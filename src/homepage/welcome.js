// Welcome card: shows on the homepage after a new install, while none of our widgets
// is on the homepage. It links to Compass's layout editor, where the widgets are added
// from the Add Widget menu. homepage.js decides when it shows.
globalThis.CompassWelcomeUI = (() => {
  const EDIT_URL = "/default.aspx?editing=true";

  const CSS_EXTRA = `
    p { margin: 0 0 10px; }
    .actions { display: flex; gap: 8px; }
    .primary { background: #203249; color: #fff; padding: 6px 12px; }
    .primary:hover { background: #2d4566; }
  `;

  // onDismiss(): called when the close button is clicked.
  function mount(host, { onDismiss } = {}) {
    const { CSS, ICONS } = globalThis.CompassTheme;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Compass Homepage Widgets</h1>
          <button id="close" title="Dismiss" aria-label="Dismiss">${ICONS.close}</button>
        </header>
        <p>The extension adds widgets for attendance, unmarked rolls, arrivals and departures,
          Chronicle, relief and weather.</p>
        <p>To add them, edit the homepage, click <b>Add Widget</b>, select the widgets marked
          "(extension)", then click <b>Save</b>.</p>
        <div class="actions">
          <button class="primary" id="edit">Edit home page</button>
        </div>
      </div>`;
    root.getElementById("edit").onclick = () => { location.href = EDIT_URL; };
    root.getElementById("close").onclick = () => onDismiss?.();
    return { stop() {} };
  }

  return { mount };
})();
