// Shared look for every widget: the base CSS (Cabin text, Compass's colours, round
// header buttons) and the Material icons. Widgets add their own CSS after this.
globalThis.CompassTheme = (() => {
  // Material icons (same set Compass's homepage uses)
  const ICONS = {
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  };

  const CSS = `
    :host { all: initial; display: block; }
    .wrap { position: relative; color: #203249; font: 13px/1.4 Cabin, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; box-sizing: border-box; }
    .panel { position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 320px;
      max-height: calc(100vh - 32px); overflow-y: auto; background: #fff;
      border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.25); padding: 14px 16px 12px; }
    /* Homepage cards: homepage.js sets --ext-pad-x to 0 when Compass's card already pads. */
    .widget { padding: var(--ext-pad-y, 10px) var(--ext-pad-x, 12px); }
    header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    h1 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
    .widget h1 { font-size: 1.125rem; font-weight: 600; }
    button { border: 0; background: #f1f3f4; border-radius: 6px; padding: 4px 8px; cursor: pointer; font: inherit; color: inherit; }
    button:hover { background: #e3e5e8; }
    /* Round icon buttons like Compass's (MUI) widgets */
    header button { width: 30px; height: 30px; padding: 0; border-radius: 50%; background: transparent; color: #545F73;
      display: inline-flex; align-items: center; justify-content: center; flex: none; }
    header button:hover { background: rgba(32, 50, 73, .08); }
    header button svg { width: 20px; height: 20px; fill: currentColor; }
    .sub { color: #5f6368; margin-bottom: 10px; }
    .subrow { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .subrow .sub { margin: 0; flex: 1; min-width: 0; }
    /* Two fixed lines (session, then counts) in every state, so the card never changes height. */
    .sub .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub.err { height: 2.8em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .status { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .seg { display: inline-flex; border: 1px solid #dadce0; border-radius: 6px; overflow: hidden; flex: none; }
    .seg button { border-radius: 0; background: #fff; padding: 2px 8px; font-size: 12px; }
    .seg button + button { border-left: 1px solid #dadce0; }
    .seg button[aria-pressed="true"] { background: #203249; color: #fff; }
    .chart { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 20px; }
    svg { display: block; flex: none; }
    ul { list-style: none; margin: 0; padding: 0; flex: 1 1 200px; min-width: 200px; max-height: 170px; overflow-y: auto; }
    li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
    .sw { width: 12px; height: 12px; border-radius: 3px; flex: none; }
    .lbl { flex: 1; }
    .pct { font-weight: 600; min-width: 48px; text-align: right; }
    .n { color: #5f6368; min-width: 34px; text-align: right; }
    .note { color: #5f6368; font-size: 12px; margin-top: 8px; }
    .err { color: #b3261e; }
    #info[aria-expanded="true"] { background: rgba(14, 108, 217, .12); color: #0E6CD9; }
    .infopanel { position: absolute; left: 0; right: 0; bottom: 0; top: var(--info-top, 48px); z-index: 2;
      background: #fff; overflow-y: auto; padding: 4px 16px 12px; box-sizing: border-box; border-radius: 0 0 10px 10px; }
    .infopanel h2 { font-size: 13px; font-weight: 600; margin: 10px 0 4px; display: flex; align-items: center; gap: 8px; }
    .infopanel table { border-collapse: collapse; width: 100%; font: inherit; color: inherit; }
    .infopanel td { padding: 1px 0; vertical-align: top; }
    .infopanel td.code { width: 28px; font-weight: 600; font-family: ui-monospace, Consolas, monospace; }
    .infopanel .intro { color: #5f6368; font-size: 12px; margin: 4px 0 0; }
  `;

  return { CSS, ICONS };
})();
