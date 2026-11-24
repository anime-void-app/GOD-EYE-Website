/* ═══════════════════════════════════════════════════════════════
   GOD EYE · entities.js — универсальные разделы записей:
   список (таблица/карточки), фильтры, редактор, карточка-шторка, отчёты
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc;

const state = {}; // type -> {q, rel, tag, sort, mode}
const S = type => (state[type] = state[type] || Object.assign({ q: '', rel: '', tag: '', sort: 'new', mode: 'table' }, GE.settings.view[type] || {}));

const EYE_EMPTY = `<svg viewBox="0 0 120 120" fill="none" stroke="currentColor"><circle cx="60" cy="60" r="52" stroke-opacity=".25" stroke-dasharray="2 5"/><polygon points="60,16 98,82 22,82" stroke-opacity=".6"/><path d="M40 62c7-10 33-10 40 0-7 9-33 9-40 0z" stroke-opacity=".8"/><circle cx="60" cy="62" r="6" stroke="#e2232e"/></svg>`;

/* ─────────── Значения полей ─────────── */
GE.fieldText = (rec, k) => {
  const v = rec[k];
  if (k === '_adm') return '';
  if (k === 'affiliation') return GE.db.get(v)?.title || '';
  if (k === 'updated' || k === 'created') return GE.fmtDate(v);
  if (k === 'retrieved' || k === 'published') return v ? GE.fmtDate(v, false) : '';
  if (k === 'lat' || k === 'lon') return v === '' || v == null ? '' : (+v).toFixed(5);
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
};
const cell = (rec, k) => {
  if (k === '_adm') return GE.admBadge(rec);
  if (k === 'status') return rec.status ? `<span class="badge ${rec.status === 'Завершено' ? 'hi' : rec.status === 'В работе' ? 'red' : 'mid'}">${esc(rec.status)}</span>` : '—';
  if (k === 'verdict') return rec.verdict ? `<span class="badge ${/Измен|Вне|ИИ/.test(rec.verdict) ? 'lo' : rec.verdict === 'Оригинал' ? 'hi' : 'mid'}">${esc(rec.verdict)}</span>` : '—';
  const t = GE.fieldText(rec, k);
  return t ? esc(t) : '<span class="dim">—</span>';
};
GE.recSub = rec => {
  const T = rec.type;
  if (T === 'person') return [rec.role, GE.db.get(rec.affiliation)?.title].filter(Boolean).join(' · ');
  if (T === 'org') return [rec.org_type, rec.country, rec.registry_id].filter(Boolean).join(' · ');
  if (T === 'geo') return rec.lat != null && rec.lat !== '' ? `${(+rec.lat).toFixed(5)}, ${(+rec.lon).toFixed(5)}` + (rec.place ? ' · ' + rec.place : '') : rec.place || '';
  if (T === 'image') return [rec.verdict, rec.camera].filter(Boolean).join(' · ');
  if (T === 'source') return [rec.source_type, GE.host(rec.url) || rec.publisher].filter(Boolean).join(' · ');
  if (T === 'report') return [rec.report_type, rec.status].filter(Boolean).join(' · ');
  return '';
};

/* ─────────── Построение раздела ─────────── */
GE.buildEntityView = (sec) => {
  const type = sec.dataset.entity, T = GE.TYPES[type], st = S(type);
  sec.innerHTML = `
    <div class="vh">
      <div>
        <div class="vh-idx">§ ${esc(sec.dataset.idx)} · ${esc(T.code)} DATABASE</div>
        <h2 class="vh-title">${esc(T.en)}<small>${esc(T.ru)}</small></h2>
        <p class="vh-desc">${esc(T.desc)}</p>
      </div>
      <div class="vh-actions">
        <button class="btn btn-primary" data-act="new">${GE.icon('plus')}Новая запись<span class="kbd" style="margin-left:6px">N</span></button>
        <button class="btn" data-act="md">${GE.icon('vault')}В Obsidian</button>
        <button class="btn" data-act="csv">${GE.icon('down')}CSV</button>
      </div>
    </div>
    <div class="ent-extra"></div>
    ${type === 'person' ? `<div class="notice">${GE.icon('shield', 'ic')}<div><b>Этика.</b> Раздел предназначен для публичных лиц и общедоступных сведений, подтверждённых источниками. Не собирайте адреса, телефоны, сведения о здоровье, семье и иные чувствительные данные частных лиц.</div></div>` : ''}
    <div class="toolbar">
      <label class="search-field">${GE.icon('search')}<input class="input" data-f="q" placeholder="Фильтр: слова, tag:…, rel:A, cred:2, -исключить" value="${esc(st.q)}"></label>
      <select class="select" data-f="rel"><option value="">Надёжность: все</option>${Object.entries(GE.REL).map(([k, v]) => `<option value="${k}" ${st.rel === k ? 'selected' : ''}>${k} — ${esc(v)}</option>`).join('')}</select>
      <select class="select" data-f="tag"><option value="">Тег: все</option></select>
      <select class="select" data-f="sort">
        <option value="new">Сначала новые</option><option value="old">Сначала старые</option><option value="az">По названию</option><option value="rel">По надёжности</option><option value="upd">Недавно изменённые</option>
      </select>
      <div class="seg" data-f="mode"><button data-m="table">ТАБЛИЦА</button><button data-m="cards">КАРТОЧКИ</button></div>
      <span class="count"></span>
    </div>
    <div class="ent-list"></div>`;
  sec.querySelector('[data-f=sort]').value = st.sort;
  const persist = () => { GE.settings.view[type] = { sort: st.sort, mode: st.mode }; GE.saveSettings(); };
  sec.querySelector('[data-f=q]').addEventListener('input', GE.debounce(e => { st.q = e.target.value; GE.renderEntity(type); }, 120));
  ['rel', 'tag', 'sort'].forEach(f => sec.querySelector(`[data-f=${f}]`).addEventListener('change', e => { st[f] = e.target.value; persist(); GE.renderEntity(type); }));
  sec.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.m; persist(); GE.renderEntity(type); }));
  sec.querySelector('[data-act=new]').onclick = () => GE.editRecord(type);
  sec.querySelector('[data-act=md]').onclick = () => GE.vault && GE.vault.exportZip(GE.db.byType(type), T.plural);
  sec.querySelector('[data-act=csv]').onclick = () => GE.exportCSV(GE.db.byType(type), `GODEYE_${T.code}_${GE.today()}.csv`);
  GE.renderEntity(type);
};

GE.renderEntity = type => {
  const sec = $(`.view[data-entity="${type}"]`); if (!sec || !sec.querySelector('.ent-list')) return;
  const T = GE.TYPES[type], st = S(type), all = GE.db.byType(type);
  // теги
  const tags = GE.uniq(all.flatMap(r => r.tags || [])).sort();
  const tagSel = sec.querySelector('[data-f=tag]');
  tagSel.innerHTML = '<option value="">Тег: все</option>' + tags.map(t => `<option ${st.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
  sec.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
  // фильтр
  const tokens = GE.parseQuery(st.q);
  let list = all.filter(r => (!st.rel || r.reliability === st.rel) && (!st.tag || (r.tags || []).includes(st.tag)) && GE.matchQuery(r, tokens));
  const relOrder = r => 'ABCDEF'.indexOf(r.reliability || 'F') * 10 + (+r.credibility || 6);
  const sorters = {
    new: (a, b) => (b.created || '').localeCompare(a.created || ''),
    old: (a, b) => (a.created || '').localeCompare(b.created || ''),
    az: (a, b) => String(a.title).localeCompare(String(b.title), 'ru'),
    rel: (a, b) => relOrder(a) - relOrder(b),
    upd: (a, b) => (b.updated || '').localeCompare(a.updated || '')
  };
  list.sort(sorters[st.sort] || sorters.new);
  sec.querySelector('.count').textContent = `${list.length} / ${all.length}`;
  const box = sec.querySelector('.ent-list');
  if (!all.length) {
    box.innerHTML = `<div class="empty">${EYE_EMPTY}<h4>ЗАПИСЕЙ ПОКА НЕТ</h4><p>Создайте первую запись — ${esc(T.label.toLowerCase())} — или загрузите демонстрационный набор, чтобы увидеть, как работает система.</p>
      <div class="row" style="justify-content:center"><button class="btn btn-primary" data-e="new">${GE.icon('plus')}Создать</button><button class="btn" data-e="demo">Демо-данные</button></div></div>`;
    box.querySelector('[data-e=new]').onclick = () => GE.editRecord(type);
    box.querySelector('[data-e=demo]').onclick = () => GE.loadDemo();
    return;
  }
  if (!list.length) { box.innerHTML = `<div class="empty"><h4>НИЧЕГО НЕ НАЙДЕНО</h4><p>Измените фильтры или запрос.</p></div>`; return; }
  if (st.mode === 'cards') {
    box.innerHTML = `<div class="cards">${list.map(r => `
      <div class="card" data-id="${r.id}">
        ${r.thumb ? `<div class="card-thumb" style="background-image:url('${r.thumb}')"></div>` : ''}
        <div class="card-type">${esc(T.code)} · ${esc(GE.fmtDate(r.created, false))}</div>
        <div class="card-title sens">${esc(r.title)}</div>
        <div class="card-sub">${esc(GE.recSub(r)) || '&nbsp;'}</div>
        <div class="card-foot">${type !== 'report' ? GE.admBadge(r) : cell(r, 'status')}${(r.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>`).join('')}</div>`;
  } else {
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${T.cols.map(k => `<th>${esc(GE.FIELD_LABEL(type, k))}</th>`).join('')}<th></th></tr></thead><tbody>
      ${list.map(r => `<tr data-id="${r.id}">${T.cols.map(k => `<td class="${k === 'title' ? 't-title sens' : ''}">${cell(r, k)}</td>`).join('')}
        <td class="acts"><button class="btn btn-icon btn-sm btn-ghost" data-a="search" title="Искать в открытых источниках">${GE.icon('search')}</button><button class="btn btn-icon btn-sm btn-ghost" data-a="edit" title="Изменить">${GE.icon('edit')}</button><button class="btn btn-icon btn-sm btn-ghost btn-danger" data-a="del" title="Удалить">${GE.icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>`;
  }
  box.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', e => {
    const id = el.dataset.id, a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'edit') return GE.editRecord(type, id);
    if (a === 'del') return GE.deleteRecords([id]);
    if (a === 'search') return GE.searchFor(GE.db.get(id));
    GE.openRecord(id);
  }));
};

/* ─────────── Поиск по записи ─────────── */
GE.searchFor = rec => {
  if (!rec) return;
  let q = rec.title, t = 'auto';
  if (rec.type === 'geo' && rec.lat !== '' && rec.lat != null) { q = `${rec.lat}, ${rec.lon}`; t = 'coords'; }
  else if (rec.type === 'source' && rec.url) { q = rec.url; t = 'url'; }
  else if (rec.type === 'image' && rec.image_url) { q = rec.image_url; t = 'image'; }
  else if (rec.type === 'org') { t = 'org'; }
  else if (rec.type === 'person') { q = `"${rec.title}"`; t = 'text'; }
  location.hash = `#/search?q=${encodeURIComponent(q)}&t=${t}`;
};

/* ─────────── Удаление с отменой ─────────── */
GE.deleteRecords = async ids => {
  if (!ids.length) return;
  if (ids.length > 3 && !(await GE.confirm(`Удалить ${ids.length} записей? Их можно будет восстановить кнопкой «Отменить» в течение нескольких секунд.`, { ok: 'Удалить' }))) return;
  const snap = GE.db.remove(ids);
  GE.closeDrawer();
  GE.toast(`Удалено: ${snap.removed.length}`, { action: { label: 'Отменить', fn: () => GE.db.restore(snap) } });
};

/* ─────────── Редактор записи ─────────── */
const inputFor = (f, rec, type) => {
  const v = rec[f.k];
  const id = 'f_' + f.k;
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  switch (f.t) {
    case 'textarea': return `<textarea class="textarea ${f.mono ? 'mono' : ''}" id="${id}" style="${f.big ? 'min-height:260px' : ''}"${ph}>${esc(v || '')}</textarea>`;
    case 'select': return `<select class="select" id="${id}"><option value="">—</option>${f.opts.map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    case 'rel': return `<select class="select" id="${id}"><option value="">—</option>${Object.entries(GE.REL).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${k} — ${esc(l)}</option>`).join('')}</select>`;
    case 'cred': return `<select class="select" id="${id}"><option value="">—</option>${Object.entries(GE.CRED).map(([k, l]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${k} — ${esc(l)}</option>`).join('')}</select>`;
    case 'ref': return `<select class="select" id="${id}"><option value="">— не выбрано —</option>${GE.db.byType(f.ref).map(r => `<option value="${r.id}" ${v === r.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}<option value="__new">+ создать новую…</option></select>`;
    case 'refs': {
      const sel = new Set(v || []);
      const items = GE.db.all().filter(r => r.id !== rec.id && r.type !== 'report' || (r.type === 'report' && r.id !== rec.id));
      return `<input class="input" placeholder="Фильтр записей…" data-refs-filter="${id}" style="margin-bottom:6px"><div class="refs-box" id="${id}">${items.length ? items.map(r => `<label data-t="${esc((r.title + ' ' + r.type).toLowerCase())}"><span class="check"><input type="checkbox" value="${r.id}" ${sel.has(r.id) ? 'checked' : ''}></span><span class="ty">${GE.TYPES[r.type].code}</span>${esc(r.title)}</label>`).join('') : '<div class="muted" style="padding:8px;font-size:12.5px">Записей пока нет.</div>'}</div>`;
    }
    case 'urls': return `<textarea class="textarea mono" id="${id}" style="min-height:76px" placeholder="https://…">${esc((v || []).join('\n'))}</textarea>`;
    case 'tags': return `<input class="input" id="${id}" value="${esc((v || []).join(', '))}"${ph}>`;
    case 'date': return `<input class="input" type="date" id="${id}" value="${esc(v || (f.def === 'today' && !rec.id ? GE.today() : ''))}">`;
    case 'number': return `<input class="input mono" type="number" step="any" id="${id}" value="${v ?? ''}"${ph}>`;
    case 'url': return `<input class="input mono" type="url" id="${id}" value="${esc(v || '')}" placeholder="https://…">`;
    default: return `<input class="input ${f.mono ? 'mono' : ''}" id="${id}" value="${esc(v || '')}"${ph}>`;
  }
};
const readField = (f, root) => {
  const el = root.querySelector('#f_' + f.k); if (!el) return undefined;
  switch (f.t) {
    case 'refs': return Array.from(el.querySelectorAll('input:checked')).map(i => i.value);
    case 'urls': return el.value.split(/\s*\n\s*/).map(s => s.trim()).filter(Boolean);
    case 'tags': return GE.toList(el.value);
    case 'number': return el.value === '' ? '' : +el.value;
    default: return el.value.trim();
  }
};

GE.editRecord = (type, id, preset = {}) => {
  const T = GE.TYPES[type], rec = id ? GE.db.get(id) : Object.assign({}, preset);
  if (id && !rec) return;
  const isReport = type === 'report';
  const body = document.createElement('div');
  body.innerHTML = `
    ${type === 'geo' ? `<div class="notice silver" style="margin-bottom:16px">${GE.icon('geo', 'ic')}<div>Вставьте координаты в любом формате — поля заполнятся автоматически:<input class="input mono" id="geo-paste" placeholder="59.9390, 30.3158  ·  59°56'20&quot;N 30°18'57&quot;E" style="margin-top:8px"></div></div>` : ''}
    ${rec.thumb ? `<img src="${rec.thumb}" class="dr-thumb" alt="">` : ''}
    <div class="form-grid">${T.fields.map(f => `<label class="field ${f.full || f.t === 'textarea' || f.t === 'refs' ? 'full' : ''}"><span>${esc(f.l)}${f.req ? ' <em>*</em>' : ''}</span>${inputFor(f, rec, type)}</label>`).join('')}</div>`;
  if (type === 'geo') {
    body.querySelector('#geo-paste').addEventListener('input', e => {
      const c = GE.parseCoords(e.target.value);
      if (c) { body.querySelector('#f_lat').value = c.lat.toFixed(6); body.querySelector('#f_lon').value = c.lon.toFixed(6); }
    });
  }
  body.querySelectorAll('[data-refs-filter]').forEach(inp => inp.addEventListener('input', () => {
    const q = inp.value.toLowerCase();
    body.querySelectorAll('#' + inp.dataset.refsFilter + ' label').forEach(l => { l.style.display = l.dataset.t.includes(q) ? '' : 'none'; });
  }));
  body.querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
    if (s.value !== '__new') return;
    const f = T.fields.find(x => 'f_' + x.k === s.id);
    GE.modal({
      title: 'Новая: ' + GE.TYPES[f.ref].label, size: 'narrow',
      body: `<label class="field"><span>Название</span><input class="input" id="quick-title"></label>`,
      actions: [{ label: 'Отмена', fn: () => { s.value = ''; } }, {
        label: 'Создать', primary: true, fn: ({ el }) => {
          const t = el.querySelector('#quick-title').value.trim(); if (!t) return false;
          const r = GE.db.add(f.ref, { title: t, retrieved: GE.today() });
          s.insertAdjacentHTML('afterbegin', `<option value="${r.id}">${esc(r.title)}</option>`); s.value = r.id;
        }
      }]
    });
  }));
  const actions = [];
  if (id) actions.push({ label: 'Удалить', danger: true, left: true, fn: () => { GE.deleteRecords([id]); } });
  if (isReport) actions.push({ label: 'Автосборка из связанных', left: !id, keep: true, fn: ({ el }) => {
    const linked = readField(T.fields.find(f => f.k === 'linked'), el);
    const ta = el.querySelector('#f_body');
    const gen = GE.reportAutoBody(linked);
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + gen;
    GE.toast('Добавлены сведения из связанных записей');
  } });
  actions.push({ label: 'Отмена' });
  actions.push({
    label: id ? 'Сохранить' : 'Создать запись', primary: true, fn: ({ el }) => {
      const data = {};
      for (const f of T.fields) data[f.k] = readField(f, el);
      if (!data.title) { el.querySelector('#f_title').focus(); GE.toast('Заполните название', { type: 'err' }); return false; }
      for (const f of T.fields) if (f.t === 'url' && data[f.k] && !GE.safeUrl(data[f.k])) { GE.toast(`Поле «${f.l}»: нужна ссылка вида https://…`, { type: 'err' }); el.querySelector('#f_' + f.k).focus(); return false; }
      if (type === 'geo' || type === 'image') {
        if (data.lat !== '' && (Math.abs(data.lat) > 90)) { GE.toast('Широта должна быть от −90 до 90', { type: 'err' }); return false; }
        if (data.lon !== '' && (Math.abs(data.lon) > 180)) { GE.toast('Долгота должна быть от −180 до 180', { type: 'err' }); return false; }
      }
      if (data.sources) data.sources = data.sources.filter(u => GE.safeUrl(u) || /^\[\[/.test(u));
      let r;
      if (id) r = GE.db.update(id, data);
      else r = GE.db.add(type, Object.assign({}, preset, data));
      GE.toast(id ? 'Запись обновлена' : 'Запись создана: ' + r.title);
      GE.emit('record:saved', r);
      if (GE.drawerId === r.id) GE.openRecord(r.id);
    }
  });
  GE.modal({ title: (id ? 'Изменить · ' : 'Новая запись · ') + T.label, body, actions, size: isReport ? 'wide' : '' });
};

GE.reportAutoBody = ids => {
  const recs = (ids || []).map(GE.db.get).filter(Boolean);
  if (!recs.length) return '';
  let out = '## Связанные материалы\n';
  GE.TYPE_KEYS.forEach(type => {
    const g = recs.filter(r => r.type === type); if (!g.length) return;
    out += `\n### ${GE.TYPES[type].plural}\n`;
    g.forEach(r => {
      out += `- [[${r.title}]]${GE.recSub(r) ? ' — ' + GE.recSub(r) : ''}${r.reliability || r.credibility ? ` (оценка ${r.reliability || 'F'}${r.credibility || '6'})` : ''}\n`;
    });
  });
  const urls = GE.uniq(recs.flatMap(r => [].concat(r.url || [], r.sources || [], r.archived_url || [])).filter(u => GE.safeUrl(u)));
  if (urls.length) out += '\n## Источники\n' + urls.map((u, i) => `${i + 1}. ${u}`).join('\n') + '\n';
  return out;
};

/* ─────────── Карточка записи (шторка) ─────────── */
GE.closeDrawer = () => { $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); GE.drawerId = null; };
GE.openRecord = id => {
  const r = GE.db.get(id); if (!r) return;
  const T = GE.TYPES[r.type], dr = $('#drawer');
  GE.drawerId = id;
  const urls = GE.uniq([].concat(r.url || [], r.website || [], r.image_url || [], r.archived_url || [], r.sources || []).filter(u => GE.safeUrl(u)));
  const skip = new Set(['title', 'notes', 'body', 'objective', 'conclusion', 'sources', 'url', 'website', 'image_url', 'archived_url', 'linked', 'tags', 'reliability', 'credibility']);
  const kv = T.fields.filter(f => !skip.has(f.k) && GE.fieldText(r, f.k)).map(f => `<dt>${esc(GE.FIELD_LABEL(r.type, f.k))}</dt><dd class="${f.mono ? 'mono' : ''}">${f.k === 'affiliation' ? `<a href="#" data-open="${r.affiliation}">${esc(GE.fieldText(r, f.k))}</a>` : esc(GE.fieldText(r, f.k))}</dd>`).join('');
  const nb = GE.db.neighbors(id);
  const text = (k, h) => r[k] ? `<div class="dr-sec"><h6>${h}</h6><div class="md">${GE.md(r[k])}</div></div>` : '';
  dr.innerHTML = `
    <div class="dr-h">
      <button class="btn btn-icon btn-ghost close" aria-label="Закрыть">${GE.icon('x', 'ic')}</button>
      <div class="dr-type">${esc(T.code)} · ${esc(T.label.toUpperCase())}</div>
      <div class="dr-title sens">${esc(r.title)}</div>
      <div class="dr-badges">${r.type !== 'report' ? GE.admBadge(r) : ''}${r.reliability ? `<span class="badge">${esc(GE.REL[r.reliability])}</span>` : ''}${r.credibility ? `<span class="badge">${esc(GE.CRED[r.credibility])}</span>` : ''}${r.status ? cell(r, 'status') : ''}${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>
    </div>
    <div class="dr-b">
      ${r.thumb ? `<img class="dr-thumb" src="${r.thumb}" alt="">` : ''}
      ${r.type === 'geo' && r.lat !== '' && r.lat != null ? `<div class="row" style="margin-bottom:16px"><button class="btn btn-sm" data-act="map">${GE.icon('geo')}Показать на карте</button><a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}">Google</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://yandex.ru/maps/?ll=${r.lon},${r.lat}&z=17&pt=${r.lon},${r.lat}">Яндекс</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=17/${r.lat}/${r.lon}">OSM</a></div>` : ''}
      ${kv ? `<div class="dr-sec"><h6>Сведения</h6><dl class="kv">${kv}<dt>Создано</dt><dd>${esc(GE.fmtDate(r.created))}</dd><dt>Изменено</dt><dd>${esc(GE.fmtDate(r.updated))}</dd></dl></div>` : ''}
      ${text('objective', 'Цель исследования')}
      ${text('body', r.type === 'report' ? 'Ход работы и находки' : 'Описание')}
      ${text('conclusion', 'Вывод')}
      ${text('notes', 'Заметки')}
      ${urls.length ? `<div class="dr-sec"><h6>Источники и ссылки · ${urls.length}</h6><div class="url-list">${urls.map(u => `<div class="row" style="gap:6px;flex-wrap:nowrap"><a href="${esc(u)}" target="_blank" rel="noopener" class="grow">${esc(u)}</a><a class="btn btn-icon btn-sm btn-ghost" title="Архивная копия" target="_blank" rel="noopener" href="https://web.archive.org/web/*/${esc(u)}">${GE.icon('archive')}</a></div>`).join('')}</div></div>` : ''}
      <div class="dr-sec"><h6>Связи · ${nb.length}</h6>
        <div class="link-list">${nb.length ? nb.map(n => `<div class="link-i" data-open="${n.other.id}"><span class="rel">${n.out ? '→' : '←'} ${esc(n.edge.rel)}</span><span class="sens">${esc(n.other.title)}</span><span class="dim mono" style="font-size:10px">${GE.TYPES[n.other.type].code}</span>${n.edge.kind === 'link' ? `<button class="btn btn-icon btn-sm btn-ghost x" data-unlink="${n.edge.id}" title="Удалить связь">${GE.icon('x')}</button>` : ''}</div>`).join('') : '<div class="muted" style="font-size:12.5px">Связей пока нет.</div>'}</div>
        <button class="btn btn-sm" style="margin-top:10px" data-act="link">${GE.icon('link')}Добавить связь</button>
      </div>
    </div>
    <div class="dr-f">
      <button class="btn btn-primary" data-act="edit">${GE.icon('edit')}Изменить</button>
      <button class="btn" data-act="search">${GE.icon('search')}Искать</button>
      <button class="btn" data-act="dossier" title="Сохранить автономное офлайн HTML-досье">${GE.icon('report')}HTML-досье</button>
      ${r.type === 'report' ? `<button class="btn" data-act="export">${GE.icon('down')}Экспорт</button>` : ''}
      <button class="btn" data-act="md" title="Скопировать как заметку Obsidian">${GE.icon('copy')}Markdown</button>
      <button class="btn btn-ghost btn-danger" data-act="del" style="margin-left:auto">${GE.icon('trash')}</button>
    </div>`;
  dr.querySelector('.close').onclick = GE.closeDrawer;
  dr.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('[data-unlink]')) return; e.preventDefault(); GE.openRecord(el.dataset.open); }));
  dr.querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); GE.db.unlink(b.dataset.unlink); GE.openRecord(id); }));
  dr.querySelectorAll('.wl').forEach(w => w.addEventListener('click', () => { const x = GE.db.findTitle(w.dataset.wl); if (x) GE.openRecord(x.id); else GE.toast('Запись «' + w.dataset.wl + '» не найдена'); }));
  const act = a => dr.querySelector(`[data-act=${a}]`);
  act('edit').onclick = () => GE.editRecord(r.type, id);
  act('search').onclick = () => { GE.closeDrawer(); GE.searchFor(r); };
  if (act('dossier')) act('dossier').onclick = () => GE.pro && GE.pro.exportDossier(r);
  act('del').onclick = () => GE.deleteRecords([id]);
  act('link').onclick = () => GE.linkDialog(id);
  act('md').onclick = () => GE.vault && GE.copy(GE.vault.recToMd(r));
  if (act('map')) act('map').onclick = () => { GE.closeDrawer(); location.hash = '#/geolocation'; setTimeout(() => GE.geo && GE.geo.focus(r), 250); };
  if (act('export')) act('export').onclick = () => GE.exportReportDialog(r);
  dr.classList.add('on'); $('#scrim').classList.add('on');
};

/* ─────────── Диалог связи ─────────── */
GE.RELATIONS = ['связан с', 'работает в', 'руководит', 'владеет', 'учредитель', 'входит в', 'партнёр', 'упоминается в', 'подтверждает', 'опровергает', 'опубликовал', 'находится в', 'снято в', 'источник для', 'дочерняя компания'];
GE.linkDialog = (fromId, toId) => {
  const all = GE.db.all();
  if (all.length < 2) { GE.toast('Нужно хотя бы две записи, чтобы создать связь', { type: 'err' }); return; }
  const opts = sel => all.map(r => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${GE.TYPES[r.type].code} · ${esc(r.title)}</option>`).join('');
  GE.modal({
    title: 'Новая связь', body: `
      <div class="stack">
        <label class="field"><span>Откуда</span><select class="select" id="ln-from">${opts(fromId)}</select></label>
        <label class="field"><span>Тип связи</span><input class="input" id="ln-rel" list="ln-rels" value="связан с"><datalist id="ln-rels">${GE.RELATIONS.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="field"><span>Куда</span><select class="select" id="ln-to">${opts(toId || (all.find(r => r.id !== fromId) || {}).id)}</select></label>
        <div class="form-grid">
          <label class="field"><span>Надёжность источника</span><select class="select" id="ln-relia"><option value="">—</option>${Object.entries(GE.REL).map(([k, v]) => `<option value="${k}">${k} — ${esc(v)}</option>`).join('')}</select></label>
          <label class="field"><span>Подтверждение (URL)</span><input class="input mono" id="ln-src" placeholder="https://…"></label>
        </div>
        <label class="field"><span>Комментарий</span><input class="input" id="ln-note"></label>
      </div>`,
    actions: [{ label: 'Отмена' }, {
      label: 'Связать', primary: true, fn: ({ el }) => {
        const from = el.querySelector('#ln-from').value, to = el.querySelector('#ln-to').value;
        if (from === to) { GE.toast('Выберите две разные записи', { type: 'err' }); return false; }
        GE.db.link(from, to, el.querySelector('#ln-rel').value.trim() || 'связан с', { reliability: el.querySelector('#ln-relia').value, source: GE.safeUrl(el.querySelector('#ln-src').value), note: el.querySelector('#ln-note').value.trim() });
        GE.toast('Связь создана');
        if (GE.drawerId) GE.openRecord(GE.drawerId);
      }
    }]
  });
};

/* ─────────── Экспорт ─────────── */
GE.exportCSV = (recs, name) => {
  if (!recs.length) return GE.toast('Нет записей для экспорта', { type: 'err' });
  const keys = GE.uniq(['type', 'title', ...recs.flatMap(r => Object.keys(r))]).filter(k => !['thumb', '_wikilinks', '_path'].includes(k));
  const q = v => { v = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = [keys.join(','), ...recs.map(r => keys.map(k => q(k === 'affiliation' ? (GE.db.get(r[k])?.title || '') : k === 'linked' ? (r[k] || []).map(x => GE.db.get(x)?.title).join('; ') : r[k])).join(','))];
  GE.download(name, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
};

GE.reportHTML = r => {
  const linked = (r.linked || []).map(GE.db.get).filter(Boolean);
  const urls = GE.uniq(linked.flatMap(x => [].concat(x.url || [], x.sources || [])).filter(u => GE.safeUrl(u)));
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(r.title)} — GOD EYE</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono&display=swap');
body{font:14px/1.65 'IBM Plex Sans',sans-serif;color:#111;max-width:820px;margin:40px auto;padding:0 24px}
header{border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px;position:relative}
header:after{content:'';position:absolute;left:0;bottom:-2px;width:80px;height:2px;background:#8b0000}
.k{font:11px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#8b0000}
h1{font:600 28px/1.2 Cinzel,serif;letter-spacing:.08em;margin:10px 0}
h2,h3{font-family:Cinzel,serif;letter-spacing:.08em}
.meta{font:12px 'JetBrains Mono',monospace;color:#555}
.box{border:1px solid #ccc;padding:12px 16px;margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}
a{color:#8b0000}code{font-family:'JetBrains Mono',monospace}
footer{margin-top:40px;border-top:1px solid #ccc;padding-top:12px;font:11px 'JetBrains Mono',monospace;color:#777}
@media print{body{margin:0}}</style></head><body>
<header><div class="k">GOD EYE · OSINT INTELLIGENCE · ${esc(r.report_type || 'ОТЧЁТ')}</div><h1>${esc(r.title)}</h1>
<div class="meta">Статус: ${esc(r.status || '—')} · Уверенность: ${esc(r.confidence || '—')} · Обновлено: ${esc(GE.fmtDate(r.updated))} · Аналитик: ${esc(GE.settings.callsign)}</div></header>
${r.objective ? `<h2>Цель</h2><div class="box">${GE.md(r.objective)}</div>` : ''}
${r.body ? `<h2>Ход работы и находки</h2>${GE.md(r.body)}` : ''}
${r.conclusion ? `<h2>Вывод</h2><div class="box">${GE.md(r.conclusion)}</div>` : ''}
${linked.length ? `<h2>Связанные записи</h2><table><tr><th>Тип</th><th>Запись</th><th>Сведения</th><th>Оценка</th></tr>${linked.map(x => `<tr><td>${esc(GE.TYPES[x.type].label)}</td><td>${esc(x.title)}</td><td>${esc(GE.recSub(x))}</td><td>${esc((x.reliability || '') + (x.credibility || ''))}</td></tr>`).join('')}</table>` : ''}
${urls.length ? `<h2>Источники</h2><ol>${urls.map(u => `<li><a href="${esc(u)}">${esc(u)}</a></li>`).join('')}</ol>` : ''}
<footer>Сформировано в GOD EYE ${esc(GE.fmtDate(GE.now()))}. Оценки — по шкале Адмиралтейства (A–F надёжность источника, 1–6 достоверность сведений). Документ основан только на открытых источниках.</footer>
</body></html>`;
};
GE.exportReportDialog = r => {
  const name = 'GODEYE_' + String(r.title).replace(/[^\wа-яё]+/gi, '_').slice(0, 60);
  GE.modal({
    title: 'Экспорт отчёта', size: 'narrow', body: `<p class="muted" style="font-size:13px">Выберите формат. «Печать / PDF» откроет оформленный отчёт — в окне печати выберите «Сохранить как PDF».</p>`,
    actions: [
      { label: 'Markdown (Obsidian)', fn: () => GE.download(name + '.md', GE.vault.recToMd(r), 'text/markdown;charset=utf-8') },
      { label: 'HTML', fn: () => GE.download(name + '.html', GE.reportHTML(r), 'text/html;charset=utf-8') },
      { label: 'TXT', fn: () => GE.download(name + '.txt', `GOD EYE — ОТЧЁТ\n${'═'.repeat(48)}\n${r.title}\nТип: ${r.report_type || '—'} · Статус: ${r.status || '—'} · Уверенность: ${r.confidence || '—'}\n${'─'.repeat(48)}\n\nЦЕЛЬ\n${r.objective || '—'}\n\nНАХОДКИ\n${r.body || '—'}\n\nВЫВОД\n${r.conclusion || '—'}\n`) },
      { label: 'Печать / PDF', primary: true, fn: () => { const w = window.open('', '_blank'); if (!w) return GE.toast('Разрешите всплывающие окна', { type: 'err' }); w.document.write(GE.reportHTML(r)); w.document.close(); setTimeout(() => w.print(), 600); } }
    ]
  });
};

/* ─────────── Демонстрационные данные (вымышленные) ─────────── */
GE.loadDemo = () => {
  if (GE.db.all().some(r => (r.tags || []).includes('демо'))) return GE.toast('Демо-данные уже загружены');
  const d = GE.today(), tag = ['демо'];
  const org = GE.db.add('org', { title: 'ООО «Северный Маяк» (DEMO)', org_type: 'Компания', country: 'Россия', registry_id: '0000000000 (вымышленный)', website: '', sources: ['https://example.com/about'], reliability: 'C', credibility: '3', retrieved: d, tags: tag, notes: 'Вымышленная организация для демонстрации возможностей системы.' }, true);
  const per = GE.db.add('person', { title: 'Анна Пример (DEMO)', aliases: ['A. Primer'], role: 'Пресс-секретарь', affiliation: org.id, country: 'Россия', sources: ['https://example.com/press'], reliability: 'B', credibility: '2', retrieved: d, tags: tag, notes: 'Вымышленная публичная персона. Только официальные заявления от имени компании.' }, true);
  const src1 = GE.db.add('source', { title: 'Пост в публичном канале с «фото наводнения» (DEMO)', url: 'https://example.com/channel/post/123', source_type: 'Соцсеть', publisher: 'Публичный канал (вымышленный)', published: d, retrieved: d, reliability: 'E', credibility: '4', tags: tag.concat('проверка'), notes: 'Первоисточник утверждения. Архивировать до удаления.' }, true);
  const src2 = GE.db.add('source', { title: 'Официальное заявление пресс-службы (DEMO)', url: 'https://example.com/press/statement', source_type: 'Сайт', publisher: org.title, retrieved: d, reliability: 'B', credibility: '2', tags: tag }, true);
  const src3 = GE.db.add('source', { title: 'Архивная публикация 2019 года с тем же фото (DEMO)', url: 'https://example.org/2019/flood-gallery', archived_url: 'https://web.archive.org/web/2019/https://example.org/2019/flood-gallery', source_type: 'СМИ', retrieved: d, reliability: 'B', credibility: '1', tags: tag.concat('проверка') }, true);
  const geo = GE.db.add('geo', { title: 'Дворцовая площадь (DEMO)', lat: 59.939, lon: 30.3158, place: 'Санкт-Петербург, Дворцовая площадь', accuracy: 'Точная', retrieved: d, sources: ['https://www.openstreetmap.org/?mlat=59.939&mlon=30.3158'], reliability: 'A', credibility: '1', tags: tag, notes: 'Место, где якобы сделано фото. Совпадают Александровская колонна и арка Главного штаба.' }, true);
  const img = GE.db.add('image', { title: 'Фото «затопленной площади» (DEMO)', verdict: 'Вне контекста', captured: '2019:06:14 18:22:05', camera: 'Canon EOS 80D', lat: 59.939, lon: 30.3158, retrieved: d, sources: [src1.url, src3.url], reliability: 'E', credibility: '4', tags: tag.concat('проверка'), notes: 'Обратный поиск нашёл публикацию 2019 года. EXIF совпадает с датой архивной публикации.' }, true);
  GE.db.add('report', {
    title: 'Проверка вирусного фото «Затопленная площадь» (DEMO)', report_type: 'Проверка изображения', status: 'Завершено', confidence: 'Высокая',
    objective: 'Установить, когда и где сделано фото, распространяемое как «снимок сегодняшнего наводнения».',
    linked: [img.id, geo.id, src1.id, src3.id],
    body: '## Шаги\n1. Архивировали первоисточник — [[Пост в публичном канале с «фото наводнения» (DEMO)]].\n2. Обратный поиск (Яндекс, TinEye) — найдена публикация 2019 года.\n3. EXIF: дата съёмки 2019:06:14, камера Canon EOS 80D.\n4. Геолокация: [[Дворцовая площадь (DEMO)]] — совпадают ориентиры.\n\n> Фото подлинное, но опубликовано **вне контекста**.',
    conclusion: 'Изображение сделано в 2019 году и не относится к текущим событиям. Оценка: вне контекста.', tags: tag
  }, true);
  GE.db.link(per.id, org.id, 'работает в');
  GE.db.link(src2.id, org.id, 'опубликовал');
  GE.db.link(src3.id, img.id, 'опровергает');
  GE.db.link(src1.id, img.id, 'опубликовал');
  GE.db.link(img.id, geo.id, 'снято в');
  GE.log('DEMO', 'Загружен демонстрационный набор (вымышленные данные)');
  GE.save();
  GE.toast('Демо-данные загружены — откройте «Связи» и «Исследования»');
};

})();
