/* ═══════════════════════════════════════════════════════════════
   GOD EYE · app.js — запуск: заставка, маршрутизация, дашборд,
   командная палитра, архив, настройки, горячие клавиши
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc;
const reduced = () => GE.settings.motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═════════════ Заставка ═════════════ */
const Intro = {
  run(force) {
    return new Promise(resolve => {
      const mode = GE.settings.intro;
      const skip = !force && (mode === 'off' || (mode === 'session' && GE.ss.get('godeye.intro')) || reduced());
      if (skip) { resolve(); return; }
      GE.ss.set('godeye.intro', '1');
      const el = $('#intro');
      el.classList.remove('hidden', 'reveal');
      document.body.classList.add('intro-active');
      const title = $('#intro-title');
      title.className = 'intro-title';
      title.innerHTML = 'GOD EYE'.split('').map((ch, i) => ch === ' ' ? '<span class="gap"></span>' : `<span style="--i:${i}">${ch}</span>`).join('');
      ['#intro-sub', '#intro-rule', '#intro-enter'].forEach(s => $(s).classList.remove('on'));
      $('#intro-boot').innerHTML = '';
      const eye = new GE.GodEye($('#intro-canvas'), { mode: 'intro', size: Math.min(0.62, 0.62 * (innerWidth < 700 ? 1.25 : 1)), cy: 0.4, quality: GE.settings.quality === 'min' ? 'lite' : GE.settings.quality });
      eye.start();
      const timers = [];
      const at = (s, fn) => timers.push(setTimeout(fn, s * 1000));
      at(5.0, () => title.classList.add('on'));
      at(5.6, () => { $('#intro-rule').classList.add('on'); $('#intro-sub').classList.add('on'); });
      const boot = ['ИНИЦИАЛИЗАЦИЯ ЯДРА', 'ЗАГРУЗКА БАЗЫ · ' + GE.db.all().length + ' ЗАПИСЕЙ', 'КАЛИБРОВКА ОКА', 'ДОБРО ПОЖАЛОВАТЬ, ' + String(GE.settings.callsign).toUpperCase()];
      boot.forEach((line, i) => at(6.1 + i * 0.32, () => { const d = document.createElement('div'); d.className = 'ok'; d.textContent = '> ' + line; $('#intro-boot').appendChild(d); }));
      at(7.4, () => $('#intro-enter').classList.add('on'));
      let finished = false;
      const finish = async () => {
        if (finished) return; finished = true;
        timers.forEach(clearTimeout);
        document.removeEventListener('keydown', onKey, true);
        await eye.lids(0, 200);
        el.classList.add('reveal');
        document.body.classList.remove('intro-active');
        GE.reveal();
        setTimeout(() => { eye.destroy(); el.classList.add('hidden'); el.classList.remove('reveal'); resolve(); }, 1150);
      };
      const onKey = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(); } };
      document.addEventListener('keydown', onKey, true);
      $('#intro-skip').onclick = finish;
      $('#intro-enter').onclick = finish;
      at(9.2, finish);
    });
  }
};
GE.intro = Intro;

GE.reveal = () => {
  const app = $('#app');
  $$('.nav a').forEach((a, i) => a.style.setProperty('--i', i));
  app.classList.remove('app-pre');
  void app.offsetWidth;
  app.classList.add('app-in');
  setTimeout(() => app.classList.remove('app-in'), 2600);
  try { GE.startHero(); } catch (e) { console.error(e); }
  if (GE.currentView === 'dashboard') GE.dash.count(true);
};

/* ═════════════ Маршрутизация ═════════════ */
const VIEW_TITLE = {};
GE.currentView = null;
GE.go = view => { location.hash = '#/' + view; };
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [view, qs] = h.split('?');
  const sec = $(`.view[data-view="${view}"]`) ? view : 'dashboard';
  const params = new URLSearchParams(qs || '');
  if (GE.currentView !== sec) {
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === sec));
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.view === sec));
    GE.currentView = sec;
    const v = $(`.view[data-view="${sec}"]`);
    $('#crumbs').innerHTML = `GOD EYE <i>/</i> § ${esc(v.dataset.idx)} <i>/</i> <b>${esc(v.dataset.en)}</b>`;
    document.title = (sec === 'dashboard' ? '' : v.dataset.en + ' · ') + 'GOD EYE — OSINT INTELLIGENCE';
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
    onShow(sec);
  }
  if (sec === 'search' && params.get('q')) {
    GE.search.setQuery(params.get('q'), params.get('t') || 'auto', true);
    history.replaceState(null, '', '#/search');
  }
}
function onShow(v) {
  if (v === 'dashboard') { GE.dash.render(); GE.dash.graph && setTimeout(() => { GE.dash.graph.resize(); GE.dash.graph.fit(); GE.dash.graph.kick(0.2); }, 60); }
  if (v === 'connections') { GE.conn.refresh(); setTimeout(() => { GE.conn.g.resize(); GE.conn.g.fit(); GE.conn.g.kick(0.3); }, 60); }
  if (v === 'geolocation') setTimeout(GE.geo.ensure, 30);
  if (v === 'archive') GE.archive.render();
  if (v === 'search') setTimeout(() => $('#search-q').focus(), 80);
}

/* ═════════════ Дашборд ═════════════ */
const D = GE.dash = {};
GE.startHero = () => {
  if (GE.heroEye) { GE.heroEye.start(); return; }
  const cv = $('#hero-eye'); if (!cv) return;
  GE.heroEye = new GE.GodEye(cv, { quality: reduced() ? 'min' : GE.settings.quality, follow: GE.settings.follow, size: 0.94 });
  if (reduced()) GE.heroEye.draw(performance.now()); else GE.heroEye.start();
};
D.init = () => {
  $('#dash-examples').innerHTML = GE.EXAMPLES.map(([t, q]) => `<button class="chip" data-q="${esc(q)}" data-t="${t}"><span>${esc(q)}</span></button>`).join('');
  $('#dash-examples').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; $('#omni-dash input').value = b.dataset.q; updOmni(); });
  const inp = $('#omni-dash input');
  const updOmni = () => { const t = GE.detectType(inp.value); $('#omni-dash .omni-type').textContent = inp.value.trim() ? GE.QTYPES[t].l.toUpperCase() : 'АВТО'; };
  inp.addEventListener('input', updOmni);
  inp.addEventListener('focus', () => GE.heroEye && GE.heroEye.lookAt(inp));
  inp.addEventListener('blur', () => GE.heroEye && GE.heroEye.lookAt(null));
  $('#omni-dash').addEventListener('submit', e => {
    e.preventDefault(); const q = inp.value.trim(); if (!q) { inp.focus(); return; }
    GE.heroEye && GE.heroEye.scan();
    setTimeout(() => { location.hash = `#/search?q=${encodeURIComponent(q)}&t=auto`; }, 260);
  });
  D.graph = new GE.Graph($('#dash-graph'), { mini: true });
  D.render();
};
D.count = animate => {
  const stats = [
    ['person', 'Персоны', 'people'], ['org', 'Организации', 'organizations'], ['source', 'Источники', 'sources'],
    ['geo', 'Локации', 'geolocation'], ['image', 'Изображения', 'images'], ['report', 'Исследования', 'reports']
  ];
  const box = $('#dash-stats');
  if (!box.children.length) {
    box.innerHTML = stats.map(([t, l, v], i) => `<div class="stat rv" style="--i:${i + 1}" data-go="${v}"><svg class="ic"><use href="#i-${GE.TYPES[t].icon}"/></svg><div class="stat-n" data-n="${t}">0</div><div class="stat-l">${l}</div></div>`).join('');
    box.addEventListener('click', e => { const s = e.target.closest('[data-go]'); if (s) GE.go(s.dataset.go); });
  }
  stats.forEach(([t]) => {
    const el = box.querySelector(`[data-n="${t}"]`), target = GE.db.byType(t).length;
    const from = animate ? 0 : +el.textContent || 0;
    if (from === target || reduced()) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 900;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (target - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
};
D.render = () => {
  D.count(false);
  const all = GE.db.all();
  // последние исследования и записи
  const reps = GE.db.byType('report').sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 4);
  const recent = all.filter(r => r.type !== 'report').sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 6 - reps.length);
  const row = r => `<div class="feed-i link" data-open="${r.id}"><span class="k">${GE.TYPES[r.type].code}</span><span class="m sens">${esc(r.title)}</span><span class="t">${esc(GE.ago(r.updated))}</span></div>`;
  $('#dash-recent').innerHTML = (reps.concat(recent)).map(row).join('') || `<div class="muted" style="font-size:13px">Пока пусто. <a href="#" data-demo style="color:#fff;border-bottom:1px solid var(--crimson-3)">Загрузить демо-данные</a> или создайте первое исследование.</div>`;
  // журнал
  $('#dash-activity').innerHTML = GE.DB.activity.slice(0, 7).map(a => `<div class="feed-i ${a.ref ? 'link' : ''}" ${a.ref ? `data-open="${a.ref}"` : ''}><span class="k">${esc(a.tag)}</span><span class="m">${esc(a.msg)}</span><span class="t">${esc(GE.ago(a.t))}</span></div>`).join('') || '<div class="feed-i"><span class="k">SYSTEM</span><span class="m">GOD EYE инициализирован. Все модули в строю.</span><span class="t">сейчас</span></div>';
  // статус
  const size = GE.storageSize(), quota = GE.storage.quota || 5 * 1024 * 1024;
  const links = GE.db.edges().length;
  const backendLabel = GE.storage.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage';
  $('#dash-status').innerHTML = `
    <div class="s"><span class="dot"></span>Ядро и око<b>АКТИВНО</b></div>
    <div class="s"><span class="dot ${GE.settings.live ? '' : 'off'}"></span>Живая разведка<b>${GE.settings.live ? 'ВКЛ' : 'ВЫКЛ'}</b></div>
    <div class="s"><span class="dot ${GE.vault.handle && GE.vault.granted ? 'silver' : 'off'}"></span>Obsidian<b>${GE.vault.handle ? esc(GE.vault.handle.name) : 'не подключён'}</b></div>
    <div class="s"><span class="dot silver"></span>Записей / связей<b>${all.length} / ${links}</b></div>
    <div class="s"><span class="dot silver"></span>Поисковых движков<b>${GE.ENGINES.length}</b></div>
    <div><div class="s"><span class="dot ${GE.storage.persisted ? '' : 'silver'}"></span>Хранилище (${backendLabel})<b>${GE.bytes(size)} / ${GE.bytes(quota)}</b></div><div class="meter"><i style="width:${Math.min(100, size / Math.max(1, quota) * 100).toFixed(2)}%"></i></div></div>`;
  // матрица
  const m = {}; all.forEach(r => { if (r.reliability && r.credibility) { const k = r.reliability + r.credibility; m[k] = (m[k] || 0) + 1; } });
  const max = Math.max(1, ...Object.values(m));
  let html = `<div></div>${[1, 2, 3, 4, 5, 6].map(c => `<div class="mh">${c}<small>${esc(GE.CRED[c])}</small></div>`).join('')}`;
  'ABCDEF'.split('').forEach(r => {
    html += `<div class="mh r">${r} <small>${esc(GE.REL[r])}</small></div>`;
    for (let c = 1; c <= 6; c++) {
      const n = m[r + c] || 0, k = n / max;
      const risk = ('ABCDEF'.indexOf(r) + c - 1) / 10;
      const bg = n ? `rgba(${Math.round(120 + 106 * risk)},${Math.round(20 + 50 * (1 - risk))},${Math.round(30 + 50 * (1 - risk))},${0.15 + 0.6 * k})` : '';
      html += `<div class="mc ${n ? 'has' : ''}" data-cell="${r}${c}" style="${bg ? `background:${bg};border-color:rgba(226,35,46,${0.2 + 0.5 * k})` : ''}" title="${r}${c}: ${n} записей">${n || '·'}</div>`;
    }
  });
  $('#dash-matrix').innerHTML = html;
  // hud
  $('#hud-records').textContent = all.length; $('#hud-links').textContent = links;
  // граф
  if (D.graph) { const d = GE.graphData(); D.graph.setData(d.nodes, d.edges); }
};
document.addEventListener('click', e => {
  const o = e.target.closest('#dash-recent [data-open], #dash-activity [data-open], #ar-log [data-open]'); if (o) GE.openRecord(o.dataset.open);
  const dm = e.target.closest('[data-demo]'); if (dm) { e.preventDefault(); GE.loadDemo(); }
  const cellEl = e.target.closest('[data-cell]'); if (cellEl) { GE.go('archive'); setTimeout(() => { $('#ar-q').value = `rel:${cellEl.dataset.cell[0]} cred:${cellEl.dataset.cell[1]}`; GE.archive.render(); }, 60); }
  const nw = e.target.closest('[data-new]'); if (nw) GE.editRecord(nw.dataset.new);
  const gg = e.target.closest('[data-go]:not(.stat)'); if (gg && gg.tagName === 'BUTTON') GE.go(gg.dataset.go);
});

/* ═════════════ Архив ═════════════ */
const A = GE.archive = { sel: new Set(), sort: 'updated', dir: -1 };
A.init = () => {
  $('#ar-type').innerHTML = '<option value="">Все типы</option>' + GE.TYPE_KEYS.map(t => `<option value="${t}">${esc(GE.TYPES[t].plural)}</option>`).join('');
  ['#ar-q', '#ar-type', '#ar-from', '#ar-to'].forEach(s => $(s).addEventListener('input', GE.debounce(A.render, 100)));
  $('#ar-json').onclick = () => {
    GE.download(`GODEYE_BACKUP_${GE.today()}.json`, JSON.stringify(Object.assign({ exported: GE.now(), version: GE.VERSION }, GE.DB), null, 2), 'application/json');
    GE.settings.lastBackup = GE.now();
    GE.saveSettings();
    GE.log('BACKUP', `Создана JSON-копия (${GE.db.all().length} записей)`);
    GE.save();
    GE.toast('Резервная копия JSON сохранена', { type: 'ok' });
  };
  if ($('#ar-enc')) $('#ar-enc').onclick = () => GE.crypto.exportDialog();
  $('#ar-csv').onclick = () => GE.exportCSV(A.list(), `GODEYE_ARCHIVE_${GE.today()}.csv`);
  $('#ar-obsidian').onclick = () => GE.vault.exportZip(A.sel.size ? GE.db.all().filter(r => A.sel.has(r.id)) : GE.db.all());
  $('#ar-import').onclick = () => $('#json-file').click();
  $('#json-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      let data = JSON.parse(await GE.readAs(f, 'text'));
      if (GE.crypto.isEncrypted(data)) {
        data = await GE.crypto.decryptDialog(data);
        if (!data) { e.target.value = ''; return; }
      }
      await GE.importBackupData(data);
    } catch (err) { GE.toast('Ошибка импорта: ' + err.message, { type: 'err' }); }
    e.target.value = '';
  });
  if ($('#ar-persist')) $('#ar-persist').onclick = () => GE.requestPersist();
  $('#ar-del').onclick = () => { GE.deleteRecords(Array.from(A.sel)); A.sel.clear(); };
  $('#ar-demo').onclick = () => GE.loadDemo();
  $('#ar-wipe').onclick = async () => {
    if (!(await GE.confirm('Удалить ВСЕ записи, связи и историю? Действие необратимо. Сначала сделайте резервную копию.', { ok: 'Удалить всё' }))) return;
    Object.assign(GE.DB, { records: [], links: [], activity: [], history: [], saved: [], watchlist: [] });
    GE.log('WIPE', 'Архив очищен'); GE.save(true); GE.toast('Архив очищен');
  };
  $('#log-clear').onclick = e => { e.preventDefault(); GE.DB.activity = []; GE.save(); };
  A.viewMode = 'table';
  $$('[data-armode]').forEach(b => b.onclick = () => {
    A.viewMode = b.dataset.armode;
    $$('[data-armode]').forEach(x => x.classList.toggle('on', x === b));
    A.render();
  });
  const saveF = $('#ar-save-filter');
  if (saveF) saveF.onclick = () => {
    const q = $('#ar-q').value.trim();
    if (!q) return GE.toast('Введите запрос для сохранения фильтра');
    GE.DB.savedFilters = GE.DB.savedFilters || [];
    if (!GE.DB.savedFilters.some(f => f.q === q)) {
      GE.DB.savedFilters.push({ label: q.slice(0, 22), q });
      GE.save();
      A.renderPresets();
      GE.toast('Фильтр сохранён');
    }
  };
  A.renderPresets = () => {
    const box = $('#ar-presets'); if (!box) return;
    const built = [
      { label: 'Надёжные A/B', q: 'rel:A OR rel:B' },
      { label: 'Исследования', q: 'type:report' },
      { label: 'Live Recon', q: 'tag:живая-разведка' },
      { label: 'С координатами', q: 'type:geo' }
    ];
    const custom = (GE.DB.savedFilters || []).map((f, i) => Object.assign({ idx: i }, f));
    box.innerHTML = built.map(f => `<button class="chip" type="button" data-aq="${esc(f.q)}">${esc(f.label)}</button>`).join('')
      + custom.map(f => `<button class="chip on" type="button" data-aq="${esc(f.q)}">${esc(f.label)} <span data-adel="${f.idx}" title="Удалить">×</span></button>`).join('');
    box.onclick = e => {
      const del = e.target.closest('[data-adel]');
      if (del) { e.stopPropagation(); GE.DB.savedFilters.splice(+del.dataset.adel, 1); GE.save(); return A.renderPresets(); }
      const b = e.target.closest('[data-aq]');
      if (b) { $('#ar-q').value = b.dataset.aq; A.render(); }
    };
  };
  A.renderPresets();
};
A.list = () => {
  const rawQ = $('#ar-q').value.trim();
  const tokens = GE.parseQuery(rawQ), t = $('#ar-type').value, from = $('#ar-from').value, to = $('#ar-to').value;
  const base = GE.db.all().filter(r => (!t || r.type === t) && (!from || (r.created || '').slice(0, 10) >= from) && (!to || (r.created || '').slice(0, 10) <= to));
  let res = base.filter(r => GE.matchQuery(r, tokens));
  // Нечёткий поиск при опечатках, если точный поиск по простому тексту ничего не нашёл
  if (!res.length && rawQ && !/[:|"]|\bOR\b/i.test(rawQ)) {
    res = base.map(r => ({ r, s: GE.fuzzy(r.title + ' ' + GE.recSub(r), rawQ) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.r);
    return res;
  }
  return res.sort((a, b) => String(a[A.sort] ?? '').localeCompare(String(b[A.sort] ?? ''), 'ru') * A.dir);
};
A.render = () => {
  if (GE.currentView !== 'archive') return;
  const list = A.list();
  A.sel.forEach(id => { if (!GE.db.get(id)) A.sel.delete(id); });
  $('#ar-count').textContent = `${list.length} / ${GE.db.all().length}`;
  $('#ar-del').disabled = !A.sel.size;
  const qRaw = $('#ar-q').value;
  const tblWrap = $('#ar-table-wrap'), tlWrap = $('#ar-timeline');
  if (tblWrap) tblWrap.classList.toggle('hidden', A.viewMode === 'timeline');
  if (tlWrap) tlWrap.classList.toggle('hidden', A.viewMode !== 'timeline');
  if (A.viewMode === 'timeline' && tlWrap) {
    const sorted = list.slice().sort((a, b) => String(b.retrieved || b.created || '').localeCompare(String(a.retrieved || a.created || '')));
    tlWrap.innerHTML = sorted.length ? `<div class="timeline">${sorted.map(r => {
      const dt = r.retrieved || (r.created || '').slice(0, 10) || '—';
      const sn = qRaw ? GE.matchSnippet(r, qRaw) : '';
      return `<div class="tl-item" data-id="${r.id}"><div class="tl-dot"></div><div class="tl-date">${esc(GE.fmtDate(dt, false))}</div><div class="tl-card"><div class="row" style="gap:8px"><span class="badge">${GE.TYPES[r.type].code}</span><b class="sens" style="color:#fff">${GE.hlMatch(r.title, qRaw)}</b>${r.type === 'report' ? '' : GE.admBadge(r)}</div><div class="dim" style="font-size:12px;margin-top:4px">${GE.hlMatch(sn || GE.recSub(r), qRaw) || '—'}</div></div></div>`;
    }).join('')}</div>` : '<div class="empty"><p>Для хронологии пока нет записей.</p></div>';
    tlWrap.onclick = e => { const it = e.target.closest('[data-id]'); if (it) GE.openRecord(it.dataset.id); };
  }
  const cols = [['type', 'Тип'], ['title', 'Название'], ['_sub', 'Сведения'], ['_adm', 'Оценка'], ['created', 'Создано'], ['updated', 'Изменено']];
  $('#ar-table').innerHTML = `<thead><tr><th class="chk"><label class="check"><input type="checkbox" id="ar-all" ${list.length && list.every(r => A.sel.has(r.id)) ? 'checked' : ''}></label></th>${cols.map(([k, l]) => `<th data-sort="${k}" class="${A.sort === k ? 'sorted' : ''}">${l}${A.sort === k ? (A.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
    <tbody>${list.map(r => {
      const sn = qRaw ? GE.matchSnippet(r, qRaw) : '';
      return `<tr data-id="${r.id}"><td class="chk"><label class="check"><input type="checkbox" ${A.sel.has(r.id) ? 'checked' : ''}></label></td><td><span class="badge">${GE.TYPES[r.type].code}</span></td><td class="t-title sens">${GE.hlMatch(r.title, qRaw)}${sn ? `<div class="ar-snip">${GE.hlMatch(sn, qRaw)}</div>` : ''}</td><td>${GE.hlMatch(GE.recSub(r), qRaw) || '<span class="dim">—</span>'}</td><td>${r.type === 'report' ? '' : GE.admBadge(r)}</td><td>${esc(GE.fmtDate(r.created))}</td><td>${esc(GE.fmtDate(r.updated))}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">Ничего не найдено</td></tr>'}</tbody>`;
  $('#ar-table').onclick = e => {
    const th = e.target.closest('[data-sort]');
    if (th) { const k = th.dataset.sort; if (k.startsWith('_')) return; A.dir = A.sort === k ? -A.dir : 1; A.sort = k; return A.render(); }
    if (e.target.id === 'ar-all') { list.forEach(r => e.target.checked ? A.sel.add(r.id) : A.sel.delete(r.id)); return A.render(); }
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    if (e.target.closest('.chk')) { const id = tr.dataset.id; A.sel.has(id) ? A.sel.delete(id) : A.sel.add(id); return A.render(); }
    GE.openRecord(tr.dataset.id);
  };
  $('#ar-log').innerHTML = GE.DB.activity.map(a => `<div class="feed-i ${a.ref ? 'link' : ''}" ${a.ref ? `data-open="${a.ref}"` : ''}><span class="k">${esc(a.tag)}</span><span class="m">${esc(a.msg)}</span><span class="t">${esc(GE.fmtDate(a.t))}</span></div>`).join('') || '<div class="muted" style="font-size:12.5px">Журнал пуст.</div>';
  const size = GE.storageSize(), quota = GE.storage.quota || 5242880;
  const counts = GE.TYPE_KEYS.map(t => `<div class="s"><span class="dot silver"></span>${esc(GE.TYPES[t].plural)}<b>${GE.db.byType(t).length}</b></div>`).join('');
  $('#ar-storage').innerHTML = counts
    + `<div class="s"><span class="dot silver"></span>Явных связей<b>${GE.DB.links.length}</b></div>`
    + `<div class="s"><span class="dot ${GE.storage.backend === 'indexeddb' ? '' : 'silver'}"></span>Движок базы<b>${GE.storage.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}</b></div>`
    + `<div class="s"><span class="dot ${GE.storage.persisted ? '' : 'off'}"></span>Защита от очистки<b>${GE.storage.persisted ? 'ВКЛ' : 'не запрошена'}</b></div>`
    + `<div class="s"><span class="dot silver"></span>Последний бэкап<b>${GE.settings.lastBackup ? esc(GE.fmtDate(GE.settings.lastBackup)) : 'ещё не делался'}</b></div>`
    + `<div><div class="s"><span class="dot"></span>Объём данных<b>${GE.bytes(size)} / ${GE.bytes(quota)}</b></div><div class="meter"><i style="width:${Math.min(100, size / Math.max(1, quota) * 100).toFixed(2)}%"></i></div></div>`;
};

/* ═════════════ Командная палитра ═════════════ */
const P = GE.palette = { items: [], idx: 0 };
P.open = (q = '') => { $('#palette').classList.add('on'); const i = $('#pal-q'); i.value = q; P.render(); setTimeout(() => i.focus(), 20); };
P.close = () => $('#palette').classList.remove('on');
P.commands = () => [
  ...$$('.nav a').map(a => ({ g: 'Разделы', icon: a.querySelector('use').getAttribute('href').slice(3), t: Array.from(a.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(), sub: '§ ' + a.querySelector('.nv-idx').textContent, run: () => GE.go(a.dataset.view) })),
  ...GE.TYPE_KEYS.map(t => ({ g: 'Действия', icon: 'plus', t: 'Создать: ' + GE.TYPES[t].label.toLowerCase(), sub: 'NEW', run: () => GE.editRecord(t) })),
  { g: 'Действия', icon: 'link', t: 'Создать связь', run: () => GE.linkDialog() },
  { g: 'Действия', icon: 'image', t: 'Анализ фотографии', run: () => { GE.go('images'); setTimeout(() => $('#img-file') && $('#img-file').click(), 200); } },
  { g: 'Действия', icon: 'vault', t: 'Экспорт в Obsidian (ZIP)', run: () => GE.vault.exportZip() },
  { g: 'Действия', icon: 'vault', t: 'Подключить хранилище Obsidian', run: () => GE.vault.connect() },
  { g: 'Действия', icon: 'shield', t: 'Зашифрованный бэкап (.gebackup)', run: () => GE.crypto.exportDialog() },
  { g: 'Действия', icon: 'down', t: 'Резервная копия JSON', run: () => $('#ar-json').click() },
  { g: 'Действия', icon: 'shield', t: 'Защитить хранилище браузера от очистки', run: () => GE.requestPersist() },
  { g: 'Действия', icon: 'target', t: 'Пакетный скан (Batch Scan до 30 целей)', run: () => { GE.go('search'); GE.search.setMode('batch'); } },
  { g: 'Действия', icon: 'link', t: 'Пересечение двух целей (Diff)', run: () => { GE.go('search'); GE.search.setMode('diff'); } },
  { g: 'Действия', icon: 'eye', t: 'Мониторинг целей (Watchlist)', run: () => { GE.go('search'); GE.search.setMode('watch'); } },
  { g: 'Действия', icon: 'report', t: 'OSINT-плейбуки (сценарии проверки)', run: () => { GE.go('reports'); setTimeout(() => $('#playbooks-panel')?.scrollIntoView({ behavior: 'smooth' }), 100); } },
  { g: 'Действия', icon: 'settings', t: 'Настроить API-ключи Live Recon', run: () => { GE.go('settings'); setTimeout(() => $('#panel-api-keys')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); } },
  { g: 'Действия', icon: 'eye', t: 'Запустить заставку', run: () => GE.intro.run(true) },
  { g: 'Действия', icon: 'bolt', t: 'Красный импульс ока', run: () => GE.GodEye.scanAll() },
  { g: 'Действия', icon: 'shield', t: (GE.settings.secure ? 'Выключить' : 'Включить') + ' режим демонстрации экрана', run: () => { GE.settings.secure = !GE.settings.secure; GE.saveSettings(); } },
  { g: 'Действия', icon: 'archive', t: 'Загрузить демо-данные', run: () => GE.loadDemo() },
  ...['extract', 'hash', 'codec', 'time', 'url', 'coords', 'catalog'].map(k => ({ g: 'Лаборатория', icon: 'tools', t: { extract: 'Извлечение сущностей из текста', hash: 'Хеши файлов и текста', codec: 'Кодировщик Base64/URL/HEX', time: 'Конвертер времени и Snowflake', url: 'Анализ ссылки', coords: 'Координаты и расстояния', catalog: 'Каталог инструментов' }[k], run: () => { GE.go('tools'); setTimeout(() => GE.lab.tab(k), 50); } }))
];
P.render = () => {
  const q = $('#pal-q').value.trim();
  const items = [];
  if (q) {
    const t = GE.detectType(q);
    items.push({ g: 'Поиск в открытых источниках', icon: 'target', t: `Сканировать «${q}»`, sub: GE.QTYPES[t].l.toUpperCase(), run: () => { location.hash = `#/search?q=${encodeURIComponent(q)}&t=auto`; } });
  }
  const tokens = GE.parseQuery(q);
  const recs = GE.db.all().map(r => ({ r, s: q ? Math.max(GE.fuzzy(r.title, q.replace(/\w+:\S+/g, '').trim()), GE.matchQuery(r, tokens) ? 20 : -1) : 1 })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, q ? 8 : 5);
  recs.forEach(({ r }) => items.push({ g: 'Записи', icon: GE.TYPES[r.type].icon, t: r.title, sub: GE.TYPES[r.type].code, run: () => GE.openRecord(r.id) }));
  P.commands().map(c => ({ c, s: GE.fuzzy(c.t, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, q ? 10 : 30).forEach(x => items.push(x.c));
  P.items = items; P.idx = 0;
  let g = '', html = '';
  const hl = s => { if (!q) return esc(s); const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  items.forEach((it, i) => {
    if (it.g !== g) { g = it.g; html += `<div class="pal-g">${esc(g)}</div>`; }
    html += `<button class="pal-i ${i === 0 ? 'on' : ''}" data-i="${i}">${GE.icon(it.icon, 'ic ic-sm')}<span class="${it.g === 'Записи' ? 'sens' : ''}">${hl(it.t)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</button>`;
  });
  $('#pal-list').innerHTML = html || '<div class="muted" style="padding:20px;text-align:center">Ничего не найдено</div>';
};
P.move = d => {
  const els = $$('#pal-list .pal-i'); if (!els.length) return;
  P.idx = (P.idx + d + els.length) % els.length;
  els.forEach((el, i) => el.classList.toggle('on', i === P.idx));
  els[P.idx].scrollIntoView({ block: 'nearest' });
};
P.exec = i => { const it = P.items[i]; if (!it) return; P.close(); it.run(); };
P.init = () => {
  $('#pal-q').addEventListener('input', P.render);
  $('#pal-q').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); P.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); P.move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); P.exec(P.idx); }
    else if (e.key === 'Escape') P.close();
  });
  $('#pal-list').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) P.exec(+b.dataset.i); });
  $('#palette').addEventListener('mousedown', e => { if (e.target.id === 'palette') P.close(); });
  $('#cmd-trigger').onclick = () => P.open();
};

/* ═════════════ Настройки ═════════════ */
const applySettings = () => {
  const s = GE.settings;
  $$('[data-callsign]').forEach(el => el.textContent = String(s.callsign || 'ОПЕРАТОР').toUpperCase());
  document.body.classList.toggle('secure', !!s.secure);
  document.body.classList.toggle('fx-off', !s.spot);
  document.body.classList.toggle('motion-off', !!s.motion);
  if (GE.heroEye) { GE.heroEye.o.follow = s.follow; if (GE.heroEye.o.quality !== s.quality) GE.heroEye.setQuality(s.quality); }
};
function initSettings() {
  const s = GE.settings;
  $('#set-callsign').value = s.callsign;
  $('#set-intro').value = s.intro; $('#set-quality').value = s.quality;
  $('#set-follow').checked = s.follow; $('#set-spot').checked = s.spot; $('#set-motion').checked = s.motion;
  $('#set-secure').checked = s.secure; $('#set-live').checked = s.live;
  $('#set-callsign').addEventListener('input', GE.debounce(e => { s.callsign = e.target.value.trim() || 'ОПЕРАТОР'; GE.saveSettings(); }, 250));
  [['#set-intro', 'intro'], ['#set-quality', 'quality']].forEach(([sel, k]) => $(sel).addEventListener('change', e => { s[k] = e.target.value; GE.saveSettings(); GE.toast('Сохранено'); }));
  [['#set-follow', 'follow'], ['#set-spot', 'spot'], ['#set-motion', 'motion'], ['#set-secure', 'secure'], ['#set-live', 'live']].forEach(([sel, k]) => $(sel).addEventListener('change', e => { s[k] = e.target.checked; GE.saveSettings(); }));
  $('#set-replay').onclick = () => GE.intro.run(true);
  $('#vault-connect').onclick = () => GE.vault.connect();
  $('#vault-pull').onclick = () => GE.vault.pull();
  $('#vault-push').onclick = () => GE.vault.push();
  $('#vault-zip').onclick = () => GE.vault.exportZip();
  $('#vault-files').addEventListener('change', e => { GE.vault.importFiles(e.target.files); e.target.value = ''; });
  if ($('#set-enc-backup')) $('#set-enc-backup').onclick = () => GE.crypto.exportDialog();
  if ($('#set-json-backup')) $('#set-json-backup').onclick = () => $('#ar-json').click();
  if ($('#set-import-backup')) $('#set-import-backup').onclick = () => $('#json-file').click();
  if ($('#set-persist')) $('#set-persist').onclick = () => GE.requestPersist();
  initApiKeys();
  $('#about-ver').textContent = GE.VERSION;
  $('#sf-ver').textContent = GE.VERSION;
  GE.on('settings', applySettings);
  GE.on('storage', renderStorageStatus);
  applySettings();
  renderStorageStatus();
}

function initApiKeys() {
  const fields = ['shodan', 'otx', 'urlscan', 'vt', 'proxy'];
  const keys = GE.settings.apiKeys = Object.assign({ shodan: '', otx: '', urlscan: '', vt: '', proxy: '' }, GE.settings.apiKeys || {});
  const syncUI = () => {
    let active = 0;
    fields.forEach(k => {
      const inp = $('#key-' + k);
      if (inp && inp !== document.activeElement) inp.value = keys[k] || '';
      const has = !!(keys[k] && keys[k].trim());
      if (has && k !== 'proxy') active++;
      const badge = $(`[data-api-st="${k}"]`);
      if (badge) {
        badge.classList.toggle('on', has);
        badge.textContent = has ? 'АКТИВЕН' : (k === 'otx' ? 'ПУБЛИЧНЫЙ' : k === 'proxy' ? 'ПРЯМОЙ' : 'НЕТ');
      }
    });
    const cnt = $('#api-count-badge');
    if (cnt) {
      cnt.classList.toggle('on', active > 0);
      cnt.textContent = `${active} АКТИВНО`;
    }
  };
  let revealed = false;
  if ($('#api-save')) $('#api-save').onclick = () => {
    fields.forEach(k => { const inp = $('#key-' + k); if (inp) keys[k] = inp.value.trim(); });
    GE.saveSettings();
    syncUI();
    GE.toast('API-ключи сохранены локально в браузере', { type: 'ok' });
  };
  if ($('#api-reveal')) $('#api-reveal').onclick = () => {
    revealed = !revealed;
    ['shodan', 'otx', 'urlscan', 'vt'].forEach(k => { const inp = $('#key-' + k); if (inp) inp.type = revealed ? 'text' : 'password'; });
    $('#api-reveal').textContent = revealed ? 'Скрыть' : 'Показать';
  };
  if ($('#api-clear')) $('#api-clear').onclick = async () => {
    if (!await GE.confirm('Удалить все сохранённые API-ключи из этого браузера?')) return;
    fields.forEach(k => { keys[k] = ''; const inp = $('#key-' + k); if (inp) inp.value = ''; });
    GE.saveSettings();
    syncUI();
    GE.toast('API-ключи очищены');
  };
  syncUI();
}

function renderStorageStatus() {
  const st = GE.storage;
  const size = GE.storageSize(), quota = st.quota || 5242880;
  const be = st.backend === 'indexeddb' ? 'IDB' : 'LS';
  const sfBe = $('#sf-backend'); if (sfBe) sfBe.textContent = st.state === 'saving' ? 'СОХР…' : be;
  const sfDot = $('#sf-save-dot'); if (sfDot) sfDot.className = 'dot' + (st.state === 'error' ? ' off' : '');
  const sfStore = $('#sf-store'); if (sfStore) sfStore.textContent = GE.bytes(size);
  const box = $('#set-storage-status');
  if (box) {
    box.innerHTML = `
      <div class="s"><span class="dot ${st.backend === 'indexeddb' ? '' : 'silver'}"></span>Хранилище<b>${st.backend === 'indexeddb' ? 'IndexedDB (без лимита 5 МБ)' : 'localStorage (резервный режим)'}</b></div>
      <div class="s"><span class="dot ${st.persisted ? '' : 'off'}"></span>Защита от автоочистки<b>${st.persisted ? 'Включена (Persistent)' : 'Не запрошена'}</b></div>
      <div class="s"><span class="dot silver"></span>Занято / доступно<b>${GE.bytes(size)} / ${GE.bytes(quota)}</b></div>
      <div class="s"><span class="dot silver"></span>Последний бэкап<b>${GE.settings.lastBackup ? esc(GE.fmtDate(GE.settings.lastBackup)) : 'ещё не делался'}</b></div>`;
  }
}

/* ═════════════ Обновление интерфейса при изменении данных ═════════════ */
const refreshAll = GE.debounce(() => {
  GE.TYPE_KEYS.forEach(GE.renderEntity);
  $$('[data-count]').forEach(el => { const t = el.dataset.count; el.textContent = t === 'links' ? (GE.db.edges().length || '') : (GE.db.byType(t).length || ''); });
  $('#sf-records').textContent = GE.db.all().length;
  $('#sf-store').textContent = GE.bytes(GE.storageSize());
  if (GE.currentView === 'dashboard') D.render();
  if (GE.currentView === 'archive') A.render();
  renderStorageStatus();
  if (GE.currentView === 'connections') GE.conn.refresh();
  else if (GE.conn.g) GE.conn.refresh();
  GE.geo.refresh();
  GE.vault.status();
  if (GE.drawerId && !GE.db.get(GE.drawerId)) GE.closeDrawer();
}, 60);

/* ═════════════ Горячие клавиши и мелочи ═════════════ */
function initGlobal() {
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').classList.contains('on') ? P.close() : P.open(); return; }
    if (e.key === 'Escape') { if ($('#palette').classList.contains('on')) return P.close(); if ($('#drawer').classList.contains('on') && !$('#modal-root').children.length) return GE.closeDrawer(); }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || $('#modal-root').children.length) return;
    if (e.key === '/') { e.preventDefault(); const f = $('.view.active input[type=search], .view.active .search-field input, .view.active .omni input'); f ? f.focus() : P.open(); }
    if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'т') { const ent = $('.view.active')?.dataset.entity; if (ent) { e.preventDefault(); GE.editRecord(ent); } }
  });
  $('#scrim').onclick = GE.closeDrawer;
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  // прожектор сетки фона
  let raf = 0, mx = -500, my = -500;
  window.addEventListener('pointermove', e => {
    mx = e.clientX; my = e.clientY;
    if (!raf && GE.settings.spot) raf = requestAnimationFrame(() => { raf = 0; const s = document.documentElement.style; s.setProperty('--mx', mx + 'px'); s.setProperty('--my', my + 'px'); });
  }, { passive: true });
  // часы
  const tick = () => {
    const d = new Date();
    const utc = d.toISOString().slice(11, 19);
    $('#clock-utc').textContent = utc; $('#clock-local').textContent = `${GE.pad(d.getHours())}:${GE.pad(d.getMinutes())}`;
    $('#hud-time').textContent = utc;
    const s = $('#hud-signal'); if (s && d.getSeconds() % 3 === 0) s.textContent = (97 + Math.random() * 2.9).toFixed(1) + '%';
    const g = $('#hud-gaze'); if (g && GE.heroEye) g.textContent = `GAZE ${(GE.heroEye.g.x >= 0 ? '+' : '') + GE.heroEye.g.x.toFixed(2)} · ${(GE.heroEye.g.y >= 0 ? '+' : '') + GE.heroEye.g.y.toFixed(2)}`;
  };
  tick(); setInterval(tick, 1000);
  setInterval(() => { const g = $('#hud-gaze'); if (g && GE.heroEye && GE.currentView === 'dashboard') g.textContent = `GAZE ${(GE.heroEye.g.x >= 0 ? '+' : '') + GE.heroEye.g.x.toFixed(2)} · ${(GE.heroEye.g.y >= 0 ? '+' : '') + GE.heroEye.g.y.toFixed(2)}`; }, 120);
  window.addEventListener('godeye:downgrade', () => { GE.settings.quality = 'lite'; GE.saveSettings(); $('#set-quality').value = 'lite'; GE.toast('Компьютер не успевал отрисовывать око — качество снижено до «облегчённого». Можно вернуть в настройках.', { timeout: 7000 }); });
}

/* ═════════════ Старт ═════════════ */
async function boot() {
  await GE.initStorage();
  $$('.view[data-entity]').forEach(GE.buildEntityView);
  GE.img.init(); GE.geo.init();
  // повторно отрисовать список изображений и локаций после вставки дополнительных блоков
  GE.TYPE_KEYS.forEach(GE.renderEntity);
  GE.search.init();
  GE.lab.init();
  GE.conn.init();
  if (GE.pro) GE.pro.init();
  D.init();
  A.init();
  P.init();
  initSettings();
  initGlobal();
  GE.on('db', refreshAll);
  GE.vault.restore();
  refreshAll();
  renderStorageStatus();
  window.addEventListener('hashchange', route);
  route();
  Intro.run(false).then(() => {
    if ($('#app').classList.contains('app-pre')) { document.body.classList.remove('intro-active'); GE.reveal(); }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
