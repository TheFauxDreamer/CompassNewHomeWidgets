// Test names: shows Final Fantasy names (mostly VII and XIII) instead of the real names of students,
// staff and Custom Groups, for demos and screenshots. Only the names on the screen
// change; the widgets still get and filter the real data.
//
// TEST_NAMES = true makes the option available. Then Alt+click (Option+click on a Mac)
// the title of any extension widget to switch the test names on or off. The browser
// keeps the choice, and each widget shows a "Test names" chip while it is on.
globalThis.CompassNames = (() => {
  const TEST_NAMES = true;
  const KEY = "testNames";

  const PEOPLE = [
    "Cloud Strife", "Tifa Lockhart", "Aerith Gainsborough", "Barret Wallace", "Red XIII", "Yuffie Kisaragi",
    "Cid Highwind", "Vincent Valentine", "Cait Sith", "Reno", "Rude", "Elena",
    "Zack Fair", "Marlene Wallace", "Jessie Rasberry", "Biggs", "Wedge", "Reeve Tuesti",
    // Final Fantasy XIII
    "Lightning Farron", "Snow Villiers", "Serah Farron", "Oerba Dia Vanille", "Oerba Yun Fang", "Sazh Katzroy",
    "Hope Estheim", "Dajh Katzroy", "Nora Estheim", "Cid Raines", "Jihl Nabaat", "Yaag Rosch",
    "Lebreau", "Gadot", "Maqui", "Yuj", "Rygdea", "Bartholomew Estheim",
    // Final Fantasy IV, VI, VIII, IX, X, XII, XV and XVI
    "Cecil Harvey", "Rosa Farrell", "Kain Highwind", "Rydia", "Edward Chris von Muir", "Edge Geraldine",
    "Terra Branford", "Locke Cole", "Celes Chere", "Edgar Figaro", "Sabin Figaro", "Setzer Gabbiani",
    "Squall Leonhart", "Rinoa Heartilly", "Quistis Trepe", "Zell Dincht", "Selphie Tilmitt", "Irvine Kinneas",
    "Zidane Tribal", "Garnet Til Alexandros", "Adelbert Steiner", "Vivi Ornitier", "Freya Crescent", "Eiko Carol",
    "Tidus", "Yuna", "Wakka", "Lulu", "Kimahri Ronso", "Rikku",
    "Vaan", "Ashelia B'nargin Dalmasca", "Balthier", "Fran", "Basch fon Ronsenburg", "Penelo",
    "Noctis Lucis Caelum", "Gladiolus Amicitia", "Ignis Scientia", "Prompto Argentum", "Iris Amicitia", "Cindy Aurum",
    "Clive Rosfield", "Jill Warrick", "Joshua Rosfield", "Torgal", "Cidolfus Telamon", "Mid Telamon",
  ];
  const GROUPS = [
    "AVALANCHE", "Turks", "Shinra", "Sector 7", "Seventh Heaven", "Mako Reactor 1",
    "Midgar Academy", "Kalm", "Junon", "Wutai", "Cosmo Canyon", "Nibelheim",
    // Final Fantasy XIII
    "NORA", "Guardian Corps", "Sanctum", "Cavalry", "Bodhum", "Palumpolum",
    "Nautilus", "Eden", "Oerba", "Lake Bresha", "Vile Peaks", "Sunleth Waterscape",
    // Final Fantasy IV, VI, VIII, IX, X, XII, XV and XVI
    "Baron", "Mysidia", "Figaro", "Narshe", "Balamb Garden", "SeeD",
    "Alexandria", "Lindblum", "Besaid", "Zanarkand", "Rabanastre", "Archadia",
    "Insomnia", "Lestallum", "Altissia", "Rosaria", "The Hideaway", "Sanbreque",
  ];
  const ROMAN = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  let enabled = false;
  const listeners = new Set();

  // The same real name always gets the same test name on this page, in every widget.
  // When the list runs out, the names repeat with " II", " III" and so on.
  function namer(list) {
    const given = new Map(); // normalised real name -> { name, round }
    return (real) => {
      const key = String(real || "").trim().replace(/\s+/g, " ").toLowerCase();
      if (!key) return { name: "", round: 0 };
      if (!given.has(key)) {
        const i = given.size, round = Math.floor(i / list.length);
        const suffix = round ? " " + (ROMAN[round - 1] || round + 1) : "";
        given.set(key, { name: list[i % list.length] + suffix, base: list[i % list.length], round });
      }
      return given.get(key);
    };
  }
  const personOf = namer(PEOPLE);
  const groupOf = namer(GROUPS);

  const on = () => TEST_NAMES && enabled;

  // A person's name (student or staff).
  const person = (real) => (on() && real ? personOf(real).name : real);

  // A staff member as { code, name }: the code is made from the test name, for example "cstrife".
  function staff(p) {
    if (!on() || !p) return p;
    const t = personOf(p.name || p.code);
    const words = t.base.split(" ");
    const code = (words.length > 1 ? words[0][0] + words[words.length - 1] : words[0]).toLowerCase() + (t.round ? t.round + 1 : "");
    return { ...p, name: t.name, code: p.code ? code : "" };
  }

  // A Custom Group name.
  const group = (real) => (on() && real ? groupOf(real).name : real);

  // fn() runs when the test names are switched on or off. Gives a function that stops it.
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // --- the switch: Alt+click a widget title, and the "Test names" chip -----------------
  const chips = new Set();
  function showChips() {
    for (const chip of chips) {
      if (!chip.isConnected) { chips.delete(chip); continue; }
      chip.hidden = !on();
    }
  }

  // Call one time for each widget, after its header is drawn.
  function attach(root) {
    const title = root.querySelector("header h1");
    if (!title || !TEST_NAMES) return;
    const chip = document.createElement("span");
    chip.textContent = "Test names";
    chip.title = "Final Fantasy names are shown instead of real names. Alt+click the title to switch off.";
    chip.style.cssText = "margin-left:6px;padding:1px 7px;border-radius:999px;background:#FDECEA;color:#B3261E;" +
      "font-size:11px;font-weight:600;vertical-align:middle;white-space:nowrap;";
    title.append(chip);
    chips.add(chip);
    showChips();
    title.addEventListener("click", (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      set(!enabled);
    });
  }

  function set(next) {
    if (next === enabled) return;
    enabled = next;
    try { chrome.storage.local.set({ [KEY]: enabled }); } catch (_) {}
    changed();
  }

  function changed() {
    showChips();
    for (const fn of listeners) { try { fn(); } catch (e) { console.warn("[Test names]", e); } }
  }

  if (TEST_NAMES) {
    try {
      chrome.storage.local.get(KEY, (r) => { if (!!r?.[KEY] !== enabled) { enabled = !!r?.[KEY]; changed(); } });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !(KEY in changes)) return;
        const next = !!changes[KEY].newValue;
        if (next !== enabled) { enabled = next; changed(); }
      });
    } catch (_) {}
  }

  return { on, person, staff, group, onChange, attach, AVAILABLE: TEST_NAMES };
})();

if (typeof module !== "undefined") module.exports = globalThis.CompassNames;
