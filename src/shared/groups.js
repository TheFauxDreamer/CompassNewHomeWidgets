// Compass Custom Groups (People > Custom Groups) for the student filters.
// The Attendance chart and Arrivals & Departures can filter by these groups instead of
// by year group. A group is a set of Compass user IDs, so a widget keeps a student when
// the student's ID is in at least one of the selected groups.
//
// A group selection is saved as { kind: "groups", ids: ["<id>", …], names: { "<id>": "<name>" } }.
// The names are kept so the chip can show them before Compass answers.
globalThis.CompassGroups = (() => {
  // --- Compass requests (the same calls as People > Custom Groups) ------------------
  const AVAILABLE = true;
  // Only student groups. Compass's base role 1 is Student: the request asks for those, and
  // each group's userBaseRole is checked too, so staff or parent groups never show.
  const STUDENT_ROLE = 1;
  const MEMBER_PAGE = 500;   // Compass pages the member list and sends no total
  const MAX_MEMBER_PAGES = 20;

  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    if (res.redirected || res.status === 401 || res.status === 403) {
      throw new Error("Compass didn't accept the request. Check you're still logged in.");
    }
    if (!res.ok) throw new Error(`Compass returned HTTP ${res.status}`);
    try { return await res.json(); }
    catch (_) { throw new Error("Compass returned something that wasn't JSON. Your session may have expired."); }
  }

  // Gives [{ id, name, type }]: the student Custom Groups that the user can see.
  // `type` is shown next to the name: here, the number of students.
  async function fetchList() {
    const json = await post("/Services/PeopleManagement.svc/GetCustomGroupsByBaseRole?sessionstate=readonly", { baseRole: String(STUDENT_ROLE) });
    if (!Array.isArray(json?.d)) throw new Error("Couldn't read the Custom Groups from Compass.");
    return json.d.filter((g) => Number(g.userBaseRole) === STUDENT_ROLE).map((g) => ({
      id: g.id, name: g.name,
      type: typeof g.memberCount === "number" ? `${g.memberCount} student${g.memberCount === 1 ? "" : "s"}` : "",
    }));
  }

  // Gives the Compass user IDs of the students in one group.
  async function fetchMembers(id) {
    const ids = [];
    for (let page = 1; page <= MAX_MEMBER_PAGES; page++) {
      const json = await post("/Services/PeopleManagement.svc/GetCustomGroupMembers?sessionstate=readonly",
        { customGroupId: id, page, start: (page - 1) * MEMBER_PAGE, limit: MEMBER_PAGE });
      if (!Array.isArray(json?.d)) throw new Error("Couldn't read the group members from Compass.");
      ids.push(...json.d.map((m) => m.id));
      if (json.d.length < MEMBER_PAGE) break;
    }
    return ids;
  }

  // --- caching -------------------------------------------------------------------
  const MEMBER_MINUTES = 15;
  let listPromise = null;
  const memberCache = new Map(); // id -> { at, promise }

  // Fetched one time for each page, and again after an error.
  function list() {
    listPromise ||= fetchList()
      .then((groups) => groups
        .map((g) => ({ id: String(g.id), name: String(g.name || "").trim() || "Unnamed group", type: String(g.type || "").trim() }))
        .sort((a, b) => a.name.localeCompare(b.name)))
      .catch((e) => { listPromise = null; throw e; });
    return listPromise;
  }

  // Gives a Set of the user IDs in any of the groups.
  async function members(ids) {
    const sets = await Promise.all(ids.map((id) => {
      const hit = memberCache.get(id);
      if (hit && Date.now() - hit.at < MEMBER_MINUTES * 60 * 1000) return hit.promise;
      const promise = fetchMembers(id).then((list) => list.map(Number))
        .catch((e) => { memberCache.delete(id); throw e; });
      memberCache.set(id, { at: Date.now(), promise });
      return promise;
    }));
    return new Set(sets.flat());
  }

  // --- selections ----------------------------------------------------------------
  const isGroups = (sel) => sel?.kind === "groups" && Array.isArray(sel.ids);

  // A saved selection that the widget can use: an array of year names, null (all year
  // groups) or a group selection. Anything else, or groups while they aren't set up,
  // becomes null.
  function validSelection(saved) {
    if (Array.isArray(saved)) return saved;
    if (isGroups(saved) && AVAILABLE && saved.ids.length) return { kind: "groups", ids: saved.ids.map(String), names: saved.names || {} };
    return null;
  }

  const label = (sel) => sel.ids.map((id) => sel.names?.[id] || "Unknown group").join(", ");

  // Keeps the members of a widget's selected groups. get(sel) gives the Set, or null
  // while it loads (then onReady() runs), or throws the error from Compass.
  // reset() makes the next get() ask again (for a refresh; the cache above still applies).
  function tracker(onReady) {
    let key = null, set = null, error = null;
    return {
      get(sel) {
        const k = sel.ids.join(",");
        if (k === key) { if (error) throw error; return set; }
        key = k; set = null; error = null;
        members(sel.ids)
          .then((s) => { if (key === k) { set = s; onReady(); } })
          .catch((e) => { if (key === k) { error = e; onReady(); } });
        return null;
      },
      reset() { key = null; },
    };
  }

  return { available: AVAILABLE, list, members, isGroups, validSelection, label, tracker };
})();
