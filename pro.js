/* ═══════════════════════════════════════════════════════════════
   GOD EYE · pro.js (v3.0.0) — Пакетный скан, Пересечение целей (Diff),
   Мониторинг (Watchlist), OSINT-плейбуки и автономное HTML-досье
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc, E = encodeURIComponent;

const PRO = GE.pro = { batchRows: [] };

/* ─────────── Универсальный быстрый живой снимок цели (для Batch / Diff / Watchlist) ─────────── */
async function probeTarget(rawQ, forcedType) {
  const type = forcedType && GE.QTYPES[forcedType] ? forcedType : GE.detectType(rawQ);
  const q = GE.normQuery(rawQ, type);
  const res = { raw: rawQ, q, type, summary: [], snap: {}, risk: 'ok', links: [] };

  if (type === 'phone') {
    const p = GE.analyzePhone(q);
    if (p) {
      res.summary.push(`${p.country} (${p.iso})`, p.operator || p.kind, p.tz || '');
      res.snap = { e164: p.e164, operator: p.operator, region: p.region };
    }
    return res;
  }

  if (type === 'domain' || type === 'email') {
    const d = type === 'email' ? q.split('@').pop() : q;
    const [aR, mxR, nsR, txtR, otxR] = await Promise.all([
      GE.fetchJSON(`https://dns.google/resolve?name=${E(d)}&type=A`, 7000).catch(() => null),
      GE.fetchJSON(`https://dns.google/resolve?name=${E(d)}&type=MX`, 7000).catch(() => null),
      GE.fetchJSON(`https://dns.google/resolve?name=${E(d)}&type=NS`, 7000).catch(() => null),
      GE.fetchJSON(`https://dns.google/resolve?name=${E(d)}&type=TXT`, 7000).catch(() => null),
      GE.fetchJSON(`https://otx.alienvault.com/api/v1/indicators/domain/${E(d)}/general`, 7000).catch(() => null)
    ]);
    const ips = ((aR && aR.Answer) || []).map(x => x.data).filter(Boolean).sort();
    const mxs = ((mxR && mxR.Answer) || []).map(x => String(x.data).replace(/^\d+\s+/, '').replace(/\.$/, '').toLowerCase()).sort();
    const nss = ((nsR && nsR.Answer) || []).map(x => String(x.data).replace(/\.$/, '').toLowerCase()).sort();
    const txts = ((txtR && txtR.Answer) || []).map(x => String(x.data).replace(/^"|"$/g, ''));
    const hasSpf = txts.some(t => /v=spf1/i.test(t));
    const otx = otxR && otxR.pulse_info ? (otxR.pulse_info.count || 0) : null;
    res.snap = { ips, ns: nss, mx: mxs, spf: hasSpf, otx };
    res.summary.push(ips.length ? `IP: ${ips.slice(0, 2).join(', ')}` : 'нет A-записи');
    if (nss.length) res.summary.push(`NS: ${nss[0]}`);
    res.summary.push(`SPF ${hasSpf ? '✓' : '✗'}`);
    if (otx !== null) {
      res.summary.push(`OTX: ${otx}`);
      if (otx > 0) res.risk = 'alert';
    }
    return res;
  }

  if (type === 'ip') {
    const [geo, idb, otxR] = await Promise.all([
      GE.fetchJSON(`https://ipwho.is/${E(q)}`, 7000).catch(() => null),
      GE.fetchJSON(`https://internetdb.shodan.io/${E(q)}`, 7000).catch(() => null),
      GE.fetchJSON(`https://otx.alienvault.com/api/v1/indicators/${q.includes(':') ? 'IPv6' : 'IPv4'}/${E(q)}/general`, 7000).catch(() => null)
    ]);
    const asn = geo && geo.connection && geo.connection.asn ? 'AS' + geo.connection.asn : '';
    const ports = (idb && Array.isArray(idb.ports)) ? idb.ports.slice().sort((a, b) => a - b) : [];
    const vulns = (idb && Array.isArray(idb.vulns)) ? idb.vulns.slice().sort() : [];
    const hosts = (idb && Array.isArray(idb.hostnames)) ? idb.hostnames.slice().sort() : [];
    const otx = otxR && otxR.pulse_info ? (otxR.pulse_info.count || 0) : null;
    res.snap = { country: geo && geo.country_code || '', asn, isp: geo && geo.connection && geo.connection.isp || '', ports, vulns, hosts, otx };
    if (geo && geo.country_code) res.summary.push(`${geo.country_code} ${geo.city || ''}`.trim());
    if (asn) res.summary.push(asn);
    res.summary.push(`порты: ${ports.length ? ports.slice(0, 5).join(',') : '0'}`);
    if (vulns.length) { res.summary.push(`CVE: ${vulns.length}`); res.risk = 'alert'; }
    if (otx > 0) { res.summary.push(`OTX: ${otx}`); res.risk = 'alert'; }
    return res;
  }

  if (type === 'username') {
    const u = q.replace(/^@/, '');
    const checks = [
      ['GitHub', () => fetch(`https://api.github.com/users/${E(u)}`, { referrerPolicy: 'no-referrer' }).then(r => r.ok)],
      ['GitLab', () => GE.fetchJSON(`https://gitlab.com/api/v4/users?username=${E(u)}`, 6000).then(a => Array.isArray(a) && a.length > 0)],
      ['Keybase', () => GE.fetchJSON(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${E(u)}`, 6000).then(r => !!(r && r.them && r.them[0] && r.them[0].basics))],
      ['Bluesky', () => fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${E(u.includes('.') ? u : u + '.bsky.social')}`, { referrerPolicy: 'no-referrer' }).then(r => r.ok)],
      ['Mastodon', () => fetch(`https://mastodon.social/api/v1/accounts/lookup?acct=${E(u)}`, { referrerPolicy: 'no-referrer' }).then(r => r.ok)],
      ['HN', () => GE.fetchJSON(`https://hacker-news.firebaseio.com/v0/user/${E(u)}.json`, 6000).then(r => !!(r && r.id))],
      ['Dev.to', () => fetch(`https://dev.to/api/users/by_username?url=${E(u)}`, { referrerPolicy: 'no-referrer' }).then(r => r.ok)],
      ['Codeforces', () => fetch(`https://codeforces.com/api/user.info?handles=${E(u)}`, { referrerPolicy: 'no-referrer' }).then(r => r.ok ? r.json() : null).then(j => !!(j && j.status === 'OK'))]
    ];
    const hits = [];
    await Promise.all(checks.map(([name, fn]) => fn().then(ok => { if (ok) hits.push(name); }).catch(() => {})));
    hits.sort();
    res.snap = { platforms: hits };
    res.summary.push(hits.length ? `Найдено (${hits.length}/8): ${hits.join(', ')}` : 'На 8 Live-площадках не найден');
    if (hits.length) res.risk = 'hi';
    return res;
  }

  if (type === 'cve') {
    const r = await GE.fetchJSON(`https://cve.circl.lu/api/cve/${E(q)}`, 8000).catch(() => null);
    const cvss = r && (r.cvss || (r.metrics && r.metrics.cvssV3_1 && r.metrics.cvssV3_1.baseScore));
    res.snap = { cvss: cvss || '' };
    res.summary.push(cvss ? `CVSS: ${cvss}` : 'См. NVD / MITRE');
    if (Number(cvss) >= 7) res.risk = 'alert';
    return res;
  }

  if (type === 'asn') {
    const num = q.replace(/^AS/i, '');
    const r = await GE.fetchJSON(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${E(num)}`, 8000).catch(() => null);
    const holder = r && r.data && r.data.holder || '';
    res.snap = { holder };
    res.summary.push(holder || 'ASN не найден');
    return res;
  }

  if (type === 'transport') {
    const tr = GE.detectTransportKind(q);
    res.summary.push(tr.label);
    if (tr.kind === 'icao24' || tr.kind === 'reg') {
      let hex = tr.kind === 'icao24' ? tr.val : '';
      if (!hex) {
        const t = await fetch(`https://hexdb.io/reg-hex?reg=${E(tr.val)}`, { referrerPolicy: 'no-referrer' }).then(r => r.ok ? r.text() : '').catch(() => '');
        hex = t.trim();
      }
      if (/^[0-9A-F]{6}$/i.test(hex)) {
        const a = await GE.fetchJSON(`https://hexdb.io/api/v1/aircraft/${E(hex)}`, 7000).catch(() => null);
        if (a && a.Type) res.summary.push(`${a.Manufacturer || ''} ${a.Type}`, a.RegisteredOwners || '');
      }
    }
    return res;
  }

  res.summary.push(GE.QTYPES[type]?.l || type);
  return res;
}

/* ─────────── 1. Пакетный скан (Batch Scan) ─────────── */
function extractTargets(raw) {
  const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  // Если пользователь вставил длинный текст/лог — вытаскиваем сущности через L.extract
  if (lines.length <= 3 && raw.length > 160 && GE.lab && GE.lab.extract) {
    const ex = GE.lab.extract(raw);
    const found = [];
    Object.values(ex).forEach(arr => arr.forEach(v => found.push(v)));
    // Плюс телефоны
    (raw.match(/(?:\+?\d[\d\s\-()]{8,16}\d)/g) || []).forEach(p => {
      const d = p.replace(/\D/g, '');
      if (d.length >= 10 && d.length <= 15) found.push(p.trim());
    });
    if (found.length >= 2) return GE.uniq(found).slice(0, 30);
  }
  return GE.uniq(lines).slice(0, 30);
}

function initBatch() {
  const btn = $('#batch-run'); if (!btn) return;
  const inp = $('#batch-in'), out = $('#batch-out'), prog = $('#batch-prog'), bar = $('#batch-bar');

  const renderTable = () => {
    const rows = PRO.batchRows;
    if (!rows.length) { out.innerHTML = '<div class="muted" style="font-size:12.5px">Вставьте список целей (до 30 строк) или кусок текста/лога — система сама распознает IP, домены, ники, телефоны, ASN и CVE.</div>'; return; }
    out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Цель</th><th>Тип</th><th>Результат Live Recon</th><th></th></tr></thead><tbody>${rows.map(r => `
      <tr>
        <td class="mono" style="color:#fff">${esc(r.q)}</td>
        <td><span class="eng-tag">${esc(GE.QTYPES[r.type]?.l || r.type)}</span></td>
        <td style="white-space:normal">${r.risk === 'alert' ? '<span class="eng-tag copy" style="margin-right:6px">РИСК</span>' : ''}${esc(r.summary.filter(Boolean).join(' · ') || '—')}</td>
        <td><button class="btn btn-sm btn-ghost" data-bscan="${esc(r.q)}" data-btype="${esc(r.type)}">Скан →</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    out.onclick = e => {
      const b = e.target.closest('[data-bscan]');
      if (b) { GE.search.setMode('single'); GE.search.setQuery(b.dataset.bscan, b.dataset.btype, true); }
    };
  };

  btn.onclick = async () => {
    const targets = extractTargets(inp.value);
    if (!targets.length) return GE.toast('Введите хотя бы одну цель', { type: 'err' });
    btn.disabled = true;
    PRO.batchRows = [];
    if (prog) prog.textContent = `0 / ${targets.length}`;
    if (bar) bar.style.width = '0%';
    let done = 0;
    const queue = targets.slice();
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const t = queue.shift();
        try {
          const r = await probeTarget(t);
          PRO.batchRows.push(r);
        } catch (err) {
          PRO.batchRows.push({ raw: t, q: t, type: GE.detectType(t), summary: ['ошибка: ' + err.message], risk: 'err' });
        }
        done++;
        if (prog) prog.textContent = `${done} / ${targets.length}`;
        if (bar) bar.style.width = (done / targets.length * 100).toFixed(1) + '%';
        renderTable();
      }
    });
    await Promise.all(workers);
    btn.disabled = false;
    if ($('#batch-csv')) $('#batch-csv').disabled = false;
    if ($('#batch-save')) $('#batch-save').disabled = false;
    GE.log('BATCH', `Пакетный скан завершён: ${targets.length} целей`);
    GE.toast(`Пакетный скан готов: ${targets.length} целей`, { type: 'ok' });
  };

  if ($('#batch-csv')) $('#batch-csv').onclick = () => {
    if (!PRO.batchRows.length) return;
    const escC = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + ['Цель;Тип;Статус;Сводка', ...PRO.batchRows.map(r => [r.q, GE.QTYPES[r.type]?.l || r.type, r.risk, r.summary.filter(Boolean).join(' | ')].map(escC).join(';'))].join('\r\n');
    GE.download(`godeye-batch-${GE.today()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  if ($('#batch-save')) $('#batch-save').onclick = () => {
    if (!PRO.batchRows.length) return;
    const md = PRO.batchRows.map(r => `- **${r.q}** (${GE.QTYPES[r.type]?.l || r.type}) — ${r.summary.filter(Boolean).join(' · ')}`).join('\n');
    GE.editRecord('report', null, {
      title: `Пакетный скан (${PRO.batchRows.length} целей) · ${GE.today()}`,
      report_type: 'Общее', status: 'В работе', confidence: 'Средняя',
      objective: `Пакетная проверка ${PRO.batchRows.length} целей через Live Recon.`,
      body: md, tags: ['batch-scan', 'живая-разведка']
    });
  };

  renderTable();
}

/* ─────────── 2. Пересечение двух целей (Cross-Reference / Diff) ─────────── */
function initCrossRef() {
  const btn = $('#diff-run'); if (!btn) return;
  const aIn = $('#diff-a'), bIn = $('#diff-b'), out = $('#diff-out');
  btn.onclick = async () => {
    const qa = aIn.value.trim(), qb = bIn.value.trim();
    if (!qa || !qb) return GE.toast('Введите обе цели для сравнения', { type: 'err' });
    btn.disabled = true;
    out.innerHTML = '<div class="live-card" data-loading="1"><div class="live-card-h"><span>Анализ пересечений…</span><span class="st"><span class="spinner"></span></span></div><div class="live-card-b scanline">Параллельный сбор открытых данных по обеим целям…</div></div>';
    try {
      const [ra, rb] = await Promise.all([probeTarget(qa), probeTarget(qb)]);
      const overlaps = [];
      const sa = ra.snap || {}, sb = rb.snap || {};
      const inter = (x, y) => (x || []).filter(v => (y || []).includes(v));

      const sharedIps = inter(sa.ips, sb.ips);
      if (sharedIps.length) overlaps.push(['Общий IP-адрес', sharedIps.join(', ')]);
      if (sa.ips && sb.ips) {
        const subA = GE.uniq(sa.ips.map(i => i.split('.').slice(0, 3).join('.')));
        const subB = GE.uniq(sb.ips.map(i => i.split('.').slice(0, 3).join('.')));
        const shSub = inter(subA, subB);
        if (shSub.length && !sharedIps.length) overlaps.push(['Общая /24 подсеть', shSub.map(s => s + '.0/24').join(', ')]);
      }
      const sharedNs = inter(sa.ns, sb.ns);
      if (sharedNs.length) overlaps.push(['Общие NS-серверы', sharedNs.join(', ')]);
      const sharedMx = inter(sa.mx, sb.mx);
      if (sharedMx.length) overlaps.push(['Общие MX-серверы', sharedMx.join(', ')]);
      if (sa.asn && sb.asn && sa.asn === sb.asn) overlaps.push(['Общая автономная система (ASN)', sa.asn]);
      if (sa.isp && sb.isp && sa.isp === sb.isp) overlaps.push(['Общий провайдер (ISP)', sa.isp]);
      const sharedPorts = inter(sa.ports, sb.ports);
      if (sharedPorts.length) overlaps.push(['Общие открытые порты', sharedPorts.join(', ')]);
      const sharedVulns = inter(sa.vulns, sb.vulns);
      if (sharedVulns.length) overlaps.push(['Общие CVE', sharedVulns.join(', ')]);
      const sharedPlat = inter(sa.platforms, sb.platforms);
      if (sharedPlat.length) overlaps.push(['Общие площадки (Live)', sharedPlat.join(', ')]);
      if (sa.operator && sb.operator && sa.operator === sb.operator) overlaps.push(['Общий базовый оператор (DEF)', sa.operator]);
      if (sa.country && sb.country && sa.country === sb.country) overlaps.push(['Общая страна', sa.country]);

      const overlapHtml = overlaps.length
        ? `<div class="live-card is-ok" style="border-color:rgba(226,35,46,0.55)"><div class="live-card-h"><span>Найдены пересечения · ${overlaps.length}</span><span class="st ok">СОВПАДЕНИЕ</span></div><div class="live-card-b"><dl class="kv">${overlaps.map(([k, v]) => `<dt>${esc(k)}</dt><dd style="color:#fff">${esc(v)}</dd>`).join('')}</dl></div></div>`
        : `<div class="live-card"><div class="live-card-h"><span>Прямых пересечений не найдено</span><span class="st">0</span></div><div class="live-card-b"><div class="muted">По открытым данным DNS / IP / Shodan InternetDB / Live-профилям прямых совпадений не выявлено.</div></div></div>`;

      const sideCard = (lbl, r) => `<div class="live-card"><div class="live-card-h"><span>${lbl}: ${esc(r.q)}</span><span class="st">${esc(GE.QTYPES[r.type]?.l || r.type)}</span></div><div class="live-card-b">${esc(r.summary.filter(Boolean).join(' · ') || '—')}</div></div>`;
      out.innerHTML = overlapHtml + `<div class="two-col" style="margin-top:10px">${sideCard('ЦЕЛЬ A', ra)}${sideCard('ЦЕЛЬ B', rb)}</div>`;
      GE.log('DIFF', `Пересечение «${qa}» × «${qb}»: совпадений ${overlaps.length}`);
    } catch (err) {
      out.innerHTML = `<div class="muted">Ошибка анализа: ${esc(err.message)}</div>`;
    }
    btn.disabled = false;
  };
}

/* ─────────── 3. Мониторинг изменений (Watchlist + Diff) ─────────── */
function diffSnapshots(oldS, newS) {
  const diffs = [];
  const arrDiff = (label, a, b) => {
    const oa = new Set(a || []), nb = new Set(b || []);
    const added = [...nb].filter(x => !oa.has(x));
    const rem = [...oa].filter(x => !nb.has(x));
    if (added.length) diffs.push(`+${label}: ${added.slice(0, 6).join(', ')}`);
    if (rem.length) diffs.push(`-${label}: ${rem.slice(0, 6).join(', ')}`);
  };
  if (oldS.ips || newS.ips) arrDiff('IP', oldS.ips, newS.ips);
  if (oldS.ns || newS.ns) arrDiff('NS', oldS.ns, newS.ns);
  if (oldS.ports || newS.ports) arrDiff('Порты', oldS.ports, newS.ports);
  if (oldS.vulns || newS.vulns) arrDiff('CVE', oldS.vulns, newS.vulns);
  if (oldS.platforms || newS.platforms) arrDiff('Профили', oldS.platforms, newS.platforms);
  if (oldS.otx != null && newS.otx != null && oldS.otx !== newS.otx) diffs.push(`OTX: ${oldS.otx} → ${newS.otx}`);
  return diffs;
}

PRO.watchCurrent = () => {
  const sc = GE.search.lastScan;
  if (!sc || !sc.q) return GE.toast('Сначала выполните скан');
  GE.DB.watchlist = GE.DB.watchlist || [];
  const idx = GE.DB.watchlist.findIndex(w => w.q === sc.normQ && w.type === sc.type);
  const item = { id: GE.uid('w'), q: sc.normQ, raw: sc.q, type: sc.type, snap: sc.snap || {}, checkedAt: GE.now(), diffs: [] };
  if (idx >= 0) GE.DB.watchlist[idx] = Object.assign(GE.DB.watchlist[idx], { snap: item.snap, checkedAt: item.checkedAt, diffs: [] });
  else GE.DB.watchlist.unshift(item);
  GE.save();
  GE.log('WATCH', `Добавлено на мониторинг: ${sc.q}`);
  GE.toast(`«${sc.q}» добавлено в Мониторинг (Watchlist)`, { type: 'ok' });
  PRO.renderWatch();
};

PRO.renderWatch = () => {
  const box = $('#watch-list'); if (!box) return;
  const list = GE.DB.watchlist || [];
  const cnt = $('#watch-count'); if (cnt) cnt.textContent = list.length ? `(${list.length})` : '';
  if (!list.length) {
    box.innerHTML = '<div class="empty"><p>Список наблюдения пуст. Отсканируйте домен, IP или никнейм и нажмите <b>«Наблюдать»</b> — система запомнит снимок и сможет отслеживать изменения.</p></div>';
    return;
  }
  box.innerHTML = `<div class="stack">${list.map(w => `
    <div class="live-card ${w.diffs && w.diffs.length ? 'is-err' : ''}">
      <div class="live-card-h">
        <span>${esc(w.raw || w.q)}</span>
        <span class="eng-tag">${esc(GE.QTYPES[w.type]?.l || w.type)}</span>
        <span class="st ${w.diffs && w.diffs.length ? 'err' : 'ok'}">${w.diffs && w.diffs.length ? `ИЗМЕНЕНИЯ: ${w.diffs.length}` : 'БЕЗ ИЗМЕНЕНИЙ'}</span>
      </div>
      <div class="live-card-b">
        <div class="row" style="justify-content:space-between">
          <div class="dim" style="font-size:11.5px">Проверено: ${esc(GE.fmtDate(w.checkedAt))} · Снимок: ${esc(Object.keys(w.snap || {}).map(k => `${k}=${Array.isArray(w.snap[k]) ? w.snap[k].length : w.snap[k]}`).join(', ') || 'базовый')}</div>
          <div class="row">
            <button class="btn btn-sm" data-wcheck="${esc(w.id)}">Проверить</button>
            <button class="btn btn-sm btn-ghost" data-wscan="${esc(w.raw || w.q)}" data-wtype="${esc(w.type)}">Скан →</button>
            <button class="btn btn-sm btn-danger" data-wdel="${esc(w.id)}">✕</button>
          </div>
        </div>
        ${w.diffs && w.diffs.length ? `<div class="chips" style="margin-top:8px">${w.diffs.map(d => `<span class="chip on">${esc(d)}</span>`).join('')}</div>` : ''}
      </div>
    </div>`).join('')}</div>`;

  box.onclick = async e => {
    const del = e.target.closest('[data-wdel]');
    if (del) { GE.DB.watchlist = GE.DB.watchlist.filter(x => x.id !== del.dataset.wdel); GE.save(); return PRO.renderWatch(); }
    const sc = e.target.closest('[data-wscan]');
    if (sc) { GE.search.setMode('single'); return GE.search.setQuery(sc.dataset.wscan, sc.dataset.wtype, true); }
    const chk = e.target.closest('[data-wcheck]');
    if (chk) {
      const w = GE.DB.watchlist.find(x => x.id === chk.dataset.wcheck);
      if (!w) return;
      chk.disabled = true; chk.textContent = '…';
      await PRO.checkWatchItem(w);
      GE.save();
      PRO.renderWatch();
    }
  };
};

PRO.checkWatchItem = async w => {
  try {
    const r = await probeTarget(w.raw || w.q, w.type);
    const diffs = diffSnapshots(w.snap || {}, r.snap || {});
    w.diffs = diffs;
    w.snap = r.snap || w.snap;
    w.checkedAt = GE.now();
    if (diffs.length) {
      GE.audio && GE.audio.sfx('alert');
      GE.toast(`Изменения по «${w.q}»: ${diffs[0]}`, { type: 'err', timeout: 5000 });
    } else {
      GE.audio && GE.audio.sfx('found');
    }
  } catch (err) {
    GE.toast(`Ошибка проверки ${w.q}: ${err.message}`, { type: 'err' });
  }
};

function initWatch() {
  const allBtn = $('#watch-check-all');
  if (allBtn) allBtn.onclick = async () => {
    const list = GE.DB.watchlist || [];
    if (!list.length) return GE.toast('Список наблюдения пуст');
    allBtn.disabled = true;
    for (const w of list) await PRO.checkWatchItem(w);
    GE.save();
    PRO.renderWatch();
    allBtn.disabled = false;
    GE.toast('Проверка всех целей завершена', { type: 'ok' });
  };
  PRO.renderWatch();
}

/* ─────────── 4. OSINT-плейбуки (интерактивные сценарии) ─────────── */
const PLAYBOOKS = [
  {
    id: 'domain_audit', title: 'Полный аудит домена', tag: 'DOMAIN',
    steps: [
      { t: 'Проверить DNS (A/MX/NS/TXT), SPF и DMARC + выявить почтового и DNS-провайдера', action: 'search', type: 'domain' },
      { t: 'Изучить RDAP-регистрацию, дату создания, регистратора и DNSSEC', action: 'search', type: 'domain' },
      { t: 'Собрать поддомены из Certificate Transparency (crt.sh) и проверить ключевые хосты', action: 'search', type: 'domain' },
      { t: 'Проверить репутацию домена в AlienVault OTX, VirusTotal и исторические снимки Wayback', action: 'search', type: 'domain' },
      { t: 'Перенести найденные IP, NS и поддомены «На граф» и сохранить отчёт', action: 'graph' }
    ]
  },
  {
    id: 'company_ru', title: 'Проверка организации (РФ)', tag: 'ORG',
    steps: [
      { t: 'Найти ИНН / ОГРН организации и проверить контрольную сумму в GOD EYE', action: 'search', type: 'org' },
      { t: 'Получить официальную выписку ЕГРЮЛ ФНС и бухотчётность в ГИР БО', action: 'search', type: 'regid' },
      { t: 'Проверить судебные дела (КАД Арбитр), сообщения Федресурса и госзакупки ЕИС', action: 'search', type: 'org' },
      { t: 'Проверить наличие в OpenSanctions, GLEIF LEI и корпоративном домене', action: 'search', type: 'org' },
      { t: 'Оценить источники по шкале Адмиралтейства и выгрузить HTML-досье', action: 'reports' }
    ]
  },
  {
    id: 'photo_verify', title: 'Верификация фото / GEOINT', tag: 'IMAGE / GEO',
    steps: [
      { t: 'Загрузить файл в «Изображения»: проверить EXIF, встроенное превью, EOF-хвост, ELA и метки ИИ (C2PA)', action: 'images' },
      { t: 'Прогнать обратный поиск (Google Lens, Яндекс Картинки, TinEye) для поиска первоисточника', action: 'images' },
      { t: 'Найти ориентиры на карте «Геолокация», замерить азимут и радиусы (Overpass / Линейка)', action: 'geo' },
      { t: 'Сверить время съёмки по теням через SunCalc и рельеф через PeakVisor 3D', action: 'geo' }
    ]
  },
  {
    id: 'ip_incident', title: 'Разбор IP / сетевого инцидента', tag: 'IP / CYBER',
    steps: [
      { t: 'Снять Shodan InternetDB: открытые порты, хостнеймы, CPE и список CVE', action: 'search', type: 'ip' },
      { t: 'Проверить маршрутизацию, ASN, префикс и abuse-контакты через RIPEstat', action: 'search', type: 'ip' },
      { t: 'Проверить индикаторы угроз в AlienVault OTX, AbuseIPDB и GreyNoise', action: 'search', type: 'ip' },
      { t: 'Добавить IP в Мониторинг (Watchlist) и построить граф связей', action: 'graph' }
    ]
  }
];

function initPlaybooks() {
  const slot = $('.view[data-entity="report"] .ent-extra'); if (!slot) return;
  slot.innerHTML = `<div class="panel" id="playbooks-panel" style="margin-bottom:16px">
    <div class="panel-h">OSINT-плейбуки (сценарии проверки)<small>чек-листы с быстрым запуском модулей</small></div>
    <div class="two-col" id="playbooks-box"></div>
  </div>`;
  const box = $('#playbooks-box'); if (!box) return;
  const doneMap = GE.ls.get('godeye.playbooks', {});
  const render = () => {
    box.innerHTML = PLAYBOOKS.map(pb => {
      const total = pb.steps.length;
      const done = pb.steps.filter((_, i) => doneMap[`${pb.id}:${i}`]).length;
      return `<div class="live-card">
        <div class="live-card-h"><span>${esc(pb.title)}</span><span class="eng-tag">${esc(pb.tag)}</span><span class="st ok">${done}/${total}</span></div>
        <div class="live-card-b">
          <div class="pb-steps">${pb.steps.map((st, i) => {
            const k = `${pb.id}:${i}`, on = !!doneMap[k];
            return `<div class="pb-step ${on ? 'done' : ''}">
              <label class="check"><input type="checkbox" data-pbk="${k}" ${on ? 'checked' : ''}></label>
              <span class="grow">${esc(st.t)}</span>
              <button class="btn btn-sm btn-ghost" data-pbgo="${st.action}" data-pbtype="${st.type || ''}">Открыть →</button>
            </div>`;
          }).join('')}</div>
        </div>
      </div>`;
    }).join('');
  };
  box.addEventListener('change', e => {
    const cb = e.target.closest('[data-pbk]'); if (!cb) return;
    doneMap[cb.dataset.pbk] = cb.checked;
    GE.ls.set('godeye.playbooks', doneMap);
    render();
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-pbgo]'); if (!b) return;
    const act = b.dataset.pbgo;
    if (act === 'search') {
      GE.go('search');
      if (b.dataset.pbtype) { GE.search.type = b.dataset.pbtype; GE.search.render(); }
      setTimeout(() => $('#search-q')?.focus(), 100);
    } else if (act === 'graph') GE.go('connections');
    else if (act === 'images') GE.go('images');
    else if (act === 'geo') GE.go('geo');
    else if (act === 'reports') GE.go('reports');
  });
  render();
}

/* ─────────── 5. Автономное офлайн HTML-досье ─────────── */
PRO.exportDossier = rec => {
  if (!rec) return;
  const t = GE.TYPES[rec.type] || { label: rec.type, code: 'REC' };
  const linked = GE.db.neighbors(rec.id);
  const mdToHtml = s => esc(String(s || ''))
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');

  const rows = t.fields.filter(f => !['title', 'body', 'notes', 'objective', 'conclusion', 'linked'].includes(f.k) && rec[f.k] !== undefined && rec[f.k] !== '' && (!Array.isArray(rec[f.k]) || rec[f.k].length))
    .map(f => `<tr><th>${esc(f.l)}</th><td>${esc(Array.isArray(rec[f.k]) ? rec[f.k].join(', ') : rec[f.k])}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GOD EYE DOSSIER · ${esc(rec.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050505;color:#d6d6dc;font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:32px 20px}
.wrap{max-width:860px;margin:0 auto;border:1px solid #222;background:#0a0a0c;padding:32px;position:relative}
.wrap::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#e2232e,transparent)}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #222;padding-bottom:18px;margin-bottom:24px;gap:16px;flex-wrap:wrap}
.eyebrow{font:500 11px/1 ui-monospace,monospace;letter-spacing:.22em;color:#e2232e;text-transform:uppercase;margin-bottom:8px}
h1{font-size:26px;font-weight:600;color:#f5f5f7;letter-spacing:.03em}
.meta{font:12px/1.6 ui-monospace,monospace;color:#8a8a96;text-align:right}
h2{font:600 13px/1 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#f5f5f7;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #1d1d22}
h3{font:600 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;color:#e2232e;margin:14px 0 6px}
table{width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #1a1a20;vertical-align:top}
th{width:210px;color:#8a8a96;font:500 11px/1.4 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em}
code{font:12px ui-monospace,monospace;background:#141418;border:1px solid #26262e;padding:1px 5px;color:#fff}
.box{background:#070709;border:1px solid #1e1e24;padding:16px;margin:10px 0}
.tag{display:inline-block;font:11px ui-monospace,monospace;border:1px solid #2a2a32;padding:2px 7px;margin:0 4px 4px 0;color:#cacad2}
.foot{margin-top:28px;padding-top:14px;border-top:1px solid #1d1d22;font:11px ui-monospace,monospace;color:#6e6e78;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
@media print{body{background:#fff;color:#111}.wrap{border-color:#ccc;background:#fff}h1,h2{color:#000}.box{background:#fafafa;border-color:#ddd}}
</style></head><body><div class="wrap">
<div class="top">
  <div><div class="eyebrow">GOD EYE · OSINT DOSSIER · ${esc(t.code)}</div><h1>${esc(rec.title)}</h1></div>
  <div class="meta">ОПЕРАТОР: ${esc(GE.settings.callsign)}<br>ДАТА ЭКСПОРТА: ${esc(GE.fmtDate(GE.now()))}<br>АДМИРАЛТЕЙСТВО: ${esc((rec.reliability || '—') + (rec.credibility || ''))}</div>
</div>
${rows ? `<h2>Сводные поля</h2><table>${rows}</table>` : ''}
${rec.objective ? `<h2>Цель исследования</h2><div class="box">${mdToHtml(rec.objective)}</div>` : ''}
${rec.body ? `<h2>Ход работы и находки</h2><div class="box">${mdToHtml(rec.body)}</div>` : ''}
${rec.notes ? `<h2>Заметки</h2><div class="box">${mdToHtml(rec.notes)}</div>` : ''}
${rec.conclusion ? `<h2>Вывод</h2><div class="box">${mdToHtml(rec.conclusion)}</div>` : ''}
${linked.length ? `<h2>Связанные записи (${linked.length})</h2><table>${linked.map(x => `<tr><th>${esc(x.edge.rel)}</th><td><b>${esc(x.other.title)}</b> (${esc(GE.TYPES[x.other.type]?.label || x.other.type)})</td></tr>`).join('')}</table>` : ''}
<div class="foot"><span>GOD EYE v${esc(GE.VERSION)} · OFFLINE DOSSIER</span><span>Автономный документ · без внешних зависимостей</span></div>
</div></body></html>`;
  const slug = String(rec.title || 'dossier').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 40) || 'dossier';
  GE.download(`godeye-dossier-${slug}.html`, html, 'text/html;charset=utf-8');
  GE.log('EXPORT', `HTML-досье: ${rec.title}`, rec.id);
  GE.toast('Автономное HTML-досье сохранено', { type: 'ok' });
};

PRO.init = () => {
  initBatch();
  initCrossRef();
  initWatch();
  initPlaybooks();
};
})();
