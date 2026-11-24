/* ═══════════════════════════════════════════════════════════════
   GOD EYE · graph.js — силовой граф связей (Canvas 2D)
   Перетаскивание, масштаб, подсветка соседей, поток по рёбрам, фильтры
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, esc = GE.esc, TAU = Math.PI * 2;

const STYLE = {
  person: { fill: '#f3f3f5', ring: '#ffffff' },
  org: { fill: '#b9b9c3', ring: '#e6e6ec' },
  geo: { fill: '#e2232e', ring: '#ff6b72' },
  image: { fill: '#8e8e99', ring: '#cfcfd8' },
  source: { fill: '#55555f', ring: '#a5a5af' },
  report: { fill: '#8b0000', ring: '#e2232e' }
};

function shape(c, type, x, y, r) {
  c.beginPath();
  switch (GE.TYPES[type]?.shape) {
    case 'square': c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 'diamond': c.moveTo(x, y - r * 1.2); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.2); c.lineTo(x - r, y); c.closePath(); break;
    case 'triangle': c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.05, y + r * 0.75); c.lineTo(x - r * 1.05, y + r * 0.75); c.closePath(); break;
    case 'hex': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); break;
    case 'star': for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? r * 0.5 : r * 1.2; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); break;
    default: c.arc(x, y, r, 0, TAU);
  }
}
GE.shapeSVG = type => {
  const s = STYLE[type] || STYLE.person, sh = GE.TYPES[type].shape;
  const p = { circle: '<circle cx="6" cy="6" r="4.5"/>', square: '<rect x="2" y="2" width="8" height="8"/>', diamond: '<path d="M6 .8 11 6 6 11.2 1 6z"/>', triangle: '<path d="M6 1 11 10H1z"/>', hex: '<path d="M6 1 10.3 3.5v5L6 11 1.7 8.5v-5z"/>', star: '<path d="m6 .5 1.6 3.6 3.9.4-2.9 2.6.8 3.9L6 9 2.6 11l.8-3.9L.5 4.5l3.9-.4z"/>' }[sh];
  return `<svg viewBox="0 0 12 12" fill="${s.fill}" stroke="${s.ring}" stroke-width=".8">${p}</svg>`;
};

class Graph {
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.o = Object.assign({ mini: false, onSelect: null, onOpen: null }, opts);
    this.nodes = []; this.edges = []; this.map = new Map();
    this.view = { x: 0, y: 0, k: 1 };
    this.alpha = 1; this.hover = null; this.sel = null; this.drag = null; this.pan = null;
    this.hidden = new Set(); this.showIso = true; this.find = '';
    this.resize();
    new ResizeObserver(() => { this.resize(); this.kick(0.3); }).observe(canvas);
    if (!this.o.mini) this.bind();
    else canvas.addEventListener('click', () => { location.hash = '#/connections'; });
    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.kick(0); });
  }
  resize() {
    const r = this.cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.cv.width = r.width * dpr; this.cv.height = r.height * dpr;
    this.draw();
  }
  setData(nodes, edges) {
    const old = this.map;
    this.map = new Map();
    this.nodes = nodes.map((n, i) => {
      const p = old.get(n.id);
      const a = i * 2.39996, rr = 30 + Math.sqrt(i) * 34;
      const node = Object.assign(n, p ? { x: p.x, y: p.y, vx: 0, vy: 0, fx: p.fx, fy: p.fy } : { x: Math.cos(a) * rr, y: Math.sin(a) * rr, vx: 0, vy: 0 });
      this.map.set(n.id, node);
      return node;
    });
    this.edges = edges.filter(e => this.map.has(e.from) && this.map.has(e.to)).map(e => Object.assign({}, e, { s: this.map.get(e.from), t: this.map.get(e.to) }));
    const deg = new Map();
    this.edges.forEach(e => { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); });
    this.nodes.forEach(n => { n.deg = deg.get(n.id) || 0; n.r = (this.o.mini ? 3.2 : 6) + Math.min(9, Math.sqrt(n.deg) * (this.o.mini ? 1.4 : 2.4)); });
    if (this.sel && !this.map.has(this.sel.id)) this.sel = null;
    this.kick(old.size ? 0.5 : 1);
    if (!old.size) setTimeout(() => this.fit(), this.o.mini ? 900 : 700);
  }
  visible(n) { return !this.hidden.has(n.type) && (this.showIso || n.deg > 0); }
  kick(a = 0.6) { this.alpha = Math.max(this.alpha, a); if (!this.raf) this.loop(); }
  loop() {
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      const active = this.alpha > 0.004 || this.drag || this.sel || this.hover;
      if (this.alpha > 0.004) this.tick();
      this.draw();
      if (active && document.body.contains(this.cv) && this.cv.offsetParent !== null) this.loop();
    });
  }
  tick() {
    const N = this.nodes.filter(n => this.visible(n)), a = this.alpha;
    const rep = this.o.mini ? 900 : 2600, len = this.o.mini ? 46 : 110;
    for (let i = 0; i < N.length; i++) {
      const p = N[i];
      for (let j = i + 1; j < N.length; j++) {
        const q = N[j]; let dx = q.x - p.x, dy = q.y - p.y; let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 > 250000) continue;
        const f = rep / d2 * a, d = Math.sqrt(d2);
        p.vx -= dx / d * f; p.vy -= dy / d * f; q.vx += dx / d * f; q.vy += dy / d * f;
      }
    }
    this.edges.forEach(e => {
      if (!this.visible(e.s) || !this.visible(e.t)) return;
      const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - len) * 0.035 * a;
      e.s.vx += dx / d * f; e.s.vy += dy / d * f; e.t.vx -= dx / d * f; e.t.vy -= dy / d * f;
    });
    N.forEach(n => {
      n.vx -= n.x * 0.006 * a; n.vy -= n.y * 0.006 * a;
      if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; return; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-40, Math.min(40, n.vx)); n.y += Math.max(-40, Math.min(40, n.vy));
    });
    this.alpha *= 0.985;
  }
  fit() {
    const N = this.nodes.filter(n => this.visible(n)); if (!N.length || !this.w) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    N.forEach(n => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
    const pad = this.o.mini ? 24 : 80;
    const k = Math.min(2.2, Math.min((this.w - pad * 2) / Math.max(1, x1 - x0), (this.h - pad * 2) / Math.max(1, y1 - y0)));
    this.view.k = k; this.view.x = this.w / 2 - (x0 + x1) / 2 * k; this.view.y = this.h / 2 - (y0 + y1) / 2 * k;
    this.draw();
  }
  toWorld(px, py) { return { x: (px - this.view.x) / this.view.k, y: (py - this.view.y) / this.view.k }; }
  pick(px, py) {
    const p = this.toWorld(px, py);
    let best = null, bd = Infinity;
    this.nodes.forEach(n => { if (!this.visible(n)) return; const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < n.r + 6 / this.view.k && d < bd) { bd = d; best = n; } });
    return best;
  }
  pos(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  onHover(e) {
    if (this.drag || this.pan) return;
    const [x, y] = this.pos(e), n = this.pick(x, y);
    if (n !== this.hover) { this.hover = n; this.cv.style.cursor = n ? 'pointer' : (this.o.mini ? 'pointer' : 'grab'); this.kick(0); }
  }
  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => {
      const [x, y] = this.pos(e), n = this.pick(x, y);
      cv.setPointerCapture(e.pointerId);
      if (n) { this.drag = { n, moved: false }; n.fx = n.x; n.fy = n.y; }
      else this.pan = { x, y, vx: this.view.x, vy: this.view.y, moved: false };
    });
    cv.addEventListener('pointermove', e => {
      const [x, y] = this.pos(e);
      if (this.drag) { const p = this.toWorld(x, y); this.drag.n.fx = p.x; this.drag.n.fy = p.y; this.drag.moved = true; this.kick(0.25); }
      else if (this.pan) { this.view.x = this.pan.vx + x - this.pan.x; this.view.y = this.pan.vy + y - this.pan.y; this.pan.moved = true; this.draw(); }
    });
    const up = () => {
      if (this.drag) {
        const n = this.drag.n;
        if (!this.drag.moved) { this.select(n); }
        if (!n.pinned) { n.fx = null; n.fy = null; }
        this.drag = null; this.kick(0.15);
      } else if (this.pan) { if (!this.pan.moved) this.select(null); this.pan = null; }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', e => { const [x, y] = this.pos(e), n = this.pick(x, y); if (n && this.o.onOpen) this.o.onOpen(n); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = this.pos(e), k0 = this.view.k, k = Math.max(0.15, Math.min(4, k0 * Math.exp(-e.deltaY * 0.0015)));
      this.view.x = x - (x - this.view.x) * k / k0; this.view.y = y - (y - this.view.y) * k / k0; this.view.k = k; this.draw();
    }, { passive: false });
  }
  select(n) { this.sel = n; this.o.onSelect && this.o.onSelect(n); this.kick(0); }
  focusOn(id) {
    const n = this.map.get(id); if (!n) return;
    this.view.k = Math.max(this.view.k, 1.2);
    this.view.x = this.w / 2 - n.x * this.view.k; this.view.y = this.h / 2 - n.y * this.view.k;
    this.select(n);
  }
  draw() {
    const c = this.ctx; if (!this.w) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const t = performance.now() / 1000, mini = this.o.mini;
    if (!this.nodes.length) {
      c.fillStyle = '#5f5f68'; c.font = `${mini ? 11 : 12}px 'JetBrains Mono', monospace`; c.textAlign = 'center';
      c.fillText(mini ? 'НЕТ ДАННЫХ — ДОБАВЬТЕ ЗАПИСИ' : 'ГРАФ ПУСТ · СОЗДАЙТЕ ЗАПИСИ И СВЯЗИ', this.w / 2, this.h / 2);
      return;
    }
    c.save(); c.translate(this.view.x, this.view.y); c.scale(this.view.k, this.view.k);
    const focus = this.sel || this.hover;
    const nb = new Set();
    if (focus) { nb.add(focus.id); this.edges.forEach(e => { if (e.s === focus) nb.add(e.t.id); if (e.t === focus) nb.add(e.s.id); }); }
    const fq = this.find.toLowerCase();
    // рёбра
    this.edges.forEach(e => {
      if (!this.visible(e.s) || !this.visible(e.t)) return;
      const on = focus && (e.s === focus || e.t === focus);
      c.strokeStyle = on ? 'rgba(226,35,46,0.85)' : focus ? 'rgba(205,205,215,0.05)' : e.kind === 'link' ? 'rgba(179,18,27,0.45)' : 'rgba(205,205,215,0.16)';
      c.lineWidth = (on ? 1.6 : 1) / this.view.k;
      if (e.kind === 'wiki') c.setLineDash([3 / this.view.k, 4 / this.view.k]);
      c.beginPath(); c.moveTo(e.s.x, e.s.y); c.lineTo(e.t.x, e.t.y); c.stroke(); c.setLineDash([]);
      if (on && !mini) {
        // поток частиц по ребру
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.5 + i / 3) % 1), x = e.s.x + (e.t.x - e.s.x) * k, y = e.s.y + (e.t.y - e.s.y) * k;
          c.fillStyle = 'rgba(255,90,90,0.9)'; c.beginPath(); c.arc(x, y, 2 / this.view.k, 0, TAU); c.fill();
        }
        const mx = (e.s.x + e.t.x) / 2, my = (e.s.y + e.t.y) / 2;
        c.font = `${10.5 / this.view.k}px 'JetBrains Mono', monospace`; c.textAlign = 'center';
        c.fillStyle = 'rgba(5,5,6,0.85)'; const tw = c.measureText(e.rel).width;
        c.fillRect(mx - tw / 2 - 4 / this.view.k, my - 8 / this.view.k, tw + 8 / this.view.k, 14 / this.view.k);
        c.fillStyle = '#ff8a90'; c.fillText(e.rel, mx, my + 3 / this.view.k);
      }
    });
    // узлы
    this.nodes.forEach(n => {
      if (!this.visible(n)) return;
      const st = STYLE[n.type] || STYLE.person;
      const dim = focus && !nb.has(n.id);
      const hit = fq && n.title.toLowerCase().includes(fq);
      c.globalAlpha = dim ? 0.18 : 1;
      if (n === focus || hit) {
        const g = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3.2);
        g.addColorStop(0, 'rgba(226,35,46,0.45)'); g.addColorStop(1, 'rgba(226,35,46,0)');
        c.fillStyle = g; c.beginPath(); c.arc(n.x, n.y, n.r * 3.2, 0, TAU); c.fill();
      }
      shape(c, n.type, n.x, n.y, n.r);
      c.fillStyle = st.fill; c.fill();
      c.strokeStyle = n === this.sel ? '#e2232e' : st.ring; c.lineWidth = (n === this.sel ? 2 : 1) / this.view.k; c.stroke();
      if (n === this.sel) { c.strokeStyle = 'rgba(226,35,46,0.6)'; c.lineWidth = 1 / this.view.k; c.beginPath(); c.arc(n.x, n.y, n.r + 6 + Math.sin(t * 3) * 2, 0, TAU); c.stroke(); }
      const showLabel = !mini && (this.view.k > 0.55 || n === focus || nb.has(n.id) || hit || n.deg > 2);
      if (showLabel) {
        c.font = `${(n === focus ? 12.5 : 11) / this.view.k}px 'IBM Plex Sans', sans-serif`; c.textAlign = 'center';
        const label = n.title.length > 28 ? n.title.slice(0, 27) + '…' : n.title;
        c.fillStyle = dim ? 'rgba(200,200,210,0.4)' : (n === focus ? '#ffffff' : '#c9c9d1');
        c.fillText(GE.settings.secure ? '█████' : label, n.x, n.y + n.r + 13 / this.view.k);
      }
    });
    c.globalAlpha = 1; c.restore();
  }
  png() { return this.cv.toDataURL('image/png'); }
}
GE.Graph = Graph;

/* ─────────── Данные графа из базы ─────────── */
GE.graphData = () => ({
  nodes: GE.db.all().map(r => ({ id: r.id, type: r.type, title: String(r.title || '?') })),
  edges: GE.db.edges()
});

/* ─────────── Раздел «Связи» ─────────── */
const C = GE.conn = {};
C.init = () => {
  C.g = new Graph($('#graph-canvas'), { onSelect: C.info, onOpen: n => GE.openRecord(n.id) });
  $('#graph-legend').innerHTML = GE.TYPE_KEYS.map(t => `<span data-t="${t}">${GE.shapeSVG(t)}${esc(GE.TYPES[t].plural.toUpperCase())}</span>`).join('');
  $('#graph-legend').addEventListener('click', e => {
    const s = e.target.closest('[data-t]'); if (!s) return;
    const t = s.dataset.t; C.g.hidden.has(t) ? C.g.hidden.delete(t) : C.g.hidden.add(t);
    s.classList.toggle('off', C.g.hidden.has(t)); C.g.kick(0.4);
  });
  $('#graph-find').addEventListener('input', e => {
    C.g.find = e.target.value.trim(); C.g.kick(0);
    const n = C.g.nodes.find(x => C.g.find && x.title.toLowerCase().includes(C.g.find.toLowerCase()));
    if (n && e.target.value.length > 2) C.g.focusOn(n.id);
  });
  $('#graph-fit').onclick = () => C.g.fit();
  $('#graph-shake').onclick = () => { C.g.nodes.forEach(n => { n.x = (Math.random() - 0.5) * 400; n.y = (Math.random() - 0.5) * 400; n.fx = n.fy = null; n.pinned = false; }); C.g.kick(1); setTimeout(() => C.g.fit(), 1300); };
  $('#graph-iso').addEventListener('change', e => { C.g.showIso = e.target.checked; C.g.kick(0.4); setTimeout(() => C.g.fit(), 600); });
  $('#graph-png').onclick = () => { const a = document.createElement('a'); a.href = C.g.png(); a.download = `GODEYE_GRAPH_${GE.today()}.png`; a.click(); };
  $('#link-new').onclick = () => GE.linkDialog(C.g.sel && C.g.sel.id);
  C.refresh();
};
C.refresh = () => {
  if (!C.g) return;
  const d = GE.graphData(); C.g.setData(d.nodes, d.edges);
  const box = $('#links-list'), ls = GE.DB.links.slice().reverse();
  $('#links-count').textContent = ls.length;
  box.innerHTML = ls.slice(0, 60).map(l => {
    const a = GE.db.get(l.from), b = GE.db.get(l.to); if (!a || !b) return '';
    return `<div class="link-i" data-focus="${a.id}"><span class="sens" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.title)}</span><span class="rel">→ ${esc(l.relation)} →</span><span class="sens" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.title)}</span><button class="btn btn-icon btn-sm btn-ghost x" data-del="${l.id}" title="Удалить связь">${GE.icon('x')}</button></div>`;
  }).join('') || '<div class="muted" style="font-size:12.5px">Связей пока нет. Нажмите «Новая связь».</div>';
  box.onclick = e => {
    const d = e.target.closest('[data-del]'); if (d) { GE.db.unlink(d.dataset.del); return; }
    const f = e.target.closest('[data-focus]'); if (f) C.g.focusOn(f.dataset.focus);
  };
};
C.info = n => {
  const box = $('#graph-info');
  if (!n) { box.innerHTML = '<span class="muted">Выберите узел на графе, чтобы увидеть его связи.</span>'; return; }
  const r = GE.db.get(n.id); if (!r) return;
  const nb = GE.db.neighbors(r.id);
  box.innerHTML = `<div class="card-type">${GE.TYPES[r.type].code} · ${esc(GE.TYPES[r.type].label)}</div>
    <div class="card-title sens" style="margin-bottom:4px">${esc(r.title)}</div><div class="card-sub">${esc(GE.recSub(r))}</div>
    <div class="row" style="margin:10px 0">${r.type !== 'report' ? GE.admBadge(r) : ''}<span class="badge">СВЯЗЕЙ: ${nb.length}</span></div>
    <div class="link-list">${nb.slice(0, 12).map(x => `<div class="link-i" data-focus="${x.other.id}"><span class="rel">${x.out ? '→' : '←'} ${esc(x.edge.rel)}</span><span class="sens">${esc(x.other.title)}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-primary" data-a="open">Карточка</button><button class="btn btn-sm" data-a="link">${GE.icon('link')}Связать</button><button class="btn btn-sm" data-a="pin">${n.pinned ? 'Открепить' : 'Закрепить'}</button></div>`;
  box.onclick = e => {
    const f = e.target.closest('[data-focus]'); if (f) return C.g.focusOn(f.dataset.focus);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'open') GE.openRecord(r.id);
    if (a === 'link') GE.linkDialog(r.id);
    if (a === 'pin') { n.pinned = !n.pinned; if (n.pinned) { n.fx = n.x; n.fy = n.y; } else { n.fx = n.fy = null; } C.info(n); C.g.kick(0.2); }
  };
};
})();
