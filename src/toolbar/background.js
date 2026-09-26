// A new install starts with the homepage widgets removed and shows a welcome card
// instead (see homepage.js). Updates keep the current layout.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.storage.local.set({ newInstall: true });
});

// Clicking the toolbar icon injects the panel into the current Compass tab.
// Running inside the page means requests use your existing Compass login.
chrome.action.onClicked.addListener(async (tab) => {
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (_) {}

  if (!host.endsWith(".compass.education")) {
    chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    chrome.action.setTitle({ tabId: tab.id, title: "Open a Compass page first, then click again." });
    return;
  }

  chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/shared/years.js", "src/shared/groups.js", "src/shared/theme.js", "src/widgets/attendance/data.js", "src/widgets/attendance/chart.js", "src/toolbar/panel.js"],
  });
});

// Weather widget: fetches the Bureau of Meteorology's free public WA data files. BOM
// sends no CORS headers, so the Compass page can't fetch them itself. Only WA product
// files can be asked for, and each is kept for 5 minutes so open tabs share one fetch.
const BOM_FILE = /^IDW\d{5}\.xml$/;
const bomCache = new Map(); // file -> { at, text }
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "bom" || !BOM_FILE.test(msg.file || "")) return;
  const hit = bomCache.get(msg.file);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) { reply({ text: hit.text }); return; }
  // reg.bom.gov.au, not www: www refuses requests from extensions ("Access Denied").
  fetch(`https://reg.bom.gov.au/fwo/${msg.file}`, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`The Bureau of Meteorology returned HTTP ${r.status}`); return r.text(); })
    .then((text) => { bomCache.set(msg.file, { at: Date.now(), text }); reply({ text }); })
    .catch((e) => reply({ error: e.message || String(e) }));
  return true; // reply comes later
});
