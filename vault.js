/* ═══════════════════════════════════════════════════════════════
   GOD EYE · vault.js — обмен данными с хранилищем Obsidian
   • запись ↔ заметка Markdown с YAML-свойствами и [[вики-ссылками]]
   • прямое подключение папки (File System Access API, Chrome/Edge)
   • импорт папки в любом браузере, экспорт ZIP
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, esc = GE.esc;
const V = GE.vault = { handle: null };

const TYPE_BY_FM = { person: 'person', people: 'person', персона: 'person', organization: 'org', org: 'org', организация: 'org', geolocation: 'geo', geo: 'geo', location: 'geo', локация: 'geo', image: 'image', изображение: 'image', source: 'source', источник: 'source', research: 'report', report: 'report', исследование: 'report', отчёт: 'report' };
const TYPE_BY_DIR = { '01 People': 'person', '02 Organizations': 'org', '03 Geolocation': 'geo', '04 Images': 'image', '05 Sources': 'source', '07 Research': 'report', '08 Reports': 'report' };
const FM_TYPE = { person: 'person', org: 'organization', geo: 'geolocation', image: 'image', source: 'source', report: 'report' };
const SKIP_KEYS = new Set(['id', 'type', 'title', 'thumb', 'created', 'updated', 'notes', 'body', 'objective', 'conclusion', '_wikilinks', '_path']);

/* ─────────── Имена файлов ─────────── */
V.safeName = s => String(s || 'Без названия').replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Без названия';
const folderFor = r => r.type === 'report' ? (r.status === 'Завершено' || r.status === 'Архив' ? '08 Reports' : '07 Research') : GE.TYPES[r.type].folder;

/* ─────────── YAML (подмножество) ─────────── */
const yq = v => {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
};
V.toYAML = obj => Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) =>
  Array.isArray(v) ? `${k}:\n${v.map(x => '  - ' + yq(x)).join('\n')}` : `${k}: ${yq(v)}`).join('\n');

V.parseFrontmatter = text => {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {}; let key = null;
  const unq = s => {
    s = s.trim();
    if (/^".*"$/.test(s)) { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } }
    if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    if (s === 'true' || s === 'false') return s === 'true';
    return s;
  };
  m[1].split(/\r?\n/).forEach(line => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && key) { if (!Array.isArray(data[key])) data[key] = []; data[key].push(unq(li[1])); return; }
    const kv = line.match(/^([^:\s][^:]*):\s*(.*)$/);
    if (kv) {
      key = kv[1].trim();
      const v = kv[2];
      if (v === '' || v === '|' || v === '>') data[key] = '';
      else if (/^\[.*\]$/.test(v.trim())) data[key] = v.trim().slice(1, -1).split(',').map(unq).filter(x => x !== '');
      else data[key] = unq(v);
    }
  });
  return { data, body: text.slice(m[0].length) };
};
const unlink = v => String(v || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();

/* ─────────── Запись → заметка ─────────── */
V.recToMd = (r, names) => {
  const T = GE.TYPES[r.type];
  const nm = id => { const x = GE.db.get(id); return x ? (names && names.get(id) || V.safeName(x.title)) : null; };
  const fm = { type: FM_TYPE[r.type], godeye_id: r.id };
  T.fields.forEach(f => {
    if (SKIP_KEYS.has(f.k)) return;
    let v = r[f.k];
    if (f.t === 'ref') v = v && nm(v) ? `[[${nm(v)}]]` : '';
    if (f.t === 'refs') v = (v || []).map(nm).filter(Boolean).map(n => `[[${n}]]`);
    if (f.k === 'reliability' || f.k === 'credibility') v = v ? String(v) : '';
    fm[f.k] = v;
  });
  if (r.reliability || r.credibility) fm.admiralty = (r.reliability || 'F') + (r.credibility || '6');
  fm.tags = GE.uniq(['godeye/' + r.type, ...(r.tags || []).map(t => String(t).replace(/\s+/g, '-'))]);
  fm.created = (r.created || '').slice(0, 10); fm.updated = (r.updated || '').slice(0, 10);
  let md = `---\n${V.toYAML(fm)}\n---\n\n# ${r.title}\n\n`;
  const sub = GE.recSub(r); if (sub) md += `> [!godeye] ${T.label.toUpperCase()}\n> ${sub}\n\n`;
  if (r.type === 'report') {
    if (r.objective) md += `## Цель\n${r.objective}\n\n`;
    if (r.body) md += `## Ход работы и находки\n${r.body}\n\n`;
    if (r.conclusion) md += `## Вывод\n${r.conclusion}\n\n`;
  }
  if (r.notes) md += `## Заметки\n${r.notes}\n\n`;
  const urls = GE.uniq([].concat(r.url || [], r.website || [], r.image_url || [], r.archived_url || [], r.sources || []).filter(u => GE.safeUrl(u)));
  if (urls.length) md += `## Источники\n${urls.map(u => `- ${u}`).join('\n')}\n\n`;
  const links = GE.DB.links.filter(l => l.from === r.id).map(l => ({ l, b: nm(l.to) })).filter(x => x.b);
  if (links.length) md += `## Связи\n${links.map(({ l, b }) => `- ${l.relation} → [[${b}]]${l.note ? ' — ' + l.note : ''}`).join('\n')}\n\n`;
  md += `---\n*Создано в GOD EYE · ${GE.fmtDate(r.updated || r.created)}*\n`;
  return md;
};

/* ─────────── Заметка → запись ─────────── */
V.mdToRec = (path, text) => {
  const parts = path.split('/'), file = parts.pop(), dir = parts.find(p => TYPE_BY_DIR[p]);
  const { data, body } = V.parseFrontmatter(text);
  const type = TYPE_BY_FM[String(data.type || '').toLowerCase()] || TYPE_BY_DIR[dir];
  if (!type || /^_/.test(file)) return null;
  const T = GE.TYPES[type];
  const title = file.replace(/\.md$/i, '');
  const rec = { type, title, _path: path };
  if (data.godeye_id) rec.id = String(data.godeye_id);
  T.fields.forEach(f => {
    if (f.k === 'title' || data[f.k] === undefined || data[f.k] === '') return;
    let v = data[f.k];
    if (f.t === 'tags' || f.t === 'urls') v = GE.toList(Array.isArray(v) ? v : String(v));
    if (f.t === 'number') v = v === '' ? '' : +v;
    if (f.t === 'ref') v = { _ref: unlink(v) };
    if (f.t === 'refs') v = { _refs: GE.toList(v).map(unlink) };
    if (f.t === 'rel' || f.t === 'cred' || f.t === 'date') v = String(v);
    rec[f.k] = v;
  });
  if (!rec.reliability && /^[A-F][1-6]$/.test(String(data.admiralty || ''))) { rec.reliability = data.admiralty[0]; rec.credibility = data.admiralty[1]; }
  rec.tags = GE.toList(data.tags || []).map(t => String(t).replace(/^#/, '')).filter(t => !/^godeye\//.test(t));
  // тело: убираем заголовок и служебный блок; секции разбираем
  let b = body.replace(/^\s*#\s+.*\n/, '').replace(/^>\s*\[!godeye\][^\n]*\n(>.*\n)*/m, '').replace(/\n---\n\*Создано в GOD EYE[^\n]*\n?$/, '');
  const sec = {};
  b.split(/^##\s+/m).forEach((chunk, i) => {
    if (i === 0) { if (chunk.trim()) sec._intro = chunk.trim(); return; }
    const nl = chunk.indexOf('\n'); sec[chunk.slice(0, nl < 0 ? undefined : nl).trim().toLowerCase()] = nl < 0 ? '' : chunk.slice(nl + 1).trim();
  });
  rec._links = [];
  if (sec['связи']) sec['связи'].split('\n').forEach(l => { const m = l.match(/^\s*-\s*(.+?)\s*→\s*\[\[([^\]|]+)/); if (m) rec._links.push({ rel: m[1].trim(), to: m[2].trim() }); });
  if (sec['источники']) { const urls = (sec['источники'].match(/https?:\/\/\S+/g) || []); rec.sources = GE.uniq([...(rec.sources || []), ...urls.filter(u => u !== rec.url && u !== rec.website && u !== rec.archived_url && u !== rec.image_url)]); }
  if (type === 'report') {
    if (sec['цель']) rec.objective = sec['цель'];
    if (sec['ход работы и находки'] || sec['находки']) rec.body = sec['ход работы и находки'] || sec['находки'];
    if (sec['вывод']) rec.conclusion = sec['вывод'];
  }
  const known = new Set(['связи', 'источники', 'цель', 'ход работы и находки', 'находки', 'вывод', 'заметки']);
  const notes = [sec._intro, sec['заметки'], ...Object.entries(sec).filter(([k]) => !known.has(k) && k !== '_intro').map(([k, v]) => `## ${k}\n${v}`)].filter(Boolean).join('\n\n');
  if (type === 'report' && !rec.body && notes) rec.body = notes; else if (notes) rec.notes = notes;
  rec._wikilinks = GE.uniq((body.match(/\[\[([^\]|#]+)/g) || []).map(s => s.slice(2).trim()));
  return rec;
};

/* ─────────── Слияние импортированного в базу ─────────── */
V.merge = recs => {
  let added = 0, updated = 0, linksN = 0;
  const now = GE.now(), out = [];
  recs.forEach(n => {
    let ex = (n.id && GE.db.get(n.id)) || GE.db.findTitle(n.title, n.type);
    const clean = Object.assign({}, n); delete clean._links;
    if (ex) { Object.assign(ex, clean, { id: ex.id, updated: now }); updated++; out.push([ex, n]); }
    else { const r = Object.assign({ id: n.id || GE.uid(GE.TYPES[n.type].code.toLowerCase()), created: now, updated: now }, clean); GE.DB.records.unshift(r); added++; out.push([r, n]); }
  });
  // ссылки по названиям
  out.forEach(([r, n]) => {
    Object.keys(r).forEach(k => {
      if (r[k] && r[k]._ref !== undefined) { const x = GE.db.findTitle(r[k]._ref); r[k] = x ? x.id : ''; }
      if (r[k] && r[k]._refs) r[k] = r[k]._refs.map(t => GE.db.findTitle(t)).filter(Boolean).map(x => x.id);
    });
    (n._links || []).forEach(l => { const to = GE.db.findTitle(l.to); if (to && !GE.DB.links.some(x => x.from === r.id && x.to === to.id && x.relation === l.rel)) { GE.DB.links.push({ id: GE.uid('lnk'), from: r.id, to: to.id, relation: l.rel, created: now }); linksN++; } });
  });
  GE.log('VAULT', `Импорт из Obsidian: +${added}, обновлено ${updated}, связей ${linksN}`);
  GE.save();
  return { added, updated, linksN };
};

/* ─────────── ZIP (без сжатия) ─────────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
V.zip = files => {
  const enc = new TextEncoder(), chunks = [], central = [];
  let offset = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  files.forEach(f => {
    const name = enc.encode(f.path), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    chunks.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cSize = central.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
};

/* Имена файлов без коллизий */
V.nameMap = recs => {
  const map = new Map(), used = new Set();
  recs.forEach(r => {
    let n = V.safeName(r.title), base = n, i = 2;
    while (used.has(n.toLowerCase())) n = `${base} ${i++}`;
    used.add(n.toLowerCase()); map.set(r.id, n);
  });
  return map;
};
V.filesFor = recs => {
  const names = V.nameMap(GE.db.all());
  const files = recs.map(r => ({ path: r._path || `${folderFor(r)}/${names.get(r.id)}.md`, data: V.recToMd(r, names), rec: r }));
  if (GE.DB.links.length && recs.length > 1) {
    const rows = GE.DB.links.map(l => { const a = names.get(l.from), b = names.get(l.to); return a && b ? `| [[${a}]] | ${l.relation} | [[${b}]] | ${l.reliability || ''} |` : ''; }).filter(Boolean);
    files.push({ path: '06 Connections/Карта связей (GOD EYE).md', data: `---\ntype: "connections-map"\ntags:\n  - "godeye/connections"\nupdated: "${GE.today()}"\n---\n\n# Карта связей\n\nСформировано сайтом GOD EYE. Откройте граф Obsidian (Ctrl+G), чтобы увидеть связи визуально.\n\n| Откуда | Связь | Куда | Надёжность |\n|---|---|---|---|\n${rows.join('\n')}\n` });
  }
  return files;
};
V.exportZip = (recs, label) => {
  recs = recs || GE.db.all();
  if (!recs.length) return GE.toast('Нет записей для экспорта', { type: 'err' });
  const files = V.filesFor(recs).map(f => ({ path: 'GOD EYE/' + f.path, data: f.data }));
  GE.download(`GODEYE_Obsidian_${GE.today()}.zip`, V.zip(files));
  GE.log('VAULT', `ZIP для Obsidian: ${files.length} заметок` + (label ? ' · ' + label : ''));
  GE.save();
  GE.toast(`Готово: ${files.length} заметок. Распакуйте архив поверх папки хранилища GOD EYE.`, { timeout: 6000 });
};

/* ─────────── Прямое подключение (File System Access API) ─────────── */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('godeye', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbSet = async (k, v) => { const db = await idb(); return new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); }); };
const idbGet = async k => { const db = await idb(); return new Promise(res => { const tx = db.transaction('kv'); const q = tx.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
V.supported = () => 'showDirectoryPicker' in window;

V.restore = async () => {
  if (!V.supported()) return V.status();
  try { const h = await idbGet('vault'); if (h) { V.handle = h; V.granted = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } } catch (e) { /* ignore */ }
  V.status();
};
V.ensurePerm = async () => {
  if (!V.handle) return false;
  if ((await V.handle.queryPermission({ mode: 'readwrite' })) === 'granted') return (V.granted = true);
  V.granted = (await V.handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  V.status();
  return V.granted;
};
V.connect = async () => {
  if (!V.supported()) { GE.toast('Ваш браузер не поддерживает прямое подключение. Используйте Chrome или Edge — или «Импорт папки» и «ZIP».', { type: 'err', timeout: 7000 }); return; }
  try {
    const h = await window.showDirectoryPicker({ id: 'godeye-vault', mode: 'readwrite' });
    let looks = false;
    for await (const [name] of h.entries()) { if (name === '.obsidian' || /^0\d /.test(name)) { looks = true; break; } }
    if (!looks && !(await GE.confirm(`Папка «${h.name}» не похожа на хранилище Obsidian (нет .obsidian и папок 01…09). Всё равно подключить?`, { ok: 'Подключить', danger: false }))) return;
    V.handle = h; V.granted = true;
    await idbSet('vault', h);
    GE.log('VAULT', 'Подключено хранилище: ' + h.name); GE.save();
    GE.toast('Хранилище «' + h.name + '» подключено');
    V.status();
  } catch (e) { if (e.name !== 'AbortError') GE.toast('Не удалось подключить: ' + e.message, { type: 'err' }); }
};
async function* walk(dir, prefix = '') {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || name === '10 Templates' || name === 'Assets') continue;
    if (h.kind === 'directory') yield* walk(h, prefix + name + '/');
    else if (/\.md$/i.test(name)) yield [prefix + name, h];
  }
}
V.pull = async () => {
  if (!(await V.ensurePerm())) return GE.toast('Нет доступа к папке хранилища', { type: 'err' });
  const recs = [];
  for await (const [path, h] of walk(V.handle)) {
    try { const f = await h.getFile(); const r = V.mdToRec(path, await f.text()); if (r) recs.push(r); } catch (e) { /* пропускаем */ }
  }
  const res = V.merge(recs);
  GE.toast(`Импорт: новых ${res.added}, обновлено ${res.updated}, связей ${res.linksN}`);
};
const getDir = async (root, path) => { let d = root; for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: true }); return d; };
V.push = async () => {
  if (!(await V.ensurePerm())) return GE.toast('Нет доступа к папке хранилища', { type: 'err' });
  const recs = GE.db.all(); if (!recs.length) return GE.toast('Нет записей для записи', { type: 'err' });
  const files = V.filesFor(recs);
  let written = 0, renamed = 0, skipped = 0;
  for (const f of files) {
    const parts = f.path.split('/'), name = parts.pop(), dir = await getDir(V.handle, parts.join('/'));
    let target = name;
    try {
      const ex = await dir.getFileHandle(name);
      const txt = await (await ex.getFile()).text();
      const id = V.parseFrontmatter(txt).data.godeye_id;
      if (f.rec && !id && f.rec._path === f.path) { skipped++; continue; } // заметка написана вручную в Obsidian — не трогаем
      if (f.rec && (id ? String(id) !== f.rec.id : true)) { target = name.replace(/\.md$/, ' (GOD EYE).md'); renamed++; }
    } catch (e) { /* файла нет — создаём */ }
    const fh = await dir.getFileHandle(target, { create: true });
    const w = await fh.createWritable(); await w.write(f.data); await w.close();
    if (f.rec) f.rec._path = parts.concat(target).join('/');
    written++;
  }
  GE.log('VAULT', `Записано в хранилище: ${written} заметок`); GE.save();
  GE.toast(`Записано заметок: ${written}${renamed ? ` · ${renamed} с пометкой «(GOD EYE)», чтобы не затереть ваши заметки` : ''}${skipped ? ` · ${skipped} ваших заметок оставлены без изменений` : ''}`, { timeout: 7000 });
};
V.importFiles = async fileList => {
  const recs = [];
  for (const f of Array.from(fileList)) {
    if (!/\.md$/i.test(f.name)) continue;
    const path = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
    if (/(^|\/)(\.obsidian|10 Templates|Assets)\//.test(path)) continue;
    const r = V.mdToRec(path, await f.text()); if (r) recs.push(r);
  }
  if (!recs.length) return GE.toast('В выбранной папке нет заметок GOD EYE (01 People, 02 Organizations…)', { type: 'err', timeout: 6000 });
  const res = V.merge(recs);
  GE.toast(`Импорт: новых ${res.added}, обновлено ${res.updated}, связей ${res.linksN}`);
};

V.status = () => {
  const on = !!V.handle;
  const sv = $('#sf-vault'), dot = $('#sf-vault-dot');
  if (sv) sv.textContent = on ? (V.granted ? V.handle.name : 'нужен доступ') : 'не подключён';
  if (dot) dot.className = 'dot ' + (on && V.granted ? 'silver' : 'off');
  const st = $('#vault-status');
  if (st) st.innerHTML = `
    <div class="s"><span class="dot ${on && V.granted ? 'silver' : 'off'}"></span>Хранилище<b>${on ? esc(V.handle.name) : '—'}</b></div>
    <div class="s"><span class="dot ${V.supported() ? 'silver' : 'off'}"></span>Прямой доступ к папкам<b>${V.supported() ? 'поддерживается' : 'нет (используйте ZIP)'}</b></div>
    <div class="s"><span class="dot ${on && V.granted ? 'silver' : 'off'}"></span>Разрешение<b>${on ? (V.granted ? 'чтение и запись' : 'нажмите «Импорт» — браузер спросит') : '—'}</b></div>`;
  ['#vault-pull', '#vault-push'].forEach(s => { const b = $(s); if (b) b.disabled = !on; });
};
})();
