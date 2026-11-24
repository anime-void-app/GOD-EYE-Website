/* ═══════════════════════════════════════════════════════════════
   GOD EYE · search.js — центр поиска: автоопределение цели, движки,
   «живая разведка» через открытые API, конструктор операторов, история
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc, E = encodeURIComponent;

const S = GE.search = { q: '', type: 'auto', eff: 'text', selected: new Set(), runId: 0 };

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
  $('#eng-all').onclick = () => { $$('#engines .eng').forEach(el => S.selected.add(el.dataset.k)); S.paintSel(); };
  $('#eng-none').onclick = () => { S.selected.clear(); S.paintSel(); };
  $('#eng-copy').onclick = () => { const l = S.selectedLinks(); if (!l.length) return GE.toast('Выберите движки'); GE.copy(l.map(x => `${x.n}: ${x.url}`).join('\n')); };
  $('#eng-open').onclick = () => {
    const l = S.selectedLinks();
    if (!S.q) return GE.toast('Введите цель поиска', { type: 'err' });
    if (!l.length) return GE.toast('Отметьте движки флажками', { type: 'err' });
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
  $('#live-save').onclick = () => {
    if (!S.q) return;
    const url = /^https?:/.test(S.q) ? S.q : S.eff === 'domain' ? 'https://' + S.q : '';
    GE.editRecord('source', null, { title: S.q, url, source_type: S.eff === 'image' ? 'Изображение' : 'Сайт', retrieved: GE.today(), tags: ['поиск'] });
  };
  S.initDork();
  S.render(); S.renderSide();
};

S.setQuery = (q, type = 'auto', run = true) => {
  S.q = q; S.type = GE.QTYPES[type] ? type : 'auto';
  const inp = $('#search-q'); if (inp) inp.value = q;
  S.render();
  if (run && q) S.run(true);
};

S.effType = () => S.type === 'auto' ? GE.detectType(S.q) : S.type;

/* ─────────── Движки ─────────── */
S.enginesFor = type => GE.ENGINES.map((e, i) => Object.assign({ k: 'e' + i }, e)).filter(e => e.t.includes(type));
S.linkFor = (e, q) => { try { return e.u(GE.normQuery(q, S.eff)); } catch (err) { return ''; } };
S.selectedLinks = () => S.enginesFor(S.eff).filter(e => S.selected.has(e.k)).map(e => ({ n: e.n, url: S.linkFor(e, S.q) })).filter(x => /^https?:/.test(x.url));

S.render = () => {
  S.eff = S.effType();
  $$('#type-tabs [data-type]').forEach(b => b.classList.toggle('on', b.dataset.type === S.type));
  const chip = $('#search-type-chip');
  if (chip) chip.textContent = (S.type === 'auto' ? 'АВТО → ' : '') + GE.QTYPES[S.eff].l.toUpperCase();
  const box = $('#engines'); if (!box) return;
  const list = S.enginesFor(S.eff);
  const groups = {};
  list.forEach(e => (groups[e.c] = groups[e.c] || []).push(e));
  const hasQ = !!S.q.trim();
  box.innerHTML = Object.entries(groups).map(([g, es]) => `
    <div class="eng-group"><div class="eng-group-h">${esc(g)} · ${es.length}<button data-grp="${esc(g)}">выбрать группу</button></div>
    <div class="engines">${es.map(e => {
      const url = hasQ ? S.linkFor(e, S.q) : '';
      const internal = url.startsWith('#');
      return `<div class="eng ${S.selected.has(e.k) ? 'sel-on' : ''}" data-k="${e.k}">
        <label class="check"><input type="checkbox" ${S.selected.has(e.k) ? 'checked' : ''}></label>
        <div style="min-width:0"><div class="eng-n">${esc(e.n)}</div><div class="eng-d">${esc(e.d)}</div></div>
        ${hasQ ? `<a class="go" href="${esc(url)}" ${internal ? '' : 'target="_blank" rel="noopener"'} title="Открыть">${GE.icon('ext')}</a>` : '<span></span>'}
      </div>`;
    }).join('')}</div></div>`).join('') || '<div class="empty"><p>Для этого типа цели нет внешних движков — используйте «Живую разведку» и лабораторию.</p></div>';
  box.querySelectorAll('.eng').forEach(el => {
    const cb = el.querySelector('input');
    cb.addEventListener('change', () => { cb.checked ? S.selected.add(el.dataset.k) : S.selected.delete(el.dataset.k); S.paintSel(); });
    const go = el.querySelector('a.go');
    if (go) go.addEventListener('click', () => { GE.log('SEARCH', `${el.querySelector('.eng-n').textContent} · ${S.q}`); });
  });
  box.querySelectorAll('[data-grp]').forEach(b => b.addEventListener('click', () => {
    const els = Array.from(b.closest('.eng-group').querySelectorAll('.eng'));
    const all = els.every(el => S.selected.has(el.dataset.k));
    els.forEach(el => all ? S.selected.delete(el.dataset.k) : S.selected.add(el.dataset.k));
    S.paintSel();
  }));
  S.paintSel();
};
S.paintSel = () => {
  const ks = new Set($$('#engines .eng').map(el => el.dataset.k));
  let n = 0;
  $$('#engines .eng').forEach(el => { const on = S.selected.has(el.dataset.k); el.classList.toggle('sel-on', on); el.querySelector('input').checked = on; if (on) n++; });
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
  S.live();
};

S.renderSide = () => {
  const row = h => `<div class="hist-i"><span class="ty">${esc((GE.QTYPES[h.type] || GE.QTYPES.text).l.toUpperCase())}</span><button class="q" data-q="${esc(h.q)}" data-t="${esc(h.type)}" title="${esc(h.q)}">${esc(h.q)}</button><span class="dim" style="font-size:10px">${esc(GE.ago(h.t))}</span></div>`;
  const hist = $('#search-history'), saved = $('#search-saved');
  if (hist) hist.innerHTML = GE.DB.history.slice(0, 14).map(row).join('') || '<div class="muted" style="font-size:12.5px">История пуста.</div>';
  if (saved) saved.innerHTML = GE.DB.saved.map(h => row(h).replace('</div>', `<button class="btn btn-icon btn-sm btn-ghost" data-unsave="${esc(h.q)}" title="Убрать">${GE.icon('x')}</button></div>`)).join('') || '<div class="muted" style="font-size:12.5px">Нажмите ☆, чтобы сохранить цель.</div>';
  $$('.hist-i .q').forEach(b => b.onclick = () => S.setQuery(b.dataset.q, b.dataset.t));
  $$('[data-unsave]').forEach(b => b.onclick = () => { GE.DB.saved = GE.DB.saved.filter(s => s.q !== b.dataset.unsave); GE.save(); S.renderSide(); });
};

/* ─────────── Живая разведка ─────────── */
const card = (title, id) => `<div class="live-card" id="lc-${id}"><div class="live-card-h">${esc(title)}<span class="st"><span class="spinner"></span></span></div><div class="live-card-b scanline">Запрос…</div></div>`;
const done = (id, html, ok = true, status) => {
  const el = $('#lc-' + id); if (!el) return;
  el.querySelector('.st').className = 'st ' + (ok ? 'ok' : 'err');
  el.querySelector('.st').textContent = status || (ok ? 'OK' : 'НЕДОСТУПНО');
  const b = el.querySelector('.live-card-b'); b.classList.remove('scanline'); b.innerHTML = html;
};
const kv = pairs => `<dl class="kv">${pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v, raw]) => `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>`;
const fail = (url, err) => `<div class="muted">Сервис не ответил из браузера (${esc(err && err.message || 'сеть/CORS')}). Откройте вручную: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, '').slice(0, 60))}</a></div>`;
const link = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || u)}</a>`;

S.live = () => {
  const out = $('#live-out'), type = S.eff, q = GE.normQuery(S.q, type), id = ++S.runId;
  const ok = () => id === S.runId;
  const jobs = [];
  const job = (title, fn, url) => { jobs.push([title, fn, jobs.length, url]); };

  // офлайн-анализ (без сети)
  if (type === 'url') job('Разбор ссылки (офлайн)', async () => GE.lab.urlReport(q));
  if (type === 'hash') job('Тип хеша (офлайн)', async () => kv([['Длина', q.length + ' символов'], ['Алгоритм', { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256' }[q.length] || 'неизвестен'], ['В базе GOD EYE', GE.db.all().find(r => r.file_hash === q.toLowerCase())?.title || 'нет совпадений']]));
  if (type === 'coords') job('Координаты (офлайн)', async () => GE.lab.coordReport(q, true));
  // локальная база
  job('Совпадения в базе GOD EYE', async () => {
    const tokens = GE.parseQuery(S.q.replace(/^@/, ''));
    const hits = GE.db.all().filter(r => GE.matchQuery(r, tokens)).slice(0, 8);
    return hits.length ? `<div class="link-list">${hits.map(r => `<div class="link-i" data-open="${r.id}"><span class="rel">${GE.TYPES[r.type].code}</span><span class="sens">${esc(r.title)}</span><span class="dim" style="margin-left:auto;font-size:11px">${esc(GE.recSub(r).slice(0, 40))}</span></div>`).join('')}</div>` : '<div class="muted">В вашей базе совпадений нет.</div>';
  });

  if (!GE.settings.live) {
    job('Живая разведка выключена', async () => '<div class="muted">Прямые запросы к API отключены в настройках (раздел «Приватность»). Ниже — ссылки на внешние инструменты.</div>');
  } else if (type === 'domain' || type === 'email') {
    const d = type === 'email' ? q.split('@').pop() : q;
    job('DNS-записи · dns.google', async () => {
      const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'];
      const res = await Promise.all(types.map(t => GE.fetchJSON(`https://dns.google/resolve?name=${E(d)}&type=${t}`).catch(() => null)));
      const rows = [];
      res.forEach((r, i) => { if (r && r.Answer) r.Answer.forEach(a => rows.push([types[i], a.data, a.TTL])); });
      if (!rows.length && res.every(r => !r)) throw new Error('нет ответа');
      return rows.length ? `<table class="tbl"><thead><tr><th>Тип</th><th>Значение</th><th>TTL</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td style="white-space:normal;overflow-wrap:anywhere">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Записей не найдено — возможно, домен не существует.</div>';
    }, `https://dns.google/query?name=${E(d)}`);
    job('Регистрация · RDAP', async () => {
      const r = await GE.fetchJSON(`https://rdap.org/domain/${E(d)}`, 12000);
      const ev = {}; (r.events || []).forEach(e => ev[e.eventAction] = e.eventDate);
      const reg = (r.entities || []).find(e => (e.roles || []).includes('registrar'));
      const regName = reg && reg.vcardArray ? (reg.vcardArray[1].find(x => x[0] === 'fn') || [])[3] : '';
      return kv([
        ['Домен', r.ldhName || d], ['Статус', (r.status || []).join(', ')], ['Регистратор', regName],
        ['Создан', ev.registration && GE.fmtDate(ev.registration)], ['Истекает', ev.expiration && GE.fmtDate(ev.expiration)],
        ['Изменён', ev['last changed'] && GE.fmtDate(ev['last changed'])],
        ['NS', (r.nameservers || []).map(n => n.ldhName).join(', ')], ['DNSSEC', r.secureDNS ? (r.secureDNS.delegationSigned ? 'да' : 'нет') : '']
      ]);
    }, `https://lookup.icann.org/en/lookup?name=${E(d)}`);
    if (type === 'domain') {
      job('Архив · Wayback Machine', async () => {
        const r = await GE.fetchJSON(`https://archive.org/wayback/available?url=${E(d)}`);
        const s = r.archived_snapshots && r.archived_snapshots.closest;
        return s ? kv([['Последний снимок', GE.fmtDate(s.timestamp.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d).*/, '$1-$2-$3T$4:$5:00Z'))], ['Ссылка', link(s.url, 'открыть снимок'), 1], ['Все снимки', link('https://web.archive.org/web/*/' + d + '*', 'календарь архива'), 1]]) : '<div class="muted">Снимков не найдено.</div>';
      }, `https://web.archive.org/web/*/${d}`);
      job('Поддомены · crt.sh (Certificate Transparency)', async () => {
        const r = await GE.fetchJSON(`https://crt.sh/?q=${E('%.' + d)}&output=json`, 15000);
        const names = GE.uniq(r.flatMap(x => String(x.name_value || '').split('\n')).map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('*'))).sort();
        return names.length ? `<div class="muted" style="margin-bottom:8px">Уникальных имён: ${names.length}</div><div class="chips">${names.slice(0, 120).map(n => `<button class="chip" data-q="${esc(n)}"><span>${esc(n)}</span></button>`).join('')}</div>` : '<div class="muted">Сертификатов не найдено.</div>';
      }, `https://crt.sh/?q=${E('%.' + d)}`);
    }
  } else if (type === 'ip') {
    job('Сеть и геолокация · ipwho.is', async () => {
      const r = await GE.fetchJSON(`https://ipwho.is/${E(q)}`);
      if (r.success === false) throw new Error(r.message || 'ошибка');
      return kv([['IP', r.ip], ['Тип', r.type], ['Страна', [r.country, r.country_code].filter(Boolean).join(' · ')], ['Регион', r.region], ['Город', r.city], ['Провайдер', r.connection && r.connection.isp], ['Организация', r.connection && r.connection.org], ['ASN', r.connection && r.connection.asn && 'AS' + r.connection.asn], ['Координаты сети', r.latitude != null ? `${r.latitude}, ${r.longitude} (приблизительно)` : '']])
        + '<div class="dim" style="margin-top:8px;font-size:11px">Геолокация IP указывает на сеть провайдера, а не на конкретного человека.</div>';
    }, `https://ipinfo.io/${q}`);
    job('Владелец блока · RDAP', async () => {
      const r = await GE.fetchJSON(`https://rdap.org/ip/${E(q)}`, 12000);
      return kv([['Сеть', r.name], ['Диапазон', [r.startAddress, r.endAddress].filter(Boolean).join(' — ')], ['Страна', r.country], ['Тип', r.type], ['Handle', r.handle]]);
    }, `https://stat.ripe.net/${q}`);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(q)) job('Обратная DNS (PTR)', async () => {
      const r = await GE.fetchJSON(`https://dns.google/resolve?name=${q.split('.').reverse().join('.')}.in-addr.arpa&type=PTR`);
      return r.Answer ? r.Answer.map(a => `<div>${esc(a.data)}</div>`).join('') : '<div class="muted">PTR-записи нет.</div>';
    }, `https://dns.google/query?name=${q}`);
  } else if (type === 'username') {
    job('GitHub · публичный профиль', async () => {
      const ctl = await fetch(`https://api.github.com/users/${E(q)}`, { referrerPolicy: 'no-referrer' });
      if (ctl.status === 404) return '<div class="muted">Аккаунта с таким именем на GitHub нет.</div>';
      if (!ctl.ok) throw new Error('HTTP ' + ctl.status);
      const r = await ctl.json();
      return `<div class="row" style="align-items:flex-start;gap:14px;flex-wrap:nowrap">${r.avatar_url ? `<img src="${esc(r.avatar_url)}&s=80" alt="" style="width:56px;height:56px;border:1px solid var(--line-2);filter:grayscale(1)">` : ''}<div class="grow">${kv([['Логин', link(r.html_url, r.login), 1], ['Имя', r.name], ['О себе', r.bio], ['Компания', r.company], ['Сайт', r.blog && link(/^https?:/.test(r.blog) ? r.blog : 'https://' + r.blog, r.blog), 1], ['Репозиториев', r.public_repos], ['Подписчиков', r.followers], ['Создан', GE.fmtDate(r.created_at, false)]])}</div></div>`;
    }, `https://github.com/${q}`);
    job('Подсказка', async () => '<div class="muted">Совпадение ника на разных площадках ещё не означает, что это один и тот же человек. Сверяйте аватары, описания и перекрёстные ссылки. Проверку на сотнях площадок делает WhatsMyName (в списке ниже).</div>');
  } else if (type === 'coords') {
    const c = GE.parseCoords(S.q);
    if (c) job('Обратное геокодирование · OpenStreetMap', async () => {
      const r = await GE.fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lon}&accept-language=ru&zoom=18`, 10000);
      const a = r.address || {};
      return kv([['Адрес', r.display_name], ['Объект', r.name], ['Категория', [r.category, r.type].filter(Boolean).join(' / ')], ['Страна', a.country], ['Город', a.city || a.town || a.village], ['OSM', r.osm_type && link(`https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`, `${r.osm_type}/${r.osm_id}`), 1]])
        + `<div class="row" style="margin-top:10px"><button class="btn btn-sm" data-geo-save="${c.lat},${c.lon}" data-name="${esc(r.name || (r.display_name || '').split(',')[0] || 'Точка')}">${GE.icon('geo')}Сохранить как локацию</button></div>`;
    }, `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=17/${c.lat}/${c.lon}`);
  } else if (type === 'place') {
    job('Геокодирование · OpenStreetMap', async () => {
      const r = await GE.fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ru&q=${E(q)}`, 10000);
      return r.length ? `<div class="link-list">${r.map(p => `<div class="link-i" data-coords="${p.lat}, ${p.lon}"><span class="rel">${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}</span><span>${esc(p.display_name)}</span></div>`).join('')}</div>` : '<div class="muted">Ничего не найдено.</div>';
    }, `https://www.openstreetmap.org/search?query=${E(q)}`);
  }
  if (GE.settings.live && ['text', 'org', 'place'].includes(type)) {
    job('Википедия', async () => {
      const [ru, en] = await Promise.all(['ru', 'en'].map(l => GE.fetchJSON(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${E(q)}&format=json&origin=*&srlimit=4`).catch(() => null)));
      if (!ru && !en) throw new Error('нет ответа');
      const items = [...((ru && ru.query.search) || []).map(x => ['ru', x]), ...((en && en.query.search) || []).map(x => ['en', x])];
      return items.length ? `<div class="link-list">${items.map(([l, x]) => `<a class="link-i" target="_blank" rel="noopener" href="https://${l}.wikipedia.org/wiki/${E(x.title)}"><span class="rel">${l.toUpperCase()}</span><span><b style="color:#fff;font-weight:500">${esc(x.title)}</b><br><span class="dim" style="font-size:12px">${x.snippet.replace(/<[^>]+>/g, '').slice(0, 140)}…</span></span></a>`).join('')}</div>` : '<div class="muted">Статей не найдено.</div>';
    }, `https://ru.wikipedia.org/w/index.php?search=${E(q)}`);
    job('Wikidata · сущности', async () => {
      const r = await GE.fetchJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${E(q.replace(/"/g, ''))}&language=ru&uselang=ru&format=json&origin=*&limit=6`);
      return (r.search || []).length ? `<div class="link-list">${r.search.map(x => `<a class="link-i" target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/${esc(x.id)}"><span class="rel">${esc(x.id)}</span><span>${esc(x.label || '')}${x.description ? ` <span class="dim">— ${esc(x.description)}</span>` : ''}</span></a>`).join('')}</div>` : '<div class="muted">Сущностей не найдено.</div>';
    }, `https://www.wikidata.org/w/index.php?search=${E(q)}`);
  }
  if (GE.settings.live && type === 'url') {
    job('Архив страницы · Wayback', async () => {
      const r = await GE.fetchJSON(`https://archive.org/wayback/available?url=${E(q)}`);
      const s = r.archived_snapshots && r.archived_snapshots.closest;
      return (s ? kv([['Ближайший снимок', GE.fmtDate(s.timestamp.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d).*/, '$1-$2-$3T$4:$5:00Z'))], ['Ссылка', link(s.url, 'открыть снимок'), 1]]) : '<div class="muted">Страница ещё не архивирована.</div>')
        + `<div class="row" style="margin-top:10px"><a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="https://web.archive.org/save/${esc(q)}">Архивировать сейчас</a></div>`;
    }, `https://web.archive.org/web/*/${q}`);
  }
  if (type === 'image') job('Предпросмотр', async () => `<img src="${esc(GE.safeUrl(q))}" alt="" style="max-height:220px;border:1px solid var(--line)" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('Изображение не загрузилось (защита сайта или неверная ссылка).'))"><div class="muted" style="margin-top:8px;font-size:12px">Для анализа метаданных скачайте файл и откройте его в разделе «Изображения».</div>`);

  out.innerHTML = jobs.map(([t, , k]) => card(t, id + '-' + k)).join('');
  jobs.forEach(([t, fn, k, url]) => {
    (async () => {
      try { const html = await fn(); if (ok()) done(id + '-' + k, html); }
      catch (err) { if (ok()) done(id + '-' + k, url ? fail(url, err) : `<div class="muted">Ошибка: ${esc(err.message)}</div>`, false); }
    })();
  });
  // делегирование кликов внутри результатов
  out.onclick = e => {
    const o = e.target.closest('[data-open]'); if (o) return GE.openRecord(o.dataset.open);
    const ch = e.target.closest('[data-q]'); if (ch) return S.setQuery(ch.dataset.q, 'domain');
    const co = e.target.closest('[data-coords]'); if (co) return S.setQuery(co.dataset.coords, 'coords');
    const gs = e.target.closest('[data-geo-save]');
    if (gs) { const [lat, lon] = gs.dataset.geoSave.split(',').map(Number); GE.editRecord('geo', null, { title: gs.dataset.name, lat, lon, retrieved: GE.today(), sources: [`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}`] }); }
  };
};
/* ─────────── Конструктор операторов ─────────── */
S.initDork = () => {
  const root = $('#dork');
  const get = () => { const d = {}; $$('[data-d]', root).forEach(el => d[el.dataset.d] = el.value.trim()); return d; };
  const build = (d, engine = 'google') => {
    const p = [];
    if (d.all) p.push(d.all);
    if (d.exact) p.push(`"${d.exact.replace(/"/g, '')}"`);
    if (d.any) p.push('(' + GE.toList(d.any).map(x => /\s/.test(x) ? `"${x}"` : x).join(' OR ') + ')');
    if (d.none) GE.toList(d.none).forEach(x => p.push('-' + (/\s/.test(x) ? `"${x}"` : x)));
    if (d.site) p.push('site:' + d.site.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    if (d.filetype) p.push((engine === 'yandex' ? 'mime:' : 'filetype:') + d.filetype);
    if (d.intitle) p.push((engine === 'yandex' ? 'title:' : 'intitle:') + (/\s/.test(d.intitle) ? `"${d.intitle}"` : d.intitle));
    if (d.inurl) p.push((engine === 'yandex' ? 'url:*' : 'inurl:') + d.inurl + (engine === 'yandex' ? '*' : ''));
    if (engine === 'google') { if (d.after) p.push('after:' + d.after); if (d.before) p.push('before:' + d.before); }
    return p.join(' ');
  };
  const upd = () => { const s = build(get()); $('#dork-out').textContent = s || '—'; };
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
    const b = e.target.closest('[data-dork]'); if (!b) return;
    const eng = b.dataset.dork, d = get();
    if (eng === 'clear') { $$('[data-d]', root).forEach(el => el.value = ''); return upd(); }
    const qs = build(d, eng === 'yandex' ? 'yandex' : eng === 'google' ? 'google' : 'other');
    if (!qs) return GE.toast('Заполните хотя бы одно поле', { type: 'err' });
    if (eng === 'copy') return GE.copy(qs);
    const url = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', ddg: 'https://duckduckgo.com/?q=', yandex: 'https://yandex.ru/search/?text=' }[eng] + E(qs);
    GE.log('DORK', qs); GE.open(url);
  });
  upd();
};
})();
