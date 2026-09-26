// "Weather" widget: current conditions and today's forecast for a WA town, from the
// Bureau of Meteorology's free public data feeds (not for commercial use; see
// reg.bom.gov.au/catalogue/data-feeds.shtml). The page can't fetch BOM itself (no
// CORS headers), so background.js fetches the files. This is the only widget that
// talks to a service other than Compass.
globalThis.CompassWeather = (() => {
  const REFRESH_MINUTES = 60;
  const FILES = {
    towns: "IDW14199.xml",     // WA town forecasts ("précis"): icon, min/max, rain
    stations: "IDW60920.xml",  // WA observations: every weather station, latest reading
    districts: "IDW13010.xml", // WA district forecasts: the UV alert
    metro: "IDW12300.xml",     // Perth metropolitan forecast: the Perth areas
  };
  const PERTH = "WA_PT053"; // Perth's area code in BOM's town and metro forecasts

  // BOM gives no coordinates for forecast areas. These are approximate centres of the
  // Perth metro areas, to find the nearest weather station.
  const METRO_AT = {
    Perth: [-31.953, 115.857], Joondalup: [-31.745, 115.766], Scarborough: [-31.894, 115.757],
    Fremantle: [-32.056, 115.745], Rockingham: [-32.281, 115.730], Midland: [-31.888, 116.010],
    Kalamunda: [-31.974, 116.058], Armadale: [-32.153, 116.015], Swanbourne: [-31.970, 115.765],
    "Rottnest Island": [-32.006, 115.514], Mandurah: [-32.529, 115.723],
  };

  async function bom(file) {
    let r;
    try { r = await chrome.runtime.sendMessage({ type: "bom", file }); }
    catch (_) { throw new Error("The extension was updated. Reload the page."); }
    if (!r || r.error) throw new Error(r?.error || "Couldn't reach the Bureau of Meteorology.");
    const doc = new DOMParser().parseFromString(r.text, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("The Bureau of Meteorology sent something unexpected.");
    return doc;
  }

  const num = (el) => { const v = parseFloat(el?.textContent); return isNaN(v) ? null : v; };
  const txt = (el) => (el?.textContent || "").trim();
  const byName = (a, b) => a.name.localeCompare(b.name);

  // The forecast period that covers now: today's, or the next one late at night.
  function periodNow(area, now) {
    const periods = [...(area?.querySelectorAll("forecast-period") || [])];
    return periods.find((p) => new Date(p.getAttribute("end-time-utc")) > now) || periods[0] || null;
  }

  function towns(doc) {
    return [...doc.querySelectorAll('area[type="location"]')].map((a) => ({
      aac: a.getAttribute("aac"), name: a.getAttribute("description"), district: a.getAttribute("parent-aac"),
    })).sort(byName);
  }

  // In BOM's order, which lists each district's main station first.
  function stations(doc) {
    return [...doc.querySelectorAll("station")].map((s) => ({
      wmo: s.getAttribute("wmo-id"), name: s.getAttribute("description") || s.getAttribute("stn-name"),
      district: s.getAttribute("forecast-district-id"),
      lat: Number(s.getAttribute("lat")), lon: Number(s.getAttribute("lon")),
      hasTemp: !!s.querySelector('element[type="air_temperature"]'), el: s,
    }));
  }

  // Distance in km between a station and [lat, lon] (close enough for a few hundred km).
  const km = (s, [lat, lon]) => 6371 * Math.hypot((s.lat - lat) * Math.PI / 180, (s.lon - lon) * Math.PI / 180 * Math.cos(lat * Math.PI / 180));

  // The nearest station to [lat, lon] that measures temperature.
  function nearest(list, [lat, lon]) {
    const dist = (s) => (s.lat - lat) ** 2 + ((s.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
    return list.filter((s) => s.hasTemp).sort((a, b) => dist(a) - dist(b))[0] || null;
  }

  // The station chosen in the settings. Otherwise, for a Perth area, the nearest to it.
  // Otherwise one named like the town, or the nearest to that one that measures
  // temperature (some only measure wind or tide), or the main station of the town's
  // forecast district.
  function pickStation(list, town, wanted, area) {
    const chosen = list.find((s) => s.wmo === wanted);
    if (chosen) return chosen;
    if (area && METRO_AT[area.name]) return nearest(list, METRO_AT[area.name]);
    const name = town.name.toLowerCase();
    const named = list.find((s) => s.name.toLowerCase() === name) || list.find((s) => s.name.toLowerCase().startsWith(name));
    if (named?.hasTemp) return named;
    if (named) return nearest(list, [named.lat, named.lon]) || named;
    return list.find((s) => s.hasTemp && s.district === town.district) || list.find((s) => s.district === town.district) || null;
  }

  // The Perth areas of the metro forecast, Perth first.
  function metroAreas(doc) {
    return [...(doc?.querySelectorAll('area[type="location"][parent-aac="WA_ME001"]') || [])]
      .map((a) => ({ aac: a.getAttribute("aac"), name: a.getAttribute("description") }))
      .sort((a, b) => (b.aac === PERTH) - (a.aac === PERTH) || a.name.localeCompare(b.name));
  }

  function forecast(area, now) {
    const p = periodNow(area, now);
    if (!p) return null;
    const el = (t) => p.querySelector(`[type="${t}"]`);
    return {
      icon: num(el("forecast_icon_code")), min: num(el("air_temperature_minimum")), max: num(el("air_temperature_maximum")),
      precis: txt(el("precis")), rainChance: txt(el("probability_of_precipitation")), rainRange: txt(el("precipitation_range")),
    };
  }

  function observation(station) {
    const p = station?.el.querySelector("period");
    if (!p) return null;
    const el = (t) => p.querySelector(`element[type="${t}"]`);
    return {
      time: new Date(p.getAttribute("time-utc")), temp: num(el("air_temperature")), feels: num(el("apparent_temp")),
      humidity: num(el("rel-humidity")), windDir: txt(el("wind_dir")), wind: num(el("wind_spd_kmh")),
      rain: num(el("rainfall")), min: num(el("minimum_air_temperature")),
    };
  }

  // "Sun protection 8:50am to 3:20pm, UV Index predicted to reach 8 [Very High]"
  function uvAlert(doc, district, now) {
    const text = txt(periodNow(doc?.querySelector(`area[aac="${district}"]`), now)?.querySelector('[type="uv_alert"]'));
    if (!text) return null;
    const reach = /reach (\d+)\s*\[([^\]]+)\]/i.exec(text);
    const protect = /sun protection (.+?) to (.+?)(,|$)/i.exec(text);
    return { index: reach ? Number(reach[1]) : null, level: reach?.[2] || "", protect: protect ? `${protect[1]}–${protect[2]}` : "", text };
  }

  // A Perth area's forecast. The areas are also BOM towns, with a full forecast. If BOM
  // ever drops one from the town forecasts, the metro forecast still has its high, and
  // the rest comes from Perth's forecast.
  function areaForecast(townDoc, metroDoc, area, now) {
    const own = townDoc.querySelector(`area[aac="${area.aac}"]`);
    if (own) return forecast(own, now);
    const perth = forecast(townDoc.querySelector(`area[aac="${PERTH}"]`), now);
    const max = forecast(metroDoc.querySelector(`area[aac="${area.aac}"]`), now)?.max;
    return perth && { ...perth, max: max ?? perth.max, min: null, fromPerth: true };
  }

  // settings: { aac, area, station } or null (area: a Perth area, only with Perth).
  // Without a town, only the lists come back.
  async function load(settings, now = new Date()) {
    const [townDoc, stationDoc, districtDoc, metroDoc] = await Promise.all([
      bom(FILES.towns), bom(FILES.stations),
      bom(FILES.districts).catch(() => null), bom(FILES.metro).catch(() => null), // UV and Perth areas are extras
    ]);
    const townList = towns(townDoc);
    const stationList = stations(stationDoc);
    const metroList = metroAreas(metroDoc);
    const lists = { townList, metroList, stationList: stationList.map(({ el, ...s }) => s).sort(byName) };
    let town = settings && townList.find((t) => t.aac === settings.aac);
    if (!town) return { ...lists, town: null };
    let area = town.aac === PERTH && settings.area && settings.area !== PERTH
      ? metroList.find((a) => a.aac === settings.area) || null : null;
    // A Perth area chosen as the town (e.g. found in the school name) shows as Perth › area.
    const asArea = town.aac !== PERTH && metroList.find((a) => a.aac === town.aac);
    if (asArea) { area = asArea; town = townList.find((t) => t.aac === PERTH) || town; }
    const station = pickStation(stationList, town, settings.station, area);
    // Where the forecast is for, to say how far away the station is.
    const named = stationList.find((s) => s.name.toLowerCase() === town.name.toLowerCase());
    const place = METRO_AT[(area || town).name] || (named && [named.lat, named.lon]);
    return {
      ...lists, town, area,
      station: station && { wmo: station.wmo, name: station.name, km: place ? Math.round(km(station, place)) : null },
      obs: observation(station),
      day: area ? areaForecast(townDoc, metroDoc, area, now) : forecast(townDoc.querySelector(`area[aac="${town.aac}"]`), now),
      uv: uvAlert(districtDoc, town.district, now),
      updated: now,
    };
  }

  return { load, PERTH, REFRESH_MINUTES };
})();

globalThis.CompassWeatherUI = (() => {
  const BODY_HEIGHT = 176; // fixed so the card never changes size

  const CSS_EXTRA = `
    .yrow { align-items: center; }
    .body { height: ${BODY_HEIGHT}px; display: flex; flex-direction: column; gap: 10px; }
    .body > * { flex: none; } /* never squash a row to fit */
    .now { display: flex; align-items: center; gap: 12px; }
    .now svg.wx { width: 64px; height: 64px; flex: none; }
    .temp { font-size: 2.4rem; line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; }
    .feels { color: #5f6368; font-size: 12px; margin-top: 4px; }
    .from { color: #5f6368; font-size: 11px; max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .now > div:nth-child(2) { min-width: 0; }
    .hilo { margin-left: auto; text-align: right; font-variant-numeric: tabular-nums; }
    .hilo div { font-size: 15px; font-weight: 600; }
    .hilo .lo { color: #1A56B0; }
    .hilo .hi { color: #B3261E; }
    .hilo span { color: #5f6368; font-weight: 400; font-size: 12px; margin-right: 4px; }
    .prow2 { display: flex; align-items: center; gap: 8px; }
    .precis { flex: 1; min-width: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .more { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 8px; background: transparent;
      color: #0E6CD9; font-size: 12px; font-weight: 600; }
    .more:hover { background: rgba(14, 108, 217, .08); }
    .more svg { width: 18px; height: 18px; fill: currentColor; }
    /* Without the tiles the card is only as tall as the rows it shows. */
    .body.compact { height: auto; min-height: 92px; }
    /* Four equal boxes in one row; each shows a short value and one short line. */
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
    .stat { background: #F6F7F9; border-radius: 8px; padding: 6px 4px; min-width: 0; text-align: center; }
    .stat > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stat .k { color: #5f6368; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .stat .v { font-weight: 600; font-size: 15px; margin: 1px 0; }
    .stat .s { color: #5f6368; font-size: 11px; }
    .uv { display: inline-block; border-radius: 10px; padding: 0 8px; color: #fff; }
    .uv.low { background: #3E8E1F; } .uv.moderate { background: #E0B400; color: #203249; } .uv.high { background: #E0660A; }
    .uv.very { background: #C8102E; } .uv.extreme { background: #7B4FC9; }
    .empty { height: 100%; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; text-align: center; color: #5f6368; }
    .empty.err { color: #b3261e; }
    .foot { color: #5f6368; font-size: 12px; margin-top: 6px; height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .foot a { color: inherit; }
    .sk { background: linear-gradient(90deg, #EEF0F3 25%, #F6F7F9 50%, #EEF0F3 75%); background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite; border-radius: 6px; }
    /* Location settings: Done stays in view at the top; town and Perth area side by side. */
    .ypanel { padding: 0; gap: 8px; }
    .ypanel .phead { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600;
      position: sticky; top: 0; background: #fff; z-index: 1; padding-bottom: 2px; }
    .ypanel .prow { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .ypanel label { flex-direction: column; align-items: stretch; gap: 3px; cursor: default; font-weight: 600; min-width: 0; }
    .ypanel label[hidden] { display: none; }
    .ypanel select { font: inherit; font-weight: 400; padding: 4px; border: 1px solid #dadce0; border-radius: 6px; background: #fff;
      color: inherit; min-width: 0; width: 100%; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  `;

  // BOM forecast icon codes -> a simple drawing.
  const SUN = '<circle cx="12" cy="12" r="4.5" fill="#F6B400"/><path stroke="#F6B400" stroke-width="2" stroke-linecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const cloud = (dy = 0) => `<path transform="translate(0 ${dy})" fill="#A9B4C2" d="M7 19h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 10.1 4.5 4.5 0 0 0 7 19z"/>`;
  const DRAW = {
    sun: SUN,
    moon: '<path fill="#8C9BB0" d="M15 3a8.5 8.5 0 1 0 6 13.5A8 8 0 0 1 15 3z"/>',
    partly: `<g transform="translate(-2 -3) scale(.8)">${SUN}</g>${cloud(2)}`,
    cloud: cloud(),
    rain: `${cloud(-3)}<path stroke="#2F7FD8" stroke-width="2" stroke-linecap="round" d="M8 19l-1 3M12 19l-1 3M16 19l-1 3"/>`,
    storm: `${cloud(-3)}<path fill="#F6B400" d="M12.5 15l-3 5h2.5l-1 3.5 4-5.5h-2.5l1.5-3z"/>`,
    fog: '<path stroke="#A9B4C2" stroke-width="2" stroke-linecap="round" d="M4 9h16M6 13h12M4 17h16"/>',
    wind: '<path fill="none" stroke="#8C9BB0" stroke-width="2" stroke-linecap="round" d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7"/>',
    snow: `${cloud(-3)}<g fill="#8FB8E8"><circle cx="8" cy="20" r="1.3"/><circle cx="12" cy="21.5" r="1.3"/><circle cx="16" cy="20" r="1.3"/></g>`,
  };
  const ICONS = {
    1: ["sun", "Sunny"], 2: ["moon", "Clear"], 3: ["partly", "Partly cloudy"], 4: ["cloud", "Cloudy"], 6: ["fog", "Hazy"],
    8: ["rain", "Light rain"], 9: ["wind", "Windy"], 10: ["fog", "Fog"], 11: ["rain", "Showers"], 12: ["rain", "Rain"],
    13: ["fog", "Dusty"], 14: ["snow", "Frost"], 15: ["snow", "Snow"], 16: ["storm", "Storm"], 17: ["rain", "Light showers"],
    18: ["rain", "Heavy showers"], 19: ["storm", "Cyclone"],
  };
  // The label is the forecast text when there is one: BOM uses one icon for
  // "Partly cloudy" and "Mostly sunny".
  const icon = (code, text) => {
    const [kind, name] = ICONS[code] || ["cloud", "Weather"];
    const label = (text || name).replace(/\.$/, "").replace(/[<>&"]/g, "");
    return `<svg class="wx" viewBox="0 0 24 24" role="img" aria-label="${label}"><title>${label}</title>${DRAW[kind]}</svg>`;
  };
  const uvClass = (i) => (i == null ? "" : i <= 2 ? "low" : i <= 5 ? "moderate" : i <= 7 ? "high" : i <= 10 ? "very" : "extreme");

  const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  const deg = (v) => (v == null ? "–" : `${Math.round(v)}°`);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function mount(host, { preview = false } = {}) {
    const { load, PERTH, REFRESH_MINUTES } = globalThis.CompassWeather;
    const { CSS, ICONS: UI_ICONS } = globalThis.CompassAttendanceUI;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}${globalThis.CompassYears.CSS}${CSS_EXTRA}</style>
      <div class="wrap widget">
        <header>
          <h1>Weather</h1>
          ${preview ? "" : `<button id="refresh" title="Refresh now">${UI_ICONS.refresh}</button>`}
        </header>
        <div class="yrow"><button class="ychip" id="where" title="Choose the town"><span>Choose a town</span></button></div>
        <div class="yarea">
          <div class="body compact" id="body"></div>
          <div class="ypanel" id="panel" hidden>
            <div class="phead"><span>Weather location</span><button class="ydone" id="done">Done</button></div>
            <div class="prow">
              <label title="The BOM forecast (high, low, rain and UV) is for this town">Town<select id="town"></select></label>
              <label id="arearow" hidden title="BOM forecasts these Perth areas. Choose the one nearest the school">Perth area<select id="area"></select></label>
            </div>
            <label title="Where the current temperature, wind, humidity and rain since 9am come from. BOM weather stations are not in every town, so Automatic uses the nearest one that measures temperature">Weather station<select id="station"></select></label>
          </div>
        </div>
        <div class="foot" id="foot"></div>
      </div>`;
    const $ = (id) => root.getElementById(id);
    const body = $("body");

    const KEY = "weatherSettings"; // { aac, station } for this browser, shared with other open cards
    let settings = null;
    let lastData = null;
    let lastLoaded = 0;
    let busy = false;
    let guessed = false; // the town came from the school name, not the settings
    const DETAILS_KEY = "weatherDetails"; // true: show the four tiles (rain, UV, wind, humidity)
    let details = false;
    const CHEVRON_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>';
    const CHEVRON_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 8-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>';
    const showDetails = (on, save) => {
      details = !!on;
      body.classList.toggle("compact", !details);
      if (save) { try { chrome.storage.local.set({ [DETAILS_KEY]: details }); } catch (_) {} }
      if (lastData?.town) render();
    };

    // With no town chosen, look for a BOM town in the school name that the homepage
    // shows (e.g. "Seventh Heaven School Mandurah" -> Mandurah). The longest match wins, so
    // "Port Hedland" beats "Hedland".
    function guessTown(townList) {
      const school = (document.querySelector(".home-schoolNameWrapper h3")?.textContent || "").toLowerCase();
      if (!school) return null;
      const words = ` ${school.replace(/[^a-z0-9]+/g, " ")} `;
      return townList
        .filter((t) => words.includes(` ${t.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `))
        .sort((a, b) => b.name.length - a.name.length)[0] || null;
    }

    function skeleton() {
      body.innerHTML = `
        <div class="now"><div class="sk" style="width:64px;height:64px;border-radius:50%"></div>
          <div><div class="sk" style="width:90px;height:36px"></div><div class="sk" style="width:110px;height:12px;margin-top:6px"></div></div></div>
        <div class="sk" style="width:60%;height:16px"></div>
        ${details ? `<div class="stats">${'<div class="sk" style="height:48px"></div>'.repeat(4)}</div>` : ""}`;
    }

    function message(text, { error = false, button = null } = {}) {
      body.textContent = "";
      const box = el("div", "empty" + (error ? " err" : ""));
      box.append(el("div", null, text));
      if (button) { const b = el("button", null, button); b.onclick = openPanel; box.append(b); }
      body.append(box);
    }

    function stat(key, value, sub, title) {
      const box = el("div", "stat");
      box.append(el("div", "k", key));
      if (typeof value === "string") box.append(el("div", "v", value)); else box.append(value);
      box.append(el("div", "s", sub || " "));
      if (title) box.title = title;
      return box;
    }

    function render() {
      const d = lastData;
      $("where").firstElementChild.textContent = d.area ? d.area.name : d.town ? d.town.name : "Choose a town";
      $("where").title = guessed ? "Found in the school name. Click to choose another town." : "Choose the town";
      if (!d.town) { message("Choose the town for the forecast.", { button: "Choose town" }); setFoot(); return; }
      const { day, obs, uv } = d;
      body.textContent = "";

      const now = el("div", "now");
      now.insertAdjacentHTML("beforeend", icon(day?.icon, day?.precis));
      const cur = el("div");
      cur.append(el("div", "temp", obs?.temp != null ? `${obs.temp.toFixed(1)}°` : "–"));
      // Some stations (e.g. at harbours) measure the temperature but not "feels like".
      if (obs?.temp == null) cur.append(el("div", "feels", "No current reading"));
      else if (obs.feels != null) cur.append(el("div", "feels", `Feels like ${Math.round(obs.feels)}°`));
      // Where the current reading comes from: BOM stations aren't in every town.
      if (d.station) {
        // The distance first, so a long station name can't hide it.
        const away = d.station.km == null || d.station.km < 2 ? "" : `${d.station.km} km away`;
        const from = el("div", "from", away ? `${away} · ${d.station.name}` : `at ${d.station.name}`);
        from.title = `Current weather from the BOM station at ${d.station.name}${away ? `, ${away}` : ""}. ` +
          `The forecast is for ${(d.area || d.town).name}. To choose another station, click the location chip.`;
        cur.append(from);
      }
      const hilo = el("div", "hilo");
      // Before dawn BOM gives today's low; after that the day's forecast has only the high,
      // so the low shown is the one measured overnight.
      const low = day?.min ?? obs?.min;
      const hi = el("div", "hi"); hi.append(el("span", null, "High"), deg(day?.max));
      const lo = el("div", "lo"); lo.append(el("span", null, day?.min != null ? "Low" : "Low (overnight)"), deg(low));
      hilo.append(hi, lo);
      now.append(cur, hilo);
      body.append(now);

      const precis = el("div", "precis", day?.precis || "No forecast for today");
      precis.title = day?.fromPerth ? `${precis.textContent} (BOM forecasts only the high for ${d.area.name}; the rest is Perth's forecast)` : precis.textContent;
      const more = el("button", "more");
      more.innerHTML = `<span>${details ? "Hide details" : "Show details"}</span>${details ? CHEVRON_UP : CHEVRON_DOWN}`;
      more.setAttribute("aria-expanded", String(details));
      more.title = details ? "Hide rain, UV, wind and humidity" : "Show rain, UV, wind and humidity";
      more.onclick = () => showDetails(!details, true);
      const row = el("div", "prow2");
      row.append(precis, more);
      body.append(row);
      if (!details) { setFoot(); return; }

      // Short text in each box; the full details are on hover.
      const stats = el("div", "stats");
      const since9 = obs?.rain != null ? (obs.rain > 0 ? `${obs.rain} mm since 9am` : "None since 9am") : "";
      stats.append(stat("Rain", day?.rainChance || "–", day?.rainRange || "chance",
        [day?.rainChance && `${day.rainChance} chance of rain`, day?.rainRange && `expected ${day.rainRange}`, since9].filter(Boolean).join(" · ")));
      if (uv?.index != null) {
        const v = el("div", "v");
        v.append(el("span", `uv ${uvClass(uv.index)}`, String(uv.index)));
        stats.append(stat("UV", v, uv.level, uv.text));
      } else {
        stats.append(stat("UV", "–", "no forecast"));
      }
      const calm = !obs?.wind || obs.windDir === "CALM";
      stats.append(stat("Wind", obs?.wind != null ? `${obs.wind} km/h` : "–", obs?.wind != null ? (calm ? "calm" : obs.windDir) : ""));
      stats.append(stat("Humidity", obs?.humidity != null ? `${obs.humidity}%` : "–", "relative"));
      body.append(stats);
      setFoot();
    }

    function setFoot(text) {
      const foot = $("foot");
      foot.textContent = "";
      if (text) { foot.textContent = foot.title = text; return; }
      const d = lastData;
      const bits = [d?.updated ? `Data fetched at ${fmtTime(d.updated)}` : null];
      const link = el("a", null, "BOM");
      link.title = "Bureau of Meteorology";
      link.href = "https://www.bom.gov.au/wa/"; link.target = "_blank"; link.rel = "noopener";
      foot.append("Source: ", link, ...bits.filter(Boolean).map((b) => ` · ${b}`));
      foot.title = foot.textContent + (d?.obs ? ` · station reading taken ${fmtTime(d.obs.time)}` : "");
    }

    // --- settings panel -----------------------------------------------------------
    // The Perth area list shows only when Perth is the town.
    const showArea = () => { $("arearow").hidden = $("town").value !== PERTH || !lastData?.metroList?.length; };
    function fillSelects() {
      const town = $("town"), area = $("area"), station = $("station");
      town.textContent = ""; area.textContent = ""; station.textContent = "";
      town.append(new Option("Choose a town…", ""));
      const inPerth = new Set((lastData?.metroList || []).map((a) => a.aac).filter((a) => a !== PERTH));
      for (const t of lastData?.townList || []) if (!inPerth.has(t.aac)) town.append(new Option(t.name, t.aac));
      for (const a of lastData?.metroList || []) area.append(new Option(a.aac === PERTH ? "Perth (city)" : a.name, a.aac));
      const auto = !settings?.station && lastData?.station;
      station.append(new Option(auto ? `Automatic: ${auto.name}${auto.km != null ? ` (${auto.km} km)` : ""}` : "Automatic (nearest)", ""));
      for (const s of lastData?.stationList || []) station.append(new Option(s.name, s.wmo));
      town.value = lastData?.town?.aac || "";
      area.value = lastData?.area?.aac || PERTH;
      station.value = settings?.station || "";
      showArea();
    }
    $("town").onchange = showArea;
    function openPanel() { fillSelects(); $("panel").hidden = false; }
    $("where").onclick = () => ($("panel").hidden ? openPanel() : ($("panel").hidden = true));
    $("done").onclick = () => {
      $("panel").hidden = true;
      const aac = $("town").value;
      const area = aac === PERTH && $("area").value !== PERTH ? $("area").value || null : null;
      const next = aac ? { aac, area, station: $("station").value || null } : null;
      if (JSON.stringify(next) === JSON.stringify(settings)) return;
      settings = next;
      try { chrome.storage.local.set({ [KEY]: settings }); } catch (_) {}
      if (!preview) refresh();
    };

    async function refresh() {
      if (busy) return;
      busy = true;
      skeleton();
      try {
        let data = await load(settings);
        guessed = false;
        if (!data.town && !settings) {
          const town = guessTown(data.townList);
          if (town) { data = await load({ aac: town.aac, station: null }); guessed = true; }
        }
        lastData = data;
        render();
      } catch (e) {
        message(e.message || String(e), { error: true });
        setFoot(`Will try again in ${REFRESH_MINUTES} min`);
      } finally {
        lastLoaded = Date.now();
        busy = false;
      }
    }

    if (preview) {
      skeleton();
      setFoot("Preview – the weather shows on the homepage");
      return {};
    }

    $("refresh").onclick = refresh;
    const start = () => refresh();
    try {
      chrome.storage.local.get([KEY, DETAILS_KEY], (r) => { settings = r?.[KEY] || null; showDetails(r?.[DETAILS_KEY], false); start(); });
      const onChanged = (changes, area) => {
        if (!host.isConnected && !host.parentNode) { chrome.storage.onChanged.removeListener(onChanged); return; }
        if (area !== "local") return;
        if (DETAILS_KEY in changes && !!changes[DETAILS_KEY].newValue !== details) showDetails(changes[DETAILS_KEY].newValue, false);
        if (!(KEY in changes)) return;
        const next = changes[KEY].newValue || null;
        if (JSON.stringify(next) !== JSON.stringify(settings)) { settings = next; refresh(); }
      };
      chrome.storage.onChanged.addListener(onChanged);
    } catch (_) { start(); }

    // Auto-refresh. Browsers slow timers in background tabs, so also catch up
    // as soon as the tab is looked at again.
    const due = () => Date.now() - lastLoaded >= REFRESH_MINUTES * 60 * 1000;
    const onVisible = () => { if (document.visibilityState === "visible" && due()) refresh(); };
    const timer = setInterval(onVisible, 30 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return { refresh, stop: () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); } };
  }

  return { mount };
})();
