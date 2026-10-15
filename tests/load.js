// Loads the extension's scripts into Node for the tests. The scripts are browser scripts
// that put their API on globalThis (most have no module.exports), so each one is run with
// vm.runInThisContext, in the same order as manifest.json.
//
// A small stub of chrome.storage.local keeps values in memory. fetch is replaced in each
// test that needs Compass (see mockFetch).
// Every date in the tests is Perth time, so the results don't depend on the computer's time zone.
process.env.TZ = "Australia/Perth";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

const store = new Map();
const listeners = new Set();
globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const list = Array.isArray(keys) ? keys : [keys];
        cb(Object.fromEntries(list.filter((k) => store.has(k)).map((k) => [k, store.get(k)])));
      },
      set(values) {
        const changes = {};
        for (const [k, v] of Object.entries(values)) { changes[k] = { oldValue: store.get(k), newValue: v }; store.set(k, v); }
        for (const fn of listeners) fn(changes, "local");
      },
    },
    onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
  },
};

const loaded = new Set();
function load(...files) {
  for (const file of files) {
    if (loaded.has(file)) continue;
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), "utf8"), { filename: file });
    loaded.add(file);
  }
}

// The shared scripts that the widgets use.
load("src/shared/years.js", "src/shared/names.js", "src/shared/groups.js", "src/shared/periods.js", "src/shared/theme.js");

// Answers each Compass request with routes[<path part>](body) -> the JSON to send back.
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opt = {}) => {
    const body = opt.body ? JSON.parse(opt.body) : null;
    calls.push({ url: String(url), body });
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) throw new Error(`No mock for ${url}`);
    const json = await routes[key](body, String(url));
    return { ok: true, status: 200, redirected: false, json: async () => json };
  };
  return calls;
}

// "/Date(ms+0800)/", the older Compass date format.
const msDate = (d) => `/Date(${d.getTime()}+0800)/`;

module.exports = { load, mockFetch, msDate, store };
