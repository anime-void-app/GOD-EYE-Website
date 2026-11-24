/* ═══════════════════════════════════════════════════════════════
   GOD EYE · core.js — ядро: утилиты, база данных, схемы, интерфейсные примитивы
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const GE = window.GE = window.GE || {};
GE.VERSION = '3.0.0';

/* ─────────── Утилиты ─────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
GE.$ = $; GE.$$ = $$;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
GE.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
GE.safeUrl = u => {
  try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; }
  catch (e) { return ''; }
};
GE.uid = (p = 'r') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
GE.now = () => new Date().toISOString();
GE.today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
GE.pad = n => String(n).padStart(2, '0');
GE.fmtDate = (iso, withTime = true) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const s = `${GE.pad(d.getDate())}.${GE.pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  return withTime && /T/.test(iso) ? `${s} ${GE.pad(d.getHours())}:${GE.pad(d.getMinutes())}` : s;
};
GE.ago = iso => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return '';
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' дн назад';
  return GE.fmtDate(iso, false);
};
GE.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
GE.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
GE.icon = (id, cls = 'ic ic-sm') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
GE.bytes = n => n < 1024 ? n + ' Б' : n < 1048576 ? (n / 1024).toFixed(1) + ' КБ' : (n / 1048576).toFixed(2) + ' МБ';
GE.host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
GE.uniq = arr => Array.from(new Set(arr));
GE.toList = v => Array.isArray(v) ? v.filter(Boolean) : String(v || '').split(/[,\n;]/).map(s => s.trim()).filter(Boolean);

GE.download = (name, content, mime = 'text/plain;charset=utf-8') => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
GE.copy = async text => {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
    t.remove();
  }
  GE.toast('Скопировано в буфер обмена');
};
GE.open = url => { const u = GE.safeUrl(url); if (u) window.open(u, '_blank', 'noopener'); };

/* ─────────── Шина событий ─────────── */
const listeners = {};
GE.on = (e, fn) => { (listeners[e] = listeners[e] || []).push(fn); };
GE.emit = (e, d) => { (listeners[e] || []).forEach(fn => { try { fn(d); } catch (err) { console.error(err); } }); };

/* ─────────── Хранилище ─────────── */
GE.ls = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
GE.ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};

/* ─────────── Настройки ─────────── */
const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const _savedSet = GE.ls.get('godeye.settings', {});
GE.settings = Object.assign({
  callsign: 'ОПЕРАТОР',
  intro: 'session',
  quality: lowEnd ? 'lite' : 'full',
  follow: true,
  spot: true,
  motion: false,
  secure: false,
  live: true,
  catFav: [],
  engFav: [],
  engUsage: {},
  lastBackup: '',
  apiKeys: { shodan: '', otx: '', urlscan: '', vt: '', proxy: '' },
  audio: { ost: false, sfx: true, track: 'oculus', ostVol: 38, sfxVol: 55 },
  view: {}
}, _savedSet);
GE.settings.apiKeys = Object.assign({ shodan: '', otx: '', urlscan: '', vt: '', proxy: '' }, _savedSet.apiKeys || {});
GE.settings.audio = Object.assign({ ost: false, sfx: true, track: 'oculus', ostVol: 38, sfxVol: 55 }, _savedSet.audio || {});
GE.settings.engUsage = Object.assign({}, _savedSet.engUsage || {});
GE.saveSettings = () => {
  GE.ls.set('godeye.settings', GE.settings);
  if (GE.idb && GE.idb.ready) GE.idb.set('settings', GE.settings).catch(() => {});
  GE.emit('settings', GE.settings);
};

/* ─────────── Шкала Адмиралтейства (NATO) ─────────── */
GE.REL = { A: 'Полностью надёжный', B: 'Обычно надёжный', C: 'Довольно надёжный', D: 'Обычно ненадёжный', E: 'Ненадёжный', F: 'Нельзя оценить' };
GE.CRED = { 1: 'Подтверждено другими источниками', 2: 'Вероятно верно', 3: 'Возможно верно', 4: 'Сомнительно', 5: 'Маловероятно', 6: 'Нельзя оценить' };
GE.relClass = r => ({ A: 'hi', B: 'hi', C: 'mid', D: 'lo', E: 'lo', F: 'na' }[r] || 'na');
GE.credClass = c => ({ 1: 'hi', 2: 'hi', 3: 'mid', 4: 'lo', 5: 'lo', 6: 'na' }[c] || 'na');
GE.admBadge = rec => {
  if (!rec.reliability && !rec.credibility) return '<span class="badge na">—</span>';
  const r = rec.reliability || 'F', c = rec.credibility || '6';
  const cls = GE.relClass(r) === 'lo' || GE.credClass(c) === 'lo' ? 'lo' : (GE.relClass(r) === 'hi' && GE.credClass(c) === 'hi' ? 'hi' : (r === 'F' && c === '6' ? 'na' : 'mid'));
  return `<span class="badge ${cls}" title="${GE.esc(GE.REL[r] + ' · ' + GE.CRED[c])}">${GE.esc(r + c)}</span>`;
};

/* ─────────── Схемы записей ─────────── */
const REL_F = { k: 'reliability', l: 'Надёжность источника', t: 'rel' };
const CRED_F = { k: 'credibility', l: 'Достоверность сведений', t: 'cred' };
const RETR_F = { k: 'retrieved', l: 'Дата получения', t: 'date', def: 'today' };
const SRC_F = { k: 'sources', l: 'Публичные источники — по одному URL в строке', t: 'urls', full: 1 };
const TAGS_F = { k: 'tags', l: 'Теги (через запятую)', t: 'tags' };
const NOTES_F = { k: 'notes', l: 'Заметки', t: 'textarea', full: 1 };

GE.TYPES = {
  person: {
    label: 'Персона', plural: 'Персоны', view: 'people', folder: '01 People', code: 'PER', icon: 'person', shape: 'circle',
    en: 'PEOPLE', ru: 'Публичные персоны',
    desc: 'Только публичные лица и общедоступные сведения: должность, публичные заявления, официальные профили. Не храните здесь адреса, телефоны и иные чувствительные данные частных лиц.',
    fields: [
      { k: 'title', l: 'Имя (публичное лицо)', t: 'text', req: 1, ph: 'Например: Анна Пример' },
      { k: 'aliases', l: 'Варианты написания / псевдонимы', t: 'tags' },
      { k: 'role', l: 'Публичная роль / должность', t: 'text', ph: 'Пресс-секретарь, депутат, CEO…' },
      { k: 'affiliation', l: 'Организация', t: 'ref', ref: 'org' },
      { k: 'country', l: 'Страна', t: 'text' },
      SRC_F, REL_F, CRED_F, RETR_F, TAGS_F, NOTES_F
    ],
    cols: ['title', 'role', 'affiliation', '_adm', 'retrieved']
  },
  org: {
    label: 'Организация', plural: 'Организации', view: 'organizations', folder: '02 Organizations', code: 'ORG', icon: 'org', shape: 'square',
    en: 'ORGANIZATIONS', ru: 'Организации и структуры',
    desc: 'Компании, госорганы, НКО, СМИ. Указывайте регистрационные номера из официальных реестров и ссылки на первоисточники.',
    fields: [
      { k: 'title', l: 'Название', t: 'text', req: 1, ph: 'ООО «Пример»' },
      { k: 'org_type', l: 'Тип', t: 'select', opts: ['Компания', 'Госорган', 'НКО', 'СМИ', 'Учебное заведение', 'Международная организация', 'Другое'] },
      { k: 'country', l: 'Страна / юрисдикция', t: 'text' },
      { k: 'registry_id', l: 'Рег. номер (ИНН, ОГРН, LEI, Company No.)', t: 'text' },
      { k: 'website', l: 'Официальный сайт', t: 'url' },
      SRC_F, REL_F, CRED_F, RETR_F, TAGS_F, NOTES_F
    ],
    cols: ['title', 'org_type', 'country', 'registry_id', '_adm']
  },
  geo: {
    label: 'Локация', plural: 'Локации', view: 'geolocation', folder: '03 Geolocation', code: 'GEO', icon: 'geo', shape: 'diamond',
    en: 'GEOLOCATION', ru: 'Географический анализ',
    desc: 'Точки на карте с источником и точностью. Щёлкните по карте, чтобы добавить точку, или найдите место через поиск.',
    fields: [
      { k: 'title', l: 'Название места', t: 'text', req: 1 },
      { k: 'lat', l: 'Широта', t: 'number', ph: '59.9390' },
      { k: 'lon', l: 'Долгота', t: 'number', ph: '30.3158' },
      { k: 'place', l: 'Адрес / описание', t: 'text', full: 1 },
      { k: 'accuracy', l: 'Точность', t: 'select', opts: ['Точная', 'Улица', 'Район', 'Город', 'Регион', 'Примерная'] },
      RETR_F, SRC_F, REL_F, CRED_F, TAGS_F, NOTES_F
    ],
    cols: ['title', 'lat', 'lon', 'accuracy', '_adm']
  },
  image: {
    label: 'Изображение', plural: 'Изображения', view: 'images', folder: '04 Images', code: 'IMG', icon: 'image', shape: 'triangle',
    en: 'IMAGES', ru: 'Проверка изображений',
    desc: 'Анализ метаданных, хеши, поиск похожих, анализ уровня ошибок (ELA) — всё локально. Затем — обратный поиск по открытым сервисам.',
    fields: [
      { k: 'title', l: 'Название', t: 'text', req: 1 },
      { k: 'image_url', l: 'URL изображения (если опубликовано)', t: 'url', full: 1 },
      { k: 'verdict', l: 'Вывод о происхождении', t: 'select', opts: ['Не установлено', 'Оригинал', 'Найдены более ранние копии', 'Изменено / смонтировано', 'Вне контекста', 'Сгенерировано ИИ'] },
      { k: 'captured', l: 'Дата съёмки (EXIF)', t: 'text' },
      { k: 'camera', l: 'Камера / ПО', t: 'text' },
      { k: 'lat', l: 'Широта (EXIF)', t: 'number' },
      { k: 'lon', l: 'Долгота (EXIF)', t: 'number' },
      { k: 'file_hash', l: 'SHA-256 файла', t: 'text', full: 1, mono: 1 },
      { k: 'dhash', l: 'Перцептивный хеш (dHash)', t: 'text', mono: 1 },
      RETR_F, SRC_F, REL_F, CRED_F, TAGS_F, NOTES_F
    ],
    cols: ['title', 'verdict', 'captured', 'camera', '_adm']
  },
  source: {
    label: 'Источник', plural: 'Источники', view: 'sources', folder: '05 Sources', code: 'SRC', icon: 'source', shape: 'hex',
    en: 'SOURCES', ru: 'Каталог источников',
    desc: 'Каждый факт должен опираться на источник: ссылка, архивная копия, дата получения и оценка по шкале Адмиралтейства.',
    fields: [
      { k: 'title', l: 'Название / заголовок', t: 'text', req: 1 },
      { k: 'url', l: 'Ссылка', t: 'url', full: 1 },
      { k: 'archived_url', l: 'Архивная копия (web.archive.org, archive.ph)', t: 'url', full: 1 },
      { k: 'source_type', l: 'Тип источника', t: 'select', opts: ['Сайт', 'СМИ', 'Соцсеть', 'Документ', 'Реестр', 'Видео', 'Изображение', 'Архив', 'Другое'] },
      { k: 'publisher', l: 'Автор / издатель', t: 'text' },
      { k: 'published', l: 'Дата публикации', t: 'date' },
      RETR_F, REL_F, CRED_F, TAGS_F, NOTES_F
    ],
    cols: ['title', 'source_type', 'publisher', '_adm', 'retrieved']
  },
  report: {
    label: 'Исследование', plural: 'Исследования', view: 'reports', folder: '08 Reports', code: 'REP', icon: 'report', shape: 'star',
    en: 'RESEARCH & REPORTS', ru: 'Исследования и отчёты',
    desc: 'Исследование объединяет цель, связанные записи, ход работы и выводы. Отчёт экспортируется в Markdown для Obsidian, в HTML/PDF для печати или в TXT.',
    fields: [
      { k: 'title', l: 'Название исследования', t: 'text', req: 1 },
      { k: 'report_type', l: 'Тип', t: 'select', opts: ['Общее', 'Профиль организации', 'Профиль публичной персоны', 'Геолокация', 'Проверка изображения', 'Анализ связей', 'Проверка факта'] },
      { k: 'status', l: 'Статус', t: 'select', opts: ['Открыто', 'В работе', 'Завершено', 'Архив'] },
      { k: 'confidence', l: 'Уверенность в выводах', t: 'select', opts: ['Не оценена', 'Высокая', 'Средняя', 'Низкая'] },
      { k: 'objective', l: 'Цель / вопрос исследования', t: 'textarea', full: 1 },
      { k: 'linked', l: 'Связанные записи', t: 'refs', full: 1 },
      { k: 'body', l: 'Ход работы и находки (Markdown)', t: 'textarea', full: 1, big: 1 },
      { k: 'conclusion', l: 'Вывод', t: 'textarea', full: 1 },
      TAGS_F
    ],
    cols: ['title', 'report_type', 'status', 'confidence', 'updated']
  }
};
GE.TYPE_KEYS = Object.keys(GE.TYPES);
GE.FIELD_LABEL = (type, k) => {
  if (k === '_adm') return 'Оценка';
  if (k === 'updated') return 'Обновлено';
  if (k === 'created') return 'Создано';
  const f = (GE.TYPES[type]?.fields || []).find(x => x.k === k);
  return f ? f.l.split(' (')[0].split(' —')[0] : k;
};

/* ─────────── IndexedDB + База данных ─────────── */
const KEY = 'godeye.v2';
const IDB_NAME = 'godeye_storage';
const IDB_STORE = 'kv';
const LS_MIRROR_LIMIT = 2 * 1024 * 1024; // 2 МБ: зеркалируем в localStorage только пока база компактная
const empty = () => ({ v: 2, records: [], links: [], activity: [], history: [], saved: [], watchlist: [], savedFilters: [] });
GE.DB = Object.assign(empty(), GE.ls.get(KEY, {}));

GE.storage = {
  backend: 'localStorage',
  bytes: 0,
  quota: 5 * 1024 * 1024,
  persisted: false,
  state: 'saved', // 'saved' | 'saving' | 'error'
  lastSavedAt: null
};

GE.idb = {
  db: null,
  ready: false,
  open() {
    if (this.db) return Promise.resolve(this.db);
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB не поддерживается'));
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => { this.db = req.result; this.ready = true; res(this.db); };
      req.onerror = () => rej(req.error || new Error('Ошибка открытия IndexedDB'));
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const r = tx.objectStore(IDB_STORE).get(k);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('Транзакция IndexedDB отменена'));
    });
  },
  async del(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  }
};

function calcDbBytes() {
  try {
    const json = JSON.stringify(GE.DB);
    GE.storage.bytes = new Blob([json]).size;
    return { json, size: GE.storage.bytes };
  } catch (e) {
    return { json: '', size: GE.storage.bytes || 0 };
  }
}

GE.refreshQuota = async () => {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est && est.quota) GE.storage.quota = est.quota;
    }
    if (navigator.storage && navigator.storage.persisted) {
      GE.storage.persisted = await navigator.storage.persisted();
    }
  } catch (e) { /* ignore */ }
  GE.emit('storage', GE.storage);
};

GE.requestPersist = async () => {
  if (!navigator.storage || !navigator.storage.persist) {
    GE.toast('Ваш браузер не поддерживает API защищённого хранилища', { type: 'err' });
    return false;
  }
  try {
    const ok = await navigator.storage.persist();
    GE.storage.persisted = ok;
    GE.emit('storage', GE.storage);
    GE.toast(ok ? 'Защищённое хранилище включено — браузер не очистит базу автоматически' : 'Браузер не выдал статус защищённого хранилища (добавьте сайт в закладки или повторите позже)', { type: ok ? 'ok' : '' });
    return ok;
  } catch (e) {
    GE.toast('Не удалось запросить защищённое хранилище', { type: 'err' });
    return false;
  }
};

/* Миграция данных из первой версии сайта (ключ godeyeDB) */
function migrateV1IfNeeded() {
  if (GE.DB.records.length || GE.ls.get('godeye.migrated')) return false;
  const old = GE.ls.get('godeyeDB');
  if (!old) return false;
  const now = GE.now(), map = {};
  (old.people || []).forEach(p => { const r = { id: GE.uid('per'), type: 'person', title: p.name, aliases: GE.toList(p.alias), notes: p.affiliation ? 'Организация: ' + p.affiliation : '', sources: GE.toList(p.sources), tags: ['v1'], created: now, updated: now }; GE.DB.records.push(r); map[p.name] = r.id; });
  (old.orgs || []).forEach(o => { const r = { id: GE.uid('org'), type: 'org', title: o.name, org_type: o.type, country: o.country, tags: ['v1'], created: now, updated: now }; GE.DB.records.push(r); map[o.name] = r.id; });
  (old.sources || []).forEach(s => { GE.DB.records.push({ id: GE.uid('src'), type: 'source', title: GE.host(s.url) || s.url, url: s.url, reliability: s.credibility === 'HIGH' ? 'B' : s.credibility === 'MEDIUM' ? 'C' : 'E', tags: GE.toList(s.tag).concat('v1'), created: now, updated: now }); });
  (old.reports || []).forEach(r => { GE.DB.records.push({ id: GE.uid('rep'), type: 'report', title: r.title, report_type: 'Общее', status: 'Завершено', body: r.body, tags: ['v1'], created: now, updated: now }); });
  (old.connections || []).forEach(c => {
    [c.from, c.to].forEach(n => { if (!map[n]) { const r = { id: GE.uid('per'), type: 'person', title: n, tags: ['v1'], created: now, updated: now }; GE.DB.records.push(r); map[n] = r.id; } });
    GE.DB.links.push({ id: GE.uid('lnk'), from: map[c.from], to: map[c.to], relation: 'связан с', created: now });
  });
  GE.ls.set('godeye.migrated', true);
  if (GE.DB.records.length) setTimeout(() => GE.toast('Данные из первой версии GOD EYE перенесены'), 1500);
  return GE.DB.records.length > 0;
}

GE.initStorage = async () => {
  try {
    await GE.idb.open();
    GE.storage.backend = 'indexeddb';
    const [savedDb, savedSettings] = await Promise.all([
      GE.idb.get('db').catch(() => null),
      GE.idb.get('settings').catch(() => null)
    ]);
    if (savedSettings && typeof savedSettings === 'object') {
      const mergedKeys = Object.assign({ shodan: '', otx: '', urlscan: '', vt: '', proxy: '' }, GE.settings.apiKeys || {}, savedSettings.apiKeys || {});
      Object.assign(GE.settings, savedSettings);
      GE.settings.apiKeys = mergedKeys;
      GE.ls.set('godeye.settings', GE.settings);
    }
    const lsDb = GE.ls.get(KEY, null);
    if (savedDb && typeof savedDb === 'object' && Array.isArray(savedDb.records)) {
      GE.DB = Object.assign(empty(), savedDb);
    } else if (lsDb && Array.isArray(lsDb.records) && (lsDb.records.length || (lsDb.history && lsDb.history.length))) {
      GE.DB = Object.assign(empty(), lsDb);
      await GE.idb.set('db', GE.DB);
      setTimeout(() => GE.toast('База перенесена в IndexedDB (лимит 5 МБ снят)', { type: 'ok', timeout: 5000 }), 1000);
    } else {
      if (migrateV1IfNeeded()) await GE.idb.set('db', GE.DB);
    }
    await GE.refreshQuota();
  } catch (err) {
    console.warn('IndexedDB fallback to localStorage:', err);
    GE.storage.backend = 'localStorage';
    GE.storage.quota = 5 * 1024 * 1024;
    migrateV1IfNeeded();
  }
  calcDbBytes();
  GE.storage.state = 'saved';
  GE.emit('storage', GE.storage);
};

let saveT, pendingSave = false;
async function persistNow() {
  pendingSave = false;
  const { json, size } = calcDbBytes();
  if (GE.storage.backend === 'indexeddb' && GE.idb.ready) {
    try {
      await GE.idb.set('db', GE.DB);
      // Лёгкое зеркало в localStorage только пока база < 2 МБ
      if (size < LS_MIRROR_LIMIT) {
        try { localStorage.setItem(KEY, json); } catch (e) { /* не критично при IDB */ }
      } else {
        GE.ls.del(KEY);
      }
      GE.storage.state = 'saved';
      GE.storage.lastSavedAt = GE.now();
      GE.emit('storage', GE.storage);
      return true;
    } catch (err) {
      console.error('IDB save error:', err);
      GE.storage.state = 'error';
      GE.emit('storage', GE.storage);
      GE.toast('Ошибка записи в IndexedDB: ' + (err.message || 'проверьте свободное место'), { type: 'err', timeout: 8000 });
      return false;
    }
  } else {
    const ok = GE.ls.set(KEY, GE.DB);
    GE.storage.state = ok ? 'saved' : 'error';
    if (ok) GE.storage.lastSavedAt = GE.now();
    GE.emit('storage', GE.storage);
    if (!ok) GE.toast('Не удалось сохранить: хранилище браузера переполнено. Сделайте резервную копию.', { type: 'err', timeout: 8000 });
    return ok;
  }
}

GE.save = (immediate = false) => {
  clearTimeout(saveT);
  pendingSave = true;
  GE.storage.state = 'saving';
  GE.emit('storage', GE.storage);
  if (immediate) persistNow();
  else saveT = setTimeout(persistNow, 140);
  GE.emit('db');
};
GE.flushSave = () => { if (pendingSave) { clearTimeout(saveT); persistNow(); } };
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') GE.flushSave(); });
window.addEventListener('pagehide', () => GE.flushSave());
GE.storageSize = () => GE.storage.bytes || calcDbBytes().size;

GE.log = (tag, msg, ref) => {
  GE.DB.activity.unshift({ t: GE.now(), tag, msg, ref });
  if (GE.DB.activity.length > 300) GE.DB.activity.length = 300;
};

GE.db = {
  all: () => GE.DB.records,
  get: id => GE.DB.records.find(r => r.id === id),
  byType: t => GE.DB.records.filter(r => r.type === t),
  findTitle: (title, type) => {
    const n = String(title || '').trim().toLowerCase();
    return GE.DB.records.find(r => (!type || r.type === type) && String(r.title).trim().toLowerCase() === n);
  },
  add(type, data, silent) {
    const now = GE.now();
    const rec = Object.assign({ id: GE.uid(GE.TYPES[type].code.toLowerCase()), type, created: now, updated: now }, data);
    rec.type = type;
    GE.DB.records.unshift(rec);
    if (!silent) { GE.log(GE.TYPES[type].code, 'Создано: ' + rec.title, rec.id); GE.save(); }
    return rec;
  },
  update(id, data) {
    const r = GE.db.get(id); if (!r) return null;
    Object.assign(r, data, { updated: GE.now() });
    GE.log(GE.TYPES[r.type].code, 'Изменено: ' + r.title, r.id); GE.save();
    return r;
  },
  remove(ids) {
    ids = [].concat(ids);
    const removed = GE.DB.records.filter(r => ids.includes(r.id));
    const links = GE.DB.links.filter(l => ids.includes(l.from) || ids.includes(l.to));
    GE.DB.records = GE.DB.records.filter(r => !ids.includes(r.id));
    GE.DB.links = GE.DB.links.filter(l => !links.includes(l));
    GE.DB.records.forEach(r => {
      if (ids.includes(r.affiliation)) r.affiliation = '';
      if (Array.isArray(r.linked)) r.linked = r.linked.filter(x => !ids.includes(x));
    });
    GE.log('DEL', 'Удалено записей: ' + removed.length + (removed.length === 1 ? ' — ' + removed[0].title : ''));
    GE.save();
    return { removed, links };
  },
  restore({ removed, links }) {
    GE.DB.records.unshift(...removed); GE.DB.links.push(...links);
    GE.log('UNDO', 'Восстановлено записей: ' + removed.length); GE.save();
  },
  link(from, to, relation, extra = {}) {
    if (!from || !to || from === to) return null;
    const ex = GE.DB.links.find(l => l.from === from && l.to === to && l.relation === relation);
    if (ex) return ex;
    const l = Object.assign({ id: GE.uid('lnk'), from, to, relation: relation || 'связан с', created: GE.now() }, extra);
    GE.DB.links.push(l);
    const a = GE.db.get(from), b = GE.db.get(to);
    GE.log('LINK', `${a ? a.title : '?'} → ${l.relation} → ${b ? b.title : '?'}`);
    GE.save();
    return l;
  },
  unlink(id) { GE.DB.links = GE.DB.links.filter(l => l.id !== id); GE.save(); },
  /** Все связи записи: явные + из полей-ссылок + вики-ссылки */
  edges() {
    const out = [], ids = new Set(GE.DB.records.map(r => r.id));
    GE.DB.links.forEach(l => { if (ids.has(l.from) && ids.has(l.to)) out.push({ id: l.id, from: l.from, to: l.to, rel: l.relation, kind: 'link' }); });
    GE.DB.records.forEach(r => {
      if (r.affiliation && ids.has(r.affiliation)) out.push({ from: r.id, to: r.affiliation, rel: 'состоит в', kind: 'ref' });
      (r.linked || []).forEach(x => { if (ids.has(x)) out.push({ from: r.id, to: x, rel: 'включает', kind: 'ref' }); });
      (r._wikilinks || []).forEach(t => { const x = GE.db.findTitle(t); if (x && x.id !== r.id) out.push({ from: r.id, to: x.id, rel: 'упоминает', kind: 'wiki' }); });
    });
    return out;
  },
  neighbors(id) {
    return GE.db.edges().filter(e => e.from === id || e.to === id).map(e => ({ edge: e, other: GE.db.get(e.from === id ? e.to : e.from), out: e.from === id }));
  }
};

/* ─────────── Поиск по локальной базе (операторы + OR / |) ─────────── */
GE.parseQuery = q => {
  const branches = [];
  let cur = [];
  String(q || '').replace(/(-?)(\w+:)?("([^"]*)"|\S+)/g, (m, neg, key, val, quoted) => {
    if (!neg && !key && quoted == null && (val === 'OR' || val === '|')) {
      if (cur.length) { branches.push(cur); cur = []; }
      return m;
    }
    const v = (quoted != null ? quoted : val).toLowerCase();
    if (v) cur.push({ neg: !!neg, key: key ? key.slice(0, -1).toLowerCase() : null, val: v });
    return m;
  });
  if (cur.length) branches.push(cur);
  branches._isOrTree = true;
  return branches;
};
const KEY_ALIAS = { tag: 'tags', tags: 'tags', rel: 'reliability', cred: 'credibility', type: 'type', t: 'type', status: 'status', country: 'country', src: 'sources' };
GE.recText = r => Object.entries(r).filter(([k]) => !['id', 'thumb', 'created', 'updated', '_wikilinks', '_path'].includes(k)).map(([, v]) => Array.isArray(v) ? v.join(' ') : String(v ?? '')).join(' ').toLowerCase()
  + ' ' + (r.affiliation ? (GE.db.get(r.affiliation)?.title || '') : '').toLowerCase();
const matchOneToken = (rec, t) => {
  let hit;
  const k = t.key && KEY_ALIAS[t.key];
  if (t.key && !k) hit = GE.recText(rec).includes(t.key + ':' + t.val);
  else if (k) {
    let v = rec[k];
    if (k === 'type') v = [rec.type, GE.TYPES[rec.type]?.label, GE.TYPES[rec.type]?.view].join(' ');
    hit = (Array.isArray(v) ? v.join(' ') : String(v ?? '')).toLowerCase().includes(t.val);
  } else hit = GE.recText(rec).includes(t.val);
  return t.neg ? !hit : hit;
};
GE.matchQuery = (rec, tokens) => {
  if (!tokens || !tokens.length) return true;
  if (tokens._isOrTree) return tokens.some(branch => branch.every(t => matchOneToken(rec, t)));
  return tokens.every(t => matchOneToken(rec, t));
};
GE.hlMatch = (text, query) => {
  const s = String(text ?? '');
  if (!query || !query.trim()) return GE.esc(s);
  const branches = GE.parseQuery(query);
  const terms = GE.uniq(branches.flat().filter(t => !t.neg && !t.key && t.val.length >= 2).map(t => t.val)).sort((a, b) => b.length - a.length);
  if (!terms.length) return GE.esc(s);
  const re = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return s.split(re).map((part, i) => i % 2 === 1 ? `<mark class="hl">${GE.esc(part)}</mark>` : GE.esc(part)).join('');
};
/** Нечёткое совпадение для палитры: возвращает балл или -1 */
GE.fuzzy = (text, q) => {
  text = String(text).toLowerCase(); q = q.toLowerCase();
  if (!q) return 1;
  const i = text.indexOf(q);
  if (i >= 0) return 100 - i + (i === 0 ? 50 : 0);
  let ti = 0, score = 0;
  for (const ch of q) { const f = text.indexOf(ch, ti); if (f < 0) return -1; score += f === ti ? 3 : 1; ti = f + 1; }
  return score;
};

/* ─────────── Тосты ─────────── */
GE.toast = (msg, o = {}) => {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (o.type || '');
  el.innerHTML = `<span>${GE.esc(msg)}</span>${o.action ? `<button>${GE.esc(o.action.label)}</button>` : ''}`;
  box.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  if (o.action) el.querySelector('button').onclick = () => { o.action.fn(); kill(); };
  setTimeout(kill, o.timeout || (o.action ? 6000 : 3200));
};

/* ─────────── Модальные окна ─────────── */
GE.modal = ({ title, body, actions = [], size = '', onClose }) => {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">
    <div class="modal-h"><h3>${GE.esc(title)}</h3><button class="btn btn-icon btn-ghost close" aria-label="Закрыть">${GE.icon('x', 'ic')}</button></div>
    <div class="modal-b"></div>
    ${actions.length ? '<div class="modal-f"></div>' : ''}
  </div>`;
  const b = wrap.querySelector('.modal-b');
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); onClose && onClose(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.querySelector('.close').onclick = close;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  const f = wrap.querySelector('.modal-f');
  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.primary ? 'btn-primary ' : '') + (a.danger ? 'btn-danger ' : '') + (a.left ? 'left ' : '');
    btn.innerHTML = a.html || GE.esc(a.label);
    btn.onclick = () => { const r = a.fn ? a.fn({ close, el: wrap }) : null; if (r !== false && !a.keep) close(); };
    f.appendChild(btn);
  });
  $('#modal-root').appendChild(wrap);
  setTimeout(() => { const first = wrap.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select'); first && first.focus(); }, 60);
  return { close, el: wrap };
};
GE.confirm = (msg, { ok = 'Подтвердить', danger = true } = {}) => new Promise(res => {
  let done = false;
  GE.modal({
    title: 'Подтверждение', size: 'narrow', body: `<p style="color:var(--silver)">${GE.esc(msg)}</p>`,
    actions: [{ label: 'Отмена', fn: () => { done = true; res(false); } }, { label: ok, primary: !danger, danger, fn: () => { done = true; res(true); } }],
    onClose: () => { if (!done) res(false); }
  });
});

/* ─────────── Мини-Markdown для отчётов ─────────── */
GE.md = src => {
  const lines = GE.esc(src || '').split(/\r?\n/);
  let html = '', list = null;
  const inline = s => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m, t, _, a) => `<span class="wl" data-wl="${t}">${a || t}</span>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  lines.forEach(l => {
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^&gt;\s?(.*)/))) { closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (/^-{3,}\s*$/.test(l)) { closeList(); html += '<hr>'; }
    else if (!l.trim()) { closeList(); }
    else { closeList(); html += `<p>${inline(l)}</p>`; }
  });
  closeList();
  return html;
};

/* ─────────── Сетевые запросы с таймаутом ─────────── */
GE.fetchJSON = async (url, ms = 9000, opts = {}) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal, referrerPolicy: 'no-referrer' }, opts));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
};

/* ─────────── Чтение файлов ─────────── */
GE.readAs = (file, how = 'arrayBuffer') => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error);
  if (how === 'text') fr.readAsText(file); else if (how === 'dataURL') fr.readAsDataURL(file); else fr.readAsArrayBuffer(file);
});
GE.sha = async (buf, alg = 'SHA-256') => {
  if (!crypto.subtle) return '';
  const h = await crypto.subtle.digest(alg, buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
};

/* ─────────── Шифрованный бэкап (AES-GCM 256 + PBKDF2-SHA256) ─────────── */
const u8ToB64 = u8 => {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(bin);
};
const b64ToU8 = b64 => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
async function deriveAesKey(password, salt, iterations = 250000) {
  if (!crypto.subtle) throw new Error('Web Crypto API недоступен (нужен HTTPS или localhost)');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

GE.crypto = {
  FORMAT: 'GODEYE-ENC-V1',
  isEncrypted: obj => !!(obj && obj.format === 'GODEYE-ENC-V1' && obj.ct && obj.salt && obj.iv),
  async encryptJSON(obj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iter = 250000;
    const key = await deriveAesKey(password, salt, iter);
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    return {
      format: 'GODEYE-ENC-V1',
      alg: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA256',
      iter,
      created: GE.now(),
      version: GE.VERSION,
      recordsCount: Array.isArray(obj.records) ? obj.records.length : 0,
      salt: u8ToB64(salt),
      iv: u8ToB64(iv),
      ct: u8ToB64(ct)
    };
  },
  async decryptJSON(envelope, password) {
    if (!GE.crypto.isEncrypted(envelope)) throw new Error('Файл не является зашифрованной копией GOD EYE');
    const salt = b64ToU8(envelope.salt);
    const iv = b64ToU8(envelope.iv);
    const ct = b64ToU8(envelope.ct);
    const key = await deriveAesKey(password, salt, envelope.iter || 250000);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      throw new Error('Неверный пароль или повреждённый файл');
    }
  },
  exportDialog() {
    if (!crypto.subtle) return GE.toast('Шифрование недоступно в этом контексте (откройте сайт по HTTPS или localhost)', { type: 'err' });
    const body = document.createElement('div');
    body.className = 'stack';
    body.innerHTML = `
      <div class="notice silver" style="margin:0">${GE.icon('shield', 'ic')}<div>База (${GE.db.all().length} записей, ${GE.DB.links.length} связей) будет зашифрована локально алгоритмом <b>AES-256-GCM</b> (PBKDF2 · 250 000 итераций). Без пароля восстановить файл невозможно.</div></div>
      <label class="field"><span>Пароль шифрования (минимум 6 символов)</span><input class="input" type="password" id="enc-p1" autocomplete="new-password" placeholder="Придумайте надёжный пароль…"></label>
      <label class="field"><span>Повторите пароль</span><input class="input" type="password" id="enc-p2" autocomplete="new-password" placeholder="Повторите пароль…"></label>
      <div class="muted mono" id="enc-err" style="font-size:12px;color:#ff6b72"></div>`;
    const m = GE.modal({
      title: 'Зашифрованная резервная копия', size: 'narrow', body,
      actions: [
        { label: 'Отмена' },
        {
          label: 'Зашифровать и скачать', primary: true, keep: true,
          fn: async ({ close, el }) => {
            const p1 = el.querySelector('#enc-p1').value, p2 = el.querySelector('#enc-p2').value, err = el.querySelector('#enc-err');
            if (p1.length < 6) { err.textContent = 'Минимум 6 символов'; el.querySelector('#enc-p1').focus(); return; }
            if (p1 !== p2) { err.textContent = 'Пароли не совпадают'; el.querySelector('#enc-p2').focus(); return; }
            err.textContent = 'Шифрование…';
            try {
              const payload = Object.assign({ exported: GE.now(), version: GE.VERSION }, GE.DB);
              const enc = await GE.crypto.encryptJSON(payload, p1);
              GE.download(`GODEYE_ENCRYPTED_${GE.today()}.gebackup`, JSON.stringify(enc, null, 2), 'application/json');
              GE.settings.lastBackup = GE.now();
              GE.saveSettings();
              GE.log('BACKUP', `Создана зашифрованная копия (${GE.db.all().length} записей)`);
              GE.save();
              close();
              GE.toast('Зашифрованная копия .gebackup сохранена', { type: 'ok' });
            } catch (e) {
              err.textContent = 'Ошибка: ' + e.message;
            }
          }
        }
      ]
    });
    body.querySelector('#enc-p2').addEventListener('keydown', e => { if (e.key === 'Enter') m.el.querySelector('.btn-primary').click(); });
  },
  decryptDialog(envelope) {
    return new Promise(resolve => {
      let done = false;
      const body = document.createElement('div');
      body.className = 'stack';
      body.innerHTML = `
        <div class="notice silver" style="margin:0">${GE.icon('shield', 'ic')}<div>Обнаружен зашифрованный бэкап GOD EYE (${envelope.recordsCount || '?'} записей, создан ${GE.esc(GE.fmtDate(envelope.created))}). Введите пароль для расшифровки.</div></div>
        <label class="field"><span>Пароль</span><input class="input" type="password" id="dec-p" autocomplete="current-password" placeholder="Пароль от файла .gebackup"></label>
        <div class="mono" id="dec-err" style="font-size:12px;color:#ff6b72"></div>`;
      const m = GE.modal({
        title: 'Расшифровка резервной копии', size: 'narrow', body,
        onClose: () => { if (!done) resolve(null); },
        actions: [
          { label: 'Отмена', fn: () => { done = true; resolve(null); } },
          {
            label: 'Расшифровать', primary: true, keep: true,
            fn: async ({ close, el }) => {
              const p = el.querySelector('#dec-p').value, err = el.querySelector('#dec-err');
              if (!p) { err.textContent = 'Введите пароль'; return; }
              err.textContent = 'Расшифровка…';
              try {
                const data = await GE.crypto.decryptJSON(envelope, p);
                done = true; close(); resolve(data);
              } catch (e) {
                err.textContent = e.message;
                el.querySelector('#dec-p').select();
              }
            }
          }
        ]
      });
      body.querySelector('#dec-p').addEventListener('keydown', e => { if (e.key === 'Enter') m.el.querySelector('.btn-primary').click(); });
    });
  }
};

GE.importBackupData = async data => {
  if (!data || !Array.isArray(data.records)) throw new Error('это не резервная копия GOD EYE');
  const mode = await new Promise(res => {
    let done = false;
    GE.modal({
      title: 'Импорт резервной копии', size: 'narrow',
      body: `<p style="color:var(--silver)">В файле найдено <b>${data.records.length}</b> записей и <b>${(data.links || []).length}</b> связей. Как выполнить импорт?</p>`,
      onClose: () => { if (!done) res(null); },
      actions: [
        { label: 'Отмена', left: true, fn: () => { done = true; res(null); } },
        { label: 'Заменить всё', danger: true, fn: () => { done = true; res('replace'); } },
        { label: 'Объединить', primary: true, fn: () => { done = true; res('merge'); } }
      ]
    });
  });
  if (!mode) return false;
  if (mode === 'replace') {
    GE.DB.records = data.records;
    GE.DB.links = data.links || [];
    GE.DB.activity = data.activity || [];
    GE.DB.history = data.history || [];
    GE.DB.saved = data.saved || [];
    GE.DB.watchlist = data.watchlist || [];
    GE.DB.savedFilters = data.savedFilters || [];
  } else {
    const ids = new Set(GE.DB.records.map(r => r.id));
    data.records.forEach(r => { if (!ids.has(r.id)) GE.DB.records.push(r); });
    const lids = new Set(GE.DB.links.map(l => l.id));
    (data.links || []).forEach(l => { if (!lids.has(l.id)) GE.DB.links.push(l); });
    const hq = new Set(GE.DB.history.map(h => h.q));
    (data.history || []).forEach(h => { if (!hq.has(h.q)) GE.DB.history.push(h); });
    const sq = new Set(GE.DB.saved.map(s => s.q));
    (data.saved || []).forEach(s => { if (!sq.has(s.q)) GE.DB.saved.push(s); });
    const wq = new Set((GE.DB.watchlist || []).map(w => w.q));
    (data.watchlist || []).forEach(w => { if (!wq.has(w.q)) GE.DB.watchlist.push(w); });
  }
  GE.log('IMPORT', `Импорт резервной копии (${mode === 'replace' ? 'замена' : 'объединение'}): ${data.records.length} записей`);
  GE.save(true);
  GE.toast('Импорт завершён', { type: 'ok' });
  return true;
};

/* ─────────── Технический разбор телефона (E.164 / открытый план нумерации) ─────────── */
const CC_MAP = [
  ['375', 'Беларусь', 'BY'], ['380', 'Украина', 'UA'], ['374', 'Армения', 'AM'],
  ['372', 'Эстония', 'EE'], ['371', 'Латвия', 'LV'], ['370', 'Литва', 'LT'],
  ['373', 'Молдова', 'MD'], ['995', 'Грузия', 'GE'], ['994', 'Азербайджан', 'AZ'],
  ['998', 'Узбекистан', 'UZ'], ['996', 'Кыргызстан', 'KG'], ['992', 'Таджикистан', 'TJ'],
  ['993', 'Туркменистан', 'TM'], ['971', 'ОАЭ', 'AE'], ['972', 'Израиль', 'IL'],
  ['351', 'Португалия', 'PT'], ['358', 'Финляндия', 'FI'], ['353', 'Ирландия', 'IE'],
  ['357', 'Кипр', 'CY'], ['420', 'Чехия', 'CZ'], ['421', 'Словакия', 'SK'],
  ['381', 'Сербия', 'RS'], ['382', 'Черногория', 'ME'], ['385', 'Хорватия', 'HR'],
  ['48', 'Польша', 'PL'], ['49', 'Германия', 'DE'], ['44', 'Великобритания', 'GB'],
  ['33', 'Франция', 'FR'], ['39', 'Италия', 'IT'], ['34', 'Испания', 'ES'],
  ['31', 'Нидерланды', 'NL'], ['32', 'Бельгия', 'BE'], ['41', 'Швейцария', 'CH'],
  ['43', 'Австрия', 'AT'], ['45', 'Дания', 'DK'], ['46', 'Швеция', 'SE'],
  ['47', 'Норвегия', 'NO'], ['90', 'Турция', 'TR'], ['81', 'Япония', 'JP'],
  ['82', 'Южная Корея', 'KR'], ['86', 'Китай', 'CN'], ['91', 'Индия', 'IN'],
  ['61', 'Австралия', 'AU'], ['55', 'Бразилия', 'BR'], ['52', 'Мексика', 'MX'],
  ['7', 'Россия / Казахстан', 'RU'], ['1', 'США / Канада', 'US']
];
// Крупные DEF/ABC-диапазоны РФ (открытый план нумерации Россвязи/ФАС; фактический оператор мог смениться по MNP)
const RU_DEF_OPS = [
  [/^91[0-9]/, 'МТС', 'Мобильный РФ'],
  [/^98[0-9]/, 'МТС', 'Мобильный РФ'],
  [/^9(03|05|06|09)/, 'Билайн (ВымпелКом)', 'Мобильный РФ'],
  [/^96[0-9]/, 'Билайн (ВымпелКом)', 'Мобильный РФ'],
  [/^92[0-9]/, 'МегаФон', 'Мобильный РФ'],
  [/^93[0-9]/, 'МегаФон', 'Мобильный РФ'],
  [/^999/, 'Yota / МегаФон / MVNO', 'Мобильный РФ'],
  [/^9(00|01|02|04|08|50|51|52|53|58|77|91|92|93|94|95|96)/, 'T2 (Tele2) / MVNO (Т-Мобайл, СберМобайл, Газпромбанк)', 'Мобильный РФ'],
  [/^978/, 'К-Телеком / Миранда / Волна', 'Крым / Севастополь (UTC+3)'],
  [/^9(70|71|86|9[0-8])/, 'MVNO / мульти-операторский DEF', 'Мобильный РФ'],
  [/^80[04]/, 'Бесплатная линия 8-800', 'Федеральный бизнес-номер']
];
const RU_ABC_CITIES = {
  '495': ['Москва', 'UTC+3'], '499': ['Москва', 'UTC+3'], '496': ['Московская область', 'UTC+3'], '498': ['Московская область', 'UTC+3'],
  '812': ['Санкт-Петербург', 'UTC+3'], '813': ['Ленинградская область', 'UTC+3'],
  '343': ['Екатеринбург / Свердловская обл.', 'UTC+5'], '351': ['Челябинск', 'UTC+5'], '342': ['Пермь', 'UTC+5'], '345': ['Тюмень', 'UTC+5'], '347': ['Уфа / Башкортостан', 'UTC+5'], '353': ['Оренбург', 'UTC+5'],
  '383': ['Новосибирск', 'UTC+7'], '381': ['Омск', 'UTC+6'], '382': ['Томск', 'UTC+7'], '384': ['Кемерово', 'UTC+7'], '385': ['Барнаул', 'UTC+7'], '391': ['Красноярск', 'UTC+7'], '395': ['Иркутск', 'UTC+8'],
  '423': ['Владивосток / Приморский край', 'UTC+10'], '421': ['Хабаровск', 'UTC+10'], '411': ['Якутск', 'UTC+9'], '415': ['Петропавловск-Камчатский', 'UTC+12'], '424': ['Южно-Сахалинск', 'UTC+11'],
  '843': ['Казань / Татарстан', 'UTC+3'], '831': ['Нижний Новгород', 'UTC+3'], '846': ['Самара', 'UTC+4'], '848': ['Тольятти', 'UTC+4'], '845': ['Саратов', 'UTC+4'], '844': ['Волгоград', 'UTC+3'], '841': ['Пенза', 'UTC+3'], '842': ['Ульяновск', 'UTC+4'], '851': ['Астрахань', 'UTC+4'],
  '861': ['Краснодар', 'UTC+3'], '862': ['Сочи', 'UTC+3'], '863': ['Ростов-на-Дону', 'UTC+3'], '865': ['Ставрополь', 'UTC+3'], '867': ['Владикавказ', 'UTC+3'], '872': ['Махачкала', 'UTC+3'],
  '473': ['Воронеж', 'UTC+3'], '472': ['Белгород', 'UTC+3'], '474': ['Липецк', 'UTC+3'], '471': ['Курск', 'UTC+3'], '482': ['Тверь', 'UTC+3'], '485': ['Ярославль', 'UTC+3'], '487': ['Тула', 'UTC+3'], '491': ['Рязань', 'UTC+3'], '492': ['Владимир', 'UTC+3'], '493': ['Иваново', 'UTC+3'], '484': ['Калуга', 'UTC+3'],
  '401': ['Калининград', 'UTC+2'], '815': ['Мурманск', 'UTC+3'], '818': ['Архангельск', 'UTC+3'], '814': ['Петрозаводск', 'UTC+3'], '821': ['Сыктывкар', 'UTC+3'], '833': ['Киров', 'UTC+3'], '341': ['Ижевск', 'UTC+4']
};
GE.analyzePhone = raw => {
  const s = String(raw || '').trim();
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  let ruLocal = false;
  // Исправлено: 8XXXXXXXXXX (11 цифр, РФ/КЗ локальный набор — даже если ошибочно введён с '+8...')
  if (digits.length === 11 && /^8[3489]\d{9}$/.test(digits)) {
    digits = '7' + digits.slice(1);
    ruLocal = true;
  } else if (!s.startsWith('+') && digits.length === 10 && /^[3489]\d{9}$/.test(digits)) {
    digits = '7' + digits;
    ruLocal = true;
  }
  const e164 = '+' + digits;
  let country = 'Неизвестно', iso = '—', cc = '';
  for (const [code, name, ciso] of CC_MAP) {
    if (digits.startsWith(code)) { cc = code; country = name; iso = ciso; break; }
  }
  let nsn = cc ? digits.slice(cc.length) : digits;
  let kind = 'Не определён', operator = '', region = '', tz = '';
  if (cc === '7' && nsn.length === 10) {
    const code3 = nsn.slice(0, 3);
    if (/^[67]/.test(nsn)) {
      country = 'Казахстан'; iso = 'KZ'; tz = 'UTC+5';
      kind = nsn.startsWith('7') ? 'Мобильный (Казахстан · ' + code3 + ')' : 'Стационарный (Казахстан)';
      if (/^7(00|08)/.test(nsn)) operator = 'Altel / Tele2 KZ';
      else if (/^7(01|02|75|78)/.test(nsn)) operator = 'Kcell / Activ';
      else if (/^7(05|71|76|77)/.test(nsn)) operator = 'Beeline KZ';
      else if (/^7(07|47)/.test(nsn)) operator = 'Tele2 KZ';
    } else {
      country = 'Россия'; iso = 'RU';
      if (nsn.startsWith('9')) {
        kind = 'Мобильный (DEF ' + code3 + ')';
        for (const [re, op, reg] of RU_DEF_OPS) {
          if (re.test(nsn)) { operator = op; region = reg; break; }
        }
      } else if (/^80[04]/.test(nsn)) {
        kind = 'Бесплатный (8-800 / 8-804)'; operator = 'Федеральная горячая линия / бизнес';
      } else {
        kind = 'Городской / стационарный (ABC ' + code3 + ')';
        if (RU_ABC_CITIES[code3]) {
          region = RU_ABC_CITIES[code3][0];
          tz = RU_ABC_CITIES[code3][1];
          operator = 'Городская АТС · ' + region;
        }
      }
    }
  } else if (cc === '375' && nsn.length === 9) {
    tz = 'UTC+3';
    const c2 = nsn.slice(0, 2);
    kind = /^(25|29|33|44)$/.test(c2) ? 'Мобильный (РБ · ' + c2 + ')' : 'Стационарный (РБ)';
    operator = c2 === '33' ? 'МТС Беларусь' : c2 === '44' ? 'A1 Беларусь' : c2 === '25' ? 'life:)' : c2 === '29' ? 'A1 / МТС Беларусь' : '';
  } else if (cc === '380' && nsn.length === 9) {
    tz = 'UTC+2';
    const c2 = nsn.slice(0, 2);
    kind = 'Мобильный / городской (UA · ' + c2 + ')';
    operator = /^(67|68|96|97|98)$/.test(c2) ? 'Киевстар' : /^(50|66|95|99)$/.test(c2) ? 'Vodafone UA' : /^(63|73|93)$/.test(c2) ? 'lifecell' : '';
  } else if (cc === '1' && nsn.length === 10) {
    kind = /^(800|833|844|855|866|877|888)/.test(nsn) ? 'Toll-Free (США/Канада)' : 'NANP (код зоны ' + nsn.slice(0, 3) + ')';
  }
  const validLen = digits.length >= 7 && digits.length <= 15;
  const formats = [];
  const addF = v => { if (v && !formats.includes(v)) formats.push(v); };
  addF(e164);
  if (cc === '7' && nsn.length === 10) {
    const a = nsn.slice(0, 3), b = nsn.slice(3, 6), c = nsn.slice(6, 8), d = nsn.slice(8, 10);
    addF(`+7 (${a}) ${b}-${c}-${d}`);
    addF(`+7 ${a} ${b}-${c}-${d}`);
    addF(`8 (${a}) ${b}-${c}-${d}`);
    addF(`8${nsn}`);
    addF(`8-${a}-${b}-${c}-${d}`);
    addF(`${a}-${b}-${c}-${d}`);
    addF(nsn);
  } else if (cc === '1' && nsn.length === 10) {
    const a = nsn.slice(0, 3), b = nsn.slice(3, 6), c = nsn.slice(6, 10);
    addF(`+1 (${a}) ${b}-${c}`);
    addF(`${a}-${b}-${c}`);
    addF(`(${a}) ${b}-${c}`);
  } else if (cc && nsn.length >= 6) {
    addF(`+${cc} ${nsn}`);
    addF(digits);
    addF(nsn);
  } else {
    addF(digits);
  }
  return { raw: s, digits, e164, cc, nsn, country, iso, kind, operator, region, tz, validLen, ruLocal, formats };
};

/* ─────────── Умное расширение запроса (транслит, перестановки, варианты ника) ─────────── */
const CYR_LAT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
  р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
};
const translitRuEn = s => String(s || '').replace(/[а-яёА-ЯЁ]/g, ch => {
  const lo = ch.toLowerCase(), t = CYR_LAT[lo] ?? lo;
  return ch !== lo ? t.charAt(0).toUpperCase() + t.slice(1) : t;
});
GE.expandQuery = (raw, type) => {
  const q = String(raw || '').trim();
  if (!q) return [];
  const out = [];
  const add = (label, val, t) => {
    val = String(val || '').trim();
    if (!val || val.toLowerCase() === q.toLowerCase() || out.some(x => x.q.toLowerCase() === val.toLowerCase())) return;
    out.push({ label, q: val, t: t || type });
  };
  if (type === 'username') {
    const u = q.replace(/^@/, '');
    if (/[._-]/.test(u)) {
      add('слитно', u.replace(/[._-]+/g, ''), 'username');
      add('через точку', u.replace(/[._-]+/g, '.'), 'username');
      add('через дефис', u.replace(/[._-]+/g, '-'), 'username');
      add('подчёркивание', u.replace(/[._-]+/g, '_'), 'username');
    } else if (u.length >= 4) {
      add('с _', u + '_', 'username');
      add('с 1', u + '1', 'username');
    }
    add('как текст', `"${u}"`, 'text');
  } else if (type === 'phone') {
    const p = GE.analyzePhone(q);
    if (p) {
      add('E.164', p.e164, 'phone');
      if (p.formats[1]) add('формат', p.formats[1], 'phone');
      if (p.formats[4]) add('8…', p.formats[4], 'phone');
      const orQ = p.formats.slice(0, 5).map(f => `"${f}"`).join(' OR ');
      add('OR-дорк (все форматы)', orQ, 'text');
    }
  } else if (type === 'org') {
    const clean = q.replace(/^(ООО|АО|ПАО|ЗАО|ОАО|ИП|ГУП|МУП|НКО|ФГБУ|АНО)\s*/i, '').replace(/[«»"']/g, '').trim();
    if (clean && clean !== q) {
      add('без формы', clean, 'org');
      add('поиск ИНН', `"${clean}" ИНН`, 'text');
    }
    if (/[а-яё]/i.test(q)) add('транслит', translitRuEn(clean || q), 'org');
  } else if (type === 'domain') {
    const d = q.toLowerCase().replace(/^www\./, '');
    const base = d.split('.')[0];
    if (base && base.length >= 3) add('бренд', base, 'text');
    add('поддомены', `site:*.${d} -site:www.${d}`, 'text');
    add('упоминания вне сайта', `"${d}" -site:${d}`, 'text');
  } else if (type === 'email') {
    const [local, dom] = q.split('@');
    if (local) add('ник из почты', '@' + local, 'username');
    if (dom) add('домен почты', dom, 'domain');
  } else if (type === 'text' || type === 'place' || type === 'person') {
    if (/[а-яё]/i.test(q)) add('транслит EN', translitRuEn(q), type);
    const words = q.replace(/[«»"']/g, '').split(/\s+/).filter(Boolean);
    if (words.length === 2) add('обратный порядок', `${words[1]} ${words[0]}`, type);
    if (words.length >= 2 && !/^".*"$/.test(q)) add('точная фраза', `"${q}"`, 'text');
  }
  return out.slice(0, 6);
};

/* Контекстный фрагмент совпадения для Архива */
GE.matchSnippet = (rec, rawQ) => {
  const q = String(rawQ || '').replace(/\b(OR|AND)\b|\||\b\w+:\S+|-\S+|"/gi, ' ').trim();
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length) return '';
  const hay = [rec.notes, rec.body, rec.objective, rec.conclusion, rec.address, rec.url, (rec.tags || []).join(', ')].filter(Boolean).join(' · ');
  const lo = hay.toLowerCase();
  for (const t of terms) {
    const idx = lo.indexOf(t);
    if (idx >= 0) {
      const start = Math.max(0, idx - 32), end = Math.min(hay.length, idx + t.length + 52);
      return (start > 0 ? '…' : '') + hay.slice(start, end).replace(/\s+/g, ' ') + (end < hay.length ? '…' : '');
    }
  }
  return '';
};

/* ─────────── Классификация открытого транспорта (авиа / море / спутники) ─────────── */
GE.detectTransportKind = q => {
  const s = String(q || '').trim().toUpperCase();
  if (/^IMO[\s:-]?\d{7}$/.test(s)) return { kind: 'imo', label: 'Судно · IMO', val: s.replace(/\D/g, '') };
  if (/^MMSI[\s:-]?\d{9}$/.test(s)) return { kind: 'mmsi', label: 'Судно · MMSI', val: s.replace(/\D/g, '') };
  if (/^(NORAD|SAT|CATNR)[\s:-]?\d{4,6}$/.test(s)) return { kind: 'norad', label: 'Спутник · NORAD', val: s.replace(/\D/g, '') };
  if (/^[0-9A-F]{6}$/.test(s) && (/[A-F]/.test(s) || /^[0-9A-F]{6}$/.test(s))) return { kind: 'icao24', label: 'Борт · ICAO24 Hex', val: s };
  if (/^(RA-\d{5}|RF-\d{5}|EW-\d{3}[A-Z]{2}|UP-[A-Z0-9]{4,5}|VP-[BC][A-Z]{2}|VQ-[BC][A-Z]{2}|EI-[A-Z]{3}|[DFGHIOPST]-[A-Z]{4}|OE-[A-Z]{3}|HB-[A-Z]{3}|PH-[A-Z]{3}|SP-[A-Z]{3}|TC-[A-Z]{3}|A6-[A-Z]{3}|A7-[A-Z]{3}|VH-[A-Z]{3}|C-[FG][A-Z]{3}|JA\d{4}[A-Z]?|B-\d{4}[A-Z]?|N[1-9][0-9]{0,4}[A-Z]{0,2})$/.test(s)) {
    return { kind: 'reg', label: 'Борт · Рег. номер', val: s };
  }
  if (/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(s)) return { kind: 'callsign', label: 'Рейс / Позывной', val: s };
  return { kind: 'unknown', label: 'Транспорт / Борт', val: s };
};

})();
