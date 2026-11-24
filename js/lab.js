/* ═══════════════════════════════════════════════════════════════
   GOD EYE · lab.js — локальная лаборатория (без сети):
   извлечение сущностей, хеши, кодировщик, время/Snowflake, URL, координаты, каталог
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc;
const L = GE.lab = {};

/* ─────────── Вкладки ─────────── */
L.init = () => {
  $('#lab-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    L.tab(b.dataset.tab);
  });
  initExtract(); initHash(); initCodec(); initTime(); initUrl(); initCoords(); initCatalog();
};
L.tab = name => {
  $$('#lab-tabs [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
  $$('[data-pane]').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
};

/* ─────────── Извлечение сущностей ─────────── */
const FILE_EXT = /^(jpe?g|png|gif|webp|svg|html?|php|aspx?|js|css|json|xml|txt|pdf|docx?|xlsx?|pptx?|zip|rar|exe|mp4|mp3|md|csv|ico)$/i;
L.extract = text => {
  const out = {};
  const add = (k, v) => { (out[k] = out[k] || new Set()).add(v); };
  const urls = text.match(/\bhttps?:\/\/[^\s<>"'`)\]}]+/gi) || [];
  urls.forEach(u => add('Ссылки', u.replace(/[.,;:!?»]+$/, '')));
  (text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []).forEach(m => add('Email', m.toLowerCase()));
  (text.match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g) || []).forEach(m => add('IP-адреса', m));
  const stripped = text.replace(/\bhttps?:\/\/[^\s]+/gi, u => ' ' + (GE.host(u) || '') + ' ').replace(/\S+@\S+/g, ' ');
  (stripped.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]+)\b/gi) || []).forEach(m => {
    const tld = m.split('.').pop();
    if (!FILE_EXT.test(tld) && !/^\d+(\.\d+)+$/.test(m)) add('Домены', m.toLowerCase());
  });
  urls.forEach(u => { const h = GE.host(u); if (h) add('Домены', h); });
  for (const m of text.matchAll(/(^|[\s(])#([\p{L}\p{N}_]{2,60})/gu)) add('Хэштеги', '#' + m[2]);
  for (const m of text.matchAll(/(^|[\s(])@([A-Za-z0-9_.]{2,32})\b/g)) add('Упоминания', '@' + m[2]);
  for (const m of text.matchAll(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/g)) { const c = GE.parseCoords(m[1] + ',' + m[2]); if (c) add('Координаты', `${c.lat}, ${c.lon}`); }
  (text.match(/\bCVE-\d{4}-\d{4,}\b/gi) || []).forEach(m => add('CVE', m.toUpperCase()));
  (text.match(/\bAS\d{2,10}\b/gi) || []).forEach(m => add('ASN', m.toUpperCase()));
  (text.match(/\b0x[a-f0-9]{40}\b|\bbc1[a-z0-9]{25,62}\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g) || []).forEach(m => add('Криптоадреса', m));
  (text.match(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?\b|\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g) || []).forEach(m => add('Даты', m));
  (text.match(/\b[a-f0-9]{64}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{32}\b/gi) || []).forEach(m => add('Хеши', m.toLowerCase()));
  const res = {};
  Object.entries(out).forEach(([k, s]) => res[k] = Array.from(s));
  return res;
};
const TYPE_OF = { 'Ссылки': 'url', 'Email': 'email', 'IP-адреса': 'ip', 'Домены': 'domain', 'Хэштеги': 'text', 'Упоминания': 'username', 'Координаты': 'coords', 'Хеши': 'hash', 'Даты': 'text', 'CVE': 'cve', 'ASN': 'asn', 'Криптоадреса': 'crypto' };
function initExtract() {
  const run = () => {
    const txt = $('#ex-in').value;
    const r = L.extract(txt), box = $('#ex-out');
    const total = Object.values(r).reduce((s, a) => s + a.length, 0);
    $('#ex-stat').textContent = `${txt.length} символов · найдено ${total}`;
    if (!total) { box.innerHTML = '<div class="muted">Сущностей не найдено.</div>'; return; }
    box.innerHTML = Object.entries(r).map(([k, arr]) => `<div class="out-group"><h5>${esc(k)} <b>${arr.length}</b><button data-copy="${esc(k)}">копировать</button>${k === 'Ссылки' ? `<button data-save-urls="1">→ в источники</button>` : ''}</h5>
      <div class="chips">${arr.slice(0, 200).map(v => `<button class="chip" data-v="${esc(v)}" data-t="${TYPE_OF[k]}" title="Искать"><span>${esc(v)}</span></button>`).join('')}</div></div>`).join('');
    box.onclick = e => {
      const c = e.target.closest('[data-copy]'); if (c) return GE.copy(r[c.dataset.copy].join('\n'));
      if (e.target.closest('[data-save-urls]')) {
        let n = 0;
        r['Ссылки'].forEach(u => { if (!GE.db.all().some(x => x.url === u)) { GE.db.add('source', { title: GE.host(u) + ' — ' + (new URL(u).pathname.slice(0, 60) || '/'), url: u, retrieved: GE.today(), tags: ['извлечено'] }, true); n++; } });
        GE.log('SRC', `Из текста добавлено источников: ${n}`); GE.save();
        return GE.toast(`Добавлено источников: ${n}`);
      }
      const ch = e.target.closest('[data-v]'); if (ch) { location.hash = `#/search?q=${encodeURIComponent(ch.dataset.v)}&t=${ch.dataset.t}`; }
    };
  };
  $('#ex-run').onclick = run;
  $('#ex-clear').onclick = () => { $('#ex-in').value = ''; $('#ex-out').innerHTML = ''; $('#ex-stat').textContent = ''; };
  $('#ex-in').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); });
}

/* ─────────── Хеши ─────────── */
const hashRows = async (buf, el) => {
  if (!crypto.subtle) { el.innerHTML = '<div class="muted">Хеши недоступны: откройте сайт в Chrome или Edge.</div>'; return; }
  const algs = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  const hs = await Promise.all(algs.map(a => GE.sha(buf, a)));
  el.innerHTML = algs.map((a, i) => `<div class="hash-row"><span>${a}</span><code>${hs[i]}</code><button class="btn btn-icon btn-sm btn-ghost" data-h="${hs[i]}" title="Копировать">${GE.icon('copy')}</button></div>`).join('');
  el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => GE.copy(b.dataset.h));
  return hs;
};
function initHash() {
  $('#hash-in').addEventListener('input', GE.debounce(e => hashRows(new TextEncoder().encode(e.target.value), $('#hash-text-out')), 150));
  $('#hash-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const out = $('#hash-file-out');
    out.innerHTML = `<div class="muted mono" style="font-size:12px">${esc(f.name)} · ${GE.bytes(f.size)} · ${esc(f.type || 'неизвестный тип')}</div><div class="spinner"></div>`;
    const buf = await GE.readAs(f);
    const div = document.createElement('div'); div.className = 'hash-out';
    out.innerHTML = `<div class="muted mono" style="font-size:12px;margin-bottom:6px">${esc(f.name)} · ${GE.bytes(f.size)} · изменён ${esc(GE.fmtDate(new Date(f.lastModified).toISOString()))}</div>`;
    out.appendChild(div);
    const hs = await hashRows(buf, div);
    const match = hs && GE.db.all().find(r => r.file_hash === hs[1]);
    if (match) out.insertAdjacentHTML('beforeend', `<div class="flag warn" style="margin-top:10px"><b>Совпадение в базе:</b>&nbsp;${esc(match.title)}</div>`);
    GE.log('HASH', `${f.name}: SHA-256 вычислен`);
  });
}

/* ─────────── Кодировщик ─────────── */
const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
const OPS = {
  'Base64 →': s => b64e(s), '← Base64': s => b64d(s),
  'URL →': s => encodeURIComponent(s), '← URL': s => decodeURIComponent(s.replace(/\+/g, ' ')),
  'HEX →': s => Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join(' '),
  '← HEX': s => new TextDecoder().decode(Uint8Array.from((s.replace(/[^0-9a-f]/gi, '').match(/../g) || []).map(h => parseInt(h, 16)))),
  'HTML-сущности →': s => GE.esc(s), '← HTML-сущности': s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; },
  'Unicode \\u →': s => Array.from(s).map(c => c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c).join(''),
  '← Unicode \\u': s => s.replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))),
  'Punycode (домен)': s => s.split(/\s+/).map(d => { try { return new URL('http://' + d).hostname; } catch (e) { return d; } }).join('\n'),
  'ROT13': s => s.replace(/[a-z]/gi, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)),
  'Реверс': s => Array.from(s).reverse().join(''),
  'ВЕРХНИЙ / нижний': s => s === s.toUpperCase() ? s.toLowerCase() : s.toUpperCase(),
  'Убрать пробелы': s => s.replace(/\s+/g, ' ').trim()
};
function initCodec() {
  $('#codec-ops').innerHTML = Object.keys(OPS).map(k => `<button class="chip" data-op="${esc(k)}">${esc(k)}</button>`).join('') + `<button class="chip" data-op="__swap">⇅ результат во вход</button><button class="chip" data-op="__copy">копировать</button>`;
  $('#codec-ops').addEventListener('click', e => {
    const b = e.target.closest('[data-op]'); if (!b) return;
    const op = b.dataset.op, inp = $('#codec-in'), out = $('#codec-out');
    if (op === '__swap') { inp.value = out.value; out.value = ''; return; }
    if (op === '__copy') return GE.copy(out.value);
    try { out.value = OPS[op](inp.value); } catch (err) { out.value = '⚠ Ошибка: ' + err.message; }
  });
}

/* ─────────── Время и Snowflake ─────────── */
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dtRows = d => [
  ['UTC', d.toISOString().replace('T', ' ').replace('.000Z', ' Z')],
  ['Местное (' + tz + ')', d.toLocaleString('ru-RU')],
  ['Москва', d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })],
  ['Unix (сек)', String(Math.floor(d.getTime() / 1000))],
  ['Unix (мс)', String(d.getTime())],
  ['День недели', d.toLocaleDateString('ru-RU', { weekday: 'long' })],
  ['Относительно', GE.ago(d.toISOString())]
];
const kvHtml = rows => rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd>`).join('');
function initTime() {
  const upd = () => {
    const v = $('#time-in').value.trim(), out = $('#time-out');
    if (!v) { out.innerHTML = kvHtml(dtRows(new Date())); return; }
    let d;
    if (/^now$|^сейчас$/i.test(v)) d = new Date();
    else if (/^(19|20)\d{12}$/.test(v)) d = new Date(v.replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/, '$1-$2-$3T$4:$5:$6Z')); // метка Wayback
    else if (/^\d{9,11}$/.test(v)) d = new Date(+v * 1000);
    else if (/^\d{12,14}$/.test(v)) d = new Date(+v);
    else d = new Date(v.replace(/^(\d{4}):(\d\d):(\d\d) /, '$1-$2-$3T'));
    out.innerHTML = isNaN(d) ? '<dt>Ошибка</dt><dd>Не удалось распознать дату</dd>' : kvHtml(dtRows(d));
  };
  $('#time-in').addEventListener('input', upd); upd();
  $('#snow-in').addEventListener('input', () => {
    const v = $('#snow-in').value.trim().replace(/\D/g, ''), out = $('#snow-out');
    if (!v) { out.innerHTML = ''; return; }
    try {
      const id = BigInt(v);
      const tw = new Date(Number((id >> 22n) + 1288834974657n));
      const dc = new Date(Number((id >> 22n) + 1420070400000n));
      out.innerHTML = `<dt>X / Twitter</dt><dd class="mono">${esc(tw.toISOString().replace('T', ' ').slice(0, 19))} UTC</dd><dt>Discord</dt><dd class="mono">${esc(dc.toISOString().replace('T', ' ').slice(0, 19))} UTC</dd><dt>Подсказка</dt><dd>Snowflake-ID содержит момент создания. Выберите строку, соответствующую платформе.</dd>`;
    } catch (e) { out.innerHTML = '<dt>Ошибка</dt><dd>Нужен числовой ID</dd>'; }
  });
}

/* ─────────── Анализ URL ─────────── */
const TRACK = /^(utm_[a-z]+|fbclid|gclid|gclsrc|dclid|yclid|ysclid|msclkid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|ref|ref_src|si|spm|share_id|from|feature|s|t)$/i;
L.urlReport = raw => {
  let u;
  try { u = new URL(raw.trim()); } catch (e) { return '<div class="muted">Некорректная ссылка.</div>'; }
  const params = Array.from(u.searchParams.entries());
  const clean = new URL(u.href);
  params.forEach(([k]) => { if (TRACK.test(k)) clean.searchParams.delete(k); });
  const trackers = params.filter(([k]) => TRACK.test(k));
  let decoded = u.href; try { decoded = decodeURI(u.href); } catch (e) { /* ignore */ }
  const nested = params.map(([, v]) => v).filter(v => /^https?:\/\//.test(v));
  return `<dl class="kv">
      <dt>Протокол</dt><dd>${esc(u.protocol.replace(':', ''))}${u.protocol === 'http:' ? ' <span class="badge lo">без шифрования</span>' : ''}</dd>
      <dt>Хост</dt><dd>${esc(u.hostname)}${u.port ? ':' + esc(u.port) : ''}${/^xn--|\.xn--/.test(u.hostname) ? ' <span class="badge lo">punycode — проверьте на подмену</span>' : ''}</dd>
      <dt>Путь</dt><dd>${esc(decodeURIComponent(u.pathname))}</dd>
      ${u.hash ? `<dt>Якорь</dt><dd>${esc(u.hash)}</dd>` : ''}
      <dt>Декодировано</dt><dd>${esc(decoded)}</dd>
      <dt>Чистая ссылка</dt><dd><a href="${esc(clean.href)}" target="_blank" rel="noopener">${esc(clean.href)}</a></dd>
    </dl>
    ${params.length ? `<table class="tbl" style="margin-top:12px"><thead><tr><th>Параметр</th><th>Значение</th><th></th></tr></thead><tbody>${params.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="white-space:normal;overflow-wrap:anywhere">${esc(v)}</td><td>${TRACK.test(k) ? '<span class="badge lo">трекер</span>' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    ${trackers.length ? `<div class="flag warn" style="margin-top:10px"><b>Трекеры:</b>&nbsp;${trackers.length} — ${esc(trackers.map(t => t[0]).join(', '))}. Используйте чистую ссылку при сохранении источника.</div>` : ''}
    ${nested.length ? `<div class="flag warn"><b>Вложенная ссылка (редирект):</b>&nbsp;${nested.map(n => esc(n)).join(', ')}</div>` : ''}`;
};
function initUrl() {
  const upd = () => {
    const v = $('#url-in').value.trim(), out = $('#url-out');
    if (!v) { out.innerHTML = ''; return; }
    out.innerHTML = L.urlReport(v) + `<div class="row" style="margin-top:12px"><a class="btn btn-sm" href="#/search?q=${encodeURIComponent(v)}&t=url">${GE.icon('search')}Поиск по ссылке</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://web.archive.org/save/${esc(v)}">Архивировать</a></div>`;
  };
  $('#url-in').addEventListener('input', GE.debounce(upd, 120));
}

/* ─────────── Координаты ─────────── */
const dms = (v, pos, neg) => {
  const s = v < 0 ? neg : pos; v = Math.abs(v);
  const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), sec = ((mf - m) * 60).toFixed(2);
  return `${d}°${String(m).padStart(2, '0')}'${String(sec).padStart(5, '0')}"${s}`;
};
L.coordReport = (raw, compact) => {
  const c = GE.parseCoords(raw);
  if (!c) return '<div class="muted">Не удалось распознать координаты.</div>';
  const q = `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`;
  const maps = GE.ENGINES.filter(e => e.t.includes('coords')).slice(0, compact ? 5 : 12);
  return `<dl class="kv"><dt>Десятичные</dt><dd class="mono">${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}</dd><dt>DMS</dt><dd class="mono">${dms(c.lat, 'N', 'S')} ${dms(c.lon, 'E', 'W')}</dd><dt>Градусы, минуты</dt><dd class="mono">${Math.floor(Math.abs(c.lat))}° ${((Math.abs(c.lat) % 1) * 60).toFixed(4)}' ${c.lat < 0 ? 'S' : 'N'}, ${Math.floor(Math.abs(c.lon))}° ${((Math.abs(c.lon) % 1) * 60).toFixed(4)}' ${c.lon < 0 ? 'W' : 'E'}</dd></dl>
    <div class="chips" style="margin-top:10px">${maps.map(e => `<a class="chip" target="_blank" rel="noopener" href="${esc(e.u(q))}">${esc(e.n)}</a>`).join('')}</div>
    ${compact ? '' : `<div class="row" style="margin-top:12px"><button class="btn btn-sm btn-primary" data-co-save="${q}">${GE.icon('geo')}Сохранить как локацию</button><a class="btn btn-sm" href="#/search?q=${encodeURIComponent(q)}&t=coords">${GE.icon('search')}Поиск по точке</a></div>`}`;
};
const hav = (a, b) => {
  const R = 6371.0088, toR = x => x * Math.PI / 180;
  const dLa = toR(b.lat - a.lat), dLo = toR(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
  const dist = 2 * R * Math.asin(Math.sqrt(h));
  const y = Math.sin(dLo) * Math.cos(toR(b.lat)), x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(dLo);
  const brg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { dist, brg };
};
function initCoords() {
  $('#co-in').addEventListener('input', () => { const v = $('#co-in').value.trim(); $('#co-out').innerHTML = v ? L.coordReport(v) : ''; });
  $('#co-out').addEventListener('click', e => {
    const b = e.target.closest('[data-co-save]'); if (!b) return;
    const [lat, lon] = b.dataset.coSave.split(',').map(Number);
    GE.editRecord('geo', null, { title: 'Точка ' + b.dataset.coSave, lat, lon, retrieved: GE.today() });
  });
  const upd = () => {
    const a = GE.parseCoords($('#dist-a').value), b = GE.parseCoords($('#dist-b').value), out = $('#dist-out');
    if (!a || !b) { out.innerHTML = ''; return; }
    const r = hav(a, b), dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    out.innerHTML = `<dt>Расстояние</dt><dd class="mono">${r.dist < 1 ? (r.dist * 1000).toFixed(0) + ' м' : r.dist.toFixed(2) + ' км'}</dd><dt>Азимут A→B</dt><dd class="mono">${r.brg.toFixed(1)}° (${dirs[Math.round(r.brg / 45) % 8]})</dd><dt>Маршрут</dt><dd><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/${a.lat},${a.lon}/${b.lat},${b.lon}">открыть в Google Картах</a></dd>`;
  };
  $('#dist-a').addEventListener('input', upd); $('#dist-b').addEventListener('input', upd);
}
L.haversine = hav;

/* ─────────── Каталог ─────────── */
let catCat = '';
function initCatalog() {
  const cats = GE.uniq(GE.TOOLS.map(t => t.c));
  $('#cat-cats').innerHTML = `<button class="chip on" data-c="">Все</button><button class="chip" data-c="★">★ Избранное</button>` + cats.map(c => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $('#cat-cats').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; catCat = b.dataset.c; $$('#cat-cats .chip').forEach(x => x.classList.toggle('on', x === b)); renderCatalog(); });
  $('#cat-q').addEventListener('input', renderCatalog);
  $('#cat-grid').addEventListener('click', e => {
    const f = e.target.closest('[data-fav]'); if (!f) return;
    const n = f.dataset.fav, fav = new Set(GE.settings.catFav);
    fav.has(n) ? fav.delete(n) : fav.add(n);
    GE.settings.catFav = Array.from(fav); GE.saveSettings(); renderCatalog();
  });
  renderCatalog();
}
function renderCatalog() {
  const q = ($('#cat-q').value || '').toLowerCase(), fav = new Set(GE.settings.catFav);
  const list = GE.TOOLS.filter(t => (!catCat || (catCat === '★' ? fav.has(t.n) : t.c === catCat)) && (!q || (t.n + ' ' + t.d + ' ' + t.c).toLowerCase().includes(q)));
  $('#cat-grid').innerHTML = list.map(t => `<div class="tool"><div class="tool-cat">${esc(t.c)}</div><div class="tool-n">${esc(t.n)}</div><div class="tool-d">${esc(t.d)}</div>
    <div class="tool-f"><a href="${esc(t.u)}" target="_blank" rel="noopener">ОТКРЫТЬ →</a><span class="dim mono" style="font-size:10.5px">${esc(GE.host(t.u))}</span><button class="fav ${fav.has(t.n) ? 'on' : ''}" data-fav="${esc(t.n)}" title="Избранное">★</button></div></div>`).join('') || '<div class="empty"><p>Ничего не найдено.</p></div>';
}
})();
