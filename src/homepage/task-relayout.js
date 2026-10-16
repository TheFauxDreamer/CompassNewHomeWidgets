// Runs in the page's own world (not the extension's), because only there can it reach ExtJS.
//
// task-extras.js adds sub-task lists to the rows of Compass's "My Tasks" grid after ExtJS has
// sized the widget, so the rows grow past the widget's bottom and cover the widget below it.
// When that happens, task-extras.js fires "ext-task-relayout" on the document, and this script
// asks ExtJS to size the grid again to fit its rows.

(() => {
  const path = location.pathname.toLowerCase();
  if (!(path === "/" || path === "/default.aspx") || window.__compassTaskRelayout) return;
  window.__compassTaskRelayout = true;

  function relayout() {
    const Ext = window.Ext;
    if (!Ext?.getCmp) return;
    // The closest ExtJS component around a task row (the grid's view), then its grid.
    let view = null;
    for (let el = document.querySelector(".home-mytasks tr.x-grid-data-row"); el && !view; el = el.parentElement) {
      if (el.id) view = Ext.getCmp(el.id) || null;
    }
    if (!view) return;
    const grid = view.up?.("tablepanel") || view.ownerCt || null;
    try {
      Ext.suspendLayouts?.();
      view.updateLayout?.();
      grid?.updateLayout?.();
    } catch (_) {
    } finally {
      try { Ext.resumeLayouts?.(true); } catch (_) {}
    }
    fit(view, grid);
  }

  // ExtJS's new size can still be a little short of the rows, so give the grid exactly the
  // height its rows need (or less, once it has been given a height here). The rows' height is
  // measured from the view's contents, not the view: once the grid has a height, ExtJS gives
  // the view the same height and it scrolls instead of growing.
  let fixed = false;
  function fit(view, grid) {
    const dom = view.el?.dom;
    const body = grid?.body?.dom || dom?.parentElement;
    if (!dom || !body || !grid?.setHeight || !grid.getHeight) return;
    const content = [...dom.children].reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    // The room for the rows: the body's while the view grows with its rows, else the view's
    // own, which is a little less than the body's (its border, a sideways scroll bar).
    const diff = Math.ceil(Math.max(content - body.clientHeight, content - dom.clientHeight));
    if (diff > 0 || (fixed && diff < -1)) {
      try { grid.setHeight(grid.getHeight() + diff); fixed = true; } catch (_) {}
    }
  }

  document.addEventListener("ext-task-relayout", relayout);
  relayout(); // in case the sub-tasks went in before this script loaded
})();
