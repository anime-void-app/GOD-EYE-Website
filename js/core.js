/* ═══════════════════════════════════════════════════════════════
   GOD EYE · core.js — ядро: утилиты, база данных, схемы, интерфейсные примитивы
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const GE = window.GE = window.GE || {};
GE.VERSION = '2.0.0';

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
  view: {}
}, GE.ls.get('godeye.settings', {}));
GE.saveSettings = () => { GE.ls.set('godeye.settings', GE.settings); GE.emit('settings', GE.settings); };

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

/* ─────────── База данных ─────────── */
const KEY = 'godeye.v2';
const empty = () => ({ v: 2, records: [], links: [], activity: [], history: [], saved: [] });
GE.DB = Object.assign(empty(), GE.ls.get(KEY, {}));

/* Миграция данных из первой версии сайта (ключ godeyeDB) */
(function migrate() {
  if (GE.DB.records.length || GE.ls.get('godeye.migrated')) return;
  const old = GE.ls.get('godeyeDB');
  if (!old) return;
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
})();

let saveT;
GE.save = () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!GE.ls.set(KEY, GE.DB)) GE.toast('Не удалось сохранить: хранилище браузера переполнено. Удалите крупные изображения или сделайте экспорт.', { type: 'err', timeout: 8000 });
  }, 120);
  GE.emit('db');
};
GE.storageSize = () => { try { return (localStorage.getItem(KEY) || '').length * 2; } catch (e) { return 0; } };

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

/* ─────────── Поиск по локальной базе (операторы) ─────────── */
GE.parseQuery = q => {
  const tokens = [];
  String(q || '').replace(/(-?)(\w+:)?("([^"]*)"|\S+)/g, (m, neg, key, val, quoted) => {
    tokens.push({ neg: !!neg, key: key ? key.slice(0, -1).toLowerCase() : null, val: (quoted != null ? quoted : val).toLowerCase() });
    return m;
  });
  return tokens.filter(t => t.val);
};
const KEY_ALIAS = { tag: 'tags', tags: 'tags', rel: 'reliability', cred: 'credibility', type: 'type', t: 'type', status: 'status', country: 'country', src: 'sources' };
GE.recText = r => Object.entries(r).filter(([k]) => !['id', 'thumb', 'created', 'updated', '_wikilinks', '_path'].includes(k)).map(([, v]) => Array.isArray(v) ? v.join(' ') : String(v ?? '')).join(' ').toLowerCase()
  + ' ' + (r.affiliation ? (GE.db.get(r.affiliation)?.title || '') : '').toLowerCase();
GE.matchQuery = (rec, tokens) => tokens.every(t => {
  let hit;
  const k = t.key && KEY_ALIAS[t.key];
  if (t.key && !k) hit = GE.recText(rec).includes(t.key + ':' + t.val);
  else if (k) {
    let v = rec[k];
    if (k === 'type') v = [rec.type, GE.TYPES[rec.type]?.label, GE.TYPES[rec.type]?.view].join(' ');
    hit = (Array.isArray(v) ? v.join(' ') : String(v ?? '')).toLowerCase().includes(t.val);
  } else hit = GE.recText(rec).includes(t.val);
  return t.neg ? !hit : hit;
});
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

})();
