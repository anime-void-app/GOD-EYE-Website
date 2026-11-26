(function () {
'use strict';

const VERSION = '1.147';
const CESIUM_BASE = 'https://cesium.com/downloads/cesiumjs/releases/' + VERSION + '/Build/Cesium/';
const MAPS = {
  satellite: { label: 'Спутник Esri', type: 'arcgis', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' },
  hybrid: { label: 'Спутник + подписи', type: 'hybrid', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' },
  streets: { label: 'Улицы Esri', type: 'arcgis', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer' },
  dark: { label: 'Тёмная Esri', type: 'arcgis', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer' },
  topo: { label: 'Топография Esri', type: 'arcgis', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer' },
  terrain: { label: 'Рельеф Esri', type: 'arcgis', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer' }
};

let viewer = null;
let loadPromise = null;
let selectedPoint = null;
let selectedMarker = null;
let savedMarkers = [];
let baseRequest = 0;
let lightOn = true;
let currentBase = 'satellite';

const $ = (selector, root) => (root || document).querySelector(selector);
const wrapLon = value => {
  const n = Number(value);
  return Number.isFinite(n) ? ((n + 180) % 360 + 360) % 360 - 180 : 0;
};

function addStyles() {
  if ($('#ge3d-style')) return;
  const style = document.createElement('style');
  style.id = 'ge3d-style';
  style.textContent =
    '.ge3d{position:fixed;inset:0;z-index:100000;background:#050507;color:#f1f1f4;display:none;font-family:IBM Plex Sans,Segoe UI,sans-serif}' +
    '.ge3d.open{display:block}' +
    '.ge3d-head{position:absolute;z-index:5;top:0;left:0;right:0;min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 18px;background:rgba(5,5,7,.94);border-bottom:1px solid rgba(220,220,230,.13);backdrop-filter:blur(16px)}' +
    '.ge3d-brand{display:flex;flex-direction:column;gap:3px;min-width:190px}' +
    '.ge3d-kicker{font:10px JetBrains Mono,monospace;letter-spacing:.2em;color:#e2232e}' +
    '.ge3d-brand strong{font:600 17px Cinzel,Georgia,serif;letter-spacing:.12em}' +
    '.ge3d-sub{font:10px JetBrains Mono,monospace;color:#898994}' +
    '.ge3d-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}' +
    '.ge3d select,.ge3d button{height:34px;border:1px solid rgba(220,220,230,.18);border-radius:3px;background:#111115;color:#e5e5eb;padding:0 10px;font:11px JetBrains Mono,monospace;cursor:pointer}' +
    '.ge3d button:hover,.ge3d select:hover{border-color:#b3121b;background:#191014}' +
    '.ge3d button:disabled{opacity:.4;cursor:not-allowed}' +
    '.ge3d .ge3d-close{width:36px;font-size:21px;color:#ff7b82}' +
    '.ge3d-scene{position:absolute;inset:66px 0 38px;background:#020308}' +
    '.ge3d-foot{position:absolute;z-index:5;bottom:0;left:0;right:0;min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 14px;background:rgba(5,5,7,.94);border-top:1px solid rgba(220,220,230,.12);font:10px JetBrains Mono,monospace;color:#a5a5af}' +
    '.ge3d-foot #ge3d-coords{color:#f0d0d2}' +
    '@media(max-width:760px){.ge3d-head{align-items:flex-start;flex-direction:column;padding:9px 10px;gap:8px}.ge3d-brand{gap:1px}.ge3d-brand strong{font-size:14px}.ge3d-sub{display:none}.ge3d-actions{justify-content:flex-start;width:100%;gap:5px}.ge3d select{max-width:145px}.ge3d select,.ge3d button{height:31px;padding:0 7px;font-size:10px}.ge3d-scene{top:111px}.ge3d-foot{font-size:9px;padding:6px 8px}.ge3d-foot #ge3d-status{max-width:54%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}';
  document.head.appendChild(style);
}

function buildUi() {
  if ($('#ge3d-modal')) return;
  addStyles();
  const root = document.createElement('div');
  root.id = 'ge3d-modal';
  root.className = 'ge3d';
  root.innerHTML =
    '<div class="ge3d-head">' +
      '<div class="ge3d-brand"><span class="ge3d-kicker">GOD EYE / GEOINT</span><strong>3D EARTH</strong><span class="ge3d-sub">Глобус · спутниковая подложка · сохранённые точки</span></div>' +
      '<div class="ge3d-actions">' +
        '<select id="ge3d-base" aria-label="Подложка глобуса">' +
          '<option value="satellite">Спутник</option><option value="hybrid">Спутник + подписи</option><option value="streets">Улицы</option><option value="dark">Тёмная</option><option value="topo">Топография</option><option value="terrain">Рельеф</option>' +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:5px;font:10px JetBrains Mono,monospace;color:#c7c7d0"><input id="ge3d-points" type="checkbox" checked> Точки</label>' +
        '<button id="ge3d-sync" type="button">Центр 2D</button>' +
        '<button id="ge3d-light" type="button">Свет: ВКЛ</button>' +
        '<button id="ge3d-to2d" type="button" disabled>Открыть точку в 2D</button>' +
        '<button id="ge3d-close" class="ge3d-close" type="button" aria-label="Закрыть">×</button>' +
      '</div>' +
    '</div>' +
    '<div id="ge3d-scene" class="ge3d-scene"></div>' +
    '<div class="ge3d-foot"><span id="ge3d-status">Загрузка 3D-модуля…</span><span id="ge3d-coords">Нажмите на поверхность глобуса, чтобы выбрать координаты</span></div>';
  document.body.appendChild(root);
  $('#ge3d-close', root).addEventListener('click', close);
  $('#ge3d-sync', root).addEventListener('click', syncFrom2D);
  $('#ge3d-to2d', root).addEventListener('click', openIn2D);
  $('#ge3d-light', root).addEventListener('click', toggleLight);
  $('#ge3d-base', root).addEventListener('change', event => setBase(event.target.value));
  $('#ge3d-points', root).addEventListener('change', syncPoints);
}

function status(message) {
  const el = $('#ge3d-status');
  if (el) el.textContent = message;
}

function loadCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (loadPromise) return loadPromise;
  window.CESIUM_BASE_URL = CESIUM_BASE;
  if (!$('#ge3d-cesium-css')) {
    const css = document.createElement('link');
    css.id = 'ge3d-cesium-css';
    css.rel = 'stylesheet';
    css.href = CESIUM_BASE + 'Widgets/widgets.css';
    document.head.appendChild(css);
  }
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'ge3d-cesium-script';
    script.src = CESIUM_BASE + 'Cesium.js';
    script.async = true;
    script.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('CesiumJS не инициализировался'));
    script.onerror = () => reject(new Error('Не удалось загрузить CesiumJS с официального CDN'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function current2DCenter() {
  const geo = window.GE && window.GE.geo;
  if (geo && geo.map) {
    const center = geo.map.getCenter();
    return { lat: center.lat, lon: wrapLon(center.lng) };
  }
  return { lat: 55.75, lon: 37.62 };
}

function flyTo(lat, lon, height) {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(wrapLon(lon), Number(lat), height || 14500000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-76), roll: 0 },
    duration: 1.35
  });
}

async function makeProvider(config) {
  if (config.type === 'template') {
    return new Cesium.UrlTemplateImageryProvider({
      url: config.url,
      maximumLevel: 20,
      credit: '© OpenStreetMap contributors © CARTO'
    });
  }
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(config.url);
}

async function setBase(key) {
  if (!viewer || !MAPS[key]) return;
  const requestId = ++baseRequest;
  status('Загружаю подложку: ' + MAPS[key].label + '…');
  try {
    const config = MAPS[key];
    const provider = await makeProvider(config);
    if (!viewer || requestId !== baseRequest) return;
    viewer.imageryLayers.removeAll(true);
    viewer.imageryLayers.addImageryProvider(provider);
    if (config.type === 'hybrid') {
      try {
        const labels = await Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer');
        if (viewer && requestId === baseRequest) viewer.imageryLayers.addImageryProvider(labels);
      } catch (error) {
        status('Спутник загружен; слой подписей сейчас недоступен');
      }
    }
    currentBase = key;
    const select = $('#ge3d-base');
    if (select) select.value = key;
    if (viewer && requestId === baseRequest) status('Глобус готов · ' + config.label + ' · дата снимков зависит от региона');
  } catch (error) {
    if (requestId !== baseRequest) return;
    status('Не удалось загрузить подложку: ' + (error.message || 'ошибка источника'));
  }
}

function syncPoints() {
  if (!viewer) return;
  savedMarkers.forEach(entity => viewer.entities.remove(entity));
  savedMarkers = [];
  const toggle = $('#ge3d-points');
  if (!toggle || !toggle.checked) return;
  const geo = window.GE && window.GE.geo;
  const points = geo && typeof geo.points === 'function' ? geo.points() : [];
  points.slice(0, 1500).forEach(record => {
    const lat = Number(record.lat);
    const lon = wrapLon(record.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return;
    savedMarkers.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 7,
        color: Cesium.Color.fromCssColorString('#e2232e'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1.5,
        scaleByDistance: new Cesium.NearFarScalar(100000, 1.5, 18000000, 0.45)
      },
      label: {
        text: String(record.title || 'Локация'),
        font: '11px JetBrains Mono, monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        show: false,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    }));
  });
  status('Сохранённых точек на глобусе: ' + savedMarkers.length);
}

function selectPoint(lat, lon) {
  selectedPoint = { lat: Number(lat), lon: wrapLon(lon) };
  if (selectedMarker && viewer) viewer.entities.remove(selectedMarker);
  selectedMarker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(selectedPoint.lon, selectedPoint.lat),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString('#ff3344'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2
    },
    label: {
      text: selectedPoint.lat.toFixed(5) + ', ' + selectedPoint.lon.toFixed(5),
      font: '12px JetBrains Mono, monospace',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
  const coords = $('#ge3d-coords');
  if (coords) coords.textContent = selectedPoint.lat.toFixed(5) + ', ' + selectedPoint.lon.toFixed(5);
  const button = $('#ge3d-to2d');
  if (button) button.disabled = false;
}

function createViewer() {
  viewer = new Cesium.Viewer('ge3d-scene', {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    scene3DOnly: true,
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    shouldAnimate: true
  });
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#080b12');
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45000000;
  viewer.scene.postProcessStages.fxaa.enabled = true;
  viewer.screenSpaceEventHandler.setInputAction(movement => {
    const point = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    if (!point) return;
    const cartographic = Cesium.Cartographic.fromCartesian(point);
    selectPoint(Cesium.Math.toDegrees(cartographic.latitude), Cesium.Math.toDegrees(cartographic.longitude));
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function toggleLight() {
  if (!viewer) return;
  lightOn = !lightOn;
  viewer.scene.globe.enableLighting = lightOn;
  const button = $('#ge3d-light');
  if (button) button.textContent = lightOn ? 'Свет: ВКЛ' : 'Свет: ВЫКЛ';
  viewer.scene.requestRender();
}

function syncFrom2D() {
  if (!viewer) return;
  const center = current2DCenter();
  flyTo(center.lat, center.lon, 14500000);
  status('Центр глобуса синхронизирован с 2D-картой');
}

function openIn2D() {
  if (!selectedPoint) return;
  const geo = window.GE && window.GE.geo;
  if (!geo) return;
  if (typeof geo.ensure === 'function') geo.ensure();
  if (geo.map) {
    geo.map.setView([selectedPoint.lat, selectedPoint.lon], Math.max(geo.map.getZoom(), 16));
    if (typeof geo.pick === 'function') geo.pick(selectedPoint.lat, selectedPoint.lon, 'Точка с 3D-глобуса');
  }
  close();
}

async function open() {
  buildUi();
  const root = $('#ge3d-modal');
  root.classList.add('open');
  selectedPoint = null;
  const button = $('#ge3d-to2d');
  if (button) button.disabled = true;
  const coords = $('#ge3d-coords');
  if (coords) coords.textContent = 'Нажмите на поверхность глобуса, чтобы выбрать координаты';
  status('Загрузка CesiumJS ' + VERSION + '…');
  try {
    await loadCesium();
    if (!viewer) createViewer();
    viewer.resize();
    syncPoints();
    await setBase(currentBase);
    const center = current2DCenter();
    flyTo(center.lat, center.lon, 14500000);
    viewer.scene.requestRender();
  } catch (error) {
    status('Ошибка 3D-модуля: ' + (error.message || 'неизвестная ошибка'));
  }
}

function close() {
  const root = $('#ge3d-modal');
  if (root) root.classList.remove('open');
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  selectedMarker = null;
  savedMarkers = [];
  selectedPoint = null;
  const geo = window.GE && window.GE.geo;
  if (geo && geo.map) setTimeout(() => geo.map.invalidateSize(), 100);
}

document.addEventListener('click', event => {
  const target = event.target && event.target.closest ? event.target.closest('#gm-3d-btn') : null;
  if (target) {
    event.preventDefault();
    open();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#ge3d-modal.open')) close();
});
window.addEventListener('resize', () => {
  if (viewer) viewer.resize();
});

})();