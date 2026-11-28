/* ═══════════════════════════════════════════════════════════════
   GOD EYE · geo3d.js — GEOINT 3D EARTH v4.0 (OMNISCIENT EDITION)
   Полноценный 3D-глобус и 3D-реконструкция улиц, дворов и домов до Z22:
   - Чистые векторные 3D-карты OpenFreeMap (0% размытия, без 403 и белых блоков)
   - Спутник Гибрид с защитой от пустых тайлов (без белых квадратов в малых городах)
   - Точный адресный геокодер до номера дома (Nominatim + Photon)
   - Режим прогулки по улице от первого лица (WASD + Q/E лифт высоты + 360° панорамы)
   - 3D-симулятор сектора обзора камеры / свидетеля (CCTV Cone) и прямая видимость (LOS)
   - 3D-сканер объектов рядом (камеры OSM, АЗС, аптеки, транспорт, банкоматы)
   Палитра: чёрный · белый · серебро · тёмно-красный. Без синего и фиолетового.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

if (window.__GE3D_INIT__) return;
window.__GE3D_INIT__ = true;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const EARTH_R = 6371008.8;
const PROXY = 'https://god-eye-proxy.zajcevtihon09.workers.dev';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const ESRI_TILE = name => ESRI + name + '/MapServer/tile/{z}/{y}/{x}';
const OFM_PLANET = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/* Все подложки проверены на отсутствие HTTP 403 и отсутствие белых блоков «Map data not yet available» */
const BASEMAPS = {
  vector_dark: {
    label: 'Векторный 3D-Город: Тёмный OSINT (до Z22 без размытия)',
    pureVector: 'dark',
    maxZoom: 22,
    cesiumTiles: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attr: '© OpenFreeMap · © OpenStreetMap contributors'
  },
  hybrid: {
    label: 'Спутник + 3D Улицы, Дворы и Номера Домов (без белых блоков)',
    maxZoom: 17, // Защита от белых заглушек Esri в малых городах (плавный GPU-оверзум до Z22 + векторные улицы и дома сверху)
    tiles: [ESRI_TILE('World_Imagery')],
    overlays: [],
    cesiumTiles: ESRI_TILE('World_Imagery'),
    attr: 'Imagery © Esri, Maxar · Векторные улицы и 3D-дома © OpenFreeMap / OSM'
  },
  vector_light: {
    label: 'Дворы, Улицы и Номера Домов: Чёткая Схема 3D (до Z22)',
    pureVector: 'light',
    maxZoom: 22,
    cesiumTiles: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attr: '© OpenFreeMap · © OpenStreetMap contributors'
  },
  tactical: {
    label: 'Тактическая Карта Улиц Carto Dark HD (Z20)',
    maxZoom: 19,
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    ],
    overlays: [],
    cesiumTiles: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap · © CARTO · 3D © OpenFreeMap'
  },
  voyager: {
    label: 'Подробная Карта Города Carto Voyager HD (Z20)',
    maxZoom: 19,
    tiles: [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
    ],
    overlays: [],
    cesiumTiles: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap · © CARTO · 3D © OpenFreeMap'
  },
  sat_hd: {
    label: 'Спутник Макс. Z19 (крупные мегаполисы)',
    maxZoom: 19,
    tiles: [ESRI_TILE('World_Imagery')],
    overlays: [],
    cesiumTiles: ESRI_TILE('World_Imagery'),
    attr: 'Imagery © Esri, Maxar, Earthstar Geographics'
  },
  topo: {
    label: 'Топография и Высоты Esri',
    maxZoom: 17,
    tiles: [ESRI_TILE('World_Topo_Map')],
    overlays: [],
    cesiumTiles: ESRI_TILE('World_Topo_Map'),
    attr: 'Tiles © Esri, USGS, NOAA'
  },
  terrain: {
    label: 'Тени Рельефа (Hillshade)',
    maxZoom: 16,
    tiles: [ESRI_TILE('Elevation/World_Hillshade')],
    overlays: [],
    cesiumTiles: ESRI_TILE('Elevation/World_Hillshade'),
    attr: 'World Hillshade © Esri'
  }
};

const SAT_GROUPS = [
  ['25544', 'МКС (ISS)', 'CATNR=25544'],
  ['stations', 'Космические станции', 'GROUP=stations'],
  ['gps', 'GPS (навигация)', 'GROUP=gps-ops'],
  ['weather', 'Метеоспутники', 'GROUP=weather']
];

const NEARBY_CATS = {
  cams: { label: 'Камеры наблюдения OSM', q: 'node["man_made"="surveillance"](around:450,{lat},{lon});' },
  infra: { label: 'Магазины, Аптеки и Банкоматы', q: 'node["shop"](around:350,{lat},{lon});node["amenity"~"pharmacy|atm|bank|clinic|hospital"](around:450,{lat},{lon});' },
  auto: { label: 'АЗС, Парковки и Автосервисы', q: 'node["amenity"~"fuel|parking|car_wash"](around:600,{lat},{lon});way["amenity"~"fuel|parking"](around:600,{lat},{lon});' },
  transit: { label: 'Остановки и Ж/Д станции', q: 'node["highway"="bus_stop"](around:500,{lat},{lon});node["railway"~"station|halt|tram_stop"](around:800,{lat},{lon});' }
};

/* Быстрые ориентиры для мгновенной проверки 3D-городов */
const QUICK_PLACES = [
  { label: 'Москва · Центр', lat: 55.7539, lon: 37.6208, z: 16.5 },
  { label: 'СПб · Обводный 134', lat: 59.90742, lon: 30.27815, z: 18.2 },
  { label: 'Майский · Набережная', lat: 43.6237, lon: 44.0723, z: 16.8 },
  { label: 'Париж · Кварталы', lat: 48.8584, lon: 2.2945, z: 17.0 },
  { label: 'Токио · Синдзюку', lat: 35.6896, lon: 139.6921, z: 17.2 }
];

/* Контуры материков [lon, lat] для автономного офлайн-холста */
const LAND_LOOPS = [
  [[-168,65],[-140,70],[-125,70],[-95,74],[-78,73],[-62,66],[-55,52],[-66,44],[-75,35],[-81,25],[-90,21],[-97,26],[-97,19],[-84,9],[-78,8],[-82,14],[-95,16],[-105,20],[-112,31],[-117,33],[-124,40],[-124,48],[-135,57],[-152,60],[-162,55],[-168,65]],
  [[-80,10],[-74,11],[-62,10],[-50,0],[-35,-6],[-38,-14],[-40,-22],[-48,-28],[-54,-34],[-62,-39],[-66,-48],[-68,-55],[-74,-52],[-75,-42],[-71,-30],[-70,-18],[-77,-12],[-81,-5],[-78,4],[-80,10]],
  [[-10,36],[-9,43],[-2,44],[-5,48],[2,51],[8,54],[10,58],[5,60],[12,68],[20,70],[28,71],[32,69],[42,67],[60,69],[75,72],[105,77],[135,71],[170,69],[179,65],[162,59],[155,51],[142,53],[135,44],[129,35],[122,39],[121,31],[114,22],[108,21],[109,12],[103,2],[98,8],[96,16],[89,22],[80,13],[77,8],[72,20],[67,24],[56,26],[50,30],[48,29],[55,24],[59,22],[44,12],[42,16],[34,28],[35,32],[36,36],[28,36],[26,40],[23,37],[20,40],[18,43],[13,45],[16,40],[15,38],[12,42],[9,44],[4,43],[3,42],[0,38],[-5,36],[-10,36]],
  [[-17,15],[-13,28],[-6,36],[10,37],[12,33],[25,32],[33,31],[39,20],[43,12],[51,12],[49,5],[41,-2],[40,-11],[35,-20],[33,-26],[28,-33],[18,-35],[15,-26],[12,-17],[12,-6],[9,4],[2,6],[-8,4],[-13,9],[-17,15]],
  [[114,-22],[122,-17],[131,-12],[136,-12],[142,-11],[146,-18],[153,-27],[150,-37],[141,-38],[136,-35],[129,-32],[116,-34],[114,-22]],
  [[-45,60],[-22,70],[-18,77],[-35,83],[-55,82],[-62,76],[-52,68],[-45,60]],
  [[-6,50],[-5,55],[-2,59],[2,53],[1,51],[-6,50]],
  [[130,31],[131,34],[136,35],[140,36],[141,41],[145,44],[141,45],[139,39],[135,34],[130,31]],
  [[43,-25],[44,-16],[49,-12],[50,-16],[47,-25],[43,-25]]
];

const state = {
  open: false,
  engine: 'maplibre', // 'maplibre' | 'cesium' | 'tactical'
  base: 'hybrid',
  terrain3d: false,
  buildings3d: true,
  grid3d: true,
  streetMode: false,
  orbit: false,
  orbitRaf: 0,
  mode: 'pick', // 'pick' | 'ruler' | 'los' | 'fov'
  panelOpen: false,
  obsHeight: 15,
  tgtHeight: 2,
  fovAngle: 68,
  fovRange: 140,
  fovCones: [], // [{ origin:{lat,lon}, dirDeg, fov, range }]
  fovStart: null,
  selected: null,
  tempPoints: [],
  nearbyPts: [],
  rulerPts: [],
  losPts: [],
  layers: {
    db: true,
    terminator: true,
    sat: false,
    quake: false,
    eonet: false,
    air: false
  },
  satGroup: '25544',
  satList: [],
  satTimer: 0,
  quakeData: [],
  eonetData: [],
  airData: [],
  airTimer: 0,
  sunTime: null,
  mlMap: null,
  mlLoadPromise: null,
  mlMarkers: [],
  csViewer: null,
  csLoadPromise: null,
  csEntities: [],
  tac: null
};

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapLon = v => {
  const n = Number(v);
  return Number.isFinite(n) ? ((n + 180) % 360 + 360) % 360 - 180 : 0;
};
const toast = (m, o) => window.GE && window.GE.toast ? window.GE.toast(m, o) : null;
const sfx = k => { try { window.GE && window.GE.sfx && window.GE.sfx(k); } catch (_) {} };

function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function bearingDeg(a, b) {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}
function destPoint(lat, lon, distM, brgDeg) {
  const d = distM / EARTH_R, br = brgDeg * RAD, la1 = lat * RAD, lo1 = lon * RAD;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [wrapLon(lo2 * DEG), clamp(la2 * DEG, -85, 85)];
}
function fmtDist(m) {
  return m >= 1000 ? (m / 1000).toFixed(m >= 100000 ? 0 : 2) + ' км' : Math.round(m) + ' м';
}
function dms(v, pos, neg) {
  const s = v < 0 ? neg : pos;
  v = Math.abs(v);
  const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), sec = ((mf - m) * 60).toFixed(1);
  return `${d}°${String(m).padStart(2, '0')}'${String(sec).padStart(4, '0')}"${s}`;
}

/* ─────────── Солнечная геометрия и терминатор ─────────── */
function solarInfo(date, lat, lon) {
  const d = date || new Date();
  if (window.GE && window.GE.astro && typeof window.GE.astro.sun === 'function') {
    const b = window.GE.astro.base(d);
    const s = window.GE.astro.sun(d, lat, lon);
    const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    const subLon = wrapLon((720 - utcMin - b.eq) / 4);
    return { alt: s.alt, az: s.az, shadowAz: (s.az + 180) % 360, subLat: b.decl, subLon };
  }
  const jd = d.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const subLon = wrapLon((12 - utcH) * 15);
  const ha = (lon - subLon) * RAD;
  const phi = lat * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(clamp(sinAlt, -1, 1)) * DEG;
  const y = -Math.sin(ha);
  const x = Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha);
  const az = (Math.atan2(y, x) * DEG + 360) % 360;
  return { alt, az, shadowAz: (az + 180) % 360, subLat: dec * DEG, subLon };
}

function buildTerminatorGeoJSON(date) {
  const s = solarInfo(date || new Date(), 0, 0);
  const dec = s.subLat * RAD;
  const subLon = s.subLon;
  const coords = [];
  const tanDec = Math.abs(Math.tan(dec)) < 1e-4 ? (dec >= 0 ? 1e-4 : -1e-4) : Math.tan(dec);
  for (let lon = -180; lon <= 180; lon += 2) {
    const ha = (lon - subLon) * RAD;
    const lat = Math.atan(-Math.cos(ha) / tanDec) * DEG;
    coords.push([lon, clamp(lat, -84.8, 84.8)]);
  }
  const nightPole = dec >= 0 ? -85 : 85;
  const poly = coords.slice();
  poly.push([180, nightPole], [-180, nightPole], coords[0]);
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'night' }, geometry: { type: 'Polygon', coordinates: [poly] } },
      { type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: coords } },
      { type: 'Feature', properties: { kind: 'sun', title: 'Солнце в зените' }, geometry: { type: 'Point', coordinates: [subLon, clamp(s.subLat, -84, 84)] } }
    ]
  };
}

function buildShadowVector(lat, lon, date) {
  const s = solarInfo(date || new Date(), lat, lon);
  if (s.alt <= 0.2) return null;
  const lenMeters = clamp(60 / Math.tan(s.alt * RAD), 15, 600);
  return {
    alt: s.alt,
    az: s.az,
    shadowAz: s.shadowAz,
    shadowLine: [[lon, lat], destPoint(lat, lon, lenMeters, s.shadowAz)],
    sunRay: [[lon, lat], destPoint(lat, lon, 120, s.az)]
  };
}

/* ─────────── Загрузка библиотек ─────────── */
function loadAsset(el, timeoutMs, errMsg) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => finish(new Error(errMsg + ' (тайм-аут)')), timeoutMs || 14000);
    const finish = err => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (err) { try { el.remove(); } catch (_) {} reject(err); }
      else resolve();
    };
    el.onload = () => finish();
    el.onerror = () => finish(new Error(errMsg));
    document.head.appendChild(el);
  });
}

function loadMapLibre() {
  if (window.maplibregl && typeof window.maplibregl.Map === 'function') return Promise.resolve(window.maplibregl);
  if (state.mlLoadPromise) return state.mlLoadPromise;
  const sources = [
    { name: 'локальный модуль', css: 'vendor/maplibre-gl.css', js: 'vendor/maplibre-gl.js', local: true },
    { name: 'jsDelivr CDN', css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.1/dist/maplibre-gl.css', js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.1/dist/maplibre-gl.js' },
    { name: 'unpkg CDN', css: 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.css', js: 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.js' }
  ];
  state.mlLoadPromise = (async () => {
    const errs = [];
    for (const src of sources) {
      try {
        setStatus('Подключаю 3D-движок MapLibre (' + src.name + ')…');
        const oldCss = $('#ge3d-ml-css'); if (oldCss) oldCss.remove();
        const oldJs = $('#ge3d-ml-js'); if (oldJs) oldJs.remove();
        const link = document.createElement('link');
        link.id = 'ge3d-ml-css'; link.rel = 'stylesheet'; link.href = src.css;
        await loadAsset(link, src.local ? 5000 : 12000, 'CSS ' + src.name);
        const script = document.createElement('script');
        script.id = 'ge3d-ml-js'; script.src = src.js; script.async = true;
        if (!src.local) script.crossOrigin = 'anonymous';
        await loadAsset(script, src.local ? 6000 : 15000, 'JS ' + src.name);
        if (window.maplibregl && typeof window.maplibregl.Map === 'function') return window.maplibregl;
        throw new Error('объект maplibregl не инициализирован');
      } catch (e) {
        errs.push(src.name + ': ' + e.message);
      }
    }
    throw new Error('MapLibre недоступен (' + errs.join(' · ') + ')');
  })().catch(err => { state.mlLoadPromise = null; throw err; });
  return state.mlLoadPromise;
}

function loadCesium() {
  if (window.Cesium && typeof window.Cesium.Viewer === 'function') return Promise.resolve(window.Cesium);
  if (state.csLoadPromise) return state.csLoadPromise;
  const sources = [
    { name: 'jsDelivr 1.147', base: 'https://cdn.jsdelivr.net/npm/cesium@1.147.0/Build/Cesium/', css: 'Widgets/widgets.css', js: 'Cesium.js', cors: true },
    { name: 'jsDelivr 1.146', base: 'https://cdn.jsdelivr.net/npm/cesium@1.146.0/Build/Cesium/', css: 'Widgets/widgets.css', js: 'Cesium.js', cors: true },
    { name: 'unpkg 1.147', base: 'https://unpkg.com/cesium@1.147.0/Build/Cesium/', css: 'Widgets/widgets.css', js: 'Cesium.js', cors: true }
  ];
  state.csLoadPromise = (async () => {
    const errs = [];
    for (const src of sources) {
      try {
        window.CESIUM_BASE_URL = src.base;
        setStatus('Загружаю CesiumJS (' + src.name + ')…');
        const oldCss = $('#ge3d-cs-css'); if (oldCss) oldCss.remove();
        const oldJs = $('#ge3d-cs-js'); if (oldJs) oldJs.remove();
        const link = document.createElement('link');
        link.id = 'ge3d-cs-css'; link.rel = 'stylesheet'; link.href = src.base + src.css;
        await loadAsset(link, 12000, 'CSS ' + src.name);
        const script = document.createElement('script');
        script.id = 'ge3d-cs-js'; script.src = src.base + src.js; script.async = true;
        if (src.cors) script.crossOrigin = 'anonymous';
        await loadAsset(script, 22000, 'JS ' + src.name);
        if (window.Cesium && typeof window.Cesium.Viewer === 'function') {
          if (window.Cesium.Ion) window.Cesium.Ion.defaultAccessToken = '';
          return window.Cesium;
        }
        throw new Error('Cesium.Viewer не создан');
      } catch (e) {
        errs.push(src.name + ': ' + e.message);
      }
    }
    throw new Error('Не удалось загрузить CesiumJS (' + errs.join(' | ') + ')');
  })().catch(err => { state.csLoadPromise = null; throw err; });
  return state.csLoadPromise;
}

function loadSatelliteLib() {
  if (window.satellite) return Promise.resolve(window.satellite);
  const urls = [
    'vendor/satellite.min.js',
    'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/satellite.js/5.0.0/satellite.min.js'
  ];
  return (async () => {
    for (const u of urls) {
      try {
        const s = document.createElement('script');
        s.src = u;
        if (!u.startsWith('vendor/')) s.crossOrigin = 'anonymous';
        await loadAsset(s, 8000, u);
        if (window.satellite) return window.satellite;
      } catch (_) {}
    }
    throw new Error('библиотека satellite.js недоступна');
  })();
}

/* ─────────── Стили и интерфейс модального окна 3D ─────────── */
function addStyles() {
  if ($('#ge3d-style')) return;
  const st = document.createElement('style');
  st.id = 'ge3d-style';
  st.textContent = `
.ge3d{position:fixed;inset:0;z-index:100000;background:#040406;color:#f3f3f5;display:none;font-family:'IBM Plex Sans',Segoe UI,sans-serif;user-select:none}
.ge3d.open{display:block}
.ge3d-head{position:absolute;z-index:20;top:0;left:0;right:0;min-height:60px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;background:rgba(6,6,8,.96);border-bottom:1px solid rgba(226,35,46,.32);backdrop-filter:blur(16px)}
.ge3d-brand{display:flex;flex-direction:column;gap:2px;min-width:162px;flex-shrink:0}
.ge3d-kicker{font:600 9.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:#e2232e}
.ge3d-brand strong{font:600 15.5px 'Cinzel',Georgia,serif;letter-spacing:.12em;color:#f3f3f5}
.ge3d-sub{font:10px 'JetBrains Mono',monospace;color:#8b8b96}
.ge3d-search-wrap{position:relative;flex:1;max-width:390px;min-width:170px}
.ge3d-search-wrap input{width:100%;height:34px;background:#0d0d11;border:1px solid rgba(205,205,215,.22);color:#f3f3f5;padding:0 32px 0 30px;font:12.5px 'IBM Plex Sans',sans-serif;border-radius:2px}
.ge3d-search-wrap input:focus{outline:none;border-color:#e2232e;box-shadow:0 0 0 1px rgba(226,35,46,.4)}
.ge3d-search-ico{position:absolute;left:9px;top:9px;width:15px;height:15px;color:#8b8b96;pointer-events:none}
.ge3d-search-go{position:absolute;right:4px;top:4px;height:26px;padding:0 7px;border:1px solid rgba(226,35,46,.4);background:rgba(179,18,27,.2);color:#fff;font:600 10px 'JetBrains Mono',monospace;cursor:pointer}
.ge3d-search-go:hover{background:#e2232e}
.ge3d-sugg{position:absolute;top:37px;left:0;right:0;background:#0b0b0f;border:1px solid rgba(226,35,46,.38);z-index:45;max-height:300px;overflow:auto;box-shadow:0 22px 54px rgba(0,0,0,.88)}
.ge3d-sugg.hidden{display:none}
.ge3d-sugg button{display:block;width:100%;text-align:left;padding:8px 11px;border:0;border-bottom:1px solid rgba(205,205,215,.08);background:transparent;color:#e5e5eb;cursor:pointer;font:12px 'IBM Plex Sans',sans-serif}
.ge3d-sugg button:hover{background:#1b1014;color:#fff}
.ge3d-sugg button .sugg-tag{display:inline-block;padding:1px 5px;margin-right:6px;font:600 9px 'JetBrains Mono',monospace;border:1px solid rgba(226,35,46,.5);color:#ff8a90;text-transform:uppercase}
.ge3d-sugg button small{display:block;font:10.5px 'JetBrains Mono',monospace;color:#8b8b96;margin-top:3px}
.ge3d-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.ge3d select,.ge3d .ge3d-btn{height:33px;border:1px solid rgba(205,205,215,.18);border-radius:2px;background:#0f0f13;color:#e5e5eb;padding:0 9px;font:11px 'JetBrains Mono',monospace;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:border-color .15s,background .15s,color .15s}
.ge3d select:hover,.ge3d .ge3d-btn:hover{border-color:#e2232e;background:#191014;color:#fff}
.ge3d .ge3d-btn.on{border-color:#e2232e;background:rgba(179,18,27,.28);color:#fff;box-shadow:0 0 14px rgba(226,35,46,.22)}
.ge3d .ge3d-close{width:34px;justify-content:center;font-size:20px;color:#ff7b82;padding:0}
.ge3d-scene-wrap{position:absolute;inset:60px 0 36px;background:radial-gradient(circle at 50% 50%,#0d090c 0%,#040406 72%);overflow:hidden}
.ge3d-scene{position:absolute;inset:0;width:100%;height:100%}
.ge3d-scene canvas{outline:none}
.ge3d-quick-bar{position:absolute;z-index:16;top:10px;left:140px;right:340px;display:flex;gap:5px;flex-wrap:wrap;pointer-events:none}
.ge3d-quick-bar button{pointer-events:auto;height:25px;padding:0 8px;background:rgba(7,7,10,.88);border:1px solid rgba(205,205,215,.16);color:#cacad2;font:10px 'JetBrains Mono',monospace;cursor:pointer;backdrop-filter:blur(8px)}
.ge3d-quick-bar button:hover{border-color:#e2232e;color:#fff;background:#191014}
.ge3d-rail{position:absolute;z-index:16;left:12px;top:10px;display:flex;flex-direction:column;gap:4px;background:rgba(8,8,11,.92);border:1px solid rgba(205,205,215,.18);padding:5px;backdrop-filter:blur(12px);box-shadow:0 14px 36px rgba(0,0,0,.65)}
.ge3d-rail hr{border:0;border-top:1px solid rgba(205,205,215,.12);margin:2px 0}
.ge3d-rail button{height:30px;min-width:34px;padding:0 8px;border:1px solid transparent;background:transparent;color:#cacad2;font:10.5px 'JetBrains Mono',monospace;cursor:pointer;text-align:left;display:flex;align-items:center;gap:6px;border-radius:2px}
.ge3d-rail button:hover{background:#181115;color:#fff;border-color:rgba(226,35,46,.35)}
.ge3d-rail button.on{background:rgba(179,18,27,.3);color:#fff;border-color:#e2232e}
.ge3d-drawer{position:absolute;z-index:18;right:12px;top:10px;bottom:12px;width:336px;max-width:calc(100vw - 24px);background:rgba(8,8,11,.96);border:1px solid rgba(226,35,46,.3);backdrop-filter:blur(16px);display:flex;flex-direction:column;overflow:hidden;transform:translateX(360px);transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.ge3d-drawer.open{transform:translateX(0)}
.ge3d-dh{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(205,205,215,.14);font:600 11px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#f3f3f5}
.ge3d-db{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
.ge3d-sec{border:1px solid rgba(205,205,215,.12);background:#0c0c10;padding:9px 10px}
.ge3d-sec-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font:500 12px 'IBM Plex Sans',sans-serif;color:#f3f3f5;cursor:pointer}
.ge3d-sec-h input[type=checkbox]{accent-color:#e2232e;width:15px;height:15px;cursor:pointer}
.ge3d-sec-d{font:11px/1.45 'IBM Plex Sans',sans-serif;color:#8b8b96;margin-top:4px}
.ge3d-sec-ctl{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.ge3d-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ge3d-pts-list{max-height:132px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;margin-top:6px}
.ge3d-pts-list button{text-align:left;padding:4px 7px;background:#111116;border:1px solid rgba(205,205,215,.1);color:#cacad2;font:11px 'JetBrains Mono',monospace;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ge3d-pts-list button:hover{border-color:#e2232e;color:#fff}
.ge3d-card{position:absolute;z-index:17;left:12px;bottom:12px;width:386px;max-width:calc(100vw - 24px);background:rgba(8,8,11,.96);border:1px solid rgba(226,35,46,.5);padding:12px 14px;backdrop-filter:blur(16px);box-shadow:0 20px 52px rgba(0,0,0,.84)}
.ge3d-card.hidden{display:none}
.ge3d-card-h{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
.ge3d-card-h b{font:600 13.5px/1.3 'IBM Plex Sans',sans-serif;color:#fff}
.ge3d-card-x{background:none;border:0;color:#8b8b96;font-size:17px;cursor:pointer;line-height:1}
.ge3d-card-x:hover{color:#fff}
.ge3d-kv{display:grid;grid-template-columns:96px 1fr;gap:3px 8px;font:11px 'JetBrains Mono',monospace;margin-bottom:8px}
.ge3d-kv dt{color:#8b8b96}
.ge3d-kv dd{color:#e5e5eb;overflow-wrap:anywhere}
.ge3d-links{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(205,205,215,.12)}
.ge3d-links a{font:10px 'JetBrains Mono',monospace;color:#cacad2;padding:3px 7px;border:1px solid rgba(205,205,215,.16);background:#111116;text-decoration:none}
.ge3d-links a:hover{border-color:#e2232e;color:#fff}
.ge3d-los-box{position:absolute;z-index:17;left:50%;transform:translateX(-50%);bottom:62px;width:490px;max-width:calc(100vw - 24px);background:rgba(8,8,11,.96);border:1px solid rgba(226,35,46,.35);padding:10px 12px;backdrop-filter:blur(14px)}
.ge3d-los-box.hidden{display:none}
.ge3d-los-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font:11px 'JetBrains Mono',monospace;margin-bottom:6px}
.ge3d-los-ok{color:#e5e5eb;border-left:3px solid #f3f3f5;padding-left:7px}
.ge3d-los-bad{color:#ff7b82;border-left:3px solid #e2232e;padding-left:7px}
.ge3d-foot{position:absolute;z-index:20;bottom:0;left:0;right:0;min-height:36px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 14px;background:rgba(6,6,8,.96);border-top:1px solid rgba(205,205,215,.14);font:10.5px 'JetBrains Mono',monospace;color:#a5a5af}
.ge3d-foot #ge3d-telem{color:#f0d6d8}
.ge3d-marker{width:14px;height:14px;border-radius:50%;background:#e2232e;border:2px solid #fff;box-shadow:0 0 12px rgba(226,35,46,.85);cursor:pointer;position:relative}
.ge3d-marker.sel{width:18px;height:18px;background:#ff2e3b;box-shadow:0 0 0 5px rgba(226,35,46,.34),0 0 18px rgba(226,35,46,.98)}
.ge3d-street-bar{position:absolute;z-index:19;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:5px;padding:7px 11px;background:rgba(7,7,10,.96);border:1px solid rgba(226,35,46,.55);box-shadow:0 18px 46px rgba(0,0,0,.88);backdrop-filter:blur(14px);flex-wrap:wrap;max-width:calc(100vw - 24px)}
.ge3d-street-bar.hidden{display:none}
.ge3d-street-tag{font:700 10px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#e2232e;margin-right:4px}
.maplibregl-ctrl-attrib{background:rgba(6,6,8,.75)!important;color:#8b8b96!important;font:10px 'IBM Plex Sans',sans-serif!important}
.maplibregl-ctrl-attrib a{color:#cacad2!important}
@media(max-width:980px){
  .ge3d-head{flex-wrap:wrap;padding:7px 10px;gap:6px}
  .ge3d-sub,.ge3d-quick-bar{display:none}
  .ge3d-search-wrap{order:3;max-width:none;width:100%;flex-basis:100%}
  .ge3d-scene-wrap{top:104px}
  .ge3d-card{width:calc(100vw - 16px);left:8px;bottom:8px}
}`;
  document.head.appendChild(st);
}

function buildUi() {
  if ($('#ge3d-modal')) return;
  addStyles();
  const root = document.createElement('div');
  root.id = 'ge3d-modal';
  root.className = 'ge3d';
  root.innerHTML = `
    <div class="ge3d-head">
      <div class="ge3d-brand">
        <span class="ge3d-kicker">GOD EYE / GEOINT</span>
        <strong>3D EARTH v4.0</strong>
        <span class="ge3d-sub">Векторные Дворы Z22 · Дома 3D · Осмотр Улиц</span>
      </div>
      <div class="ge3d-search-wrap">
        <svg class="ge3d-search-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/></svg>
        <input id="ge3d-q" type="text" placeholder="Город, улица, номер дома (напр. Майский Набережная 141)…" autocomplete="off" aria-label="Поиск адреса и дома на 3D-глобусе">
        <button id="ge3d-q-btn" class="ge3d-search-go" type="button" title="Найти точный адрес или дом">НАЙТИ</button>
        <div id="ge3d-sugg" class="ge3d-sugg hidden"></div>
      </div>
      <div class="ge3d-actions">
        <select id="ge3d-engine" title="Выбор 3D-движка глобуса" aria-label="3D-движок">
          <option value="maplibre">Движок: MapLibre 3D (Город Z22)</option>
          <option value="cesium">Движок: CesiumJS 3D (Орбита)</option>
          <option value="tactical">Движок: Тактический 3D (Офлайн)</option>
        </select>
        <select id="ge3d-base" title="Подложка глобуса и улиц" aria-label="Подложка">
          ${Object.entries(BASEMAPS).map(([k, v]) => `<option value="${k}"${k === state.base ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
        <button id="ge3d-street-btn" class="ge3d-btn" type="button" title="Опуститься на уровень улицы: 3D-здания, дворы, номера домов и панорамы 360°">🚶 Улица 3D</button>
        <button id="ge3d-bldg" class="ge3d-btn on" type="button" title="Векторные улицы, дворы, 3D-здания и номера домов до Z22">■ 3D Дома</button>
        <button id="ge3d-grid" class="ge3d-btn on" type="button" title="Тактическая координатная сетка OSINT">⌗ Сетка</button>
        <button id="ge3d-terrain" class="ge3d-btn" type="button" title="Горный 3D-рельеф высот DEM">▲ Горы 3D</button>
        <button id="ge3d-orbit" class="ge3d-btn" type="button" title="Плавное орбитальное вращение камеры">↻ Орбита</button>
        <button id="ge3d-layers-btn" class="ge3d-btn" type="button" title="Радар объектов рядом, живые слои OSINT и хронолокация">◈ Разведка <b id="ge3d-ly-cnt">2</b></button>
        <button id="ge3d-shot" class="ge3d-btn" type="button" title="Сохранить снимок 3D-сцены в PNG">PNG</button>
        <button id="ge3d-close" class="ge3d-btn ge3d-close" type="button" aria-label="Закрыть">×</button>
      </div>
    </div>
    <div class="ge3d-scene-wrap">
      <div id="ge3d-scene" class="ge3d-scene"></div>

      <div class="ge3d-quick-bar" id="ge3d-quick-bar">
        ${QUICK_PLACES.map((p, i) => `<button type="button" data-qp="${i}">⌖ ${esc(p.label)}</button>`).join('')}
      </div>

      <div class="ge3d-rail" aria-label="Инструменты 3D-глобуса">
        <button class="on" data-gmode="pick" title="Режим точки: точный адрес, номер дома, высота, тень Солнца">⌖ Точка</button>
        <button data-gmode="fov" title="Сектор камеры / свидетеля (клик 1 — где камера, клик 2 — куда смотрит)">🎥 Сектор камеры</button>
        <button data-gmode="ruler" title="3D-линейка: геодезическое расстояние и азимут">⟋ Линейка</button>
        <button data-gmode="los" title="Прямая видимость (LOS): учёт кривизны Земли и рельефа">👁 Видимость</button>
        <button id="ge3d-clear-draw" title="Очистить секторы камер, замеры и объекты рядом">✕ Сброс</button>
        <hr>
        <button data-pitch="0" title="Вид строго сверху (надир 0°)">Надир 0°</button>
        <button data-pitch="58" title="Тактический наклон крыш и дворов 58°">Дворы 58°</button>
        <button data-pitch="78" title="Взгляд вдоль улицы у земли (78°)">Улица 78°</button>
        <button id="ge3d-north" title="Выровнять камеру строго на Север">↑ Север</button>
        <button id="ge3d-sync2d" title="Перелететь в текущий центр 2D-карты">⇄ Центр 2D</button>
      </div>

      <aside id="ge3d-drawer" class="ge3d-drawer" aria-label="Слои 3D-разведки">
        <div class="ge3d-dh"><span>РАЗВЕДКА МЕСТНОСТИ И СЛОИ</span><button id="ge3d-drawer-x" class="ge3d-card-x" type="button">×</button></div>
        <div class="ge3d-db">
          <div class="ge3d-sec">
            <div style="font:600 11px 'JetBrains Mono',monospace;color:#e2232e;margin-bottom:5px">РАДАР ОБЪЕКТОВ РЯДОМ (OSM 500 М)</div>
            <div class="ge3d-sec-d">Находит реальные камеры наблюдения, магазины, аптеки, АЗС и остановки вокруг центра 3D-экрана.</div>
            <div class="ge3d-sec-ctl">
              <select id="ge3d-near-cat">${Object.entries(NEARBY_CATS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
              <div class="ge3d-row">
                <button type="button" class="ge3d-btn on" id="ge3d-near-scan">📡 Сканировать квартал</button>
                <button type="button" class="ge3d-btn" id="ge3d-near-clr">Очистить</button>
              </div>
              <div id="ge3d-near-st" class="ge3d-sec-d" style="color:#cacad2"></div>
            </div>
          </div>

          <div class="ge3d-sec">
            <label class="ge3d-sec-h"><span>Точки базы GOD EYE</span><input type="checkbox" data-gly="db" checked></label>
            <div class="ge3d-sec-d">Локации, места преступлений и фотографии с координатами.</div>
            <div id="ge3d-pts-list" class="ge3d-pts-list"></div>
          </div>

          <div class="ge3d-sec">
            <label class="ge3d-sec-h"><span>Солнечный терминатор и тень</span><input type="checkbox" data-gly="terminator" checked></label>
            <div class="ge3d-sec-d">Ночная сторона Земли и точный луч падения тени для проверки времени события.</div>
            <div class="ge3d-sec-ctl">
              <input id="ge3d-sun-dt" type="datetime-local" style="height:30px;background:#111116;border:1px solid rgba(205,205,215,.16);color:#f3f3f5;padding:0 7px;font:11px 'JetBrains Mono',monospace">
              <div class="ge3d-row">
                <button type="button" class="ge3d-btn" data-sun="now">Сейчас</button>
                <button type="button" class="ge3d-btn" data-sun="-60">−1 ч</button>
                <button type="button" class="ge3d-btn" data-sun="+60">+1 ч</button>
                <button type="button" class="ge3d-btn" data-sun="+360">+6 ч</button>
              </div>
              <div id="ge3d-sun-info" class="ge3d-sec-d" style="font-family:'JetBrains Mono',monospace;color:#cacad2"></div>
            </div>
          </div>

          <div class="ge3d-sec">
            <div style="font:600 11px 'JetBrains Mono',monospace;color:#f3f3f5;margin-bottom:5px">НАСТРОЙКА СЕКТОРА КАМЕРЫ И LOS</div>
            <div class="ge3d-row">
              <label style="font:10.5px 'JetBrains Mono',monospace;color:#a5a5af">Угол камеры° <input id="ge3d-fov-ang" type="number" value="68" min="15" max="160" style="width:54px;height:26px;background:#111116;border:1px solid rgba(205,205,215,.18);color:#fff;padding:0 5px"></label>
              <label style="font:10.5px 'JetBrains Mono',monospace;color:#a5a5af">Дальность, м <input id="ge3d-fov-rng" type="number" value="140" min="20" max="1000" style="width:60px;height:26px;background:#111116;border:1px solid rgba(205,205,215,.18);color:#fff;padding:0 5px"></label>
            </div>
            <div class="ge3d-row" style="margin-top:6px">
              <label style="font:10.5px 'JetBrains Mono',monospace;color:#a5a5af">Наблюд., м <input id="ge3d-obs-h" type="number" value="15" min="0" max="10000" style="width:56px;height:26px;background:#111116;border:1px solid rgba(205,205,215,.18);color:#fff;padding:0 5px"></label>
              <label style="font:10.5px 'JetBrains Mono',monospace;color:#a5a5af">Цель, м <input id="ge3d-tgt-h" type="number" value="2" min="0" max="10000" style="width:54px;height:26px;background:#111116;border:1px solid rgba(205,205,215,.18);color:#fff;padding:0 5px"></label>
            </div>
          </div>

          <div class="ge3d-sec">
            <label class="ge3d-sec-h"><span>Спутники на орбите (CelesTrak)</span><input type="checkbox" data-gly="sat"></label>
            <div class="ge3d-sec-ctl">
              <select id="ge3d-sat-grp">${SAT_GROUPS.map(g => `<option value="${g[0]}">${g[1]}</option>`).join('')}</select>
              <div id="ge3d-sat-st" class="ge3d-sec-d"></div>
            </div>
          </div>

          <div class="ge3d-sec">
            <label class="ge3d-sec-h"><span>Землетрясения USGS (сутки)</span><input type="checkbox" data-gly="quake"></label>
            <div id="ge3d-quake-st" class="ge3d-sec-d"></div>
          </div>

          <div class="ge3d-sec">
            <label class="ge3d-sec-h"><span>Природные события NASA EONET</span><input type="checkbox" data-gly="eonet"></label>
            <div id="ge3d-eonet-st" class="ge3d-sec-d"></div>
          </div>

          <div class="ge3d-sec">
            <label class="ge3d-sec-h"><span>Самолёты ADS-B вокруг центра</span><input type="checkbox" data-gly="air"></label>
            <div id="ge3d-air-st" class="ge3d-sec-d"></div>
          </div>
        </div>
      </aside>

      <div id="ge3d-card" class="ge3d-card hidden"></div>

      <div id="ge3d-street-bar" class="ge3d-street-bar hidden" aria-label="Навигация по улице">
        <span class="ge3d-street-tag">УЛИЦА 3D · WASD + Q/E</span>
        <button type="button" class="ge3d-btn" data-swalk="fwd" title="Шаг вперёд по улице (W / ↑)">↑ Вперёд</button>
        <button type="button" class="ge3d-btn" data-swalk="back" title="Шаг назад (S / ↓)">↓ Назад</button>
        <button type="button" class="ge3d-btn" data-swalk="left" title="Повернуть влево (A / ←)">↺ Влево</button>
        <button type="button" class="ge3d-btn" data-swalk="right" title="Повернуть вправо (D / →)">↻ Вправо</button>
        <button type="button" class="ge3d-btn" data-swalk="down_z" title="Ниже к тротуару (Q)">▼ К дому</button>
        <button type="button" class="ge3d-btn" data-swalk="up_z" title="Выше над крышами (E)">▲ Дрон</button>
        <button type="button" class="ge3d-btn on" data-swalk="ya360" title="Реальные фото улицы 360° в Яндекс.Панорамах">Яндекс 360°</button>
        <button type="button" class="ge3d-btn on" data-swalk="gsv360" title="Реальные фото улицы 360° в Google Street View">Street View 360°</button>
        <button type="button" class="ge3d-btn" data-swalk="pastvu" title="Архивные исторические фотографии этой улицы на PastVu">Ретро-фото</button>
        <button type="button" class="ge3d-btn" data-swalk="up" title="Выйти из режима улицы">✕ Выход</button>
      </div>

      <div id="ge3d-los-box" class="ge3d-los-box hidden">
        <div class="ge3d-los-head"><span id="ge3d-los-verdict">—</span><button id="ge3d-los-x" class="ge3d-card-x" type="button">×</button></div>
        <canvas id="ge3d-los-cv" width="464" height="112" style="width:100%;height:112px;display:block"></canvas>
      </div>
    </div>
    <div class="ge3d-foot">
      <span id="ge3d-status">Инициализация 3D-модуля…</span>
      <span id="ge3d-telem">ЛКМ — перемещение · ПКМ / Ctrl+мышь — наклон 3D · Колесо — приближение вплотную к дому (Z22)</span>
    </div>`;
  document.body.appendChild(root);
  bindUiEvents(root);
}

function setStatus(msg) {
  const el = $('#ge3d-status');
  if (el) el.textContent = msg;
}
function setTelem(msg) {
  const el = $('#ge3d-telem');
  if (el) el.textContent = msg;
}
function updateLayerBadge() {
  const cnt = Object.values(state.layers).filter(Boolean).length + (state.nearbyPts.length ? 1 : 0);
  const el = $('#ge3d-ly-cnt');
  if (el) el.textContent = String(cnt);
}

/* ─────────── Навигация по улице 3D ─────────── */
function stepStreet(act) {
  const c = getCameraCenter();
  const brg = state.mlMap ? state.mlMap.getBearing() : 0;
  if (act === 'ya360') {
    window.open(`https://yandex.ru/maps/?ll=${c.lon.toFixed(6)},${c.lat.toFixed(6)}&z=19&l=stv,sta&panorama%5Bpoint%5D=${c.lon.toFixed(6)},${c.lat.toFixed(6)}&panorama%5Bdirection%5D=${((brg % 360) + 360) % 360},0`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (act === 'gsv360') {
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${c.lat.toFixed(6)},${c.lon.toFixed(6)}&heading=${Math.round(((brg % 360) + 360) % 360)}&pitch=0`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (act === 'pastvu') {
    window.open(`https://pastvu.com/?g=${c.lat.toFixed(5)},${c.lon.toFixed(5)}&z=17`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (act === 'up') {
    state.streetMode = false;
    $('#ge3d-street-btn')?.classList.remove('on');
    $('#ge3d-street-bar')?.classList.add('hidden');
    flyTo(c.lat, c.lon, 15.6, 52);
    setStatus('Возврат к обзору квартала');
    return;
  }
  if (!state.mlMap) return;
  if (act === 'down_z' || act === 'up_z') {
    const nz = clamp(state.mlMap.getZoom() + (act === 'down_z' ? 0.85 : -0.85), 14, 21.6);
    state.mlMap.easeTo({ zoom: nz, pitch: nz >= 18 ? 78 : 62, duration: 240 });
    return;
  }
  if (act === 'left' || act === 'right') {
    state.mlMap.easeTo({ bearing: brg + (act === 'left' ? -26 : 26), duration: 220 });
    return;
  }
  const z = state.mlMap.getZoom();
  const stepM = z >= 19.5 ? 16 : z >= 18 ? 32 : 65;
  const [nLon, nLat] = destPoint(c.lat, c.lon, stepM, act === 'back' ? brg + 180 : brg);
  state.mlMap.easeTo({
    center: [nLon, nLat],
    zoom: Math.max(z, 18.6),
    pitch: Math.max(state.mlMap.getPitch(), 75),
    duration: 260
  });
}

function toggleStreetMode(forceOn) {
  if (state.engine !== 'maplibre') switchEngine('maplibre');
  state.streetMode = typeof forceOn === 'boolean' ? forceOn : !state.streetMode;
  $('#ge3d-street-btn')?.classList.toggle('on', state.streetMode);
  $('#ge3d-street-bar')?.classList.toggle('hidden', !state.streetMode);
  if (state.streetMode) {
    if (!state.buildings3d) {
      state.buildings3d = true;
      $('#ge3d-bldg')?.classList.add('on');
      applyMapLibreBuildings();
    }
    const t = state.selected || getCameraCenter();
    flyTo(t.lat, t.lon, Math.max(t.zoom || 3, 18.9), 77);
    setStatus('Режим 3D-улицы активен · W/A/S/D — шаги и поворот · Q/E — высота камеры · Яндекс 360° и PastVu синхронизированы');
  } else {
    const c = getCameraCenter();
    flyTo(c.lat, c.lon, Math.min(c.zoom || 15.5, 15.5), 52);
    setStatus('Выход из режима 3D-улицы');
  }
}

/* ─────────── Радар объектов рядом (Overpass 3D) ─────────── */
async function scanNearby3D() {
  const catKey = $('#ge3d-near-cat')?.value || 'cams';
  const cat = NEARBY_CATS[catKey] || NEARBY_CATS.cams;
  const stEl = $('#ge3d-near-st');
  const c = state.selected || getCameraCenter();
  if (stEl) stEl.textContent = 'Сканирую OpenStreetMap вокруг точки…';
  setStatus('Радар OSM: ищу «' + cat.label + '» вокруг ' + c.lat.toFixed(4) + ', ' + c.lon.toFixed(4) + '…');
  const q = `[out:json][timeout:14];(${cat.q.replace(/\{lat\}/g, c.lat.toFixed(5)).replace(/\{lon\}/g, c.lon.toFixed(5))});out center 120;`;
  let data = null;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 14000);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(q), signal: ctl.signal });
      clearTimeout(tm);
      if (r.ok) { data = await r.json(); break; }
    } catch (_) {}
  }
  if (!data || !Array.isArray(data.elements)) {
    if (stEl) stEl.textContent = 'Сервер Overpass перегружен — повторите через пару секунд.';
    return;
  }
  state.nearbyPts = data.elements.map(el => {
    const lat = Number(el.lat != null ? el.lat : el.center && el.center.lat);
    const lon = Number(el.lon != null ? el.lon : el.center && el.center.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const t = el.tags || {};
    const isCam = t.man_made === 'surveillance';
    const name = t.name || (isCam ? 'Камера наблюдения' + (t['surveillance:type'] ? ' (' + t['surveillance:type'] + ')' : '') : (t.shop || t.amenity || t.railway || t.highway || 'Объект OSM'));
    const sub = [t['addr:street'], t['addr:housenumber'], t.operator, t.opening_hours].filter(Boolean).join(' · ');
    return { lat, lon: wrapLon(lon), title: (isCam ? '🎥 ' : '◈ ') + name, desc: sub || cat.label, isCam };
  }).filter(Boolean);
  updateLayerBadge();
  refreshOverlays();
  if (stEl) stEl.textContent = state.nearbyPts.length ? `Найдено объектов: ${state.nearbyPts.length} (отмечены на 3D-сцене)` : 'В радиусе 500 м таких отметок в OSM пока нет.';
  if (state.nearbyPts.length) flyTo(c.lat, c.lon, Math.max(getCameraCenter().zoom || 15, 17.2), 62);
}

/* ─────────── Привязка событий UI ─────────── */
function bindUiEvents(root) {
  $('#ge3d-close', root).onclick = close;
  $('#ge3d-engine', root).onchange = e => switchEngine(e.target.value);
  $('#ge3d-base', root).onchange = e => setBasemap(e.target.value);
  $('#ge3d-street-btn', root).onclick = () => toggleStreetMode();
  $('#ge3d-street-bar', root).onclick = e => {
    const b = e.target.closest('[data-swalk]');
    if (b) stepStreet(b.dataset.swalk);
  };
  $('#ge3d-quick-bar', root).onclick = e => {
    const b = e.target.closest('[data-qp]');
    if (!b) return;
    const p = QUICK_PLACES[+b.dataset.qp];
    if (p) {
      flyTo(p.lat, p.lon, p.z, 64);
      selectPoint(p.lat, p.lon, p.label);
    }
  };
  $('#ge3d-near-scan', root).onclick = scanNearby3D;
  $('#ge3d-near-clr', root).onclick = () => {
    state.nearbyPts = [];
    const stEl = $('#ge3d-near-st');
    if (stEl) stEl.textContent = '';
    updateLayerBadge();
    refreshOverlays();
  };
  $('#ge3d-grid', root).onclick = () => {
    state.grid3d = !state.grid3d;
    $('#ge3d-grid').classList.toggle('on', state.grid3d);
    if (state.mlMap) {
      ['grat-lines', 'grat-major'].forEach(id => {
        try { if (state.mlMap.getLayer(id)) state.mlMap.setLayoutProperty(id, 'visibility', state.grid3d ? 'visible' : 'none'); } catch (_) {}
      });
    }
    if (state.tac) state.tac.draw();
    setStatus('Тактическая координатная сетка: ' + (state.grid3d ? 'включена' : 'выключена'));
  };
  $('#ge3d-terrain', root).onclick = () => {
    state.terrain3d = !state.terrain3d;
    $('#ge3d-terrain').classList.toggle('on', state.terrain3d);
    applyMapLibreTerrain();
    setStatus('Горный 3D-рельеф высот: ' + (state.terrain3d ? 'включён' : 'выключен (максимальная чёткость дворов и улиц)'));
  };
  $('#ge3d-bldg', root).onclick = () => {
    state.buildings3d = !state.buildings3d;
    $('#ge3d-bldg').classList.toggle('on', state.buildings3d);
    applyMapLibreBuildings();
    setStatus('3D-здания, дворы и номера домов: ' + (state.buildings3d ? 'включены' : 'скрыты'));
  };
  $('#ge3d-orbit', root).onclick = () => toggleOrbit();
  $('#ge3d-layers-btn', root).onclick = () => {
    state.panelOpen = !state.panelOpen;
    $('#ge3d-drawer').classList.toggle('open', state.panelOpen);
    $('#ge3d-layers-btn').classList.toggle('on', state.panelOpen);
  };
  $('#ge3d-drawer-x', root).onclick = () => {
    state.panelOpen = false;
    $('#ge3d-drawer').classList.remove('open');
    $('#ge3d-layers-btn').classList.remove('on');
  };
  $('#ge3d-shot', root).onclick = exportScreenshot;
  $('#ge3d-north', root).onclick = resetNorth;
  $('#ge3d-sync2d', root).onclick = () => {
    const c = current2DCenter();
    flyTo(c.lat, c.lon, Math.max(c.zoom || 5, 15), 55);
    setStatus('Камера синхронизирована с центром 2D-карты');
  };
  $('#ge3d-clear-draw', root).onclick = () => {
    state.rulerPts = [];
    state.losPts = [];
    state.fovCones = [];
    state.fovStart = null;
    state.nearbyPts = [];
    $('#ge3d-los-box').classList.add('hidden');
    updateLayerBadge();
    refreshOverlays();
    setStatus('Секторы камер, замеры и временные слои очищены');
  };
  $('#ge3d-los-x', root).onclick = () => $('#ge3d-los-box').classList.add('hidden');

  $$('[data-gmode]', root).forEach(b => {
    b.onclick = () => {
      state.mode = b.dataset.gmode;
      state.fovStart = null;
      $$('[data-gmode]', root).forEach(x => x.classList.toggle('on', x === b));
      if (state.mode === 'fov') setStatus('Сектор камеры 3D: кликните 1 — где установлена камера/свидетель, кликните 2 — куда направлен взгляд');
      else if (state.mode === 'ruler') { state.rulerPts = []; setStatus('3D-линейка: кликайте по точкам для расчёта дистанции и азимута'); }
      else if (state.mode === 'los') { state.losPts = []; setStatus('Прямая видимость (LOS): выберите точку наблюдателя A, затем цель B'); }
      else setStatus('Режим точки: кликните по любому дому, двору или улице для GEOINT-разбора');
    };
  });

  $$('[data-pitch]', root).forEach(b => {
    b.onclick = () => setCameraPitch(Number(b.dataset.pitch));
  });

  $$('[data-gly]', root).forEach(chk => {
    chk.onchange = () => {
      const k = chk.dataset.gly;
      state.layers[k] = chk.checked;
      updateLayerBadge();
      onLayerToggle(k, chk.checked);
    };
  });

  $('#ge3d-sat-grp', root).onchange = e => {
    state.satGroup = e.target.value;
    if (state.layers.sat) startSatellites();
  };

  const sunDt = $('#ge3d-sun-dt', root);
  sunDt.onchange = () => {
    state.sunTime = sunDt.value ? new Date(sunDt.value) : null;
    updateSolarOverlay();
  };
  $$('[data-sun]', root).forEach(b => {
    b.onclick = () => {
      const v = b.dataset.sun;
      if (v === 'now') state.sunTime = null;
      else state.sunTime = new Date((state.sunTime || new Date()).getTime() + Number(v) * 60000);
      if (state.sunTime) {
        sunDt.value = new Date(state.sunTime.getTime() - state.sunTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      } else {
        sunDt.value = '';
      }
      updateSolarOverlay();
    };
  });

  $('#ge3d-fov-ang', root).onchange = e => { state.fovAngle = clamp(Number(e.target.value) || 68, 15, 160); };
  $('#ge3d-fov-rng', root).onchange = e => { state.fovRange = clamp(Number(e.target.value) || 140, 20, 1000); };
  $('#ge3d-obs-h', root).onchange = e => { state.obsHeight = Math.max(0, Number(e.target.value) || 0); if (state.losPts.length === 2) computeLOS(state.losPts[0], state.losPts[1]); };
  $('#ge3d-tgt-h', root).onchange = e => { state.tgtHeight = Math.max(0, Number(e.target.value) || 0); if (state.losPts.length === 2) computeLOS(state.losPts[0], state.losPts[1]); };

  bindSearch3D(root);
}

/* ─────────── Умный адресный поиск до НОМЕРА ДОМА (Nominatim + Photon) ─────────── */
async function geocodeSmart(query, signal) {
  const q = String(query || '').trim();
  const out = [];
  const seen = new Set();
  const pushItem = it => {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lon)) return;
    const key = it.lat.toFixed(4) + ':' + it.lon.toFixed(4);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(it);
  };

  // Запрашиваем одновременно Nominatim (лучше всего знает номера домов в РФ/СНГ) и Photon
  const [nomRes, phoRes] = await Promise.allSettled([
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&accept-language=ru&q=${encodeURIComponent(q)}`, { signal }).then(r => r.ok ? r.json() : []),
    fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=ru`, { signal }).then(r => r.ok ? r.json() : {})
  ]);

  if (nomRes.status === 'fulfilled' && Array.isArray(nomRes.value)) {
    nomRes.value.forEach(r => {
      const a = r.address || {};
      const house = a.house_number || '';
      const road = a.road || a.pedestrian || a.street || '';
      const city = a.city || a.town || a.village || a.municipality || a.county || '';
      const isHouse = Boolean(house) || r.category === 'building' || r.type === 'house' || r.type === 'apartments' || r.type === 'yes';
      const isStreet = !isHouse && (r.category === 'highway' || Boolean(road));
      const zoom = isHouse ? 19.0 : isStreet ? 17.2 : (r.type === 'administrative' && r.place_rank <= 12 ? 6.5 : 14.8);
      const tag = isHouse ? (house ? 'ДОМ ' + house : 'ЗДАНИЕ') : isStreet ? 'УЛИЦА' : 'МЕСТО';
      const title = road ? (road + (house ? ', д. ' + house : '')) : (r.name || (r.display_name || '').split(',')[0] || q);
      const sub = [city, a.state, a.country].filter(Boolean).join(', ') || r.display_name || '';
      pushItem({ lat: +r.lat, lon: +r.lon, zoom, tag, title, sub, isHouse });
    });
  }

  if (phoRes.status === 'fulfilled' && phoRes.value && Array.isArray(phoRes.value.features)) {
    phoRes.value.features.forEach(f => {
      const p = f.properties || {}, g = (f.geometry || {}).coordinates || [];
      const house = p.housenumber || '';
      const road = p.street || '';
      const isHouse = Boolean(house) || p.osm_key === 'building';
      const zoom = isHouse ? 19.0 : road ? 17.0 : p.osm_value === 'country' ? 5.0 : 14.8;
      const tag = isHouse ? (house ? 'ДОМ ' + house : 'ЗДАНИЕ') : road ? 'УЛИЦА' : 'МЕСТО';
      const title = road ? (road + (house ? ', д. ' + house : '')) : (p.name || q);
      const sub = [p.city || p.county, p.state, p.country].filter(Boolean).join(', ');
      pushItem({ lat: +g[1], lon: +g[0], zoom, tag, title, sub, isHouse });
    });
  }

  return out.slice(0, 9);
}

function bindSearch3D(root) {
  const inp = $('#ge3d-q', root), box = $('#ge3d-sugg', root), goBtn = $('#ge3d-q-btn', root);
  let timer = 0, ctl = null, items = [];
  const hide = () => box.classList.add('hidden');
  const show = list => {
    items = list;
    box.innerHTML = list.map((x, i) => `<button type="button" data-i="${i}"><span class="sugg-tag">${esc(x.tag || 'ЦЕЛЬ')}</span><b>${esc(x.title)}</b><small>${esc(x.sub || '')}</small></button>`).join('');
    box.classList.toggle('hidden', !list.length);
  };
  const parseAnyCoords = raw => {
    if (window.GE && typeof window.GE.parseCoords === 'function') {
      const c = window.GE.parseCoords(raw);
      if (c) return c;
    }
    const m = String(raw || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lon: +m[2] };
    return null;
  };
  const go = item => {
    hide();
    const z = item.zoom || 17.2;
    const pitch = z >= 18 ? 68 : z >= 15 ? 58 : 38;
    flyTo(item.lat, item.lon, z, pitch);
    selectPoint(item.lat, item.lon, item.title);
  };
  const runSearch = async immediate => {
    const v = inp.value.trim();
    if (!v) return show([]);
    const c = parseAnyCoords(v);
    if (c) {
      const it = { lat: c.lat, lon: c.lon, zoom: 18.2, tag: 'GPS', title: `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`, sub: dms(c.lat, 'N', 'S') + ' ' + dms(c.lon, 'E', 'W') };
      if (immediate) return go(it);
      return show([it]);
    }
    if (!immediate && v.length < 3) return show([]);
    if (ctl) ctl.abort();
    ctl = new AbortController();
    if (immediate) setStatus('Ищу точный адрес и дом: «' + v + '»…');
    try {
      const res = await geocodeSmart(v, ctl.signal);
      if (immediate) {
        if (res.length) go(res[0]);
        else setStatus('Точный дом не найден в OSM — попробуйте формат «Город Улица Номер»');
      } else {
        show(res);
      }
    } catch (_) {}
  };

  inp.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(false), 300);
  });
  goBtn.onclick = () => runSearch(true);
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    if (it) { inp.value = it.title; go(it); }
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); hide(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (items.length) go(items[0]); else runSearch(true); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.ge3d-search-wrap')) hide(); });
}

/* ─────────── Получение точек базы GOD EYE ─────────── */
function getDbPoints() {
  const geo = window.GE && window.GE.geo;
  const dbPts = geo && typeof geo.points === 'function' ? geo.points() : [];
  const list = dbPts.slice(0, 1500).map(r => ({
    id: r.id,
    lat: Number(r.lat),
    lon: wrapLon(r.lon),
    title: String(r.title || 'Локация'),
    sub: (window.GE && window.GE.recSub ? window.GE.recSub(r) : '') || '',
    kind: r.type || 'geo'
  })).filter(p => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90);
  state.tempPoints.forEach((p, idx) => {
    if (Number.isFinite(+p.lat) && Number.isFinite(+p.lon)) {
      list.push({ id: null, lat: +p.lat, lon: wrapLon(p.lon), title: p.title || ('Цель #' + (idx + 1)), sub: p.sub || 'Временная цель', kind: 'tmp' });
    }
  });
  return list;
}

function renderPointsSidebar(pts) {
  const box = $('#ge3d-pts-list');
  if (!box) return;
  if (!pts.length) {
    box.innerHTML = '<div style="font:11px IBM Plex Sans,sans-serif;color:#6f6f7a">В базе пока нет локаций с координатами</div>';
    return;
  }
  box.innerHTML = pts.slice(0, 60).map((p, i) => `<button type="button" data-pi="${i}" title="${esc(p.title)} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})">${p.kind === 'tmp' ? '◇ ' : '● '}${esc(p.title)}</button>`).join('');
  box.onclick = e => {
    const b = e.target.closest('[data-pi]');
    if (!b) return;
    const p = pts[+b.dataset.pi];
    if (p) {
      flyTo(p.lat, p.lon, 18.2, 64);
      selectPoint(p.lat, p.lon, p.title, p.id);
    }
  };
}

function current2DCenter() {
  const geo = window.GE && window.GE.geo;
  if (geo && geo.map) {
    const c = geo.map.getCenter();
    return { lat: c.lat, lon: wrapLon(c.lng), zoom: clamp(geo.map.getZoom(), 2, 19) };
  }
  return { lat: 55.7539, lon: 37.6208, zoom: 3.6 };
}

let _graticuleCache = null;
function buildGraticuleGeoJSON() {
  if (_graticuleCache) return _graticuleCache;
  const feats = [];
  for (let lat = -75; lat <= 75; lat += 15) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, lat]);
    feats.push({ type: 'Feature', properties: { major: lat === 0 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const coords = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lon, lat]);
    feats.push({ type: 'Feature', properties: { major: lon === 0 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
  }
  _graticuleCache = { type: 'FeatureCollection', features: feats };
  return _graticuleCache;
}

/* ═══════════════════════════════════════════════════════════════
   ДВИЖОК 1: MapLibre GL JS v5 — СИНХРОННЫЙ ВЕКТОРНЫЙ 3D-ГОРОД ДО Z22
   Никаких асинхронных гонок: векторные дворы, улицы, 3D-дома и номера домов
   встроены прямо в базовый стиль и работают мгновенно на любой подложке!
   ═══════════════════════════════════════════════════════════════ */
const CITY_VECTOR_IDS = ['ge3d-buildings'];

function buildMapLibreStyle(baseKey) {
  const cfg = BASEMAPS[baseKey] || BASEMAPS.hybrid;
  const pureMode = cfg.pureVector; // 'dark' | 'light' | undefined
  const isLight = pureMode === 'light' || baseKey === 'voyager' || baseKey === 'topo';
  const bldgVis = state.buildings3d ? 'visible' : 'none';

  const sources = {
    'ofm-planet': { type: 'vector', url: OFM_PLANET },
    graticuleGeo: { type: 'geojson', data: buildGraticuleGeoJSON() },
    terminator: { type: 'geojson', data: buildTerminatorGeoJSON(state.sunTime) },
    dbGeo: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    overlaysGeo: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    measureGeo: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  };

  if (!pureMode && cfg.tiles) {
    sources.base = {
      type: 'raster',
      tiles: cfg.tiles,
      tileSize: 256,
      maxzoom: cfg.maxZoom || 18,
      attribution: cfg.attr
    };
  }
  if (state.terrain3d) {
    sources.terrainDem = {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 14,
      encoding: 'terrarium'
    };
  }

  const layers = [
    { id: 'bg', type: 'background', paint: { 'background-color': pureMode === 'light' ? '#e8e8ee' : '#060609' } }
  ];

  // Если выбрана растровая/спутниковая подложка — кладём её вниз
  if (!pureMode && cfg.tiles) {
    layers.push({
      id: 'base-tiles',
      type: 'raster',
      source: 'base',
      paint: { 'raster-fade-duration': 90 }
    });
    (cfg.overlays || []).forEach((u, idx) => {
      const sid = 'ov-' + idx;
      sources[sid] = { type: 'raster', tiles: [u], tileSize: 256, maxzoom: 19 };
      layers.push({ id: 'ov-ly-' + idx, type: 'raster', source: sid, paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 80 } });
    });
  }

  // Если выбран ЧИСТЫЙ ВЕКТОРНЫЙ 3D-ГОРОД (0% растра — 0% белых блоков на любом масштабе Z0..Z22!)
  if (pureMode) {
    layers.push(
      {
        id: 'ofm-landuse',
        type: 'fill',
        source: 'ofm-planet',
        'source-layer': 'landuse',
        paint: {
          'fill-color': pureMode === 'light' ? '#dfe0e6' : '#0c0c11',
          'fill-opacity': 0.75
        }
      },
      {
        id: 'ofm-park',
        type: 'fill',
        source: 'ofm-planet',
        'source-layer': 'park',
        paint: {
          'fill-color': pureMode === 'light' ? '#d4d6de' : '#101216',
          'fill-opacity': 0.8
        }
      },
      {
        id: 'ofm-water',
        type: 'fill',
        source: 'ofm-planet',
        'source-layer': 'water',
        paint: { 'fill-color': pureMode === 'light' ? '#b8bcc8' : '#12080b' }
      },
      {
        id: 'ofm-waterway',
        type: 'line',
        source: 'ofm-planet',
        'source-layer': 'waterway',
        paint: {
          'line-color': pureMode === 'light' ? '#9fa5b5' : '#3a1218',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 16, 3.5]
        }
      },
      {
        id: 'ofm-borders',
        type: 'line',
        source: 'ofm-planet',
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 4],
        paint: {
          'line-color': pureMode === 'light' ? '#8b8b96' : 'rgba(226,35,46,0.42)',
          'line-width': ['case', ['==', ['get', 'admin_level'], 2], 1.4, 0.7]
        }
      }
    );
  }

  // Векторная дорожная сеть, дворы, тропинки, ЖД, 3D-здания и номера домов (работают и в чистом векторе, и поверх спутника!)
  const roadMinZ = pureMode ? 5 : 13.5;
  layers.push(
    // Контур улиц для контраста на спутнике и схеме
    {
      id: 'ge3d-vec-roads-casing',
      type: 'line',
      source: 'ofm-planet',
      'source-layer': 'transportation',
      minzoom: pureMode ? 11 : 14,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'street']]],
      paint: {
        'line-color': pureMode === 'light' ? '#b8b8c4' : 'rgba(5,5,8,0.82)',
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1.8, 16, 5.5, 20, 22]
      }
    },
    // Полотно улиц и внутридворовых проездов
    {
      id: 'ge3d-vec-roads',
      type: 'line',
      source: 'ofm-planet',
      'source-layer': 'transportation',
      minzoom: roadMinZ,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'street']]],
      paint: {
        'line-color': pureMode === 'light'
          ? ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#ffffff', '#f5f5f8']
          : pureMode === 'dark'
            ? ['match', ['get', 'class'], ['motorway', 'trunk'], '#52151b', ['primary', 'secondary'], '#2c2c36', '#1d1d25']
            : 'rgba(243,243,245,0.48)',
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 0.5, 12, 1.2, 16, 3.8, 20, 17]
      }
    },
    // Дворовые тропинки, пешеходные проходы, лестницы и подходы к подъездам
    {
      id: 'ge3d-vec-paths',
      type: 'line',
      source: 'ofm-planet',
      'source-layer': 'transportation',
      minzoom: 15.2,
      filter: ['in', ['get', 'class'], ['literal', ['path', 'footway', 'pedestrian', 'steps', 'track']]],
      paint: {
        'line-color': isLight ? '#b3121b' : 'rgba(226,35,46,0.68)',
        'line-dasharray': [2, 2],
        'line-width': ['interpolate', ['linear'], ['zoom'], 15.2, 1.0, 20, 3.2]
      }
    },
    // Железные дороги
    {
      id: 'ge3d-vec-rail',
      type: 'line',
      source: 'ofm-planet',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'rail'],
      paint: {
        'line-color': isLight ? '#666672' : 'rgba(202,202,210,0.45)',
        'line-dasharray': [3, 3],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 18, 2.4]
      }
    },
    // Чёткий 2D-фундамент каждого дома (виден даже при взгляде сверху 0°)
    {
      id: 'ge3d-vec-bldg-flat',
      type: 'fill',
      source: 'ofm-planet',
      'source-layer': 'building',
      minzoom: 13.2,
      paint: {
        'fill-color': pureMode === 'light' ? '#d0d1da' : '#1b1b23',
        'fill-outline-color': isLight ? '#8b0000' : 'rgba(226,35,46,0.55)',
        'fill-opacity': pureMode ? 0.92 : 0.35
      }
    },
    // Объёмные 3D-здания
    {
      id: 'ge3d-buildings',
      type: 'fill-extrusion',
      source: 'ofm-planet',
      'source-layer': 'building',
      minzoom: 14.2,
      layout: { visibility: bldgVis },
      paint: {
        'fill-extrusion-color': pureMode === 'light'
          ? ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 9], 0, '#d8d8e0', 30, '#c0c0cc', 90, '#a87c82']
          : ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 9], 0, '#1c1c25', 24, '#2c2c38', 75, '#5e171e', 160, '#a6141e'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 9],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': baseKey === 'hybrid' || baseKey === 'sat_hd' ? 0.74 : 0.88
      }
    },
    // Названия улиц и переулков (на русском языке)
    {
      id: 'ge3d-vec-street-lbl',
      type: 'symbol',
      source: 'ofm-planet',
      'source-layer': 'transportation_name',
      minzoom: pureMode ? 12.5 : 14.2,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 18, 14, 21, 16.5]
      },
      paint: {
        'text-color': pureMode === 'light' ? '#121217' : '#ffffff',
        'text-halo-color': pureMode === 'light' ? '#ffffff' : '#050508',
        'text-halo-width': 2.0
      }
    },
    // НОМЕРА ДОМОВ (включаются уже с Z15.6 — крупно и разборчиво над каждым зданием!)
    {
      id: 'ge3d-vec-housenum',
      type: 'symbol',
      source: 'ofm-planet',
      'source-layer': 'housenumber',
      minzoom: 15.6,
      layout: {
        'text-field': ['get', 'housenumber'],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 15.6, 10, 18.5, 13.5, 21, 16],
        'text-allow-overlap': ['step', ['zoom'], false, 18.2, true]
      },
      paint: {
        'text-color': pureMode === 'light' ? '#8b0000' : '#ff9ca1',
        'text-halo-color': pureMode === 'light' ? '#ffffff' : '#050508',
        'text-halo-width': 2.0
      }
    },
    // Значимые объекты в домах (магазины, школы, больницы, аптеки, кафе)
    {
      id: 'ge3d-vec-poi',
      type: 'symbol',
      source: 'ofm-planet',
      'source-layer': 'poi',
      minzoom: 16.6,
      layout: {
        'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10.5,
        'text-offset': [0, 0.8]
      },
      paint: {
        'text-color': pureMode === 'light' ? '#33333d' : '#cacad2',
        'text-halo-color': pureMode === 'light' ? '#ffffff' : '#050508',
        'text-halo-width': 1.5
      }
    },
    // Названия городов, посёлков, районов и сёл (чтобы Майский и любой город были подписаны всегда)
    {
      id: 'ge3d-vec-places',
      type: 'symbol',
      source: 'ofm-planet',
      'source-layer': 'place',
      minzoom: pureMode ? 2 : 9,
      maxzoom: 16.5,
      layout: {
        'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['match', ['get', 'class'], 'country', 13, 'city', 13.5, 'town', 12, 10.5]
      },
      paint: {
        'text-color': pureMode === 'light' ? '#111116' : '#f3f3f5',
        'text-halo-color': pureMode === 'light' ? '#ffffff' : '#050508',
        'text-halo-width': 2.0
      }
    }
  );

  // Координатная сетка OSINT
  layers.push(
    {
      id: 'grat-lines',
      type: 'line',
      source: 'graticuleGeo',
      filter: ['==', ['get', 'major'], 0],
      layout: { visibility: state.grid3d ? 'visible' : 'none' },
      paint: { 'line-color': isLight ? '#555562' : '#cacad2', 'line-width': 0.7, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.18, 7, 0.09, 12, 0] }
    },
    {
      id: 'grat-major',
      type: 'line',
      source: 'graticuleGeo',
      filter: ['==', ['get', 'major'], 1],
      layout: { visibility: state.grid3d ? 'visible' : 'none' },
      paint: { 'line-color': '#e2232e', 'line-width': 1.1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.36, 8, 0.15, 13, 0], 'line-dasharray': [3, 3] }
    }
  );

  // Солнечный терминатор
  layers.push(
    {
      id: 'term-night',
      type: 'fill',
      source: 'terminator',
      filter: ['==', ['get', 'kind'], 'night'],
      layout: { visibility: state.layers.terminator ? 'visible' : 'none' },
      paint: { 'fill-color': '#020204', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.42, 12, 0.14, 15, 0.03] }
    },
    {
      id: 'term-line',
      type: 'line',
      source: 'terminator',
      filter: ['==', ['get', 'kind'], 'line'],
      layout: { visibility: state.layers.terminator ? 'visible' : 'none' },
      paint: { 'line-color': '#e2232e', 'line-width': 1.4, 'line-opacity': 0.65, 'line-dasharray': [3, 3] }
    },
    {
      id: 'term-sun',
      type: 'circle',
      source: 'terminator',
      filter: ['==', ['get', 'kind'], 'sun'],
      layout: { visibility: state.layers.terminator ? 'visible' : 'none' },
      paint: { 'circle-radius': 6, 'circle-color': '#f3f3f5', 'circle-stroke-color': '#e2232e', 'circle-stroke-width': 2 }
    }
  );

  // Секторы обзора камер (полигоны), линейка и луч тени
  layers.push(
    {
      id: 'ms-polys',
      type: 'fill',
      source: 'measureGeo',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#e2232e', 'fill-opacity': 0.24 }
    },
    {
      id: 'ms-lines',
      type: 'line',
      source: 'measureGeo',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#e2232e'],
        'line-width': ['coalesce', ['get', 'width'], 2.4],
        'line-opacity': 0.95
      }
    },
    {
      id: 'ms-pts',
      type: 'circle',
      source: 'measureGeo',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5.5,
        'circle-color': ['coalesce', ['get', 'color'], '#ffffff'],
        'circle-stroke-color': '#e2232e',
        'circle-stroke-width': 2
      }
    }
  );

  // Живые слои + объекты радара OSM рядом
  layers.push(
    {
      id: 'ov-tracks',
      type: 'line',
      source: 'overlaysGeo',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': ['coalesce', ['get', 'color'], '#e2232e'], 'line-width': 1.8, 'line-dasharray': [2, 3], 'line-opacity': 0.85 }
    },
    {
      id: 'ov-points',
      type: 'circle',
      source: 'overlaysGeo',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['coalesce', ['get', 'radius'], 5.5],
        'circle-color': ['coalesce', ['get', 'color'], '#e2232e'],
        'circle-stroke-color': ['coalesce', ['get', 'stroke'], '#ffffff'],
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.95
      }
    },
    {
      id: 'ov-lbl',
      type: 'symbol',
      source: 'overlaysGeo',
      minzoom: 15,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'title'],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': 10.5,
        'text-offset': [0, 1.15],
        'text-anchor': 'top'
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#050508', 'text-halo-width': 1.6 }
    }
  );

  // Точки базы GOD EYE
  layers.push(
    {
      id: 'db-pts',
      type: 'circle',
      source: 'dbGeo',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5.5, 14, 7.5, 18, 9.5],
        'circle-color': ['case', ['==', ['get', 'kind'], 'tmp'], '#f3f3f5', '#e2232e'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    },
    {
      id: 'db-lbl',
      type: 'symbol',
      source: 'dbGeo',
      minzoom: 4,
      layout: {
        'text-field': ['get', 'title'],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.25],
        'text-anchor': 'top',
        'text-max-width': 14
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#050508', 'text-halo-width': 1.7 }
    }
  );

  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    projection: { type: 'globe' }, // MapLibre v5 плавно переводит сферу в плоский город на Z11–Z12 без искажений!
    sky: {
      'sky-color': '#040406',
      'horizon-color': '#7a0c13',
      'fog-color': '#09090d',
      'sky-horizon-blend': 0.72,
      'horizon-fog-blend': 0.82,
      'fog-ground-blend': 0.45,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.7, 9, 0.15, 11, 0]
    },
    terrain: state.terrain3d ? { source: 'terrainDem', exaggeration: 1.35 } : undefined,
    sources,
    layers
  };
}

function applyMapLibreTerrain() {
  const map = state.mlMap;
  if (!map) return;
  try {
    if (state.terrain3d) {
      if (!map.getSource('terrainDem')) {
        map.addSource('terrainDem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 14,
          encoding: 'terrarium'
        });
      }
      map.setTerrain({ source: 'terrainDem', exaggeration: 1.35 });
    } else {
      map.setTerrain(null);
    }
  } catch (_) {}
}

function applyMapLibreBuildings() {
  const map = state.mlMap;
  if (!map) return;
  CITY_VECTOR_IDS.forEach(id => {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.buildings3d ? 'visible' : 'none');
    } catch (_) {}
  });
}

async function initMapLibreEngine(center) {
  const maplibregl = await loadMapLibre();
  const container = $('#ge3d-scene');
  container.innerHTML = '';
  const map = state.mlMap = new maplibregl.Map({
    container,
    style: buildMapLibreStyle(state.base),
    center: [center.lon, center.lat],
    zoom: center.zoom || 3.2,
    pitch: center.pitch != null ? center.pitch : 36,
    bearing: 0,
    maxPitch: 83,
    minZoom: 0.8,
    maxZoom: 22,
    fadeDuration: 80,
    attributionControl: { compact: true },
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'bottom-right');

  const syncAllData = () => {
    try { map.setProjection({ type: 'globe' }); } catch (_) {}
    refreshDbMarkers();
    refreshOverlays();
    updateSolarOverlay();
    updateCameraHud();
  };

  map.on('load', () => {
    syncAllData();
    setStatus('3D-глобус готов · приблизьте любой дом вплотную (до Z22) или нажмите «🚶 Улица 3D»');
  });

  map.on('style.load', syncAllData);
  map.on('move', updateCameraHud);

  map.on('click', e => {
    if (!e.lngLat) return;
    if (state.mode === 'pick') {
      const checkLayers = ['db-pts', 'ov-points'].filter(id => { try { return Boolean(map.getLayer(id)); } catch (_) { return false; } });
      if (checkLayers.length) {
        const feats = map.queryRenderedFeatures(e.point, { layers: checkLayers });
        if (feats && feats.length) {
          const p = feats[0].properties || {};
          const g = feats[0].geometry && feats[0].geometry.coordinates;
          if (g) {
            selectPoint(g[1], g[0], p.title || 'Объект', p.id || null, p.desc || '');
            return;
          }
        }
      }
    }
    handleGlobeClick(e.lngLat.lat, wrapLon(e.lngLat.lng));
  });

  ['db-pts', 'ov-points'].forEach(ly => {
    map.on('mouseenter', ly, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', ly, () => { map.getCanvas().style.cursor = ''; });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ДВИЖОК 2: CesiumJS 3D (орбитальный глобус без 403-тайлов)
   ═══════════════════════════════════════════════════════════════ */
function makeCesiumProvider(Cesium, url, maxLevel, credit) {
  return new Cesium.UrlTemplateImageryProvider({
    url,
    maximumLevel: maxLevel || 18,
    enablePickFeatures: false,
    credit: credit || 'GOD EYE'
  });
}

function applyCesiumBase() {
  const viewer = state.csViewer, Cesium = window.Cesium;
  if (!viewer || !Cesium) return;
  const cfg = BASEMAPS[state.base] || BASEMAPS.hybrid;
  const tileUrl = cfg.cesiumTiles || (cfg.tiles && cfg.tiles[0]) || ESRI_TILE('World_Imagery');
  viewer.imageryLayers.removeAll(true);
  viewer.imageryLayers.addImageryProvider(makeCesiumProvider(Cesium, tileUrl, Math.min(cfg.maxZoom || 18, 19), cfg.attr));
  viewer.scene.requestRender();
}

async function initCesiumEngine(center) {
  const Cesium = await loadCesium();
  const container = $('#ge3d-scene');
  container.innerHTML = '';
  const viewer = state.csViewer = new Cesium.Viewer(container, {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    scene3DOnly: true, baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    shouldAnimate: true,
    contextOptions: { webgl: { preserveDrawingBuffer: true } }
  });
  viewer.scene.globe.enableLighting = state.layers.terminator;
  viewer.scene.globe.showGroundAtmosphere = true;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.hueShift = -0.58;
    viewer.scene.skyAtmosphere.saturationShift = -0.35;
    viewer.scene.skyAtmosphere.brightnessShift = -0.25;
  }
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#060609');
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 42000000;

  applyCesiumBase();
  const height = Math.max(900, 22000000 / Math.pow(2, Math.max(0, (center.zoom || 3) - 1.5)));
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, height),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-72), roll: 0 }
  });

  viewer.screenSpaceEventHandler.setInputAction(mv => {
    const picked = viewer.scene.pick(mv.position);
    if (picked && picked.id && picked.id._geMeta) {
      const m = picked.id._geMeta;
      selectPoint(m.lat, m.lon, m.title, m.id, m.desc);
      return;
    }
    const pt = viewer.camera.pickEllipsoid(mv.position, viewer.scene.globe.ellipsoid);
    if (!pt) return;
    const carto = Cesium.Cartographic.fromCartesian(pt);
    handleGlobeClick(Cesium.Math.toDegrees(carto.latitude), wrapLon(Cesium.Math.toDegrees(carto.longitude)));
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  viewer.camera.changed.addEventListener(updateCameraHud);
  refreshDbMarkers();
  refreshOverlays();
  updateSolarOverlay();
  setStatus('CesiumJS 3D активен · для детального осмотра улиц и домов рекомендуем движок MapLibre 3D');
}

/* ═══════════════════════════════════════════════════════════════
   ДВИЖОК 3: Автономный тактический 3D-холст (100% офлайн)
   ═══════════════════════════════════════════════════════════════ */
function initTacticalEngine(center) {
  const container = $('#ge3d-scene');
  container.innerHTML = '<canvas id="ge3d-tac-cv" style="width:100%;height:100%;display:block;cursor:grab"></canvas>';
  const cv = $('#ge3d-tac-cv', container);
  const T = state.tac = {
    cv,
    lat: center.lat || 45,
    lon: center.lon || 37,
    scale: Math.pow(1.32, clamp((center.zoom || 3) - 2.5, -1, 10)),
    drag: null
  };

  const project = (lat, lon, W, H, R) => {
    const phi = lat * RAD, lam = lon * RAD, phi0 = T.lat * RAD, lam0 = T.lon * RAD;
    const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam - lam0);
    const x = R * Math.cos(phi) * Math.sin(lam - lam0);
    const y = R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam - lam0));
    return { x: W / 2 + x, y: H / 2 - y, vis: cosc >= 0 };
  };

  const unproject = (px, py, W, H, R) => {
    const x = px - W / 2, y = H / 2 - py;
    const rho = Math.hypot(x, y);
    if (rho > R) return null;
    const c = Math.asin(clamp(rho / R, -1, 1));
    const cosc = Math.cos(c), sinc = Math.sin(c);
    const phi0 = T.lat * RAD, lam0 = T.lon * RAD;
    const lat = rho < 1e-6 ? T.lat : Math.asin(cosc * Math.sin(phi0) + (y * sinc * Math.cos(phi0)) / rho) * DEG;
    const lon = wrapLon((lam0 + Math.atan2(x * sinc, rho * Math.cos(phi0) * cosc - y * Math.sin(phi0) * sinc)) * DEG);
    return { lat, lon };
  };

  T.draw = () => {
    if (!state.tac || state.engine !== 'tactical') return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 800, H = cv.clientHeight || 600;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#040406'; g.fillRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.41 * T.scale;
    const halo = g.createRadialGradient(W / 2, H / 2, R * 0.92, W / 2, H / 2, R * 1.12);
    halo.addColorStop(0, 'rgba(179,18,27,0.34)'); halo.addColorStop(1, 'rgba(4,4,6,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(W / 2, H / 2, R * 1.12, 0, Math.PI * 2); g.fill();
    const sph = g.createRadialGradient(W / 2 - R * 0.28, H / 2 - R * 0.28, R * 0.08, W / 2, H / 2, R);
    sph.addColorStop(0, '#16161d'); sph.addColorStop(0.75, '#0b0b10'); sph.addColorStop(1, '#050508');
    g.save(); g.beginPath(); g.arc(W / 2, H / 2, R, 0, Math.PI * 2); g.fillStyle = sph; g.fill(); g.clip();

    if (state.grid3d) {
      g.strokeStyle = 'rgba(205,205,215,0.11)'; g.lineWidth = 0.8;
      for (let lat = -75; lat <= 75; lat += 15) {
        g.beginPath(); let pen = false;
        for (let lon = -180; lon <= 180; lon += 4) { const p = project(lat, lon, W, H, R); if (p.vis) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; }
        g.stroke();
      }
      for (let lon = -180; lon < 180; lon += 15) {
        g.beginPath(); let pen = false;
        for (let lat = -85; lat <= 85; lat += 4) { const p = project(lat, lon, W, H, R); if (p.vis) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; }
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(218,218,228,0.44)'; g.lineWidth = 1.1;
    LAND_LOOPS.forEach(loop => {
      g.beginPath(); let pen = false;
      loop.forEach(([lon, lat]) => { const p = project(lat, lon, W, H, R); if (p.vis) { pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; } else pen = false; });
      g.stroke();
    });
    if (state.layers.db) {
      getDbPoints().forEach(pt => {
        const p = project(pt.lat, pt.lon, W, H, R); if (!p.vis) return;
        g.fillStyle = '#e2232e'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(p.x, p.y, 4.8, 0, Math.PI * 2); g.fill(); g.stroke();
      });
    }
    if (state.selected) {
      const p = project(state.selected.lat, state.selected.lon, W, H, R);
      if (p.vis) {
        g.fillStyle = '#ff2e3b'; g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(226,35,46,0.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(W / 2, H / 2, R, 0, Math.PI * 2); g.stroke();
    updateCameraHud();
  };

  cv.onmousedown = e => { T.drag = { x: e.clientX, y: e.clientY, lat: T.lat, lon: T.lon, moved: false }; cv.style.cursor = 'grabbing'; };
  window.addEventListener('mousemove', T.onMove = e => {
    if (!T.drag) return;
    const dx = e.clientX - T.drag.x, dy = e.clientY - T.drag.y;
    if (Math.hypot(dx, dy) > 4) T.drag.moved = true;
    const k = 0.28 / T.scale;
    T.lon = wrapLon(T.drag.lon - dx * k); T.lat = clamp(T.drag.lat + dy * k, -85, 85);
    T.draw();
  });
  window.addEventListener('mouseup', T.onUp = e => {
    if (!T.drag) return;
    const wasMoved = T.drag.moved; T.drag = null; cv.style.cursor = 'grab';
    if (!wasMoved && e.target === cv) {
      const rect = cv.getBoundingClientRect();
      const W = cv.clientWidth, H = cv.clientHeight, R = Math.min(W, H) * 0.41 * T.scale;
      const ll = unproject(e.clientX - rect.left, e.clientY - rect.top, W, H, R);
      if (ll) handleGlobeClick(ll.lat, ll.lon);
    }
  });
  cv.onwheel = e => { e.preventDefault(); T.scale = clamp(T.scale * (e.deltaY < 0 ? 1.15 : 0.87), 0.55, 16); T.draw(); };
  T.draw();
  setStatus('Автономный тактический 3D-глобус активен (офлайн)');
}

/* ─────────── Управление движками и камерой ─────────── */
function destroyEngines() {
  state.mlMarkers.forEach(m => { try { m.remove(); } catch (_) {} });
  state.mlMarkers = [];
  if (state.mlMap) { try { state.mlMap.remove(); } catch (_) {} state.mlMap = null; }
  if (state.csViewer) { try { state.csViewer.destroy(); } catch (_) {} state.csViewer = null; }
  state.csEntities = [];
  if (state.tac) {
    window.removeEventListener('mousemove', state.tac.onMove);
    window.removeEventListener('mouseup', state.tac.onUp);
    state.tac = null;
  }
}

function getCameraCenter() {
  if (state.mlMap) {
    const c = state.mlMap.getCenter();
    return { lat: c.lat, lon: wrapLon(c.lng), zoom: state.mlMap.getZoom(), pitch: state.mlMap.getPitch() };
  }
  if (state.csViewer && window.Cesium) {
    const carto = state.csViewer.camera.positionCartographic;
    const h = carto.height || 10000000;
    const zoom = clamp(Math.log2(22000000 / Math.max(200, h)) + 1.5, 1, 19);
    return { lat: carto.latitude * DEG, lon: wrapLon(carto.longitude * DEG), zoom, pitch: 35 };
  }
  if (state.tac) return { lat: state.tac.lat, lon: state.tac.lon, zoom: 3.2, pitch: 0 };
  return current2DCenter();
}

async function switchEngine(eng, targetCenter) {
  const center = targetCenter || getCameraCenter();
  destroyEngines();
  state.engine = eng;
  const sel = $('#ge3d-engine');
  if (sel) sel.value = eng;
  ['#ge3d-terrain', '#ge3d-bldg', '#ge3d-street-btn'].forEach(id => {
    const el = $(id);
    if (el) el.style.display = eng === 'maplibre' ? 'inline-flex' : 'none';
  });
  if (eng !== 'maplibre') {
    state.streetMode = false;
    $('#ge3d-street-bar')?.classList.add('hidden');
  }

  try {
    if (eng === 'maplibre') await initMapLibreEngine(center);
    else if (eng === 'cesium') await initCesiumEngine(center);
    else initTacticalEngine(center);
  } catch (err) {
    if (eng !== 'tactical') {
      toast('Переключаю на автономный 3D-холст (' + (err.message || 'WebGL недоступен') + ')', { type: 'warn', timeout: 5000 });
      state.engine = 'tactical';
      if (sel) sel.value = 'tactical';
      initTacticalEngine(center);
    }
  }
}

function setBasemap(key) {
  if (!BASEMAPS[key]) return;
  state.base = key;
  const sel = $('#ge3d-base');
  if (sel) sel.value = key;
  if (state.mlMap) {
    state.mlMap.setStyle(buildMapLibreStyle(key));
    setStatus('Подложка: ' + BASEMAPS[key].label);
  } else if (state.csViewer) {
    applyCesiumBase();
    setStatus('Подложка: ' + BASEMAPS[key].label);
  } else if (state.tac) {
    state.tac.draw();
  }
}

function flyTo(lat, lon, zoom, pitch) {
  lat = clamp(Number(lat) || 0, -85, 85);
  lon = wrapLon(lon);
  if (state.mlMap) {
    state.mlMap.flyTo({
      center: [lon, lat],
      zoom: zoom != null ? zoom : Math.max(state.mlMap.getZoom(), 15),
      pitch: pitch != null ? pitch : state.mlMap.getPitch(),
      duration: 1200,
      essential: true
    });
  } else if (state.csViewer && window.Cesium) {
    const z = zoom != null ? zoom : 14;
    const height = Math.max(400, 22000000 / Math.pow(2, Math.max(0, z - 1.5)));
    state.csViewer.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromDegrees(lon, lat, height),
      orientation: { heading: 0, pitch: window.Cesium.Math.toRadians(-(90 - clamp(pitch || 24, 0, 75))), roll: 0 },
      duration: 1.25
    });
  } else if (state.tac) {
    state.tac.lat = lat; state.tac.lon = lon;
    if (zoom != null) state.tac.scale = clamp(Math.pow(1.26, zoom - 2.5), 0.7, 14);
    state.tac.draw();
  }
}

function setCameraPitch(deg) {
  if (state.mlMap) state.mlMap.easeTo({ pitch: clamp(deg, 0, 82), duration: 550 });
  else if (state.csViewer && window.Cesium) { const c = getCameraCenter(); flyTo(c.lat, c.lon, Math.max(c.zoom, 11), deg); }
}

function resetNorth() {
  if (state.mlMap) state.mlMap.easeTo({ bearing: 0, duration: 480 });
  else if (state.csViewer && window.Cesium) state.csViewer.camera.flyTo({ destination: state.csViewer.camera.positionWC, orientation: { heading: 0, pitch: state.csViewer.camera.pitch, roll: 0 }, duration: 0.5 });
}

function toggleOrbit(forceOff) {
  state.orbit = forceOff ? false : !state.orbit;
  const btn = $('#ge3d-orbit');
  if (btn) btn.classList.toggle('on', state.orbit);
  cancelAnimationFrame(state.orbitRaf);
  if (!state.orbit) return;
  let last = performance.now();
  const step = now => {
    if (!state.orbit || !state.open) return;
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (state.mlMap) {
      const z = state.mlMap.getZoom();
      if (z < 5.5) {
        const c = state.mlMap.getCenter();
        state.mlMap.jumpTo({ center: [wrapLon(c.lng + dt * 7.5), c.lat] });
      } else {
        state.mlMap.rotateTo((state.mlMap.getBearing() + dt * 12) % 360, { duration: 0 });
      }
    } else if (state.csViewer && window.Cesium) {
      state.csViewer.scene.camera.rotate(window.Cesium.Cartesian3.UNIT_Z, -dt * 0.14);
    } else if (state.tac) {
      state.tac.lon = wrapLon(state.tac.lon + dt * 10);
      state.tac.draw();
    }
    state.orbitRaf = requestAnimationFrame(step);
  };
  state.orbitRaf = requestAnimationFrame(step);
}

function updateCameraHud() {
  const c = getCameraCenter();
  const sun = solarInfo(state.sunTime || new Date(), c.lat, c.lon);
  const brg = state.mlMap ? Math.round((state.mlMap.getBearing() + 360) % 360) : 0;
  const pitch = state.mlMap ? Math.round(state.mlMap.getPitch()) : 0;
  setTelem(`${c.lat.toFixed(5)}°, ${c.lon.toFixed(5)}° · Z ${(c.zoom || 3).toFixed(1)}${state.mlMap ? ` · наклон ${pitch}° · курс ${brg}°` : ''} · Солнце ${sun.alt.toFixed(1)}° / тень ${sun.shadowAz.toFixed(0)}°`);
}

/* ─────────── Отрисовка маркеров БД, секторов камер и живых слоёв (БЕЗ блокировок isStyleLoaded!) ─────────── */
function refreshDbMarkers() {
  const pts = getDbPoints();
  renderPointsSidebar(pts);

  state.mlMarkers.forEach(m => { try { m.remove(); } catch (_) {} });
  state.mlMarkers = [];
  if (state.mlMap && window.maplibregl) {
    try {
      const src = state.mlMap.getSource('dbGeo');
      if (src) {
        const dbFeatures = state.layers.db
          ? pts.slice(0, 1200).map(p => ({
              type: 'Feature',
              properties: { id: p.id || '', title: p.title.slice(0, 32), desc: p.sub || '', kind: p.kind || 'geo' },
              geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
            }))
          : [];
        src.setData({ type: 'FeatureCollection', features: dbFeatures });
      }
    } catch (_) {}
    if (state.selected) {
      const el = document.createElement('div');
      el.className = 'ge3d-marker sel';
      state.mlMarkers.push(new window.maplibregl.Marker({ element: el }).setLngLat([state.selected.lon, state.selected.lat]).addTo(state.mlMap));
    }
  }

  if (state.csViewer && window.Cesium) {
    const Cesium = window.Cesium;
    state.csEntities.forEach(en => state.csViewer.entities.remove(en));
    state.csEntities = [];
    if (state.layers.db) {
      pts.slice(0, 1000).forEach(p => {
        const ent = state.csViewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
          point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(p.kind === 'tmp' ? '#f3f3f5' : '#e2232e'), outlineColor: Cesium.Color.WHITE, outlineWidth: 1.6 },
          label: { text: p.title.slice(0, 28), font: '11px JetBrains Mono, monospace', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -16), distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6500000), disableDepthTestDistance: Number.POSITIVE_INFINITY }
        });
        ent._geMeta = { lat: p.lat, lon: p.lon, title: p.title, id: p.id, desc: p.sub };
        state.csEntities.push(ent);
      });
    }
    state.csViewer.scene.requestRender();
  }
  if (state.tac) state.tac.draw();
}

function collectLiveFeatures() {
  const feats = [];
  state.nearbyPts.forEach(n => {
    feats.push({
      type: 'Feature',
      properties: { title: n.title, desc: n.desc, color: n.isCam ? '#ff2e3b' : '#f3f3f5', stroke: n.isCam ? '#ffffff' : '#e2232e', radius: n.isCam ? 7 : 5.5 },
      geometry: { type: 'Point', coordinates: [n.lon, n.lat] }
    });
  });
  if (state.layers.sat && state.satList.length && window.satellite) {
    const now = state.sunTime || new Date();
    state.satList.forEach((s, idx) => {
      try {
        const pv = window.satellite.propagate(s.rec, now);
        if (!pv.position) return;
        const gmst = window.satellite.gstime(now);
        const gd = window.satellite.eciToGeodetic(pv.position, gmst);
        const lat = window.satellite.degreesLat(gd.latitude);
        const lon = window.satellite.degreesLong(gd.longitude);
        const v = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) * 3600 : 0;
        feats.push({
          type: 'Feature',
          properties: { title: '🛰 ' + s.name, desc: `Высота ${Math.round(gd.height)} км · ${Math.round(v)} км/ч · NORAD ${s.id}`, color: idx === 0 ? '#ff3b47' : '#f3f3f5', stroke: '#0a0a0c', radius: idx === 0 ? 6.5 : 4.2 },
          geometry: { type: 'Point', coordinates: [lon, lat] }
        });
        if (idx === 0) {
          const seg = []; let prevLon = null;
          for (let m = 0; m <= 92; m += 2) {
            const d2 = new Date(now.getTime() + m * 60000);
            const pv2 = window.satellite.propagate(s.rec, d2);
            if (!pv2.position) continue;
            const g2 = window.satellite.eciToGeodetic(pv2.position, window.satellite.gstime(d2));
            const lo2 = window.satellite.degreesLong(g2.longitude), la2 = window.satellite.degreesLat(g2.latitude);
            if (prevLon !== null && Math.abs(lo2 - prevLon) > 180) {
              if (seg.length > 1) feats.push({ type: 'Feature', properties: { color: '#ff3b47' }, geometry: { type: 'LineString', coordinates: seg.slice() } });
              seg.length = 0;
            }
            seg.push([lo2, la2]); prevLon = lo2;
          }
          if (seg.length > 1) feats.push({ type: 'Feature', properties: { color: '#ff3b47' }, geometry: { type: 'LineString', coordinates: seg } });
        }
      } catch (_) {}
    });
  }
  if (state.layers.quake) {
    state.quakeData.forEach(q => feats.push({
      type: 'Feature',
      properties: { title: `M${q.mag.toFixed(1)}`, desc: `${q.place} · глубина ${Math.round(q.depth)} км · ${q.time}`, color: '#e2232e', stroke: '#ffffff', radius: clamp(3 + q.mag * 1.4, 4, 14) },
      geometry: { type: 'Point', coordinates: [q.lon, q.lat] }
    }));
  }
  if (state.layers.eonet) {
    state.eonetData.forEach(ev => feats.push({
      type: 'Feature',
      properties: { title: ev.title, desc: `${ev.cat} · ${ev.date}`, color: '#cacad2', stroke: '#e2232e', radius: 5.5 },
      geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] }
    }));
  }
  if (state.layers.air) {
    state.airData.forEach(a => feats.push({
      type: 'Feature',
      properties: { title: `✈ ${a.call}`, desc: `Высота ${a.altM} м · ${a.kmh} км/ч · курс ${a.trk}°`, color: '#f3f3f5', stroke: '#b3121b', radius: 4.5 },
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] }
    }));
  }
  return feats;
}

function buildMeasureFeatures() {
  const feats = [];
  // 3D-секторы обзора камер наблюдения (CCTV / Свидетель)
  state.fovCones.forEach(c => {
    const ring = [[c.origin.lon, c.origin.lat]];
    const half = c.fov / 2;
    for (let i = 0; i <= 24; i++) {
      const ang = c.dirDeg - half + (c.fov * i) / 24;
      ring.push(destPoint(c.origin.lat, c.origin.lon, c.range, ang));
    }
    ring.push([c.origin.lon, c.origin.lat]);
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });
    feats.push({ type: 'Feature', properties: { color: '#ff4b55', width: 2 }, geometry: { type: 'LineString', coordinates: ring } });
    feats.push({ type: 'Feature', properties: { color: '#ffffff' }, geometry: { type: 'Point', coordinates: [c.origin.lon, c.origin.lat] } });
  });
  if (state.fovStart) {
    feats.push({ type: 'Feature', properties: { color: '#ff4b55' }, geometry: { type: 'Point', coordinates: [state.fovStart.lon, state.fovStart.lat] } });
  }

  if (state.rulerPts.length >= 2) {
    feats.push({ type: 'Feature', properties: { color: '#e2232e', width: 2.6 }, geometry: { type: 'LineString', coordinates: state.rulerPts.map(p => [p.lon, p.lat]) } });
  }
  state.rulerPts.forEach(p => feats.push({ type: 'Feature', properties: { color: '#ffffff' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }));

  if (state.losPts.length >= 1) {
    state.losPts.forEach((p, i) => feats.push({ type: 'Feature', properties: { color: i === 0 ? '#ffffff' : '#ff3b47' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }));
    if (state.losPts.length === 2) {
      feats.push({ type: 'Feature', properties: { color: state.losClear === false ? '#8b8b96' : '#f3f3f5', width: 2.4 }, geometry: { type: 'LineString', coordinates: state.losPts.map(p => [p.lon, p.lat]) } });
    }
  }

  if (state.selected && state.layers.terminator) {
    const sh = buildShadowVector(state.selected.lat, state.selected.lon, state.sunTime);
    if (sh) {
      feats.push(
        { type: 'Feature', properties: { color: '#cacad2', width: 1.6 }, geometry: { type: 'LineString', coordinates: sh.sunRay } },
        { type: 'Feature', properties: { color: '#e2232e', width: 3.0 }, geometry: { type: 'LineString', coordinates: sh.shadowLine } }
      );
    }
  }
  return feats;
}

function refreshOverlays() {
  const liveFC = { type: 'FeatureCollection', features: collectLiveFeatures() };
  const msFC = { type: 'FeatureCollection', features: buildMeasureFeatures() };
  if (state.mlMap) {
    try {
      const s1 = state.mlMap.getSource('overlaysGeo'); if (s1) s1.setData(liveFC);
      const s2 = state.mlMap.getSource('measureGeo'); if (s2) s2.setData(msFC);
    } catch (_) {}
  }
  if (state.tac) state.tac.draw();
}

function updateSolarOverlay() {
  const d = state.sunTime || new Date();
  const c = state.selected || getCameraCenter();
  const s = solarInfo(d, c.lat, c.lon);
  const infoEl = $('#ge3d-sun-info');
  if (infoEl) {
    infoEl.textContent = `${d.toISOString().replace('T', ' ').slice(0, 16)} UTC · Солнце ${s.alt.toFixed(1)}° (азимут ${s.az.toFixed(0)}°) · ${s.alt > 0 ? 'тень → ' + s.shadowAz.toFixed(0) + '°' : 'ночь (тени нет)'}`;
  }
  if (state.mlMap) {
    try {
      const src = state.mlMap.getSource('terminator');
      if (src) src.setData(buildTerminatorGeoJSON(d));
      ['term-night', 'term-line', 'term-sun'].forEach(id => {
        if (state.mlMap.getLayer(id)) state.mlMap.setLayoutProperty(id, 'visibility', state.layers.terminator ? 'visible' : 'none');
      });
    } catch (_) {}
  }
  if (state.csViewer && window.Cesium) {
    state.csViewer.scene.globe.enableLighting = state.layers.terminator;
    state.csViewer.clock.currentTime = window.Cesium.JulianDate.fromDate(d);
    state.csViewer.scene.requestRender();
  }
  refreshOverlays();
  if (state.selected) renderSelectedCard();
}

/* ─────────── Клик по сцене, сектор камеры, линейка и LOS ─────────── */
function handleGlobeClick(lat, lon) {
  sfx('click');
  if (state.mode === 'fov') {
    if (!state.fovStart) {
      state.fovStart = { lat, lon };
      refreshOverlays();
      setStatus('Камера установлена — теперь кликните в направлении, куда смотрит объектив / свидетель');
    } else {
      const dirDeg = bearingDeg(state.fovStart, { lat, lon });
      const dist = clamp(Math.round(haversine(state.fovStart, { lat, lon })), 25, 800);
      state.fovCones.push({ origin: state.fovStart, dirDeg, fov: state.fovAngle, range: dist || state.fovRange });
      state.fovStart = null;
      refreshOverlays();
      setStatus(`Сектор обзора камеры построен: курс ${dirDeg.toFixed(0)}°, угол ${state.fovAngle}°, дальность ${dist} м`);
    }
    return;
  }
  if (state.mode === 'ruler') {
    state.rulerPts.push({ lat, lon });
    if (state.rulerPts.length >= 2) {
      let total = 0;
      for (let i = 1; i < state.rulerPts.length; i++) total += haversine(state.rulerPts[i - 1], state.rulerPts[i]);
      const a = state.rulerPts[state.rulerPts.length - 2], b = state.rulerPts[state.rulerPts.length - 1];
      setStatus(`3D-линейка (${state.rulerPts.length} т.): участок ${fmtDist(haversine(a, b))} · азимут ${bearingDeg(a, b).toFixed(1)}° · всего ${fmtDist(total)}`);
    } else {
      setStatus('Точка 1 поставлена — выберите следующую точку');
    }
    refreshOverlays();
    return;
  }
  if (state.mode === 'los') {
    if (state.losPts.length >= 2) state.losPts = [];
    state.losPts.push({ lat, lon });
    refreshOverlays();
    if (state.losPts.length === 1) setStatus(`Наблюдатель A (${lat.toFixed(4)}, ${lon.toFixed(4)}, +${state.obsHeight} м) — выберите точку цели B`);
    else computeLOS(state.losPts[0], state.losPts[1]);
    return;
  }
  selectPoint(lat, lon);
}

async function selectPoint(lat, lon, title, recId, desc) {
  state.selected = { lat: Number(lat), lon: wrapLon(lon), title: title || 'Выбранная точка', id: recId || null, desc: desc || '', elev: null, addr: '' };
  refreshDbMarkers();
  refreshOverlays();
  renderSelectedCard();
  setStatus(`Цель: ${state.selected.lat.toFixed(5)}, ${state.selected.lon.toFixed(5)}`);

  const cur = state.selected;
  const [geoRes, elRes] = await Promise.allSettled([
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${cur.lat.toFixed(6)}&lon=${cur.lon.toFixed(6)}&accept-language=ru&zoom=18`).then(r => r.ok ? r.json() : null),
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${cur.lat.toFixed(5)}&longitude=${cur.lon.toFixed(5)}`).then(r => r.ok ? r.json() : null)
  ]);
  if (state.selected !== cur) return;
  if (geoRes.status === 'fulfilled' && geoRes.value) {
    const g = geoRes.value, a = g.address || {};
    cur.addr = g.display_name || '';
    const streetHouse = [a.road || a.pedestrian, a.house_number ? 'д. ' + a.house_number : ''].filter(Boolean).join(', ');
    if (!title || title === 'Выбранная точка') {
      cur.title = streetHouse || g.name || (cur.addr.split(',')[0]) || 'Выбранная точка';
    }
  }
  if (elRes.status === 'fulfilled' && elRes.value && Array.isArray(elRes.value.elevation)) {
    cur.elev = elRes.value.elevation[0];
  }
  renderSelectedCard();
}

function attachPointToCase(p) {
  if (!window.GE) return;
  const cases = GE.db.byType('case');
  if (!cases.length) {
    if (window.GECaseStudio) {
      close();
      window.GECaseStudio.createPresetCase('murder_blank');
      const created = GE.db.byType('case')[0];
      if (created && created.detective) {
        created.detective.scenePlace = p.addr || p.title;
        created.detective.sceneLat = +p.lat.toFixed(6);
        created.detective.sceneLon = +p.lon.toFixed(6);
        GE.caseSet(created.id, { region: p.addr || p.title, detective: created.detective });
        window.GECaseStudio.open(created.id);
      }
    }
    return;
  }
  const c = cases[0];
  c.detective = c.detective || {};
  c.detective.scenePlace = p.addr ? p.addr.split(',').slice(0, 3).join(',') : p.title;
  c.detective.sceneLat = +p.lat.toFixed(6);
  c.detective.sceneLon = +p.lon.toFixed(6);
  GE.caseSet(c.id, { region: c.detective.scenePlace, detective: c.detective });
  toast(`Локация привязана к делу «${c.title}»`, { type: 'ok' });
  if (window.GECaseStudio) {
    close();
    window.GECaseStudio.open(c.id, 'scene3d');
  }
}

function renderSelectedCard() {
  const card = $('#ge3d-card');
  const p = state.selected;
  if (!card || !p) { if (card) card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const q = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  const qCompact = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const fmts = window.GE && window.GE.coordFormats ? Object.fromEntries(window.GE.coordFormats(p.lat, p.lon)) : {};
  const sun = solarInfo(state.sunTime || new Date(), p.lat, p.lon);
  card.innerHTML = `
    <div class="ge3d-card-h">
      <div><div style="font:600 9.5px 'JetBrains Mono',monospace;letter-spacing:.18em;color:#e2232e">ЦЕЛЬ · АДРЕС · ХРОНОЛОКАЦИЯ</div><b>${esc(p.title)}</b></div>
      <button type="button" class="ge3d-card-x" data-ca="close" aria-label="Скрыть">×</button>
    </div>
    ${p.desc ? `<div style="font-size:11.5px;color:#cacad2;margin-bottom:5px">${esc(p.desc)}</div>` : ''}
    ${p.addr ? `<div style="font-size:11.5px;color:#a5a5af;margin-bottom:7px;line-height:1.4">${esc(p.addr)}</div>` : ''}
    <dl class="ge3d-kv">
      <dt>Координаты</dt><dd>${q}${p.elev != null ? ` · <b>${Math.round(p.elev)} м</b> НУМ` : ''}</dd>
      <dt>DMS</dt><dd>${dms(p.lat, 'N', 'S')} ${dms(p.lon, 'E', 'W')}</dd>
      ${fmts.MGRS ? `<dt>MGRS</dt><dd>${esc(fmts.MGRS)}</dd>` : ''}
      <dt>Солнце / Тень</dt><dd>${sun.alt.toFixed(1)}° · азимут ${sun.az.toFixed(0)}°${sun.alt > 0.2 ? ` · тень → ${sun.shadowAz.toFixed(0)}°` : ' · ночь'}</dd>
    </dl>
    <div class="ge3d-row">
      <button type="button" class="ge3d-btn on" data-ca="street">🚶 Улица 3D</button>
      <button type="button" class="ge3d-btn" data-ca="case">🕵️ В Дело</button>
      ${p.id ? `<button type="button" class="ge3d-btn" data-ca="open-rec">Досье</button>` : `<button type="button" class="ge3d-btn" data-ca="add-db">+ В Базу</button>`}
      <button type="button" class="ge3d-btn" data-ca="radar">📡 Радар 500м</button>
      <button type="button" class="ge3d-btn" data-ca="to2d">В 2D</button>
      <button type="button" class="ge3d-btn" data-ca="copy">Копия</button>
    </div>
    <div class="ge3d-links">
      <a href="https://yandex.ru/maps/?ll=${p.lon},${p.lat}&z=19&l=stv,sta&panorama%5Bpoint%5D=${p.lon},${p.lat}" target="_blank" rel="noopener noreferrer">Яндекс.Панорамы 360°</a>
      <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${qCompact}" target="_blank" rel="noopener noreferrer">Street View 360°</a>
      <a href="https://pastvu.com/?g=${p.lat.toFixed(5)},${p.lon.toFixed(5)}&z=17" target="_blank" rel="noopener noreferrer">PastVu Ретро-фото</a>
      <a href="https://www.mapillary.com/app/?lat=${p.lat}&lng=${p.lon}&z=17" target="_blank" rel="noopener noreferrer">Mapillary</a>
      <a href="https://shademap.app/@${p.lat},${p.lon},17z" target="_blank" rel="noopener noreferrer">ShadeMap Тени</a>
    </div>`;

  card.onclick = e => {
    const b = e.target.closest('[data-ca]');
    if (!b) return;
    const act = b.dataset.ca;
    if (act === 'close') card.classList.add('hidden');
    else if (act === 'street') toggleStreetMode(true);
    else if (act === 'case') attachPointToCase(p);
    else if (act === 'radar') scanNearby3D();
    else if (act === 'copy') {
      if (window.GE && window.GE.copy) window.GE.copy(q);
      else if (navigator.clipboard) navigator.clipboard.writeText(q);
      toast('Координаты скопированы: ' + q);
    } else if (act === 'to2d') openSelectedIn2D();
    else if (act === 'add-db' && window.GE && window.GE.editRecord) {
      close();
      window.GE.editRecord('geo', null, {
        title: p.title || (p.addr ? p.addr.split(',')[0] : 'Точка'),
        lat: +p.lat.toFixed(6),
        lon: +p.lon.toFixed(6),
        place: p.addr || '',
        retrieved: window.GE.today ? window.GE.today() : new Date().toISOString().slice(0, 10)
      });
    } else if (act === 'open-rec' && p.id && window.GE && window.GE.openRecord) {
      close();
      window.GE.openRecord(p.id);
    }
  };
}

/* Расчёт прямой видимости (LOS) */
async function computeLOS(a, b) {
  const dist = haversine(a, b);
  if (dist < 20) { setStatus('Точки слишком близко (< 20 м)'); return; }
  setStatus('Запрашиваю профиль высот рельефа вдоль луча A → B…');
  const N = clamp(Math.round(dist / 250), 20, 64);
  const samples = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    samples.push({ d: dist * f, lat: a.lat + (b.lat - a.lat) * f, lon: wrapLon(a.lon + (b.lon - a.lon) * f) });
  }
  let elev = null;
  try {
    const u = `https://api.open-meteo.com/v1/elevation?latitude=${samples.map(s => s.lat.toFixed(4)).join(',')}&longitude=${samples.map(s => s.lon.toFixed(4)).join(',')}`;
    const r = await fetch(u);
    if (r.ok) elev = (await r.json()).elevation;
  } catch (_) {}
  if (!elev || elev.length !== N) elev = samples.map(() => 0);

  const R_EFF = EARTH_R / (1 - 0.13);
  const hObs = elev[0] + state.obsHeight, hTgt = elev[N - 1] + state.tgtHeight;
  const drop = d => (d * (dist - d)) / (2 * R_EFF);
  const adj = elev.map((h, i) => h - drop(samples[i].d));
  const rayAt = i => hObs + (hTgt - hObs) * (i / (N - 1));

  let maxBlock = -Infinity, blockIdx = -1;
  for (let i = 1; i < N - 1; i++) {
    const diff = adj[i] - rayAt(i);
    if (diff > maxBlock) { maxBlock = diff; blockIdx = i; }
  }
  const clear = maxBlock <= 0;
  state.losClear = clear;
  refreshOverlays();

  const box = $('#ge3d-los-box'), verd = $('#ge3d-los-verdict'), cv = $('#ge3d-los-cv');
  box.classList.remove('hidden');
  const az = bearingDeg(a, b);
  verd.className = clear ? 'ge3d-los-ok' : 'ge3d-los-bad';
  verd.innerHTML = clear
    ? `<b>ПРЯМАЯ ВИДИМОСТЬ ЕСТЬ</b> · ${fmtDist(dist)} · азимут ${az.toFixed(1)}° · запас ${Math.abs(Math.round(maxBlock))} м`
    : `<b>ЛУЧ ПЕРЕКРЫТ РЕЛЬЕФОМ</b> · на ${fmtDist(samples[blockIdx].d)} (+${Math.round(maxBlock)} м выше луча)`;

  const W = cv.width = cv.clientWidth || 464, H = cv.height = 112;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const vals = [...adj, hObs, hTgt];
  const lo = Math.min(...vals) - 8, hi = Math.max(...vals) + 12, span = Math.max(15, hi - lo);
  const X = i => 10 + (i / (N - 1)) * (W - 20);
  const Y = v => H - 18 - ((v - lo) / span) * (H - 30);

  g.beginPath(); g.moveTo(X(0), H - 18); adj.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(N - 1), H - 18); g.closePath();
  g.fillStyle = 'rgba(202,202,212,0.18)'; g.fill();
  g.beginPath(); adj.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = '#cacad2'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.moveTo(X(0), Y(hObs)); g.lineTo(X(N - 1), Y(hTgt));
  g.strokeStyle = clear ? '#ffffff' : '#e2232e'; g.lineWidth = 2;
  if (!clear) g.setLineDash([5, 4]);
  g.stroke(); g.setLineDash([]);
  if (!clear && blockIdx > 0) { g.fillStyle = '#e2232e'; g.beginPath(); g.arc(X(blockIdx), Y(adj[blockIdx]), 4.5, 0, Math.PI * 2); g.fill(); }
}

/* ─────────── Живые OSINT-слои на 3D-глобусе ─────────── */
async function onLayerToggle(key, on) {
  if (key === 'db') return refreshDbMarkers();
  if (key === 'terminator') return updateSolarOverlay();
  if (key === 'sat') {
    if (on) await startSatellites();
    else { clearInterval(state.satTimer); state.satList = []; $('#ge3d-sat-st').textContent = ''; refreshOverlays(); }
  }
  if (key === 'quake') {
    if (on) await loadQuakes();
    else { state.quakeData = []; $('#ge3d-quake-st').textContent = ''; refreshOverlays(); }
  }
  if (key === 'eonet') {
    if (on) await loadEonet();
    else { state.eonetData = []; $('#ge3d-eonet-st').textContent = ''; refreshOverlays(); }
  }
  if (key === 'air') {
    if (on) { await pollAir(); clearInterval(state.airTimer); state.airTimer = setInterval(pollAir, 11000); }
    else { clearInterval(state.airTimer); state.airData = []; $('#ge3d-air-st').textContent = ''; refreshOverlays(); }
  }
}

async function startSatellites() {
  const stEl = $('#ge3d-sat-st');
  if (stEl) stEl.textContent = 'Загружаю орбиты TLE…';
  try {
    const sat = await loadSatelliteLib();
    const grp = SAT_GROUPS.find(g => g[0] === state.satGroup) || SAT_GROUPS[0];
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?${grp[2]}&FORMAT=TLE`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const lines = (await r.text()).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const list = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      if (!lines[i + 1].startsWith('1 ') || !lines[i + 2].startsWith('2 ')) continue;
      try { list.push({ name: lines[i], id: lines[i + 1].slice(2, 7).trim(), rec: sat.twoline2satrec(lines[i + 1], lines[i + 2]) }); } catch (_) {}
    }
    state.satList = list.slice(0, 80);
    if (stEl) stEl.textContent = `Активно на орбите: ${state.satList.length}`;
    clearInterval(state.satTimer);
    state.satTimer = setInterval(() => { if (state.open && state.layers.sat) refreshOverlays(); }, 1500);
    refreshOverlays();
  } catch (e) { if (stEl) stEl.textContent = 'CelesTrak: ' + e.message; }
}

async function loadQuakes() {
  const stEl = $('#ge3d-quake-st');
  if (stEl) stEl.textContent = 'Запрос USGS…';
  try {
    const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    const d = await r.json();
    state.quakeData = (d.features || []).map(f => {
      const c = (f.geometry || {}).coordinates || [], p = f.properties || {};
      return { lon: +c[0], lat: +c[1], depth: +c[2] || 0, mag: +p.mag || 2.5, place: p.place || '', time: p.time ? new Date(p.time).toLocaleString('ru-RU') : '' };
    }).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    if (stEl) stEl.textContent = `Событий за сутки: ${state.quakeData.length}`;
    refreshOverlays();
  } catch (e) { if (stEl) stEl.textContent = 'Ошибка USGS: ' + e.message; }
}

async function loadEonet() {
  const stEl = $('#ge3d-eonet-st');
  if (stEl) stEl.textContent = 'Запрос NASA EONET…';
  try {
    const r = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=25&limit=80');
    const d = await r.json();
    const mapById = new Map();
    (d.features || []).forEach(f => {
      const p = f.properties || {}, g = f.geometry || {};
      const c = g.type === 'Point' ? g.coordinates : (g.type === 'Polygon' && g.coordinates[0] ? g.coordinates[0][0] : null);
      if (!c) return;
      mapById.set(p.id, { lon: +c[0], lat: +c[1], title: p.title || 'Событие', cat: ((p.categories || [])[0] || {}).title || 'NASA EONET', date: p.date ? String(p.date).slice(0, 10) : '' });
    });
    state.eonetData = [...mapById.values()];
    if (stEl) stEl.textContent = `Активных событий: ${state.eonetData.length}`;
    refreshOverlays();
  } catch (e) { if (stEl) stEl.textContent = 'Ошибка EONET: ' + e.message; }
}

async function pollAir() {
  if (!state.open || !state.layers.air) return;
  const stEl = $('#ge3d-air-st');
  const c = getCameraCenter();
  try {
    const target = `https://api.adsb.lol/v2/point/${c.lat.toFixed(3)}/${c.lon.toFixed(3)}/220`;
    const r = await fetch(`${PROXY}/?url=${encodeURIComponent(target)}`);
    const d = await r.json();
    state.airData = (d.ac || []).filter(a => Number.isFinite(+a.lat) && Number.isFinite(+a.lon)).slice(0, 350).map(a => ({
      hex: String(a.hex || '').toUpperCase(),
      call: String(a.flight || '').trim() || String(a.hex || '').toUpperCase(),
      lat: +a.lat, lon: +a.lon,
      altM: Math.round((typeof a.alt_baro === 'number' ? a.alt_baro : 0) * 0.3048),
      kmh: Math.round((+a.gs || 0) * 1.852),
      trk: Math.round(+a.track || 0)
    }));
    if (stEl) stEl.textContent = `Бортов рядом: ${state.airData.length}`;
    refreshOverlays();
  } catch (_) { if (stEl) stEl.textContent = 'ADS-B недоступен'; }
}

/* ─────────── Снимок PNG и переход в 2D ─────────── */
function exportScreenshot() {
  let srcCanvas = null;
  if (state.mlMap) srcCanvas = state.mlMap.getCanvas();
  else if (state.csViewer) { state.csViewer.render(); srcCanvas = state.csViewer.scene.canvas; }
  else if (state.tac) srcCanvas = state.tac.cv;
  if (!srcCanvas) return toast('Холст 3D ещё не готов', { type: 'err' });

  try {
    const out = document.createElement('canvas');
    out.width = srcCanvas.width; out.height = srcCanvas.height;
    const g = out.getContext('2d');
    g.drawImage(srcCanvas, 0, 0);
    g.fillStyle = 'rgba(5,5,8,0.86)';
    g.fillRect(0, out.height - 34, out.width, 34);
    g.fillStyle = '#e5e5eb';
    g.font = '600 12px "JetBrains Mono",monospace';
    const c = getCameraCenter();
    g.fillText(`GOD EYE v4.0 · 3D GEOINT · ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)} · ${new Date().toISOString().slice(0, 19)}Z`, 14, out.height - 12);
    out.toBlob(blob => {
      if (!blob) return toast('Не удалось сформировать PNG', { type: 'err' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `GODEYE_3D_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      sfx('found');
      toast('Снимок 3D-сцены сохранён в PNG', { type: 'ok' });
    }, 'image/png');
  } catch (_) {
    toast('Для скриншота переключитесь на «Векторный 3D-Город»', { type: 'warn' });
  }
}

function openSelectedIn2D() {
  const p = state.selected || getCameraCenter();
  close();
  if (location.hash !== '#/geolocation') location.hash = '#/geolocation';
  setTimeout(() => {
    const geo = window.GE && window.GE.geo;
    if (!geo) return;
    if (typeof geo.ensure === 'function') geo.ensure();
    if (geo.map) {
      geo.map.setView([p.lat, p.lon], Math.max(geo.map.getZoom(), 18));
      if (typeof geo.pick === 'function') geo.pick(p.lat, p.lon, p.title || 'Точка с 3D-глобуса');
    }
  }, 140);
}

/* ─────────── Открытие и закрытие 3D-модуля ─────────── */
async function open(opts) {
  opts = opts || {};
  buildUi();
  const root = $('#ge3d-modal');
  root.classList.add('open');
  state.open = true;
  sfx('scan');

  if (opts.base && BASEMAPS[opts.base]) state.base = opts.base;
  const baseSel = $('#ge3d-base');
  if (baseSel) baseSel.value = state.base;

  if (Array.isArray(opts.tempPoints)) state.tempPoints = opts.tempPoints;
  const target = (Number.isFinite(+opts.lat) && Number.isFinite(+opts.lon))
    ? { lat: +opts.lat, lon: wrapLon(opts.lon), zoom: opts.zoom || 17.4, pitch: opts.pitch != null ? opts.pitch : 62 }
    : current2DCenter();

  await switchEngine(state.engine, target);
  if (Number.isFinite(+opts.lat) && Number.isFinite(+opts.lon)) {
    selectPoint(+opts.lat, +opts.lon, opts.title || 'Выбранная точка');
  }
}

function openAt(lat, lon, title, zoom) {
  return open({ lat, lon, title, zoom: zoom || 17.8, pitch: 64 });
}

function plotPoints(points, title) {
  const clean = (Array.isArray(points) ? points : []).filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lon));
  if (!clean.length) return open();
  state.tempPoints = clean;
  return open({ lat: clean[0].lat, lon: clean[0].lon, zoom: clean.length === 1 ? 17.6 : 4.2, pitch: clean.length === 1 ? 62 : 34, title: title || clean[0].title || 'Извлечённая точка' });
}

function close() {
  state.open = false;
  toggleOrbit(true);
  clearInterval(state.satTimer);
  clearInterval(state.airTimer);
  const root = $('#ge3d-modal');
  if (root) root.classList.remove('open');
  destroyEngines();
  const geo = window.GE && window.GE.geo;
  if (geo && geo.map) setTimeout(() => geo.map.invalidateSize(), 100);
}

document.addEventListener('click', ev => {
  const btn = ev.target && ev.target.closest ? ev.target.closest('#gm-3d-btn, #top-3d-btn, [data-open-3d]') : null;
  if (!btn) return;
  ev.preventDefault();
  const lat = btn.dataset.lat, lon = btn.dataset.lon;
  if (lat != null && lon != null && lat !== '' && lon !== '') openAt(+lat, +lon, btn.dataset.title || 'Локация');
  else open();
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && state.open) {
    ev.preventDefault();
    close();
    return;
  }
  if (state.open && state.streetMode && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) {
    if (ev.code === 'KeyW' || ev.key === 'ArrowUp') { ev.preventDefault(); stepStreet('fwd'); return; }
    if (ev.code === 'KeyS' || ev.key === 'ArrowDown') { ev.preventDefault(); stepStreet('back'); return; }
    if (ev.code === 'KeyA' || ev.key === 'ArrowLeft') { ev.preventDefault(); stepStreet('left'); return; }
    if (ev.code === 'KeyD' || ev.key === 'ArrowRight') { ev.preventDefault(); stepStreet('right'); return; }
    if (ev.code === 'KeyQ') { ev.preventDefault(); stepStreet('down_z'); return; }
    if (ev.code === 'KeyE') { ev.preventDefault(); stepStreet('up_z'); return; }
  }
  if (ev.altKey && (ev.code === 'KeyG' || ev.key === 'g' || ev.key === 'G' || ev.key === 'п' || ev.key === 'П')) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) return;
    ev.preventDefault();
    state.open ? close() : open();
  }
});

window.addEventListener('resize', () => {
  if (!state.open) return;
  if (state.mlMap) state.mlMap.resize();
  if (state.csViewer) state.csViewer.resize();
  if (state.tac) state.tac.draw();
});

async function openStreet(lat, lon, title) {
  await open({ lat, lon, title: title || 'Осмотр улицы', zoom: 18.9, pitch: 77 });
  toggleStreetMode(true);
}

window.GE3D = { open, openAt, openStreet, plotPoints, close, state, flyTo };
})();
