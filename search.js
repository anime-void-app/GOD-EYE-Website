/* ═══════════════════════════════════════════════════════════════
   GOD EYE · search.js — центр поиска: автоопределение цели, движки,
   «живая разведка» (CORS API + кэш + pivot + сохранение отчёта),
   конструктор операторов, история
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc, E = encodeURIComponent;

const LIVE_CACHE = new Map(); // key -> { ts, res }
const CACHE_TTL = 10 * 60 * 1000; // 10 минут

const S = GE.search = {
  q: '',
  type: 'auto',
  eff: 'text',
  engFilter: '',
  selected: new Set(),
  runId: 0,
  lastScan: null
};

/* ─────────── Инициализация ─────────── */
S.init = () => {
  const tabs = $('#type-tabs');
  tabs.innerHTML = Object.entries(GE.QTYPES).map(([k, v]) => `<button class="chip" data-type="${k}">${esc(v.l)}</button>`).join('');
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    S.type = b.dataset.type; S.render(); if (S.q) S.run(false);
  });
  const inp = $('#search-q');
  inp.addEventListener('input', () => { S.q = inp.value; S.render(); });
  inp.addEventListener('focus', () => GE.heroEye && GE.heroEye.lookAt(inp));
  inp.addEventListener('blur', () => GE.heroEye && GE.heroEye.lookAt(null));
  $('#omni-search').addEventListener('submit', e => { e.preventDefault(); S.q = inp.value.trim(); S.run(true); });

  const ef = $('#eng-filter');
  if (ef) ef.addEventListener('input', GE.debounce(() => { S.engFilter = ef.value.trim().toLowerCase(); S.render(); }, 100));

  $('#eng-all').onclick = () => { $$('#engines .eng[data-ext="1"]').forEach(el => S.selected.add(el.dataset.k)); S.paintSel(); };
  $('#eng-none').onclick = () => { S.selected.clear(); S.paintSel(); };
  const presetSelect = pred => {
    S.selected.clear();
    const visible = S.enginesFor(S.eff).filter(e => !e.internal && pred(e));
    visible.forEach(e => S.selected.add(e.k));
    S.paintSel();
    if (!visible.length) GE.toast('Нет подходящих движков для этого пресета');
  };
  if ($('#eng-fast')) $('#eng-fast').onclick = () => presetSelect(e => !!e.fast);
  if ($('#eng-ru')) $('#eng-ru').onclick = () => presetSelect(e => e.reg === 'ru');
  if ($('#eng-fav')) $('#eng-fav').onclick = () => {
    const fav = new Set(GE.settings.engFav || []);
    presetSelect(e => fav.has(e.n));
  };

  $('#eng-copy').onclick = () => { const l = S.selectedLinks(); if (!l.length) return GE.toast('Выберите движки'); GE.copy(l.map(x => `${x.n}: ${x.url}`).join('\n')); };
  $('#eng-open').onclick = () => {
    const l = S.selectedLinks();
    if (!S.q) return GE.toast('Введите цель поиска', { type: 'err' });
    if (!l.length) return GE.toast('Отметьте движки флажками', { type: 'err' });
    if (l.some(x => x.manual)) GE.copy(GE.normQuery(S.q, S.eff));
    let blocked = 0;
    l.forEach(x => { const w = window.open(x.url, '_blank', 'noopener'); if (!w) blocked++; });
    GE.log('SEARCH', `Открыто вкладок: ${l.length - blocked} · ${S.q}`);
    if (blocked) GE.toast(`Браузер заблокировал ${blocked} вкладок. Разрешите всплывающие окна для этой страницы (значок в адресной строке).`, { type: 'err', timeout: 7000 });
  };
  $('#save-query').onclick = () => {
    if (!S.q) return GE.toast('Сначала введите цель');
    if (!GE.DB.saved.some(s => s.q === S.q)) { GE.DB.saved.unshift({ q: S.q, type: S.eff, t: GE.now() }); GE.save(); }
    S.renderSide(); GE.toast('Цель сохранена');
  };
  $('#hist-clear').onclick = e => { e.preventDefault(); GE.DB.history = []; GE.save(); S.renderSide(); };
  $('#live-save').onclick = () => S.saveAsSource();
  if ($('#live-save-report')) $('#live-save-report').onclick = () => S.saveAsReport();
  if ($('#live-to-graph')) $('#live-to-graph').onclick = () => S.sendToGraph();
  if ($('#live-watch')) $('#live-watch').onclick = () => GE.pro && GE.pro.watchCurrent();
  if ($('#live-refresh')) $('#live-refresh').onclick = () => { if (S.q) S.live(true); };
  $$('[data-smode]').forEach(b => b.addEventListener('click', () => S.setMode(b.dataset.smode)));
  S.initDork();
  S.render(); S.renderSide();
};

S.setMode = mode => {
  $$('[data-smode]').forEach(b => b.classList.toggle('on', b.dataset.smode === mode));
  $$('[data-spane]').forEach(p => p.classList.toggle('on', p.dataset.spane === mode));
  if (mode === 'watch' && GE.pro) GE.pro.renderWatch();
};

S.setQuery = (q, type = 'auto', run = true) => {
  S.q = q; S.type = GE.QTYPES[type] ? type : 'auto';
  const inp = $('#search-q'); if (inp) inp.value = q;
  S.render();
  if (run && q) S.run(true);
};

S.effType = () => S.type === 'auto' ? GE.detectType(S.q) : S.type;

/* ─────────── Сохранение результатов «Живой разведки» ─────────── */
S.buildScanMarkdown = () => {
  const sc = S.lastScan;
  if (!sc) return '';
  const lines = [
    `## Сводка сканирования GOD EYE`,
    `- **Цель:** \`${sc.q}\``,
    `- **Тип:** ${GE.QTYPES[sc.type]?.l || sc.type}`,
    `- **Дата (UTC):** ${sc.ts.replace('T', ' ').slice(0, 19)} UTC`,
    ''
  ];
  sc.order.forEach(title => {
    const item = sc.sections.get(title);
    if (!item || !item.md) return;
    lines.push(`### ${title}`, item.md.trim(), '');
  });
  return lines.join('\n').trim();
};

S.saveAsSource = () => {
  if (!S.q) return;
  const q = GE.normQuery(S.q, S.eff);
  const url = /^https?:/.test(S.q) ? S.q : S.eff === 'domain' ? 'https://' + q : '';
  const md = S.buildScanMarkdown();
  GE.editRecord('source', null, {
    title: S.q,
    url,
    source_type: S.eff === 'image' ? 'Изображение' : S.eff === 'regid' ? 'Реестр' : 'Сайт',
    retrieved: GE.today(),
    tags: ['поиск', 'живая-разведка', S.eff],
    notes: md
  });
};

S.saveAsReport = () => {
  if (!S.q) return;
  const md = S.buildScanMarkdown();
  const typeLabel = GE.QTYPES[S.eff]?.l || S.eff;
  GE.editRecord('report', null, {
    title: `Разведка: ${S.q}`,
    report_type: S.eff === 'org' || S.eff === 'regid' ? 'Профиль организации' : S.eff === 'coords' || S.eff === 'place' ? 'Геолокация' : S.eff === 'image' ? 'Проверка изображения' : 'Общее',
    status: 'В работе',
    confidence: 'Средняя',
    objective: `Сбор открытых данных по цели «${S.q}» (${typeLabel}).`,
    body: md || `Первичная проверка цели \`${S.q}\`.`,
    tags: ['живая-разведка', S.eff]
  });
};

/* Авто-построение графа связей из результатов Live Recon */
S.sendToGraph = () => {
  const sc = S.lastScan;
  if (!sc || !sc.q) return GE.toast('Сначала выполните скан');
  const nodes = sc.graphNodes || [];
  const rootType = sc.type === 'org' || sc.type === 'regid' ? 'org' : sc.type === 'coords' || sc.type === 'place' ? 'geo' : sc.type === 'image' ? 'image' : 'source';
  const ensure = (title, type, extra = {}) => {
    const clean = String(title || '').trim();
    if (!clean) return null;
    const ex = GE.db.all().find(r => r.title.toLowerCase() === clean.toLowerCase() && r.type === type);
    if (ex) return ex.id;
    const rec = GE.db.add(type, Object.assign({ title: clean, retrieved: GE.today(), tags: ['граф-скан', sc.type] }, extra), true);
    return rec.id;
  };
  const rootId = ensure(sc.q, rootType, {
    url: /^https?:/.test(sc.q) ? sc.q : sc.type === 'domain' ? 'https://' + sc.normQ : '',
    notes: S.buildScanMarkdown().slice(0, 2000)
  });
  let createdLinks = 0;
  const seen = new Set();
  nodes.slice(0, 28).forEach(n => {
    const key = n.label + '|' + n.rel;
    if (seen.has(key) || !n.label || n.label.toLowerCase() === sc.q.toLowerCase()) return;
    seen.add(key);
    const nid = ensure(n.label, n.recType || 'source', n.extra || {});
    if (nid && nid !== rootId) {
      const hasL = GE.DB.links.some(l => (l.from === rootId && l.to === nid) || (l.from === nid && l.to === rootId));
      if (!hasL) { GE.db.link(rootId, nid, n.rel || 'связан с'); createdLinks++; }
    }
  });
  GE.log('GRAPH', `Авто-граф из скана «${sc.q}»: узлов ${seen.size}, связей +${createdLinks}`);
  GE.save();
  GE.toast(`Добавлено на граф: ${seen.size} узлов`, { type: 'ok' });
  GE.go('connections');
};

/* ─────────── Движки (умная контекстная фильтрация и адаптивное ранжирование) ─────────── */
S.enginesFor = type => GE.ENGINES.map((e, i) => Object.assign({ k: 'e' + i }, e)).filter(e => e.t.includes(type));
S.linkFor = (e, q) => { try { return e.u(GE.normQuery(q, S.eff)); } catch (err) { return ''; } };
S.selectedLinks = () => S.enginesFor(S.eff).filter(e => !e.internal && S.selected.has(e.k)).map(e => ({ n: e.n, manual: !!e.manual, url: S.linkFor(e, S.q) })).filter(x => /^https?:/.test(x.url));

S.renderExpander = () => {
  const bar = $('#query-expand');
  if (!bar) return;
  const items = S.q.trim() ? GE.expandQuery(S.q, S.eff) : [];
  if (!items.length) { bar.innerHTML = ''; bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `<span class="qe-lbl">ВАРИАНТЫ:</span>` + items.map(it =>
    `<button class="chip" type="button" data-eq="${esc(it.q)}" data-et="${esc(it.t)}" title="${esc(it.q)}"><span class="dim">${esc(it.label)}:</span> ${esc(it.q.length > 36 ? it.q.slice(0, 35) + '…' : it.q)}</button>`
  ).join('');
  bar.onclick = e => {
    const b = e.target.closest('[data-eq]');
    if (b) S.setQuery(b.dataset.eq, b.dataset.et, true);
  };
};

S.render = () => {
  S.eff = S.effType();
  $$('#type-tabs [data-type]').forEach(b => b.classList.toggle('on', b.dataset.type === S.type));
  const chip = $('#search-type-chip');
  if (chip) chip.textContent = (S.type === 'auto' ? 'АВТО → ' : '') + GE.QTYPES[S.eff].l.toUpperCase();
  S.renderExpander();
  const box = $('#engines'); if (!box) return;
  const fav = new Set(GE.settings.engFav || []);
  const usage = GE.settings.engUsage || {};
  let list = S.enginesFor(S.eff);

  // Контекстная подтиповая фильтрация (криптосеть / авиа-море-космос)
  const hasQ = !!S.q.trim();
  const cryptoNet = hasQ && S.eff === 'crypto' ? GE.detectCryptoNet(S.q) : '';
  const trKind = hasQ && S.eff === 'transport' ? GE.detectTransportKind(S.q).kind : '';
  const trSub = trKind === 'imo' || trKind === 'mmsi' ? 'sea' : trKind === 'norad' ? 'space' : (trKind === 'reg' || trKind === 'icao24' || trKind === 'callsign') ? 'air' : '';
  const isRuCtx = /[а-яё]/i.test(S.q) || /\.(ru|рф|su|by|kz)\b/i.test(S.q) || (S.eff === 'phone' && /^\+?(7|8|375)/.test(S.q.replace(/[^\d+]/g, '')));

  if (cryptoNet) list = list.filter(e => !e.sub || e.sub === cryptoNet);
  if (trSub) list = list.filter(e => !e.sub || e.sub === trSub);
  if (S.engFilter) {
    list = list.filter(e => (e.n + ' ' + e.d + ' ' + e.c).toLowerCase().includes(S.engFilter));
  }
  const score = e => (fav.has(e.n) ? 1000 : 0) + Math.min(400, (usage[e.n] || 0) * 20) + (isRuCtx && e.reg === 'ru' ? 80 : 0) + (e.fast ? 20 : 0);
  const groups = {};
  list.forEach(e => (groups[e.c] = groups[e.c] || []).push(e));
  Object.values(groups).forEach(arr => arr.sort((a, b) => score(b) - score(a)));
  box.innerHTML = Object.entries(groups).map(([g, es]) => `
    <div class="eng-group"><div class="eng-group-h">${esc(g)} · ${es.length}<button data-grp="${esc(g)}">выбрать группу</button></div>
    <div class="engines">${es.map((e, idx) => {
      const url = hasQ ? S.linkFor(e, S.q) : '';
      const internal = !!e.internal || url.startsWith('#');
      const isFav = fav.has(e.n);
      const isTop = (usage[e.n] || 0) >= 3;
      const flags = `${isTop ? '<span class="eng-tag top" title="Часто используется вами">TOP</span>' : ''}${e.login ? '<span class="eng-tag" title="Сервис часто требует вход">LOGIN</span>' : ''}${e.manual ? '<span class="eng-tag copy" title="При клике цель копируется в буфер — вставьте Ctrl+V">COPY</span>' : ''}`;
      return `<div class="eng ${!internal && S.selected.has(e.k) ? 'sel-on' : ''}" style="--i:${Math.min(idx, 14)}" data-k="${e.k}" data-ext="${internal ? '0' : '1'}" data-manual="${e.manual ? '1' : '0'}">
        ${internal ? '<span class="eng-pin" title="Переход внутри GOD EYE">↳</span>' : `<label class="check"><input type="checkbox" ${S.selected.has(e.k) ? 'checked' : ''}></label>`}
        <div style="min-width:0">
          <div class="eng-n">${esc(e.n)} ${flags}</div>
          <div class="eng-d">${esc(e.d)}</div>
        </div>
        <div class="eng-acts">
          <button class="fav ${isFav ? 'on' : ''}" data-efav="${esc(e.n)}" title="В избранные движки">★</button>
          ${hasQ ? `<a class="go" href="${esc(url)}" ${internal ? '' : 'target="_blank" rel="noopener"'} title="${e.manual ? 'Открыть и скопировать цель' : 'Открыть'}">${GE.icon(internal ? 'target' : 'ext')}</a>` : ''}
        </div>
      </div>`;
    }).join('')}</div></div>`).join('') || '<div class="empty"><p>Для этого типа цели или фильтра движки не найдены — используйте «Живую разведку» и лабораторию.</p></div>';

  box.querySelectorAll('.eng').forEach(el => {
    const cb = el.querySelector('input[type=checkbox]');
    if (cb) cb.addEventListener('change', () => { cb.checked ? S.selected.add(el.dataset.k) : S.selected.delete(el.dataset.k); S.paintSel(); });
    const go = el.querySelector('a.go');
    if (go) go.addEventListener('click', () => {
      const name = el.querySelector('.eng-n').childNodes[0].textContent.trim();
      GE.settings.engUsage = GE.settings.engUsage || {};
      GE.settings.engUsage[name] = (GE.settings.engUsage[name] || 0) + 1;
      GE.saveSettings();
      GE.log('SEARCH', `${name} · ${S.q}`);
      if (el.dataset.manual === '1' && S.q) {
        const norm = GE.normQuery(S.q, S.eff);
        navigator.clipboard?.writeText(norm).catch(() => {});
        GE.toast(`«${norm}» скопировано — вставьте (Ctrl+V) на странице ${name}`, { timeout: 4500 });
      }
    });
  });
  box.querySelectorAll('[data-efav]').forEach(b => b.addEventListener('click', () => {
    const set = new Set(GE.settings.engFav || []);
    set.has(b.dataset.efav) ? set.delete(b.dataset.efav) : set.add(b.dataset.efav);
    GE.settings.engFav = Array.from(set);
    GE.saveSettings();
    S.render();
  }));
  box.querySelectorAll('[data-grp]').forEach(b => b.addEventListener('click', () => {
    const els = Array.from(b.closest('.eng-group').querySelectorAll('.eng[data-ext="1"]'));
    const all = els.every(el => S.selected.has(el.dataset.k));
    els.forEach(el => all ? S.selected.delete(el.dataset.k) : S.selected.add(el.dataset.k));
    S.paintSel();
  }));
  S.paintSel();
};

S.paintSel = () => {
  const ks = new Set($$('#engines .eng[data-ext="1"]').map(el => el.dataset.k));
  let n = 0;
  $$('#engines .eng[data-ext="1"]').forEach(el => {
    const on = S.selected.has(el.dataset.k);
    el.classList.toggle('sel-on', on);
    const cb = el.querySelector('input[type=checkbox]');
    if (cb) cb.checked = on;
    if (on) n++;
  });
  [...S.selected].forEach(k => { if (!ks.has(k)) S.selected.delete(k); });
  $('#eng-sel').textContent = 'ВЫБРАНО: ' + n;
};

/* ─────────── Запуск поиска ─────────── */
S.run = (addHistory) => {
  if (!S.q.trim()) return;
  S.eff = S.effType(); S.render();
  if (addHistory) {
    GE.DB.history = [{ q: S.q, type: S.eff, t: GE.now() }, ...GE.DB.history.filter(h => h.q !== S.q)].slice(0, 60);
    GE.log('SCAN', `${GE.QTYPES[S.eff].l}: ${S.q}`);
    GE.save(); S.renderSide();
    GE.GodEye && GE.GodEye.scanAll();
  }
  const sub = $('#live-sub'); if (sub) sub.textContent = `${GE.QTYPES[S.eff].l} · ${S.q}`;
  $('#live-save').disabled = false;
  if ($('#live-save-report')) $('#live-save-report').disabled = false;
  if ($('#live-to-graph')) $('#live-to-graph').disabled = false;
  if ($('#live-watch')) $('#live-watch').disabled = false;
  if ($('#live-refresh')) $('#live-refresh').disabled = false;
  S.live(false);
};

S.renderSide = () => {
  const row = h => `<div class="hist-i"><span class="ty">${esc((GE.QTYPES[h.type] || GE.QTYPES.text).l.toUpperCase())}</span><button class="q" data-q="${esc(h.q)}" data-t="${esc(h.type)}" title="${esc(h.q)}">${esc(h.q)}</button><span class="dim" style="font-size:10px">${esc(GE.ago(h.t))}</span></div>`;
  const hist = $('#search-history'), saved = $('#search-saved');
  if (hist) hist.innerHTML = GE.DB.history.slice(0, 14).map(row).join('') || '<div class="muted" style="font-size:12.5px">История пуста.</div>';
  if (saved) saved.innerHTML = GE.DB.saved.map(h => row(h).replace('</div>', `<button class="btn btn-icon btn-sm btn-ghost" data-unsave="${esc(h.q)}" title="Убрать">${GE.icon('x')}</button></div>`)).join('') || '<div class="muted" style="font-size:12.5px">Нажмите ☆, чтобы сохранить цель.</div>';
  $$('.hist-i .q').forEach(b => b.onclick = () => S.setQuery(b.dataset.q, b.dataset.t));
  $$('[data-unsave]').forEach(b => b.onclick = () => { GE.DB.saved = GE.DB.saved.filter(s => s.q !== b.dataset.unsave); GE.save(); S.renderSide(); });
};

/* ─────────── Помощники «Живой разведки» ─────────── */
const card = (title, id, canRetry = true, idx = 0) => `<div class="live-card" id="lc-${id}" data-loading="1" style="--i:${Math.min(idx, 10)}"><div class="live-card-h"><span>${esc(title)}</span><span class="st"><span class="spinner"></span></span>${canRetry ? `<button class="live-retry" data-retry="${id}" title="Повторить запрос (без кэша)">↻</button>` : ''}</div><div class="live-card-b scanline">Запрос…</div></div>`;
const done = (id, html, ok = true, status) => {
  const el = $('#lc-' + id); if (!el) return;
  el.removeAttribute('data-loading');
  el.classList.toggle('is-ok', ok);
  el.classList.toggle('is-err', !ok);
  const st = el.querySelector('.st');
  st.className = 'st ' + (ok ? 'ok' : 'err');
  st.textContent = status || (ok ? 'OK' : 'НЕДОСТУПНО');
  const b = el.querySelector('.live-card-b'); b.classList.remove('scanline'); b.innerHTML = html;
};
const apiUrl = url => {
  const px = (GE.settings.apiKeys && GE.settings.apiKeys.proxy || '').trim();
  return px ? px.replace(/\/+$/, '') + '/' + url : url;
};
const fetchAPI = async (url, headers = {}, ms = 10000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, referrerPolicy: 'no-referrer', headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
};
const kv = pairs => `<dl class="kv">${pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v, raw]) => `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>`;
const kvMd = pairs => pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v]) => `- **${k}:** ${String(v).replace(/<[^>]+>/g, '')}`).join('\n');
const fail = (url, err) => `<div class="muted">Сервис не ответил из браузера (${esc(err && err.message || 'сеть/CORS')}). Откройте вручную: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, '').slice(0, 64))}</a></div>`;
const link = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || u)}</a>`;
const pivot = (val, type, label) => `<button class="pivot" data-pivot-q="${esc(val)}" data-pivot-t="${esc(type)}" title="Сканировать (${esc(GE.QTYPES[type]?.l || type)})">${esc(label || val)}</button>`;

/* Разбор почтовых / облачных провайдеров по MX, NS, TXT */
function analyzeDnsIntel(rows, dmarcRecs) {
  const mx = rows.filter(r => r[0] === 'MX').map(r => r[1].toLowerCase()).join(' ');
  const ns = rows.filter(r => r[0] === 'NS').map(r => r[1].toLowerCase()).join(' ');
  const txts = rows.filter(r => r[0] === 'TXT').map(r => r[1].replace(/^"|"$/g, ''));
  const intel = [];
  const mailMap = [
    [/google\.com|googlemail\.com/, 'Google Workspace'], [/yandex\.(net|ru)/, 'Яндекс 360'],
    [/mail\.ru/, 'VK WorkSpace / Mail.ru'], [/outlook\.com|protection\.outlook/, 'Microsoft 365'],
    [/protonmail\.ch/, 'Proton Mail'], [/zoho\./, 'Zoho Mail'], [/fastmail\.com/, 'Fastmail'],
    [/timeweb\./, 'Timeweb'], [/reg\.ru/, 'REG.RU'], [/beget\./, 'Beget'], [/migadu\./, 'Migadu']
  ];
  const mailProv = mailMap.find(([re]) => re.test(mx))?.[1];
  if (mailProv) intel.push(['Почтовый провайдер', mailProv]);

  const dnsMap = [
    [/cloudflare\.com/, 'Cloudflare'], [/awsdns-/, 'AWS Route 53'], [/googledomains|google\.com/, 'Google Cloud DNS'],
    [/yandex\.(net|ru)/, 'Яндекс DNS'], [/reg\.ru/, 'REG.RU'], [/selectel\./, 'Selectel'],
    [/digitalocean\.com/, 'DigitalOcean'], [/hetzner\./, 'Hetzner'], [/nic\.ru/, 'RU-CENTER'], [/beget\./, 'Beget']
  ];
  const dnsProv = dnsMap.find(([re]) => re.test(ns))?.[1];
  if (dnsProv) intel.push(['DNS-хостинг', dnsProv]);

  const spf = txts.find(t => /v=spf1/i.test(t));
  intel.push(['SPF', spf ? spf : 'не найден']);

  const dmarc = (dmarcRecs || []).find(t => /v=DMARC1/i.test(t));
  if (dmarc) {
    const p = (dmarc.match(/\bp=([a-z]+)/i) || [])[1] || '?';
    intel.push(['DMARC', `политика p=${p} · ${dmarc}`]);
  } else {
    intel.push(['DMARC', 'запись _dmarc не найдена']);
  }

  const verifs = [];
  txts.forEach(t => {
    const m = t.match(/^(google-site-verification|yandex-verification|facebook-domain-verification|apple-domain-verification|atlassian-domain-verification|MS|stripe-verification|openai-domain-verification|adobe-idp-site-verification|docusign|github-domain-verification|mailru-verification)=/i);
    if (m) verifs.push(m[1].replace(/-?(site|domain)?-?verification$/i, ''));
  });
  if (verifs.length) intel.push(['Подтверждённые сервисы (TXT)', GE.uniq(verifs).join(', ')]);
  return intel;
}

/* ─────────── Живая разведка ─────────── */
S.live = (forceRefresh = false) => {
  const out = $('#live-out'), type = S.eff, q = GE.normQuery(S.q, type), id = ++S.runId;
  const ok = () => id === S.runId;
  const jobs = [];
  const job = (title, fn, url, opts = {}) => { jobs.push({ title, fn, idx: jobs.length, url, cacheable: opts.cacheable !== false }); };

  S.lastScan = { q: S.q, normQ: q, type, ts: GE.now(), order: [], sections: new Map(), graphNodes: [], hud: new Map(), snap: {} };
  const hudBox = $('#live-hud');
  const paintHud = () => {
    if (!hudBox || !ok()) return;
    const arr = Array.from(S.lastScan.hud.values());
    if (!arr.length) { hudBox.innerHTML = ''; hudBox.classList.add('hidden'); return; }
    hudBox.classList.remove('hidden');
    hudBox.innerHTML = arr.map(h => `<div class="hud-pill ${h.tone || ''}"><span>${esc(h.k)}</span><b>${esc(h.v)}</b></div>`).join('');
  };
  const setHud = (idK, k, v, tone = '') => {
    if (!ok() || v === undefined || v === null || v === '') return;
    S.lastScan.hud.set(idK, { k, v: String(v), tone });
    paintHud();
  };
  const addNode = (label, rel, recType = 'source', extra = {}) => {
    if (!ok() || !label) return;
    S.lastScan.graphNodes.push({ label: String(label), rel, recType, extra });
  };
  if (hudBox) { hudBox.innerHTML = ''; hudBox.classList.add('hidden'); }
  setHud('type', 'ТИП', GE.QTYPES[type]?.l || type);

  // 1. Офлайн-анализ (мгновенно, без сети)
  if (type === 'url') job('Разбор ссылки (офлайн)', async () => ({
    html: GE.lab.urlReport(q),
    md: `- URL: ${q}\n- Хост: ${GE.host(q) || '—'}`
  }), null, { cacheable: false });

  if (type === 'hash') job('Тип хеша (офлайн)', async () => {
    const alg = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256' }[q.length] || 'неизвестен';
    const match = GE.db.all().find(r => r.file_hash === q.toLowerCase());
    const pairs = [['Длина', q.length + ' символов'], ['Алгоритм', alg], ['В базе GOD EYE', match ? match.title : 'нет совпадений']];
    return { html: kv(pairs), md: kvMd(pairs) };
  }, null, { cacheable: false });

  if (type === 'coords') job('Координаты (офлайн)', async () => ({
    html: GE.lab.coordReport(q, true),
    md: `- Координаты: \`${q}\``
  }), null, { cacheable: false });

  if (type === 'crypto') job('Анализ криптоадреса (офлайн)', async () => {
    const net = GE.detectCryptoNet(q) || 'Не определена';
    const pairs = [['Адрес', q], ['Сеть', net], ['Длина', q.length + ' символов']];
    return { html: kv(pairs), md: kvMd(pairs) };
  }, null, { cacheable: false });

  if (type === 'regid') job('Регистрационный номер (офлайн)', async () => {
    const kind = GE.detectRegIdKind(q) || 'Нестандартный / не прошёл контрольную сумму';
    const pairs = [['Идентификатор', q], ['Тип (проверка КС)', kind]];
    return { html: kv(pairs), md: kvMd(pairs) };
  }, null, { cacheable: false });

  if (type === 'phone') job('Разбор номера · E.164 и план нумерации (офлайн)', async () => {
    const p = GE.analyzePhone(q);
    if (!p) return { html: '<div class="muted">Не удалось разобрать номер.</div>', md: '' };
    setHud('country', 'СТРАНА', `${p.country} (${p.iso})`);
    if (p.operator) setHud('op', 'ОПЕРАТОР (DEF)', p.operator.split(' (')[0], 'hi');
    if (p.tz) setHud('tz', 'ЧАСОВОЙ ПОЯС', p.tz);
    S.lastScan.snap.phone = { e164: p.e164, operator: p.operator, region: p.region };
    if (p.operator) addNode(p.operator, 'базовый оператор DEF', 'org');
    if (p.region) addNode(p.region, 'регион нумерации', 'geo');
    const pairs = [
      ['Формат E.164', p.e164],
      ['Страна / код', `${p.country}${p.cc ? ' (+' + p.cc + ')' : ''} · ${p.iso}`],
      ['Тип номера', p.kind],
      ['Базовый оператор (DEF)', p.operator || '—'],
      ['Регион / часовой пояс', [p.region, p.tz].filter(Boolean).join(' · ') || '—'],
      ['Длина / валидность', `${p.digits.length} цифр · ${p.validLen ? 'корректная длина' : 'нестандартная длина'}`]
    ];
    const quickLinks = `<div class="row" style="margin-top:10px">
      <a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="https://www.google.com/search?q=${E(p.formats.slice(0, 4).map(f => `"${f}"`).join(' OR '))}">Google (все форматы)</a>
      <a class="btn btn-sm" target="_blank" rel="noopener" href="https://t.me/${E(p.e164)}">Telegram</a>
      <a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/${E(p.digits)}">WhatsApp</a>
      <a class="btn btn-sm" target="_blank" rel="noopener" href="https://2gis.ru/search/${E(p.e164)}">2ГИС</a>
      <a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.neberitrubku.ru/nomer-telefona/${E(p.digits.length === 11 && p.digits.startsWith('7') ? '8' + p.digits.slice(1) : p.digits)}">Антиспам</a>
    </div>`;
    const fmts = `<div class="phone-fmts"><div class="dim" style="font-size:11px;margin:10px 0 6px">Варианты формата для поиска (нажмите, чтобы скопировать):</div><div class="chips">${p.formats.map(f => `<button class="chip" data-copy-val="${esc(f)}" title="Копировать">${esc(f)}</button>`).join('')}</div></div>`;
    const note = `<div class="dim" style="margin-top:8px;font-size:11px">${p.operator ? 'Оператор определён по открытому плану нумерации (DEF/ABC); фактический оператор мог измениться по MNP. ' : ''}GOD EYE использует только открытые справочники и легальные публичные ссылки.</div>`;
    return {
      html: kv(pairs) + quickLinks + fmts + note,
      md: kvMd(pairs) + '\n- Форматы: ' + p.formats.map(f => `\`${f}\``).join(', ')
    };
  }, null, { cacheable: false });

  if (type === 'transport') job('Классификация борта / судна (офлайн)', async () => {
    const tr = GE.detectTransportKind(q);
    const pairs = [['Идентификатор', tr.val], ['Тип', tr.label]];
    const links = tr.kind === 'imo' || tr.kind === 'mmsi'
      ? `<div class="row" style="margin-top:8px">${link('https://www.marinetraffic.com/en/ais/index/search/all?keyword=' + E(tr.val), 'MarineTraffic')} · ${link('https://www.vesselfinder.com/vessels?name=' + E(tr.val), 'VesselFinder')}</div>`
      : tr.kind === 'norad'
        ? `<div class="row" style="margin-top:8px">${link('https://www.n2yo.com/satellite/?s=' + E(tr.val), 'Орбита на N2YO')} · ${link('https://celestrak.org/satcat/table-satcat.php?CATNR=' + E(tr.val), 'CelesTrak')}</div>`
        : '';
    return { html: kv(pairs) + links, md: kvMd(pairs) };
  }, null, { cacheable: false });

  // 2. Поиск совпадений в локальной базе GOD EYE
  job('Совпадения в базе GOD EYE', async () => {
    const tokens = GE.parseQuery(S.q.replace(/^@/, ''));
    const hits = GE.db.all().filter(r => GE.matchQuery(r, tokens)).slice(0, 8);
    return {
      html: hits.length ? `<div class="link-list">${hits.map(r => `<div class="link-i" data-open="${r.id}"><span class="rel">${GE.TYPES[r.type].code}</span><span class="sens">${esc(r.title)}</span><span class="dim" style="margin-left:auto;font-size:11px">${esc(GE.recSub(r).slice(0, 40))}</span></div>`).join('')}</div>` : '<div class="muted">В вашей базе совпадений нет.</div>',
      md: hits.length ? hits.map(r => `- [[${r.title}]] (${GE.TYPES[r.type].label})`).join('\n') : ''
    };
  }, null, { cacheable: false });

  // 3. Живые запросы к открытым API
  if (!GE.settings.live) {
    job('Живая разведка выключена', async () => ({
      html: '<div class="muted">Прямые запросы к API отключены в настройках (раздел «Приватность»). Ниже — ссылки на внешние инструменты.</div>',
      md: ''
    }), null, { cacheable: false });
  } else if (type === 'domain' || type === 'email') {
    const d = type === 'email' ? q.split('@').pop() : q;

    job('DNS + Почта (SPF / DMARC) · dns.google', async () => {
      const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'];
      const [res, dmarcRes] = await Promise.all([
        Promise.all(types.map(t => GE.fetchJSON(`https://dns.google/resolve?name=${E(d)}&type=${t}`).catch(() => null))),
        GE.fetchJSON(`https://dns.google/resolve?name=${E('_dmarc.' + d)}&type=TXT`).catch(() => null)
      ]);
      const rows = [];
      res.forEach((r, i) => { if (r && r.Answer) r.Answer.forEach(a => rows.push([types[i], a.data, a.TTL])); });
      if (!rows.length && res.every(r => !r)) throw new Error('нет ответа');
      const dmarcRecs = (dmarcRes && dmarcRes.Answer || []).map(a => String(a.data || '').replace(/^"|"$/g, ''));
      const intel = analyzeDnsIntel(rows, dmarcRecs);
      const ips = rows.filter(r => r[0] === 'A' || r[0] === 'AAAA').map(r => r[1]);
      const nss = rows.filter(r => r[0] === 'NS').map(r => r[1].replace(/\.$/, ''));
      const mxs = rows.filter(r => r[0] === 'MX').map(r => r[1].replace(/^\d+\s+/, '').replace(/\.$/, ''));
      const hasSpf = rows.some(r => r[0] === 'TXT' && /v=spf1/i.test(r[1]));
      const hasDmarc = dmarcRecs.some(t => /v=DMARC1/i.test(t));
      setHud('dns', 'DNS', `${ips.length} IP · SPF ${hasSpf ? '✓' : '✗'} · DMARC ${hasDmarc ? '✓' : '✗'}`, hasSpf && hasDmarc ? 'ok' : '');
      S.lastScan.snap.ips = ips.sort();
      S.lastScan.snap.ns = nss.sort();
      ips.forEach(ip => addNode(ip, 'IP-адрес (A/AAAA)', 'source'));
      nss.slice(0, 4).forEach(ns => addNode(ns, 'NS-сервер', 'source'));
      mxs.slice(0, 3).forEach(mx => addNode(mx, 'MX-сервер', 'source'));

      const fmtVal = (t, val) => {
        if (t === 'A' || t === 'AAAA') return pivot(val, 'ip');
        if (t === 'NS' || t === 'CNAME') return pivot(val.replace(/\.$/, ''), 'domain');
        if (t === 'MX') {
          const m = val.match(/^(\d+\s+)(.+)$/);
          if (m) return `${esc(m[1])}${pivot(m[2].replace(/\.$/, ''), 'domain')}`;
        }
        return esc(val);
      };
      const html = (intel.length ? kv(intel) + '<div style="height:10px"></div>' : '') +
        (rows.length ? `<table class="tbl"><thead><tr><th>Тип</th><th>Значение (кликабельно для pivot)</th><th>TTL</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td style="white-space:normal;overflow-wrap:anywhere">${fmtVal(r[0], r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>`
          : '<div class="muted">Записей не найдено — возможно, домен не существует.</div>');
      const md = [kvMd(intel), '', ...rows.map(r => `- \`${r[0]}\` ${r[1]} (TTL ${r[2]})`)].join('\n');
      return { html, md };
    }, `https://dns.google/query?name=${E(d)}`);

    if (type === 'email') {
      job('Публичный профиль · Gravatar', async () => {
        const hash = await GE.sha(new TextEncoder().encode(q.trim().toLowerCase()), 'SHA-256');
        const avatarUrl = `https://gravatar.com/avatar/${hash}?s=96&d=404`;
        const profileUrl = `https://gravatar.com/${hash}`;
        const found = await new Promise(res => {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          img.onload = () => res(true);
          img.onerror = () => res(false);
          img.src = avatarUrl;
        });
        if (!found) return { html: `<div class="muted">Публичного аватара Gravatar для этого адреса не найдено. SHA-256: <code class="mono">${esc(hash.slice(0, 16))}…</code></div>`, md: '- Gravatar: не найден' };
        return {
          html: `<div class="row" style="align-items:center;gap:14px"><img src="${esc(avatarUrl)}" alt="" referrerpolicy="no-referrer" style="width:56px;height:56px;border:1px solid var(--line-2)"><div><div><b style="color:#fff">Найден публичный аватар Gravatar</b></div><div class="muted" style="font-size:12px;margin-top:4px">${link(profileUrl, 'Открыть профиль Gravatar')} · SHA-256: <code>${esc(hash.slice(0, 16))}…</code></div></div></div>`,
          md: `- **Gravatar:** найден публичный профиль (${profileUrl})`
        };
      }, `https://gravatar.com/`);
    }

    job('Регистрация · RDAP', async () => {
      const r = await GE.fetchJSON(`https://rdap.org/domain/${E(d)}`, 12000);
      const ev = {}; (r.events || []).forEach(e => ev[e.eventAction] = e.eventDate);
      const reg = (r.entities || []).find(e => (e.roles || []).includes('registrar'));
      const regName = reg && reg.vcardArray ? (reg.vcardArray[1].find(x => x[0] === 'fn') || [])[3] : '';
      const nsList = (r.nameservers || []).map(n => n.ldhName).filter(Boolean);
      const pairs = [
        ['Домен', r.ldhName || d], ['Статус', (r.status || []).join(', ')], ['Регистратор', regName],
        ['Создан', ev.registration && GE.fmtDate(ev.registration)], ['Истекает', ev.expiration && GE.fmtDate(ev.expiration)],
        ['Изменён', ev['last changed'] && GE.fmtDate(ev['last changed'])],
        ['NS', nsList.length ? nsList.map(n => pivot(n, 'domain')).join(' ') : '', 1],
        ['DNSSEC', r.secureDNS ? (r.secureDNS.delegationSigned ? 'да' : 'нет') : '']
      ];
      return { html: kv(pairs), md: kvMd(pairs.map(([k, v]) => [k, k === 'NS' ? nsList.join(', ') : v])) };
    }, `https://lookup.icann.org/en/lookup?name=${E(d)}`);

    if (type === 'domain') {
      job('Архив · Wayback Machine', async () => {
        const r = await GE.fetchJSON(`https://archive.org/wayback/available?url=${E(d)}`);
        const s = r.archived_snapshots && r.archived_snapshots.closest;
        if (!s) return { html: '<div class="muted">Снимков не найдено.</div>', md: '- Wayback Machine: снимков не найдено' };
        const ts = GE.fmtDate(s.timestamp.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d).*/, '$1-$2-$3T$4:$5:00Z'));
        return {
          html: kv([['Последний снимок', ts], ['Ссылка', link(s.url, 'открыть снимок'), 1], ['Все снимки', link('https://web.archive.org/web/*/' + d + '*', 'календарь архива'), 1]]),
          md: `- **Последний снимок:** ${ts}\n- **Ссылка:** ${s.url}`
        };
      }, `https://web.archive.org/web/*/${d}`);

      job('Поддомены · crt.sh (Certificate Transparency)', async () => {
        const r = await GE.fetchJSON(`https://crt.sh/?q=${E('%.' + d)}&output=json`, 15000);
        const names = GE.uniq(r.flatMap(x => String(x.name_value || '').split('\n')).map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('*'))).sort();
        setHud('ct', 'ПОДДОМЕНЫ (CT)', names.length);
        S.lastScan.snap.subdomains = names.length;
        names.slice(0, 6).forEach(n => { if (n !== d) addNode(n, 'поддомен (crt.sh)', 'source'); });
        return {
          html: names.length ? `<div class="muted" style="margin-bottom:8px">Уникальных имён: ${names.length} (клик по поддомену — переход в скан)</div><div class="chips">${names.slice(0, 120).map(n => `<button class="chip" data-pivot-q="${esc(n)}" data-pivot-t="domain"><span>${esc(n)}</span></button>`).join('')}</div>` : '<div class="muted">Сертификатов не найдено.</div>',
          md: names.length ? `- Найдено уникальных имён: **${names.length}**\n` + names.slice(0, 30).map(n => `  - \`${n}\``).join('\n') : '- Сертификатов не найдено'
        };
      }, `https://crt.sh/?q=${E('%.' + d)}`);

      job('Репутация · AlienVault OTX', async () => {
        const key = (GE.settings.apiKeys && GE.settings.apiKeys.otx || '').trim();
        const hdr = key ? { 'X-OTX-API-KEY': key } : {};
        const r = await fetchAPI(`https://otx.alienvault.com/api/v1/indicators/domain/${E(d)}/general`, hdr, 10000);
        const pi = r.pulse_info || {};
        const pulses = (pi.pulses || []).slice(0, 6);
        const tags = GE.uniq(pulses.flatMap(p => p.tags || [])).slice(0, 12);
        const cnt = pi.count ?? 0;
        setHud('otx', 'OTX УГРОЗЫ', cnt > 0 ? `${cnt} импульсов` : 'ЧИСТО', cnt > 0 ? 'alert' : 'ok');
        S.lastScan.snap.otx = cnt;
        const pairs = [
          ['Импульсов угроз (OTX)', pi.count ?? 0],
          ['Alexa / рейтинг', r.alexa || '—'],
          ['Валидация', (r.validation || []).map(v => v.name).join(', ')],
          ['Теги', tags.join(', ')],
          ['Карточка OTX', link(`https://otx.alienvault.com/indicator/domain/${E(d)}`, 'открыть в AlienVault'), 1]
        ];
        const pHtml = pulses.length ? `<div class="link-list" style="margin-top:8px">${pulses.map(p => `<a class="link-i" target="_blank" rel="noopener" href="https://otx.alienvault.com/pulse/${esc(p.id)}"><span class="rel">OTX</span><span>${esc(p.name)}</span></a>`).join('')}</div>` : '';
        return { html: kv(pairs) + pHtml, md: kvMd([['Импульсов OTX', pi.count ?? 0], ['Теги', tags.join(', ')]]) };
      }, `https://otx.alienvault.com/indicator/domain/${E(d)}`);

      if (GE.settings.apiKeys && (GE.settings.apiKeys.urlscan || GE.settings.apiKeys.proxy)) {
        job('Сканы сайта · URLScan.io API', async () => {
          const key = (GE.settings.apiKeys.urlscan || '').trim();
          const hdr = key ? { 'API-Key': key } : {};
          const r = await fetchAPI(apiUrl(`https://urlscan.io/api/v1/search/?q=${E('domain:' + d)}&size=5`), hdr, 10000);
          const list = r.results || [];
          if (!list.length) return { html: '<div class="muted">Публичных сканов не найдено.</div>', md: '- URLScan: сканов нет' };
          const html = `<div class="link-list">${list.map(it => {
            const p = it.page || {}, t = it.task || {};
            const meta = [p.ip, p.server, p.status && ('HTTP ' + p.status), t.time && GE.fmtDate(t.time, false)].filter(Boolean).join(' · ');
            return `<a class="link-i" target="_blank" rel="noopener" href="${esc(it.result || '#')}"><span class="rel">SCAN</span><span><b style="color:#fff;font-weight:500">${esc(p.title || t.url || d)}</b><br><span class="dim" style="font-size:11px">${esc(meta)}</span></span></a>`;
          }).join('')}</div>`;
          return { html, md: list.map(it => `- [${it.page?.title || it.task?.url}](${it.result}) (${it.page?.ip || '—'})`).join('\n') };
        }, `https://urlscan.io/domain/${E(d)}`);
      }
    }
  } else if (type === 'ip') {
    job('Порты, сервисы и CVE · Shodan InternetDB', async () => {
      const r = await GE.fetchJSON(`https://internetdb.shodan.io/${E(q)}`, 10000);
      if (r.detail) { setHud('ports', 'ПОРТЫ', '0'); return { html: '<div class="muted">Открытых портов в Shodan InternetDB не зафиксировано.</div>', md: '- Shodan InternetDB: данных нет' }; }
      const ports = r.ports || [], hosts = r.hostnames || [], vulns = r.vulns || [], cpes = r.cpes || [], tags = r.tags || [];
      setHud('ports', 'ПОРТЫ', ports.length ? ports.slice(0, 6).join(', ') + (ports.length > 6 ? '…' : '') : '0', ports.length ? 'hi' : '');
      if (vulns.length) setHud('cve', 'CVE', `${vulns.length} уязвимостей`, 'alert');
      S.lastScan.snap.ports = ports.slice().sort((a, b) => a - b);
      S.lastScan.snap.vulns = vulns.slice().sort();
      hosts.slice(0, 6).forEach(h => addNode(h, 'хостнейм (Shodan)', 'source'));
      vulns.slice(0, 6).forEach(v => addNode(v, 'потенциальная CVE', 'source'));
      const pairs = [
        ['Открытые порты', ports.length ? ports.map(p => `<span class="eng-tag">${esc(p)}</span>`).join(' ') : 'не обнаружены', 1],
        ['Хостнеймы', hosts.length ? hosts.slice(0, 12).map(h => pivot(h, 'domain')).join(' ') : '', 1],
        ['CPE / ПО', cpes.slice(0, 6).join(', ')],
        ['Теги', tags.join(', ')],
        ['Потенциальные CVE', vulns.length ? vulns.slice(0, 14).map(v => pivot(v, 'cve')).join(' ') + (vulns.length > 14 ? ` <span class="dim">+${vulns.length - 14}</span>` : '') : 'не зафиксированы', 1]
      ];
      return {
        html: kv(pairs),
        md: kvMd([['Порты (InternetDB)', ports.join(', ') || 'нет'], ['Хостнеймы', hosts.slice(0, 10).join(', ')], ['CVE', vulns.slice(0, 10).join(', ') || 'нет']])
      };
    }, `https://www.shodan.io/host/${E(q)}`);

    if (GE.settings.apiKeys && GE.settings.apiKeys.shodan) {
      job('Детальные баннеры · Shodan API', async () => {
        const key = GE.settings.apiKeys.shodan.trim();
        const r = await GE.fetchJSON(`https://api.shodan.io/shodan/host/${E(q)}?key=${E(key)}`, 12000);
        const svcs = (r.data || []).slice(0, 8);
        const pairs = [
          ['Организация', r.org], ['ISP', r.isp], ['ОС', r.os], ['ASN', r.asn ? pivot(r.asn, 'asn') : '', 1],
          ['Последний скан', r.last_update && GE.fmtDate(r.last_update)]
        ];
        const sHtml = svcs.length ? `<div class="link-list" style="margin-top:8px">${svcs.map(s => `<div class="link-i"><span class="rel">${esc(s.port)}/${esc(s.transport || 'tcp')}</span><span><b style="color:#fff;font-weight:500">${esc(s.product || s._shodan?.module || 'service')} ${esc(s.version || '')}</b><br><span class="dim" style="font-size:11px">${esc(String(s.data || '').replace(/\s+/g, ' ').slice(0, 110))}</span></span></div>`).join('')}</div>` : '';
        return {
          html: kv(pairs) + sHtml,
          md: kvMd([['Shodan Org', r.org], ['OS', r.os], ['Сервисы', svcs.map(s => `${s.port}/${s.product || s._shodan?.module || ''}`).join(', ')]])
        };
      }, `https://www.shodan.io/host/${E(q)}`);
    }

    job('Репутация · AlienVault OTX', async () => {
      const key = (GE.settings.apiKeys && GE.settings.apiKeys.otx || '').trim();
      const hdr = key ? { 'X-OTX-API-KEY': key } : {};
      const kind = q.includes(':') ? 'IPv6' : 'IPv4';
      const r = await fetchAPI(`https://otx.alienvault.com/api/v1/indicators/${kind}/${E(q)}/general`, hdr, 10000);
      const pi = r.pulse_info || {};
      const pulses = (pi.pulses || []).slice(0, 6);
      const tags = GE.uniq(pulses.flatMap(p => p.tags || [])).slice(0, 12);
      const cnt = pi.count ?? 0;
      setHud('otx', 'OTX УГРОЗЫ', cnt > 0 ? `${cnt} импульсов` : 'ЧИСТО', cnt > 0 ? 'alert' : 'ok');
      S.lastScan.snap.otx = cnt;
      if (r.asn) addNode(String(r.asn).split(' ')[0], 'ASN', 'org');
      const pairs = [
        ['Импульсов угроз (OTX)', pi.count ?? 0],
        ['Репутация', r.reputation ?? 0],
        ['Страна', r.country_name],
        ['ASN', r.asn ? pivot(String(r.asn).split(' ')[0], 'asn') : '', 1],
        ['Теги', tags.join(', ')],
        ['Карточка OTX', link(`https://otx.alienvault.com/indicator/ip/${E(q)}`, 'открыть в AlienVault'), 1]
      ];
      const pHtml = pulses.length ? `<div class="link-list" style="margin-top:8px">${pulses.map(p => `<a class="link-i" target="_blank" rel="noopener" href="https://otx.alienvault.com/pulse/${esc(p.id)}"><span class="rel">OTX</span><span>${esc(p.name)}</span></a>`).join('')}</div>` : '';
      return { html: kv(pairs) + pHtml, md: kvMd([['Импульсов OTX', pi.count ?? 0], ['Репутация', r.reputation ?? 0], ['Теги', tags.join(', ')]]) };
    }, `https://otx.alienvault.com/indicator/ip/${E(q)}`);
    job('Сеть и геолокация · ipwho.is', async () => {
      const r = await GE.fetchJSON(`https://ipwho.is/${E(q)}`);
      if (r.success === false) throw new Error(r.message || 'ошибка');
      const asn = r.connection && r.connection.asn ? 'AS' + r.connection.asn : '';
      const coords = r.latitude != null ? `${r.latitude}, ${r.longitude}` : '';
      setHud('geo', 'СЕТЬ', [r.country_code, r.city, asn].filter(Boolean).join(' · '));
      if (asn) addNode(asn, 'автономная система', 'org');
      if (r.connection && r.connection.isp) addNode(r.connection.isp, 'провайдер (ISP)', 'org');
      const pairs = [
        ['IP', r.ip], ['Тип', r.type],
        ['Страна', [r.country, r.country_code].filter(Boolean).join(' · ')],
        ['Регион', r.region], ['Город', r.city],
        ['Провайдер', r.connection && r.connection.isp],
        ['Организация', r.connection && r.connection.org],
        ['ASN', asn ? pivot(asn, 'asn') : '', 1],
        ['Координаты сети', coords ? `${pivot(coords, 'coords')} <span class="dim">(приблизительно)</span>` : '', 1]
      ];
      return {
        html: kv(pairs) + '<div class="dim" style="margin-top:8px;font-size:11px">Геолокация IP указывает на сеть провайдера, а не на конкретного человека.</div>',
        md: kvMd([['IP', r.ip], ['Страна', r.country], ['Город', r.city], ['Провайдер', r.connection?.isp], ['ASN', asn], ['Координаты сети', coords]])
      };
    }, `https://ipinfo.io/${q}`);

    job('Маршрутизация и Abuse · RIPEstat', async () => {
      const [net, abuse] = await Promise.all([
        GE.fetchJSON(`https://stat.ripe.net/data/network-info/data.json?resource=${E(q)}`, 10000),
        GE.fetchJSON(`https://stat.ripe.net/data/abuse-contact-finder/data.json?resource=${E(q)}`, 10000).catch(() => null)
      ]);
      const d = net.data || {};
      const asns = (d.asns || []).map(a => 'AS' + a);
      const abuseEmails = (abuse && abuse.data && abuse.data.abuse_contacts) || [];
      const holder = abuse && abuse.data && abuse.data.holder_info && abuse.data.holder_info.name;
      const pairs = [
        ['Префикс (BGP)', d.prefix],
        ['ASN', asns.length ? asns.map(a => pivot(a, 'asn')).join(' ') : '', 1],
        ['Владелец блока', holder],
        ['Abuse-контакт', abuseEmails.length ? abuseEmails.map(m => pivot(m, 'email')).join(' ') : '', 1],
        ['RIPEstat', link(`https://stat.ripe.net/${q}`, 'открыть полную сводку'), 1]
      ];
      return {
        html: kv(pairs),
        md: kvMd([['Префикс', d.prefix], ['ASN', asns.join(', ')], ['Владелец', holder], ['Abuse', abuseEmails.join(', ')]])
      };
    }, `https://stat.ripe.net/${q}`);

    job('Владелец блока · RDAP', async () => {
      const r = await GE.fetchJSON(`https://rdap.org/ip/${E(q)}`, 12000);
      const pairs = [['Сеть', r.name], ['Диапазон', [r.startAddress, r.endAddress].filter(Boolean).join(' — ')], ['Страна', r.country], ['Тип', r.type], ['Handle', r.handle]];
      return { html: kv(pairs), md: kvMd(pairs) };
    }, `https://stat.ripe.net/${q}`);

    if (/^\d+\.\d+\.\d+\.\d+$/.test(q)) job('Обратная DNS (PTR)', async () => {
      const r = await GE.fetchJSON(`https://dns.google/resolve?name=${q.split('.').reverse().join('.')}.in-addr.arpa&type=PTR`);
      const hosts = (r.Answer || []).map(a => String(a.data || '').replace(/\.$/, '')).filter(Boolean);
      return {
        html: hosts.length ? hosts.map(h => `<div>${pivot(h, 'domain')}</div>`).join('') : '<div class="muted">PTR-записи нет.</div>',
        md: hosts.length ? hosts.map(h => `- PTR: \`${h}\``).join('\n') : '- PTR-записи нет'
      };
    }, `https://dns.google/query?name=${q}`);
  } else if (type === 'asn') {
    const num = q.replace(/^AS/i, '');
    job('Автономная система · RIPEstat', async () => {
      const [ov, pref] = await Promise.all([
        GE.fetchJSON(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${E(num)}`, 10000),
        GE.fetchJSON(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${E(num)}`, 10000).catch(() => null)
      ]);
      const d = ov.data || {};
      const prefixes = ((pref && pref.data && pref.data.prefixes) || []).map(p => p.prefix);
      const pairs = [
        ['ASN', 'AS' + num],
        ['Владелец', d.holder],
        ['Блок / RIR', d.block && d.block.desc],
        ['Анонсируется', d.announced ? 'да' : 'нет'],
        ['Префиксов', prefixes.length]
      ];
      const prefHtml = prefixes.length ? `<div style="margin-top:10px"><div class="dim" style="font-size:11px;margin-bottom:6px">Анонсируемые префиксы (первые ${Math.min(25, prefixes.length)}):</div><div class="chips">${prefixes.slice(0, 25).map(p => `<button class="chip" data-pivot-q="${esc(p.split('/')[0])}" data-pivot-t="ip"><span>${esc(p)}</span></button>`).join('')}</div></div>` : '';
      return {
        html: kv(pairs) + prefHtml,
        md: kvMd(pairs) + (prefixes.length ? '\n- Примеры префиксов: ' + prefixes.slice(0, 10).map(p => `\`${p}\``).join(', ') : '')
      };
    }, `https://stat.ripe.net/AS${num}`);
  } else if (type === 'username') {
    job('GitHub · публичный профиль', async () => {
      const ctl = await fetch(`https://api.github.com/users/${E(q)}`, { referrerPolicy: 'no-referrer' });
      if (ctl.status === 404) return { html: '<div class="muted">Аккаунта с таким именем на GitHub нет.</div>', md: '- GitHub: не найден' };
      if (!ctl.ok) throw new Error('HTTP ' + ctl.status);
      const r = await ctl.json();
      const blog = r.blog && (/^https?:/.test(r.blog) ? r.blog : 'https://' + r.blog);
      const pairs = [
        ['Логин', link(r.html_url, r.login), 1], ['Имя', r.name], ['О себе', r.bio],
        ['Компания', r.company], ['Сайт', blog && link(blog, r.blog), 1],
        ['Репозиториев', r.public_repos], ['Подписчиков', r.followers], ['Создан', GE.fmtDate(r.created_at, false)]
      ];
      return {
        html: `<div class="row" style="align-items:flex-start;gap:14px;flex-wrap:nowrap">${r.avatar_url ? `<img src="${esc(r.avatar_url)}&s=80" alt="" referrerpolicy="no-referrer" style="width:56px;height:56px;border:1px solid var(--line-2);filter:grayscale(1)">` : ''}<div class="grow">${kv(pairs)}</div></div>`,
        md: kvMd([['GitHub', r.html_url], ['Имя', r.name], ['Bio', r.bio], ['Компания', r.company], ['Сайт', blog], ['Репозиториев', r.public_repos], ['Создан', GE.fmtDate(r.created_at, false)]])
      };
    }, `https://github.com/${q}`);

    job('Публичные профили · Live-проверка (12 платформ)', async () => {
      const checks = [
        {
          name: 'GitLab',
          fn: async () => {
            const arr = await GE.fetchJSON(`https://gitlab.com/api/v4/users?username=${E(q)}`, 8000);
            const u = Array.isArray(arr) && arr[0];
            return u ? { found: true, url: u.web_url, info: u.name || u.username } : { found: false };
          }
        },
        {
          name: 'Keybase',
          fn: async () => {
            const r = await GE.fetchJSON(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${E(q)}`, 8000);
            const u = r && r.them && r.them[0];
            if (!u || !u.basics) return { found: false };
            const proofs = (u.proofs_summary?.all || []).map(p => `${p.proof_type}:${p.nametag}`).slice(0, 4).join(', ');
            return { found: true, url: `https://keybase.io/${u.basics.username}`, info: proofs || u.profile?.full_name || 'найден' };
          }
        },
        {
          name: 'Hacker News',
          fn: async () => {
            const u = await GE.fetchJSON(`https://hacker-news.firebaseio.com/v0/user/${E(q)}.json`, 8000);
            return u && u.id ? { found: true, url: `https://news.ycombinator.com/user?id=${E(u.id)}`, info: `karma ${u.karma || 0}` } : { found: false };
          }
        },
        {
          name: 'Dev.to',
          fn: async () => {
            const r = await fetch(`https://dev.to/api/users/by_username?url=${E(q)}`, { referrerPolicy: 'no-referrer' });
            if (r.status === 404) return { found: false };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const u = await r.json();
            return { found: true, url: `https://dev.to/${u.username}`, info: u.name || u.username };
          }
        },
        {
          name: 'Bluesky',
          fn: async () => {
            const actor = q.includes('.') ? q : q + '.bsky.social';
            const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${E(actor)}`, { referrerPolicy: 'no-referrer' });
            if (r.status === 400 || r.status === 404) return { found: false };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const u = await r.json();
            return u && u.did ? { found: true, url: `https://bsky.app/profile/${u.handle}`, info: u.displayName || `${u.followersCount || 0} подп.` } : { found: false };
          }
        },
        {
          name: 'Mastodon',
          fn: async () => {
            const r = await fetch(`https://mastodon.social/api/v1/accounts/lookup?acct=${E(q)}`, { referrerPolicy: 'no-referrer' });
            if (r.status === 404) return { found: false };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const u = await r.json();
            return u && u.url ? { found: true, url: u.url, info: u.display_name || `${u.followers_count || 0} подп.` } : { found: false };
          }
        },
        {
          name: 'Codeforces',
          fn: async () => {
            const r = await fetch(`https://codeforces.com/api/user.info?handles=${E(q)}`, { referrerPolicy: 'no-referrer' });
            if (r.status === 400 || r.status === 404) return { found: false };
            const j = await r.json();
            const u = j.status === 'OK' && j.result && j.result[0];
            return u ? { found: true, url: `https://codeforces.com/profile/${E(u.handle)}`, info: [u.rank, u.rating, u.country].filter(Boolean).join(' · ') || 'найден' } : { found: false };
          }
        },
        {
          name: 'npm',
          fn: async () => {
            const r = await GE.fetchJSON(`https://registry.npmjs.org/-/v1/search?text=maintainer:${E(q.toLowerCase())}&size=1`, 8000);
            return r && r.total > 0 ? { found: true, url: `https://www.npmjs.com/~${E(q.toLowerCase())}`, info: `пакетов: ${r.total}` } : { found: false };
          }
        },
        {
          name: 'Wikipedia',
          fn: async () => {
            const r = await GE.fetchJSON(`https://en.wikipedia.org/w/api.php?action=query&list=users&ususers=${E(q)}&usprop=editcount|registration&format=json&origin=*`, 8000);
            const u = r && r.query && r.query.users && r.query.users[0];
            return u && u.userid ? { found: true, url: `https://en.wikipedia.org/wiki/User:${E(u.name)}`, info: `правок: ${u.editcount || 0}` } : { found: false };
          }
        },
        {
          name: 'HuggingFace',
          fn: async () => {
            const r = await fetch(`https://huggingface.co/api/users/${E(q)}/overview`, { referrerPolicy: 'no-referrer' });
            if (r.status === 404) return { found: false };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const u = await r.json();
            return u && u.user ? { found: true, url: `https://huggingface.co/${E(u.user)}`, info: u.fullname || `моделей: ${u.numModels || 0}` } : { found: false };
          }
        },
        {
          name: 'Chess.com',
          fn: async () => {
            const r = await fetch(`https://api.chess.com/pub/player/${E(q.toLowerCase())}`, { referrerPolicy: 'no-referrer' });
            if (r.status === 404) return { found: false };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const u = await r.json();
            return { found: true, url: u.url || `https://www.chess.com/member/${E(q)}`, info: [u.title, u.name, u.location].filter(Boolean).join(' · ') || 'найден' };
          }
        },
        {
          name: 'Lichess',
          fn: async () => {
            const r = await fetch(`https://lichess.org/api/user/${E(q)}`, { referrerPolicy: 'no-referrer' });
            if (r.status === 404) return { found: false };
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const u = await r.json();
            return { found: true, url: u.url || `https://lichess.org/@/${E(q)}`, info: u.profile?.country || 'найден' };
          }
        }
      ];
      const results = await Promise.all(checks.map(c => c.fn().then(r => Object.assign({ name: c.name }, r)).catch(e => ({ name: c.name, err: e.message }))));
      const foundList = results.filter(r => r.found);
      setHud('profiles', 'ПРОФИЛИ (LIVE)', `${foundList.length} / ${checks.length}`, foundList.length ? 'hi' : '');
      S.lastScan.snap.platforms = foundList.map(r => r.name).sort();
      foundList.forEach(r => addNode(`${r.name}: ${q}`, 'профиль (Live)', 'source', { url: r.url }));
      const html = `<div class="live-grid">${results.map(r => {
        if (r.found) return `<a class="live-pill hit" target="_blank" rel="noopener" href="${esc(r.url)}"><b>${esc(r.name)}</b><span>${esc(r.info || 'найден')}</span></a>`;
        if (r.err) return `<div class="live-pill err"><b>${esc(r.name)}</b><span>недоступно</span></div>`;
        return `<div class="live-pill miss"><b>${esc(r.name)}</b><span>нет</span></div>`;
      }).join('')}</div><div class="dim" style="margin-top:8px;font-size:11px">Совпадение ника не доказывает, что это один человек — сверяйте аватары, био и перекрёстные ссылки. Полная проверка: WhatsMyName ниже.</div>`;
      const md = foundList.length ? foundList.map(r => `- **${r.name}:** ${r.url} (${r.info})`).join('\n') : `- На проверенных ${checks.length} платформах совпадений не найдено`;
      return { html, md };
    }, `https://whatsmyname.app/?q=${E(q)}`);
  } else if (type === 'coords') {
    const c = GE.parseCoords(S.q);
    if (c) job('Обратное геокодирование · OpenStreetMap', async () => {
      const r = await GE.fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lon}&accept-language=ru&zoom=18`, 10000);
      const a = r.address || {};
      const osmUrl = r.osm_type ? `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}` : '';
      const pairs = [
        ['Адрес', r.display_name], ['Объект', r.name],
        ['Категория', [r.category, r.type].filter(Boolean).join(' / ')],
        ['Страна', a.country], ['Город', a.city || a.town || a.village],
        ['OSM', osmUrl && link(osmUrl, `${r.osm_type}/${r.osm_id}`), 1]
      ];
      return {
        html: kv(pairs) + `<div class="row" style="margin-top:10px"><button class="btn btn-sm" data-geo-save="${c.lat},${c.lon}" data-name="${esc(r.name || (r.display_name || '').split(',')[0] || 'Точка')}">${GE.icon('geo')}Сохранить как локацию</button></div>`,
        md: kvMd([['Адрес', r.display_name], ['Объект', r.name], ['Страна', a.country], ['Город', a.city || a.town || a.village], ['OSM', osmUrl]])
      };
    }, `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=17/${c.lat}/${c.lon}`);
  } else if (type === 'place') {
    job('Геокодирование · OpenStreetMap', async () => {
      const r = await GE.fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ru&q=${E(q)}`, 10000);
      return {
        html: r.length ? `<div class="link-list">${r.map(p => `<div class="link-i" data-pivot-q="${p.lat}, ${p.lon}" data-pivot-t="coords"><span class="rel">${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}</span><span>${esc(p.display_name)}</span></div>`).join('')}</div>` : '<div class="muted">Ничего не найдено.</div>',
        md: r.length ? r.map(p => `- \`${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}\` — ${p.display_name}`).join('\n') : '- Ничего не найдено'
      };
    }, `https://www.openstreetmap.org/search?query=${E(q)}`);
  } else if (type === 'cve') {
    job('Карточка уязвимости · CIRCL CVE API', async () => {
      const r = await GE.fetchJSON(`https://cve.circl.lu/api/cve/${E(q)}`, 10000);
      if (!r || (!r.id && !r.cveMetadata)) return { html: '<div class="muted">Запись CVE не найдена в CIRCL API.</div>', md: '- CIRCL CVE: не найдено' };
      const cna = r.containers && r.containers.cna;
      const desc = r.summary || (cna && cna.descriptions && cna.descriptions[0] && cna.descriptions[0].value) || '';
      const score = r.cvss || (cna && cna.metrics && cna.metrics[0] && (cna.metrics[0].cvssV3_1?.baseScore || cna.metrics[0].cvssV3_0?.baseScore)) || '';
      const pub = r.Published || r.cveMetadata?.datePublished || '';
      const refs = (r.references || (cna && cna.references || []).map(x => x.url) || []).slice(0, 6);
      const pairs = [['CVE', r.id || r.cveMetadata?.cveId || q], ['CVSS', score], ['Опубликовано', pub && GE.fmtDate(pub, false)], ['Описание', desc]];
      return {
        html: kv(pairs) + (refs.length ? `<div class="url-list" style="margin-top:8px">${refs.map(u => link(u)).join('')}</div>` : ''),
        md: kvMd(pairs) + (refs.length ? '\n' + refs.map(u => `- ${u}`).join('\n') : '')
      };
    }, `https://nvd.nist.gov/vuln/detail/${E(q)}`);
  } else if (type === 'crypto' && GE.detectCryptoNet(q) === 'BTC') {
    job('Bitcoin блокчейн · Mempool.space', async () => {
      const r = await GE.fetchJSON(`https://mempool.space/api/address/${E(q)}`, 10000);
      const c = r.chain_stats || {}, m = r.mempool_stats || {};
      const bal = ((c.funded_txo_sum || 0) - (c.spent_txo_sum || 0) + (m.funded_txo_sum || 0) - (m.spent_txo_sum || 0)) / 1e8;
      const recv = (c.funded_txo_sum || 0) / 1e8;
      const spent = (c.spent_txo_sum || 0) / 1e8;
      const pairs = [
        ['Баланс', `${bal.toFixed(8)} BTC`],
        ['Всего получено', `${recv.toFixed(8)} BTC`],
        ['Всего отправлено', `${spent.toFixed(8)} BTC`],
        ['Транзакций (подтв. / mempool)', `${c.tx_count || 0} / ${m.tx_count || 0}`],
        ['Эксплорер', link(`https://mempool.space/address/${E(q)}`, 'mempool.space'), 1]
      ];
      return { html: kv(pairs), md: kvMd([['Баланс', `${bal.toFixed(8)} BTC`], ['Получено', `${recv.toFixed(8)} BTC`], ['Транзакций', c.tx_count || 0]]) };
    }, `https://mempool.space/address/${E(q)}`);
  }

  // GLEIF LEI для организаций и LEI-кодов
  if (GE.settings.live && (type === 'org' || (type === 'regid' && GE.detectRegIdKind(q) === 'LEI'))) {
    const isLei = GE.detectRegIdKind(q) === 'LEI';
    job('Международный реестр юрлиц · GLEIF LEI', async () => {
      const url = isLei
        ? `https://api.gleif.org/api/v1/lei-records/${E(q)}`
        : `https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${E(q)}&page[size]=5`;
      const r = await GE.fetchJSON(url, 10000);
      const list = Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);
      if (!list.length) return { html: '<div class="muted">В реестре GLEIF LEI совпадений не найдено.</div>', md: '' };
      const html = `<div class="link-list">${list.map(it => {
        const a = it.attributes || {}, e = a.entity || {}, hq = e.headquartersAddress || {};
        const name = e.legalName?.name || it.id;
        const meta = [e.jurisdiction, hq.city, e.status, it.id].filter(Boolean).join(' · ');
        return `<a class="link-i" target="_blank" rel="noopener" href="https://search.gleif.org/#/record/${esc(it.id)}"><span class="rel">LEI</span><span><b style="color:#fff;font-weight:500">${esc(name)}</b><br><span class="dim" style="font-size:11.5px">${esc(meta)}</span></span></a>`;
      }).join('')}</div>`;
      const md = list.map(it => `- **${it.attributes?.entity?.legalName?.name || it.id}** · LEI \`${it.id}\` (${it.attributes?.entity?.jurisdiction || '—'})`).join('\n');
      return { html, md };
    }, `https://search.gleif.org/#/search/simpleSearch=${E(q)}`);
  } else if (type === 'transport') {
    const tr = GE.detectTransportKind(q);
    if (tr.kind === 'icao24' || tr.kind === 'reg') {
      job('Реестр воздушных судов · HexDB', async () => {
        let hex = tr.kind === 'icao24' ? tr.val : '';
        if (!hex) {
          const ctl = await fetch(`https://hexdb.io/reg-hex?reg=${E(tr.val)}`, { referrerPolicy: 'no-referrer' });
          if (!ctl.ok) throw new Error('борт не найден в открытом реестре');
          hex = (await ctl.text()).trim();
          if (!/^[0-9A-F]{6}$/i.test(hex)) throw new Error('ICAO24 не найден');
        }
        const a = await GE.fetchJSON(`https://hexdb.io/api/v1/aircraft/${E(hex)}`, 10000);
        const owner = a.RegisteredOwners || '';
        const pairs = [
          ['ICAO24 (Mode-S)', a.ModeS || hex],
          ['Регистрация', a.Registration || tr.val],
          ['Производитель', a.Manufacturer],
          ['Модель / тип', [a.Type, a.ICAOTypeCode && `(${a.ICAOTypeCode})`].filter(Boolean).join(' ')],
          ['Владелец / оператор', owner ? pivot(owner, 'org') : '', 1],
          ['Код оператора (ICAO)', a.OperatorFlagCode],
          ['Трекер ADS-B', link(`https://globe.adsbexchange.com/?icao=${E((a.ModeS || hex).toLowerCase())}`, 'открыть на ADS-B Exchange'), 1]
        ];
        return {
          html: kv(pairs),
          md: kvMd([['ICAO24', a.ModeS || hex], ['Регистрация', a.Registration], ['Модель', `${a.Manufacturer || ''} ${a.Type || ''}`.trim()], ['Оператор', owner]])
        };
      }, `https://www.planespotters.net/search?q=${E(tr.val)}`);
    } else if (tr.kind === 'callsign') {
      job('Маршрут рейса и аэропорты · HexDB', async () => {
        const r = await GE.fetchJSON(`https://hexdb.io/api/v1/route/icao/${E(tr.val)}`, 10000);
        const route = String(r.route || '');
        const codes = route.split('-').filter(Boolean);
        const aps = await Promise.all(codes.map(c => GE.fetchJSON(`https://hexdb.io/api/v1/airport/icao/${E(c)}`, 8000).catch(() => null)));
        const apRows = codes.map((c, i) => {
          const ap = aps[i];
          if (!ap || !ap.airport) return [i === 0 ? 'Вылет' : 'Прилёт / точка', c];
          const coords = ap.latitude != null ? `${Number(ap.latitude).toFixed(4)}, ${Number(ap.longitude).toFixed(4)}` : '';
          return [
            i === 0 ? 'Вылет' : (i === codes.length - 1 ? 'Прилёт' : 'Промежуточный'),
            `${esc(ap.airport)} (${esc(ap.iata || c)} / ${esc(ap.country_code || '')})${coords ? ' ' + pivot(coords, 'coords') : ''}`,
            1
          ];
        });
        const pairs = [['Рейс / позывной', r.flight || tr.val], ['Маршрут (ICAO)', route], ...apRows];
        return {
          html: kv(pairs),
          md: kvMd([['Рейс', r.flight || tr.val], ['Маршрут', route], ...aps.filter(Boolean).map(a => ['Аэропорт', `${a.airport} (${a.icao}, ${a.country_code})`])])
        };
      }, `https://www.flightaware.com/live/flight/${E(tr.val)}`);
    }
  } else if (type === 'hash') {
    if (GE.settings.apiKeys && GE.settings.apiKeys.otx) {
      job('Индикатор файла · AlienVault OTX API', async () => {
        const r = await fetchAPI(`https://otx.alienvault.com/api/v1/indicators/file/${E(q)}/general`, { 'X-OTX-API-KEY': GE.settings.apiKeys.otx.trim() }, 10000);
        const pi = r.pulse_info || {};
        const pulses = (pi.pulses || []).slice(0, 6);
        const pairs = [['Импульсов угроз', pi.count ?? 0], ['Карточка OTX', link(`https://otx.alienvault.com/indicator/file/${E(q)}`, 'открыть в AlienVault'), 1]];
        const pHtml = pulses.length ? `<div class="link-list" style="margin-top:8px">${pulses.map(p => `<a class="link-i" target="_blank" rel="noopener" href="https://otx.alienvault.com/pulse/${esc(p.id)}"><span class="rel">OTX</span><span>${esc(p.name)}</span></a>`).join('')}</div>` : '';
        return { html: kv(pairs) + pHtml, md: kvMd([['Импульсов OTX (file)', pi.count ?? 0]]) };
      }, `https://otx.alienvault.com/indicator/file/${E(q)}`);
    }
    if (GE.settings.apiKeys && GE.settings.apiKeys.vt) {
      job('Анализ файла · VirusTotal API', async () => {
        const r = await fetchAPI(apiUrl(`https://www.virustotal.com/api/v3/files/${E(q)}`), { 'x-apikey': GE.settings.apiKeys.vt.trim() }, 12000);
        const a = r.data && r.data.attributes || {};
        const st = a.last_analysis_stats || {};
        const pairs = [
          ['Имя файла', a.meaningful_name || (a.names && a.names[0])],
          ['Тип', a.type_description],
          ['Размер', a.size != null ? GE.bytes(a.size) : ''],
          ['Детекты (malicious / suspicious)', `${st.malicious || 0} / ${st.suspicious || 0} (из ${(st.malicious || 0) + (st.suspicious || 0) + (st.undetected || 0) + (st.harmless || 0)})`],
          ['VirusTotal', link(`https://www.virustotal.com/gui/file/${E(q)}`, 'открыть отчёт'), 1]
        ];
        return { html: kv(pairs), md: kvMd([['VT имя', a.meaningful_name], ['VT детекты', `${st.malicious || 0} malicious`]]) };
      }, `https://www.virustotal.com/gui/file/${E(q)}`);
    }
  }

  // Wikipedia + Wikidata для текста, организаций и мест (с безопасным esc() для сниппетов!)
  if (GE.settings.live && ['text', 'org', 'place'].includes(type)) {
    job('Википедия', async () => {
      const [ru, en] = await Promise.all(['ru', 'en'].map(l => GE.fetchJSON(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${E(q)}&format=json&origin=*&srlimit=4`).catch(() => null)));
      if (!ru && !en) throw new Error('нет ответа');
      const items = [...((ru && ru.query.search) || []).map(x => ['ru', x]), ...((en && en.query.search) || []).map(x => ['en', x])];
      const strip = s => esc(String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 140));
      return {
        html: items.length ? `<div class="link-list">${items.map(([l, x]) => `<a class="link-i" target="_blank" rel="noopener" href="https://${l}.wikipedia.org/wiki/${E(x.title)}"><span class="rel">${l.toUpperCase()}</span><span><b style="color:#fff;font-weight:500">${esc(x.title)}</b><br><span class="dim" style="font-size:12px">${strip(x.snippet)}…</span></span></a>`).join('')}</div>` : '<div class="muted">Статей не найдено.</div>',
        md: items.length ? items.map(([l, x]) => `- [${l.toUpperCase()}] [${x.title}](https://${l}.wikipedia.org/wiki/${E(x.title)})`).join('\n') : ''
      };
    }, `https://ru.wikipedia.org/w/index.php?search=${E(q)}`);

    job('Wikidata · сущности', async () => {
      const r = await GE.fetchJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${E(q.replace(/"/g, ''))}&language=ru&uselang=ru&format=json&origin=*&limit=6`);
      const items = r.search || [];
      return {
        html: items.length ? `<div class="link-list">${items.map(x => `<a class="link-i" target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/${esc(x.id)}"><span class="rel">${esc(x.id)}</span><span>${esc(x.label || '')}${x.description ? ` <span class="dim">— ${esc(x.description)}</span>` : ''}</span></a>`).join('')}</div>` : '<div class="muted">Сущностей не найдено.</div>',
        md: items.length ? items.map(x => `- [${x.id}](https://www.wikidata.org/wiki/${x.id}) — ${x.label || ''}${x.description ? ': ' + x.description : ''}`).join('\n') : ''
      };
    }, `https://www.wikidata.org/w/index.php?search=${E(q)}`);
  }

  if (GE.settings.live && type === 'url') {
    job('Архив страницы · Wayback', async () => {
      const r = await GE.fetchJSON(`https://archive.org/wayback/available?url=${E(q)}`);
      const s = r.archived_snapshots && r.archived_snapshots.closest;
      const ts = s ? GE.fmtDate(s.timestamp.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d).*/, '$1-$2-$3T$4:$5:00Z')) : '';
      return {
        html: (s ? kv([['Ближайший снимок', ts], ['Ссылка', link(s.url, 'открыть снимок'), 1]]) : '<div class="muted">Страница ещё не архивирована.</div>')
          + `<div class="row" style="margin-top:10px"><a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="https://web.archive.org/save/${esc(q)}">Архивировать сейчас</a></div>`,
        md: s ? `- **Wayback снимок:** ${ts} — ${s.url}` : '- Wayback: не архивировано'
      };
    }, `https://web.archive.org/web/*/${q}`);
  }

  if (type === 'image') job('Предпросмотр', async () => ({
    html: `<img src="${esc(GE.safeUrl(q))}" alt="" style="max-height:220px;border:1px solid var(--line)" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('Изображение не загрузилось (защита сайта или неверная ссылка).'))"><div class="muted" style="margin-top:8px;font-size:12px">Для анализа метаданных скачайте файл и откройте его в разделе «Изображения».</div>`,
    md: `- URL изображения: ${q}`
  }), null, { cacheable: false });

  S.lastScan.order = jobs.map(j => j.title);
  out.innerHTML = jobs.map(j => card(j.title, id + '-' + j.idx, j.cacheable, j.idx)).join('');

  const runJob = async (j, bypassCache) => {
    const cid = id + '-' + j.idx;
    const cacheKey = `${type}|${q}|${j.title}`;
    if (j.cacheable && !bypassCache) {
      const hit = LIVE_CACHE.get(cacheKey);
      if (hit && (Date.now() - hit.ts) < CACHE_TTL) {
        if (!ok()) return;
        S.lastScan.sections.set(j.title, { md: hit.res.md || '', ok: true });
        done(cid, hit.res.html, true, 'КЭШ');
        return;
      }
    }
    const el = $('#lc-' + cid);
    if (bypassCache && el) {
      el.setAttribute('data-loading', '1');
      el.classList.remove('is-ok', 'is-err');
      el.querySelector('.st').className = 'st';
      el.querySelector('.st').innerHTML = '<span class="spinner"></span>';
      const b = el.querySelector('.live-card-b'); b.classList.add('scanline'); b.textContent = 'Повторный запрос…';
    }
    try {
      const raw = await j.fn();
      const res = typeof raw === 'string' ? { html: raw, md: '' } : raw;
      if (j.cacheable) LIVE_CACHE.set(cacheKey, { ts: Date.now(), res });
      if (ok()) {
        S.lastScan.sections.set(j.title, { md: res.md || '', ok: true });
        done(cid, res.html, true, 'OK');
      }
    } catch (err) {
      if (ok()) {
        S.lastScan.sections.set(j.title, { md: '', ok: false });
        done(cid, j.url ? fail(j.url, err) : `<div class="muted">Ошибка: ${esc(err.message)}</div>`, false);
      }
    }
  };

  jobs.forEach(j => runJob(j, forceRefresh));

  // Делегирование кликов внутри результатов (pivot, retry, copy, open record, geo save)
  out.onclick = e => {
    const rt = e.target.closest('[data-retry]');
    if (rt) {
      const idx = +rt.dataset.retry.split('-').pop();
      const j = jobs[idx];
      if (j) runJob(j, true);
      return;
    }
    const cp = e.target.closest('[data-copy-val]'); if (cp) return GE.copy(cp.dataset.copyVal);
    const o = e.target.closest('[data-open]'); if (o) return GE.openRecord(o.dataset.open);
    const pv = e.target.closest('[data-pivot-q]'); if (pv) return S.setQuery(pv.dataset.pivotQ, pv.dataset.pivotT || 'auto');
    const gs = e.target.closest('[data-geo-save]');
    if (gs) {
      const [lat, lon] = gs.dataset.geoSave.split(',').map(Number);
      GE.editRecord('geo', null, { title: gs.dataset.name, lat, lon, retrieved: GE.today(), sources: [`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}`] });
    }
  };
};

/* ─────────── Конструктор операторов (Google / Яндекс / Bing / DDG) ─────────── */
S.initDork = () => {
  const root = $('#dork');
  let previewEngine = 'google';
  const get = () => { const d = {}; $$('[data-d]', root).forEach(el => d[el.dataset.d] = el.value.trim()); return d; };
  const build = (d, engine = 'google') => {
    const p = [];
    if (d.all) p.push(d.all);
    if (d.exact) p.push(`"${d.exact.replace(/"/g, '')}"`);
    if (d.any) {
      const parts = GE.toList(d.any).map(x => /\s/.test(x) && !/^\w+:/.test(x) ? `"${x}"` : x);
      if (parts.length) p.push('(' + parts.join(engine === 'yandex' ? ' | ' : ' OR ') + ')');
    }
    if (d.none) GE.toList(d.none).forEach(x => {
      if (/^site:/i.test(x)) p.push('-' + x);
      else p.push('-' + (/\s/.test(x) ? `"${x}"` : x));
    });
    if (d.site) p.push('site:' + d.site.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    if (d.filetype) p.push((engine === 'yandex' ? 'mime:' : 'filetype:') + d.filetype);
    if (d.intitle) p.push((engine === 'yandex' ? 'title:' : 'intitle:') + (/\s/.test(d.intitle) ? `"${d.intitle}"` : d.intitle));
    if (d.inurl) p.push('inurl:' + d.inurl);
    if (engine === 'google') {
      if (d.after) p.push('after:' + d.after);
      if (d.before) p.push('before:' + d.before);
    } else if (engine === 'yandex') {
      if (d.after) p.push('date:>' + d.after.replace(/-/g, ''));
      if (d.before) p.push('date:<' + d.before.replace(/-/g, ''));
    }
    return p.join(' ');
  };
  const upd = () => {
    const s = build(get(), previewEngine);
    $('#dork-out').textContent = s || '—';
    $$('[data-dork-prev]', root).forEach(b => b.classList.toggle('on', b.dataset.dorkPrev === previewEngine));
  };
  root.addEventListener('input', upd); root.addEventListener('change', upd);
  $('#dork-presets').innerHTML = GE.DORK_PRESETS.map((p, i) => `<button class="chip" data-p="${i}" title="${esc(p.hint || '')}">${esc(p.l)}</button>`).join('');
  $('#dork-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const p = GE.DORK_PRESETS[+b.dataset.p], d = get();
    if (p.need && !d[p.need]) { GE.toast('Сначала заполните поле site:'); $(`[data-d=${p.need}]`, root).focus(); return; }
    const set = p.fn ? p.fn(d) : p.set;
    Object.entries(set).forEach(([k, v]) => { const el = $(`[data-d=${k}]`, root); if (el) el.value = v || ''; });
    upd();
  });
  root.addEventListener('click', e => {
    const pv = e.target.closest('[data-dork-prev]');
    if (pv) { previewEngine = pv.dataset.dorkPrev; return upd(); }
    const b = e.target.closest('[data-dork]'); if (!b) return;
    const eng = b.dataset.dork, d = get();
    if (eng === 'clear') { $$('[data-d]', root).forEach(el => el.value = ''); return upd(); }
    const targetEng = eng === 'copy' ? previewEngine : (eng === 'yandex' ? 'yandex' : eng === 'google' ? 'google' : 'other');
    const qs = build(d, targetEng);
    if (!qs) return GE.toast('Заполните хотя бы одно поле', { type: 'err' });
    if (eng === 'copy') return GE.copy(qs);
    const url = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', ddg: 'https://duckduckgo.com/?q=', yandex: 'https://yandex.ru/search/?text=' }[eng] + E(qs);
    GE.log('DORK', `[${eng}] ${qs}`); GE.open(url);
  });
  upd();
};
})();
