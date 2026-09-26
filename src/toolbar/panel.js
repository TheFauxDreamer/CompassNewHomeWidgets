// Toolbar icon: toggle a floating attendance panel on any Compass page.
(() => {
  const HOST_ID = "compass-attendance-snapshot";
  const existing = document.getElementById(HOST_ID);
  if (existing) { existing.remove(); return; } // clicking the icon again closes it

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  globalThis.CompassAttendanceUI.mountSnapshot(host, { mode: "panel", onClose: () => host.remove() });
})();
