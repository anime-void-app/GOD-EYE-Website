/* ═══════════════════════════════════════════════════════════════
   GOD EYE · eye.js — всевидящее око (Canvas 2D)
   Слои: аура → лучи → кольца → треугольник → глаз → частицы → импульсы.
   Анимации: саккады и слежение зрачка, моргание, пульсация радужки,
   вращение колец в разные стороны, частицы, мерцание рун, красные импульсы,
   волна искажения пространства. Кинематографичная заставка — режим 'intro'.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIn = t => t * t * t;
const eIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eBack = t => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lp = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const QUALITY = {
  full: { dpr: 2, parts: 90, rays: true, distort: true, fps: 60 },
  lite: { dpr: 1.25, parts: 36, rays: true, distort: false, fps: 40 },
  min: { dpr: 1, parts: 0, rays: false, distort: false, fps: 24 }
};

/* Общая позиция указателя для всех глаз */
const pointer = { x: 0, y: 0, t: 0 };
window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = performance.now(); }, { passive: true });

class GodEye {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = Object.assign({ mode: 'normal', quality: 'full', follow: true, size: 0.96, cy: 0.5, autoDowngrade: true }, opts);
    this.q = QUALITY[this.o.quality] || QUALITY.full;
    this.R = rng(1129);
    this.g = { x: 0, y: 0, vx: 0, vy: 0 };
    this.gx = 0; this.gy = 0; this.open = 1; this.pf = 0; this.t = 0;
    this.nextSacc = 0; this.saccT = { x: 0, y: 0 };
    this.blinkS = null; this.nextBlink = performance.now() + 2200 + Math.random() * 2500;
    this.lidAnim = null; this.lidMul = 1;
    this.pulses = []; this.nextPulse = performance.now() + 4500;
    this.scanAt = -1e9;
    this.focusEl = null;
    this.parts = [];
    this.rot = 0;
    this.flick = Array.from({ length: RUNES.length }, () => ({ a: 0.5, tg: 0.6, next: 0 }));
    this.sigils = this.makeSigils(8);
    this.t0 = performance.now();
    this.introT = this.o.mode === 'intro' ? 0 : 99;
    this.flashed = false;
    this.running = false; this.inView = true;
    this.frames = 0; this.slow = 0;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(es => { this.inView = es[0].isIntersecting; });
      this.io.observe(canvas);
    }
    if (this.o.mode !== 'intro') canvas.addEventListener('click', () => this.scan());
    GodEye.all.add(this);
  }

  setQuality(name) { this.q = QUALITY[name] || QUALITY.full; this.o.quality = name; this.resize(); if (!this.running) this.draw(performance.now()); }

  resize() {
    const r = this.cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    const u = this.u = Math.min(r.width, r.height) / 2 * this.o.size;
    this.cx = r.width / 2; this.cy = r.height * this.o.cy;
    this.ew = 0.335 * u; this.eh = 0.158 * u; this.ir = 0.124 * u;
    this.tri = [0, 1, 2].map(i => { const a = -Math.PI / 2 + i * TAU / 3; return { x: this.cx + Math.cos(a) * 0.8 * u, y: this.cy + Math.sin(a) * 0.8 * u }; });
    this.buildIris();
    this.buildVeins();
    if (!this.running) this.draw(performance.now());
  }

  /* Текстура радужки: волокна, коллаж-кольцо, крипты, лимб */
  buildIris() {
    const R = Math.max(8, Math.ceil(this.ir * this.dpr));
    const size = R * 2 + 4, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), m = size / 2, rnd = rng(77), k = R / 100;
    let grd = g.createRadialGradient(m, m, R * 0.2, m, m, R);
    grd.addColorStop(0, '#fbfbfd'); grd.addColorStop(0.32, '#e2e2e8'); grd.addColorStop(0.62, '#a6a6b1');
    grd.addColorStop(0.86, '#5a5a65'); grd.addColorStop(1, '#16161b');
    g.fillStyle = grd; g.beginPath(); g.arc(m, m, R, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(m, m, R, 0, TAU); g.clip();
    for (let i = 0; i < 560; i++) {
      const a = rnd() * TAU, r0 = R * (0.28 + rnd() * 0.12), r1 = R * (0.7 + rnd() * 0.3), bend = (rnd() - 0.5) * 0.3;
      const light = rnd() < 0.55;
      g.strokeStyle = light ? `rgba(255,255,255,${0.06 + rnd() * 0.22})` : `rgba(18,18,24,${0.06 + rnd() * 0.24})`;
      g.lineWidth = (0.5 + rnd() * 1.4) * k;
      g.beginPath();
      g.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0);
      const am = a + bend, rm = (r0 + r1) / 2;
      g.quadraticCurveTo(m + Math.cos(am) * rm, m + Math.sin(am) * rm, m + Math.cos(a + bend * 0.4) * r1, m + Math.sin(a + bend * 0.4) * r1);
      g.stroke();
    }
    // коллаж-кольцо (зубчатое)
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.4 * k;
    g.beginPath();
    for (let i = 0; i <= 90; i++) { const a = i / 90 * TAU, r = R * (0.5 + (i % 2 ? 0.035 : -0.02) + (rnd() - 0.5) * 0.03); const x = m + Math.cos(a) * r, y = m + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
    // крипты
    for (let i = 0; i < 34; i++) {
      const a = rnd() * TAU, r = R * (0.55 + rnd() * 0.28);
      g.fillStyle = `rgba(10,10,14,${0.15 + rnd() * 0.25})`;
      g.beginPath(); g.ellipse(m + Math.cos(a) * r, m + Math.sin(a) * r, (2 + rnd() * 4) * k, (1 + rnd() * 2) * k, a, 0, TAU); g.fill();
    }
    // тёплый красный отсвет у зрачка
    grd = g.createRadialGradient(m, m, R * 0.25, m, m, R * 0.55);
    grd.addColorStop(0, 'rgba(170,10,20,0.28)'); grd.addColorStop(1, 'rgba(170,10,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    // лимб
    grd = g.createRadialGradient(m, m, R * 0.8, m, m, R);
    grd.addColorStop(0, 'rgba(4,4,6,0)'); grd.addColorStop(1, 'rgba(4,4,6,0.92)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    g.restore();
    this.irisTex = c;
  }

  buildVeins() {
    const rnd = rng(9), ew = this.ew, eh = this.eh;
    this.veins = [];
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const pts = [];
      let x = side * ew * (0.95 - rnd() * 0.1), y = (rnd() - 0.5) * eh * 0.5;
      pts.push([x, y]);
      for (let j = 0; j < 4; j++) { x -= side * ew * (0.08 + rnd() * 0.09); y += (rnd() - 0.5) * eh * 0.28; pts.push([x, y]); }
      this.veins.push({ pts, w: 0.5 + rnd() * 0.8 });
    }
  }

  makeSigils(n) {
    const rnd = rng(31), out = [];
    const P = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (let i = 0; i < n; i++) {
      const strokes = [];
      const cnt = 2 + Math.floor(rnd() * 3);
      for (let j = 0; j < cnt; j++) {
        if (rnd() < 0.2) strokes.push({ c: 1, x: P[Math.floor(rnd() * 9)][0] * 0.5, y: P[Math.floor(rnd() * 9)][1] * 0.5, r: 0.35 });
        else { const a = P[Math.floor(rnd() * 9)], b = P[Math.floor(rnd() * 9)]; if (a !== b) strokes.push({ a, b }); }
      }
      strokes.push({ a: [0, -1], b: [0, 1] });
      out.push(strokes);
    }
    return out;
  }

  /* ─────────── Управление ─────────── */
  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    const loop = now => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (!this.inView || document.hidden) { this.last = now; return; }
      if (now - this.last < 1000 / this.q.fps - 2) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.draw(now);
      this.watchPerf(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  destroy() { this.stop(); this.ro && this.ro.disconnect(); this.io && this.io.disconnect(); GodEye.all.delete(this); }

  watchPerf(dt) {
    if (!this.o.autoDowngrade || this.q !== QUALITY.full || this.o.mode === 'intro') return;
    this.frames++; if (dt > 0.03) this.slow++;
    if (this.frames === 240) {
      if (this.slow > 120) { this.setQuality('lite'); window.dispatchEvent(new CustomEvent('godeye:downgrade')); }
      this.frames = 0; this.slow = 0;
    }
  }

  /** Красный импульс: ударная волна + искры */
  pulse(strength = 1) {
    const now = performance.now();
    this.pulses.push({ t0: now, k: 0, r: 0, s: strength, seed: Math.random() * 10 });
    const n = Math.round((this.q.parts ? 18 : 0) * strength);
    for (let i = 0; i < n; i++) this.parts.push(this.mkPart('s'));
  }
  /** Сканирование: зрачок сужается, импульс, частицы стекаются к оку */
  scan() {
    this.scanAt = performance.now();
    this.pulse(1.4);
    const n = this.q.parts ? 16 : 0;
    for (let i = 0; i < n; i++) this.parts.push(this.mkPart('i', true));
  }
  blink() { if (!this.blinkS) this.blinkS = { t0: performance.now(), dbl: false }; }
  /** Плавно закрыть (to=0) или открыть (to=1) веко; возвращает Promise */
  lids(to, dur = 260) {
    return new Promise(res => { this.lidAnim = { from: this.lidMul, to, t0: performance.now(), dur, res }; });
  }
  lookAt(el) { this.focusEl = el; }

  mkPart(kind, fast) {
    const R = Math.random;
    if (kind === 'o') return { k: 'o', r: lerp(0.46, 1.02, R()), a: R() * TAU, w: (R() < 0.5 ? -1 : 1) * (0.04 + R() * 0.22), dr: 0, age: 0, life: 1e9, s: 0.5 + R() * 1.3, red: R() < 0.55, tw: R() * TAU };
    if (kind === 'i') return { k: 'i', r: 0.9 + R() * 0.2, a: R() * TAU, w: (R() < 0.5 ? -1 : 1) * (0.3 + R() * 0.6), dr: -(fast ? 0.55 + R() * 0.4 : 0.08 + R() * 0.14), age: 0, life: 12, s: 0.6 + R() * 1.1, red: R() < 0.7, tw: R() * TAU };
    return { k: 's', r: 0.16 + R() * 0.06, a: R() * TAU, w: (R() - 0.5) * 0.5, dr: 0.45 + R() * 1.1, age: 0, life: 0.6 + R() * 0.9, s: 0.6 + R() * 1.4, red: R() < 0.8, tw: 0 };
  }

  /* ─────────── Состояние заставки ─────────── */
  introState() {
    if (this.o.mode !== 'intro') return { line: 1, sides: 1, apex: 0, fill: 1, slit: 1, eye: 1, iris: 1, flash: 0, rings: 1, rays: 1, parts: 1, aura: 1, spin: 1 };
    const T = this.introT;
    return {
      line: eIO(seg(T, 0.4, 1.25)),
      sides: eIO(seg(T, 1.25, 2.4)),
      apex: T > 2.4 ? Math.max(0, 1 - (T - 2.4) / 0.8) : 0,
      fill: eOut(seg(T, 2.2, 3.1)),
      slit: eOut(seg(T, 2.6, 2.95)),
      eye: clamp(eBack(seg(T, 2.95, 3.85)), 0, 1.06),
      iris: eOut(seg(T, 3.0, 3.7)),
      flash: T > 3.85 ? Math.max(0, 1 - (T - 3.85) / 1.0) : 0,
      rings: seg(T, 4.0, 5.6),
      rays: eOut(seg(T, 4.6, 6.0)),
      parts: seg(T, 4.2, 5.6),
      aura: eOut(seg(T, 3.8, 5.2)),
      spin: 1 + 9 * Math.pow(1 - seg(T, 4.0, 6.4), 2)
    };
  }

  /* ─────────── Обновление ─────────── */
  update(dt, now) {
    const t = (now - this.t0) / 1000;
    if (this.o.mode === 'intro') {
      this.introT = t;
      if (!this.flashed && t > 3.85) { this.flashed = true; this.pulse(1.8); this.scanAt = now; }
    }
    const I = this.introState();
    this.rot += dt * I.spin;

    // Взгляд: элемент фокуса → курсор → свободные саккады
    let tx, ty;
    const idle = now - pointer.t > 2600 || !this.o.follow || this.o.mode === 'intro';
    const rc = this.cv.getBoundingClientRect();
    const aim = (px, py) => {
      const dx = px - (rc.left + this.cx), dy = py - (rc.top + this.cy), d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / (this.u * 2.4));
      tx = dx / d * m; ty = dy / d * m;
    };
    if (this.focusEl && this.focusEl.isConnected) { const r = this.focusEl.getBoundingClientRect(); aim(r.left + Math.min(r.width, 260) / 2, r.top + r.height / 2); }
    else if (!idle) aim(pointer.x, pointer.y);
    else {
      if (now > this.nextSacc) {
        const R = Math.random;
        if (R() < 0.3) this.saccT = { x: 0, y: 0 };
        else { const a = R() * TAU, r = 0.25 + R() * 0.6; this.saccT = { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 }; }
        this.nextSacc = now + 450 + R() * 2000;
      }
      tx = this.saccT.x; ty = this.saccT.y;
    }
    const K = 560, C = 2 * Math.sqrt(K) * 0.86, g = this.g;
    g.vx += (K * (tx - g.x) - C * g.vx) * dt; g.vy += (K * (ty - g.y) - C * g.vy) * dt;
    g.x += g.vx * dt; g.y += g.vy * dt;
    // микротремор
    this.gx = g.x + Math.sin(t * 37) * 0.004 + Math.sin(t * 23) * 0.003;
    this.gy = g.y + Math.cos(t * 31) * 0.004;

    // Моргание
    let open = 1;
    if (this.o.mode !== 'intro' || this.introT > 6.5) {
      if (!this.blinkS && now > this.nextBlink) this.blinkS = { t0: now, dbl: Math.random() < 0.18 };
      if (this.blinkS) {
        const e = now - this.blinkS.t0, Cl = 80, H = 45, Op = 175;
        if (e < 0) open = 1;
        else if (e < Cl) open = 1 - eIn(e / Cl);
        else if (e < Cl + H) open = 0;
        else if (e < Cl + H + Op) open = eOut((e - Cl - H) / Op);
        else if (this.blinkS.dbl) this.blinkS = { t0: now + 70, dbl: false };
        else { this.blinkS = null; this.nextBlink = now + 2600 + Math.random() * 4400; }
      }
    }
    if (this.lidAnim) {
      const a = this.lidAnim, k = clamp((now - a.t0) / a.dur, 0, 1);
      this.lidMul = lerp(a.from, a.to, a.to < a.from ? eIn(k) : eOut(k));
      if (k >= 1) { this.lidAnim = null; a.res(); }
    }
    this.open = open * this.lidMul;

    // Красные импульсы
    if (this.o.mode !== 'intro' && now > this.nextPulse) { this.pulse(1); this.nextPulse = now + 5500 + Math.random() * 4500; }
    for (const p of this.pulses) { p.k = (now - p.t0) / 1700; p.r = lerp(0.17, 1.08, eOut(clamp(p.k, 0, 1))) * this.u; }
    this.pulses = this.pulses.filter(p => p.k < 1);

    // Мерцание рун
    for (const f of this.flick) {
      if (now > f.next) { const R = Math.random(); f.tg = R < 0.1 ? 0.05 : 0.25 + Math.random() * 0.75; f.next = now + 80 + Math.random() * 1100; }
      f.a += (f.tg - f.a) * Math.min(1, dt * 9);
    }

    // Частицы
    const want = Math.round(this.q.parts * I.parts);
    let orb = 0, inf = 0;
    for (const p of this.parts) { if (p.k === 'o') orb++; else if (p.k === 'i') inf++; }
    while (orb < want * 0.62) { this.parts.push(this.mkPart('o')); orb++; }
    while (inf < want * 0.38) { this.parts.push(this.mkPart('i')); inf++; }
    for (const p of this.parts) {
      p.age += dt; p.pa = p.a; p.pr = p.r;
      p.a += p.w * dt * (p.k === 'o' ? I.spin : 1);
      p.r += p.dr * dt;
      if (p.k === 'i') { p.dr -= 0.06 * dt; p.w *= 1 + dt * 0.9; }
      if (p.k === 's') p.dr *= 1 - dt * 1.5;
    }
    this.parts = this.parts.filter(p => p.age < p.life && p.r > 0.13 && p.r < 1.25 && (p.k !== 'o' || orb <= want * 0.7 || Math.random() > 0.02));
    this.t = t;
  }

  /* ─────────── Отрисовка ─────────── */
  draw(now) {
    const c = this.ctx;
    if (!this.w) return;
    if (this.t == null) this.t = 0;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const I = this.introState();
    this.I = I;
    const pf = this.pulses.reduce((m, p) => Math.max(m, Math.pow(1 - p.k, 2) * p.s), 0);
    this.pf = Math.min(1.5, pf);
    this.drawAura(I);
    if (this.q.rays && I.rays > 0) this.drawRays(I);
    if (I.rings > 0) this.drawRings(I);
    this.drawTriangle(I);
    if (I.rings > 0) this.drawIncircle(I);
    this.drawEye(I);
    if (this.parts.length) this.drawParts(I);
    if (this.pulses.length) this.drawPulses();
    if (I.flash > 0) {
      const g = c.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(this.w, this.h) * 0.7);
      g.addColorStop(0, `rgba(255,60,60,${0.55 * I.flash})`); g.addColorStop(0.25, `rgba(200,10,20,${0.35 * I.flash})`); g.addColorStop(1, 'rgba(120,0,0,0)');
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, 0, this.w, this.h); c.globalCompositeOperation = 'source-over';
    }
  }

  /* Путь окружности с волной искажения от импульсов */
  circ(r, a0 = 0, a1 = TAU, move = true) {
    const c = this.ctx;
    if (!this.q.distort || !this.pulses.length || !this.distNear(r)) {
      if (move) c.moveTo(this.cx + Math.cos(a0) * r, this.cy + Math.sin(a0) * r);
      c.arc(this.cx, this.cy, r, a0, a1);
      return;
    }
    const n = Math.max(16, Math.ceil(Math.abs(a1 - a0) / TAU * 180));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, rr = r + this.dist(r, a);
      const x = this.cx + Math.cos(a) * rr, y = this.cy + Math.sin(a) * rr;
      if (i === 0 && move) c.moveTo(x, y); else c.lineTo(x, y);
    }
  }
  distNear(r) { const w = this.u * 0.2; return this.pulses.some(p => Math.abs(r - p.r) < w); }
  dist(r, a) {
    let d = 0;
    for (const p of this.pulses) {
      const k = (r - p.r) / (this.u * 0.07);
      if (k > 3 || k < -3) continue;
      d += this.u * 0.024 * (1 - p.k) * Math.exp(-k * k) * (0.65 + 0.35 * Math.sin(a * 7 + p.seed + this.t * 2));
    }
    return d;
  }

  drawAura(I) {
    const c = this.ctx, u = this.u, t = this.t, a = I.aura;
    if (a <= 0) return;
    const breath = 0.5 + 0.5 * Math.sin(t * 1.1);
    let g = c.createRadialGradient(this.cx, this.cy, u * 0.08, this.cx, this.cy, u * (1.08 + 0.03 * Math.sin(t * 0.7)));
    g.addColorStop(0, `rgba(170,12,22,${(0.2 + 0.07 * breath + 0.22 * this.pf) * a})`);
    g.addColorStop(0.42, `rgba(110,0,10,${(0.09 + 0.05 * this.pf) * a})`);
    g.addColorStop(1, 'rgba(60,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, this.w, this.h);
    g = c.createRadialGradient(this.cx, this.cy, u * 0.74, this.cx, this.cy, u * 1.0);
    g.addColorStop(0, 'rgba(205,205,220,0)'); g.addColorStop(0.55, `rgba(205,205,220,${0.04 * a})`); g.addColorStop(1, 'rgba(205,205,220,0)');
    c.fillStyle = g; c.fillRect(0, 0, this.w, this.h);
  }

  drawRays(I) {
    const c = this.ctx, u = this.u, t = this.t, n = 72;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineWidth = 1; c.lineCap = 'round';
    const grd = c.createRadialGradient(this.cx, this.cy, u * 0.42, this.cx, this.cy, u * 1.0);
    grd.addColorStop(0, 'rgba(230,230,240,0.9)'); grd.addColorStop(1, 'rgba(230,230,240,0)');
    c.strokeStyle = grd;
    for (let i = 0; i < n; i++) {
      const ang = i / n * TAU + this.rot * 0.012, long = i % 3 === 0;
      const r1 = u * (long ? 1.0 : 0.82) * (0.9 + 0.1 * Math.sin(t * 0.8 + i * 1.7));
      c.globalAlpha = (long ? 0.12 : 0.06) * I.rays * (0.55 + 0.45 * Math.sin(t * 1.3 + i * 2.1));
      c.beginPath(); c.moveTo(this.cx + Math.cos(ang) * u * 0.42, this.cy + Math.sin(ang) * u * 0.42); c.lineTo(this.cx + Math.cos(ang) * r1, this.cy + Math.sin(ang) * r1); c.stroke();
    }
    c.restore();
  }

  ringP(I, i) { return this.o.mode === 'intro' ? eOut(seg(I.rings, i * 0.1, i * 0.1 + 0.5)) : 1; }

  drawRings(I) {
    const c = this.ctx, u = this.u, rot = this.rot, t = this.t;
    c.save(); c.lineCap = 'butt';

    // 1 — внешнее кольцо с делениями
    let p = this.ringP(I, 0);
    if (p > 0) {
      const r = u * 0.955, a0 = rot * 0.015;
      c.strokeStyle = `rgba(205,205,218,${0.24 * p})`; c.lineWidth = 1;
      c.beginPath(); this.circ(r, a0, a0 + TAU * p); c.stroke();
      c.strokeStyle = `rgba(205,205,218,${0.4 * p})`;
      c.beginPath();
      const n = 144, lim = Math.floor(n * p);
      for (let i = 0; i < lim; i++) {
        const a = a0 + i / n * TAU, major = i % 12 === 0, rr = r + (this.q.distort ? this.dist(r, a) : 0);
        c.moveTo(this.cx + Math.cos(a) * rr, this.cy + Math.sin(a) * rr);
        c.lineTo(this.cx + Math.cos(a) * (rr + u * (major ? 0.032 : 0.013)), this.cy + Math.sin(a) * (rr + u * (major ? 0.032 : 0.013)));
      }
      c.stroke();
    }

    // 2 — кольцо рун (вращается против часовой)
    p = this.ringP(I, 1);
    if (p > 0) {
      const r = u * 0.895, a0 = -rot * 0.032, n = RUNES.length;
      c.font = `${Math.max(9, u * 0.046)}px 'Noto Sans Runic','Segoe UI Historic',serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        if (i / n > p) break;
        const a = a0 + i / n * TAU, rr = r + (this.q.distort ? this.dist(r, a) : 0), f = this.flick[i].a;
        c.save(); c.translate(this.cx + Math.cos(a) * rr, this.cy + Math.sin(a) * rr); c.rotate(a + Math.PI / 2);
        if (f > 0.82) { c.fillStyle = `rgba(226,35,46,${0.35 * p})`; c.fillText(RUNES[i], 0.6, 0.6); }
        c.fillStyle = `rgba(222,222,232,${(0.16 + 0.7 * f) * p})`;
        c.fillText(RUNES[i], 0, 0);
        c.restore();
        const ad = a + Math.PI / n;
        c.fillStyle = `rgba(205,205,218,${0.3 * p})`;
        c.fillRect(this.cx + Math.cos(ad) * r - 0.8, this.cy + Math.sin(ad) * r - 0.8, 1.6, 1.6);
      }
    }

    // 3 — красные сегменты (по часовой, быстрее)
    p = this.ringP(I, 2);
    if (p > 0) {
      const r = u * 0.842, a0 = rot * 0.09;
      const segs = [[0, 0.95], [1.2, 1.5], [1.95, 2.1], [3.25, 4.55], [4.85, 5.05], [5.35, 5.8]];
      c.strokeStyle = `rgba(214,26,36,${(0.55 + 0.25 * this.pf) * p})`; c.lineWidth = Math.max(1.2, u * 0.006);
      for (const [s, e] of segs) { if (s / TAU > p) break; c.beginPath(); this.circ(r, a0 + s, a0 + Math.min(e, TAU * p)); c.stroke(); }
      c.fillStyle = `rgba(255,90,90,${0.7 * p})`;
      for (const [s] of segs) { const a = a0 + s; c.beginPath(); c.arc(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, u * 0.006, 0, TAU); c.fill(); }
    }

    // 4 — описанная окружность треугольника
    p = this.ringP(I, 3);
    if (p > 0) {
      c.strokeStyle = `rgba(215,215,228,${0.3 * p})`; c.lineWidth = 1;
      c.beginPath(); this.circ(u * 0.8, -Math.PI / 2, -Math.PI / 2 + TAU * p); c.stroke();
    }

    // 5 — двойное кольцо с ромбами и сигилами (против часовой)
    p = this.ringP(I, 4);
    if (p > 0) {
      const r = u * 0.7, a0 = -rot * 0.06;
      c.strokeStyle = `rgba(205,205,218,${0.17 * p})`; c.lineWidth = 1;
      c.beginPath(); this.circ(r - u * 0.012, a0, a0 + TAU * p); c.stroke();
      c.beginPath(); this.circ(r + u * 0.012, a0, a0 + TAU * p); c.stroke();
      for (let i = 0; i < 8; i++) {
        if (i / 8 > p) break;
        const a = a0 + i / 8 * TAU, x = this.cx + Math.cos(a) * r, y = this.cy + Math.sin(a) * r, s = u * 0.016;
        c.save(); c.translate(x, y); c.rotate(a);
        c.fillStyle = i % 2 ? `rgba(226,35,46,${0.85 * p})` : `rgba(230,230,240,${0.7 * p})`;
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.6, 0); c.lineTo(0, s); c.lineTo(-s * 0.6, 0); c.closePath(); c.fill();
        c.restore();
        const as = a + TAU / 16, sx = this.cx + Math.cos(as) * r, sy = this.cy + Math.sin(as) * r, ss = u * 0.018;
        c.save(); c.translate(sx, sy); c.rotate(as + Math.PI / 2);
        c.strokeStyle = `rgba(215,215,228,${(0.25 + 0.45 * this.flick[i * 3 % RUNES.length].a) * p})`; c.lineWidth = 1;
        c.beginPath();
        for (const st of this.sigils[i]) {
          if (st.c) { c.moveTo(st.x * ss + st.r * ss, st.y * ss); c.arc(st.x * ss, st.y * ss, st.r * ss, 0, TAU); }
          else { c.moveTo(st.a[0] * ss * 0.6, st.a[1] * ss); c.lineTo(st.b[0] * ss * 0.6, st.b[1] * ss); }
        }
        c.stroke(); c.restore();
      }
    }

    // 6 — пунктир и радарная развёртка
    p = this.ringP(I, 5);
    if (p > 0) {
      const r = u * 0.57;
      c.setLineDash([2, 7]); c.lineDashOffset = -rot * 24;
      c.strokeStyle = `rgba(205,205,218,${0.32 * p})`; c.lineWidth = 1;
      c.beginPath(); this.circ(r, 0, TAU * p); c.stroke();
      c.setLineDash([]);
      const sw = rot * 0.7 + t * 0.15;
      c.lineWidth = Math.max(1.5, u * 0.008);
      for (let j = 0; j < 18; j++) {
        c.strokeStyle = `rgba(226,35,46,${(1 - j / 18) * 0.55 * p})`;
        c.beginPath(); c.arc(this.cx, this.cy, r, sw - (j + 1) * 0.035, sw - j * 0.035); c.stroke();
      }
    }
    c.restore();
  }

  drawTriangle(I) {
    const c = this.ctx, u = this.u, t = this.t;
    const [A, B, Cc] = this.tri;
    c.save();
    if (I.fill > 0) {
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(Cc.x, Cc.y); c.closePath();
      let g = c.createLinearGradient(0, A.y, 0, B.y);
      g.addColorStop(0, `rgba(18,18,22,${0.95 * I.fill})`); g.addColorStop(1, `rgba(5,5,6,${0.97 * I.fill})`);
      c.fillStyle = g; c.fill();
      g = c.createRadialGradient(this.cx, this.cy, u * 0.05, this.cx, this.cy, u * 0.5);
      g.addColorStop(0, `rgba(150,8,18,${(0.22 + 0.15 * this.pf) * I.fill})`); g.addColorStop(1, 'rgba(150,8,18,0)');
      c.fillStyle = g; c.fill();
    }
    const sg = c.createLinearGradient(0, A.y, 0, B.y);
    sg.addColorStop(0, '#f6f6f9'); sg.addColorStop(0.55, '#babac4'); sg.addColorStop(1, '#6e6e79');
    c.strokeStyle = sg; c.lineWidth = Math.max(1.3, u * 0.0065); c.lineJoin = 'miter'; c.lineCap = 'round';
    const tips = [];
    if (I.sides >= 1) {
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(Cc.x, Cc.y); c.closePath(); c.stroke();
    } else {
      const M = lp(B, Cc, 0.5);
      if (I.line > 0) {
        const p1 = lp(M, Cc, I.line), p2 = lp(M, B, I.line);
        c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
        if (I.sides <= 0) tips.push(p1, p2);
      }
      if (I.sides > 0) {
        const q1 = lp(Cc, A, I.sides), q2 = lp(B, A, I.sides);
        c.beginPath(); c.moveTo(Cc.x, Cc.y); c.lineTo(q1.x, q1.y); c.moveTo(B.x, B.y); c.lineTo(q2.x, q2.y); c.stroke();
        tips.push(q1, q2);
      }
    }
    c.globalCompositeOperation = 'lighter';
    for (const p of tips) {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, u * 0.07);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(230,60,60,0.5)'); g.addColorStop(1, 'rgba(200,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, u * 0.07, 0, TAU); c.fill();
    }
    if (I.apex > 0) {
      const g = c.createRadialGradient(A.x, A.y, 0, A.x, A.y, u * 0.28);
      g.addColorStop(0, `rgba(255,255,255,${I.apex})`); g.addColorStop(0.2, `rgba(255,80,80,${0.5 * I.apex})`); g.addColorStop(1, 'rgba(200,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(A.x, A.y, u * 0.28, 0, TAU); c.fill();
    }
    // световая искра, бегущая по периметру
    if (I.fill > 0.5) {
      const s = (t * 0.09) % 1, edge = Math.floor(s * 3), k = s * 3 - edge, P = [A, B, Cc];
      const pt = lp(P[edge], P[(edge + 1) % 3], k);
      const g = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, u * 0.05);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(pt.x, pt.y, u * 0.05, 0, TAU); c.fill();
    }
    if (this.pf > 0.02 && I.sides >= 1) {
      c.strokeStyle = `rgba(255,40,50,${0.6 * Math.min(1, this.pf)})`; c.lineWidth = Math.max(2, u * 0.012);
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(Cc.x, Cc.y); c.closePath(); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    if (I.fill > 0) {
      // внутренний треугольник и засечки
      const sc = 0.88;
      const inner = [A, B, Cc].map(p => ({ x: this.cx + (p.x - this.cx) * sc, y: this.cy + (p.y - this.cy) * sc }));
      c.strokeStyle = `rgba(205,205,218,${0.22 * I.fill})`; c.lineWidth = 1;
      c.beginPath(); c.moveTo(inner[0].x, inner[0].y); c.lineTo(inner[1].x, inner[1].y); c.lineTo(inner[2].x, inner[2].y); c.closePath(); c.stroke();
      c.beginPath();
      for (let e = 0; e < 3; e++) {
        const P0 = [A, B, Cc][e], P1 = [A, B, Cc][(e + 1) % 3];
        for (const k of [0.25, 0.5, 0.75]) {
          const pt = lp(P0, P1, k), nx = this.cx - pt.x, ny = this.cy - pt.y, d = Math.hypot(nx, ny);
          const L = u * (k === 0.5 ? 0.045 : 0.022);
          c.moveTo(pt.x, pt.y); c.lineTo(pt.x + nx / d * L, pt.y + ny / d * L);
        }
      }
      c.strokeStyle = `rgba(205,205,218,${0.45 * I.fill})`; c.stroke();
      // вершины
      for (const p of [A, B, Cc]) {
        const s = u * 0.02;
        c.fillStyle = `rgba(226,35,46,${0.95 * I.fill})`;
        c.beginPath(); c.moveTo(p.x, p.y - s); c.lineTo(p.x + s * 0.7, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s * 0.7, p.y); c.closePath(); c.fill();
        c.strokeStyle = `rgba(240,240,248,${0.6 * I.fill})`; c.stroke();
      }
    }
    c.restore();
  }

  drawIncircle(I) {
    const c = this.ctx, u = this.u, t = this.t, p = this.ringP(I, 2);
    if (p <= 0) return;
    c.save();
    c.strokeStyle = `rgba(205,205,218,${0.2 * p})`; c.lineWidth = 1;
    c.setLineDash([1, 4]); c.lineDashOffset = this.rot * 8;
    c.beginPath(); c.arc(this.cx, this.cy, u * 0.4, 0, TAU * p); c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + i * TAU / 3, x = this.cx + Math.cos(a) * u * 0.4, y = this.cy + Math.sin(a) * u * 0.4;
      const al = (0.45 + 0.45 * Math.sin(t * 2.2 + i * 2.1)) * p;
      c.fillStyle = `rgba(240,50,58,${al})`; c.beginPath(); c.arc(x, y, u * 0.009, 0, TAU); c.fill();
    }
    c.restore();
  }

  eyeGeo(open) {
    const { cx, cy, ew, eh } = this;
    const meet = cy + eh * 0.16;
    const up = lerp(meet, cy - eh, open), lo = lerp(meet, cy + eh * 0.8, open);
    const kU = (up - cy) / 0.75, kL = (lo - cy) / 0.75;
    return {
      L: { x: cx - ew, y: cy }, R: { x: cx + ew, y: cy },
      u1: { x: cx - ew * 0.5, y: cy + kU }, u2: { x: cx + ew * 0.38, y: cy + kU },
      l1: { x: cx - ew * 0.36, y: cy + kL }, l2: { x: cx + ew * 0.46, y: cy + kL },
      up, lo
    };
  }

  drawEye(I) {
    const c = this.ctx, u = this.u, t = this.t, now = performance.now();
    const intro = this.o.mode === 'intro';
    if (intro && I.slit <= 0) return;
    const open = clamp((intro ? I.eye : 1) * (this.open ?? 1), 0, 1.06);
    const P = this.eyeGeo(open);
    const { cx, cy, ew, eh } = this;
    const path = () => { c.beginPath(); c.moveTo(P.L.x, P.L.y); c.bezierCurveTo(P.u1.x, P.u1.y, P.u2.x, P.u2.y, P.R.x, P.R.y); c.bezierCurveTo(P.l2.x, P.l2.y, P.l1.x, P.l1.y, P.L.x, P.L.y); c.closePath(); };

    if (open > 0.015) {
      c.save(); path(); c.clip();
      // склера
      let g = c.createRadialGradient(cx, cy + eh * 0.12, eh * 0.15, cx, cy, ew * 1.05);
      g.addColorStop(0, '#2c2c33'); g.addColorStop(0.55, '#141418'); g.addColorStop(1, '#040405');
      c.fillStyle = g; c.fillRect(cx - ew - 2, cy - eh * 1.3, ew * 2 + 4, eh * 2.6);
      // сосуды
      c.strokeStyle = 'rgba(150,12,20,0.32)';
      for (const v of this.veins) {
        c.lineWidth = v.w; c.beginPath();
        v.pts.forEach(([x, y], i) => i ? c.lineTo(cx + x, cy + y) : c.moveTo(cx + x, cy + y));
        c.stroke();
      }
      // радужка
      const ix = cx + this.gx * ew * 0.44, iy = cy + this.gy * eh * 0.44;
      const sx = 1 - Math.min(0.17, Math.abs(this.gx) * 0.17);
      const ipulse = 0.5 + 0.5 * Math.sin(t * 1.7);
      const ir = this.ir * (1 + 0.012 * Math.sin(t * 1.7)) * (intro ? lerp(0.85, 1, I.iris) : 1);
      const ia = intro ? I.iris : 1;
      g = c.createRadialGradient(ix, iy, ir * 0.9, ix, iy, ir * 1.7);
      g.addColorStop(0, `rgba(225,225,240,${0.16 * ia})`); g.addColorStop(1, 'rgba(225,225,240,0)');
      c.fillStyle = g; c.beginPath(); c.arc(ix, iy, ir * 1.7, 0, TAU); c.fill();
      c.save(); c.globalAlpha = ia; c.translate(ix, iy); c.scale(sx, 1); c.rotate(Math.sin(t * 0.21) * 0.08);
      c.drawImage(this.irisTex, -ir - 2 / this.dpr, -ir - 2 / this.dpr, ir * 2 + 4 / this.dpr, ir * 2 + 4 / this.dpr);
      c.restore();
      // пульсация радужки
      g = c.createRadialGradient(ix, iy, ir * 0.3, ix, iy, ir);
      g.addColorStop(0, `rgba(255,255,255,${0.07 * ipulse * ia})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(ix, iy, ir * sx, ir, 0, 0, TAU); c.fill();
      c.strokeStyle = `rgba(214,24,34,${(0.22 + 0.25 * ipulse + 0.4 * this.pf) * ia})`; c.lineWidth = Math.max(1, u * 0.0045);
      c.beginPath(); c.ellipse(ix, iy, ir * sx, ir, 0, 0, TAU); c.stroke();
      // зрачок
      const sk = (now - this.scanAt) / 1000;
      const constrict = sk >= 0 && sk < 4 ? Math.exp(-sk * 1.9) * (1 - Math.exp(-sk * 22)) : 0;
      let pk = 0.4 + 0.035 * Math.sin(t * 0.8) + 0.015 * Math.sin(t * 2.3) - 0.17 * constrict + (this.focusEl ? 0.05 : 0);
      if (intro) pk = lerp(0.2, pk, I.iris) - 0.12 * I.flash;
      const pr = ir * clamp(pk, 0.16, 0.6);
      const ember = clamp(0.35 + 0.25 * Math.sin(t * 2.4) + 0.9 * this.pf + (intro ? I.flash : 0), 0, 1.6);
      g = c.createRadialGradient(ix, iy, pr * 0.7, ix, iy, pr * 1.9);
      g.addColorStop(0, 'rgba(220,20,30,0)'); g.addColorStop(0.3, `rgba(230,30,40,${0.5 * Math.min(1, ember) * ia})`); g.addColorStop(1, 'rgba(160,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(ix, iy, pr * 1.9, 0, TAU); c.fill();
      g = c.createRadialGradient(ix - pr * 0.2, iy - pr * 0.2, 0, ix, iy, pr);
      g.addColorStop(0, '#140002'); g.addColorStop(0.7, '#030000'); g.addColorStop(1, '#000');
      c.fillStyle = g; c.beginPath(); c.ellipse(ix, iy, pr * sx, pr, 0, 0, TAU); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      g = c.createRadialGradient(ix, iy, 0, ix, iy, pr * 0.62);
      g.addColorStop(0, `rgba(255,50,50,${0.6 * Math.min(1.2, ember) * ia})`); g.addColorStop(0.5, `rgba(180,0,10,${0.25 * ember * ia})`); g.addColorStop(1, 'rgba(120,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(ix, iy, pr * 0.62, 0, TAU); c.fill();
      c.restore();
      // тень верхнего века
      g = c.createLinearGradient(0, P.up, 0, P.up + eh * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(cx - ew, P.up - 2, ew * 2, eh * 0.75);
      // затенение уголков
      for (const s of [-1, 1]) {
        g = c.createRadialGradient(cx + s * ew, cy, 0, cx + s * ew, cy, ew * 0.42);
        g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(cx + (s < 0 ? -ew : ew * 0.55), cy - eh, ew * 0.45, eh * 2);
      }
      // блики роговицы
      c.save(); c.translate(ix - ir * 0.36, iy - ir * 0.36); c.rotate(-0.5);
      g = c.createRadialGradient(0, 0, 0, 0, 0, ir * 0.24);
      g.addColorStop(0, `rgba(255,255,255,${0.75 * ia})`); g.addColorStop(0.5, `rgba(255,255,255,${0.28 * ia})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, ir * 0.24, ir * 0.13, 0, 0, TAU); c.fill(); c.restore();
      c.fillStyle = `rgba(255,255,255,${0.4 * ia})`; c.beginPath(); c.arc(ix + ir * 0.32, iy + ir * 0.3, ir * 0.045, 0, TAU); c.fill();
      c.fillStyle = `rgba(255,70,70,${0.18 * ia})`; c.beginPath(); c.ellipse(ix + ir * 0.18, iy + ir * 0.55, ir * 0.22, ir * 0.06, 0.2, 0, TAU); c.fill();
      // влажная кромка нижнего века
      c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(P.L.x, P.L.y); c.bezierCurveTo(P.l1.x, P.l1.y - 1.5, P.l2.x, P.l2.y - 1.5, P.R.x, P.R.y); c.stroke();
      c.restore();
    }

    // контуры век (вне клипа)
    const lw = Math.max(1.2, u * 0.0075);
    const sg = c.createLinearGradient(cx - ew, 0, cx + ew, 0);
    sg.addColorStop(0, 'rgba(200,200,212,0.5)'); sg.addColorStop(0.5, '#f4f4f8'); sg.addColorStop(1, 'rgba(200,200,212,0.5)');
    const slitA = intro ? I.slit : 1;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = sg; c.lineWidth = lw;
    if (intro && I.eye <= 0.01) {
      const wv = ew * slitA;
      c.globalCompositeOperation = 'lighter';
      const gg = c.createLinearGradient(cx - wv, 0, cx + wv, 0);
      gg.addColorStop(0, 'rgba(255,40,40,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(255,40,40,0)');
      c.strokeStyle = gg; c.lineWidth = lw * 1.6;
      c.beginPath(); c.moveTo(cx - wv, cy + eh * 0.16); c.lineTo(cx + wv, cy + eh * 0.16); c.stroke();
      c.restore();
      return;
    }
    // верхнее веко + «хвосты»
    c.beginPath(); c.moveTo(P.L.x, P.L.y); c.bezierCurveTo(P.u1.x, P.u1.y, P.u2.x, P.u2.y, P.R.x, P.R.y); c.stroke();
    c.lineWidth = lw * 0.8;
    c.beginPath(); c.moveTo(P.L.x, P.L.y); c.lineTo(P.L.x - ew * 0.13, P.L.y + eh * 0.05); c.stroke();
    c.beginPath(); c.moveTo(P.R.x, P.R.y); c.lineTo(P.R.x + ew * 0.16, P.R.y - eh * 0.1); c.stroke();
    // складка века
    const crease = lerp(cy - eh * 0.4, P.up - eh * 0.38, clamp(open, 0, 1));
    c.strokeStyle = `rgba(205,205,218,${0.28 + 0.1 * Math.min(1, open)})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - ew * 0.88, cy - eh * 0.22); c.bezierCurveTo(cx - ew * 0.45, cy + (crease - cy) / 0.75, cx + ew * 0.35, cy + (crease - cy) / 0.75, cx + ew * 0.9, cy - eh * 0.28); c.stroke();
    // нижнее веко
    c.strokeStyle = 'rgba(190,190,204,0.55)'; c.lineWidth = lw * 0.7;
    c.beginPath(); c.moveTo(P.L.x, P.L.y); c.bezierCurveTo(P.l1.x, P.l1.y, P.l2.x, P.l2.y, P.R.x, P.R.y); c.stroke();
    if (open < 0.15) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(255,60,60,${0.5 * (1 - open / 0.15)})`; c.lineWidth = lw;
      c.beginPath(); c.moveTo(P.L.x, P.L.y); c.bezierCurveTo(P.u1.x, P.u1.y, P.u2.x, P.u2.y, P.R.x, P.R.y); c.stroke();
    }
    c.restore();
  }

  drawParts(I) {
    const c = this.ctx, u = this.u, t = this.t;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (const p of this.parts) {
      let a;
      if (p.k === 'o') a = 0.3 + 0.35 * Math.sin(t * 2 + p.tw);
      else if (p.k === 'i') a = Math.min(1, p.age * 1.5) * (0.35 + 0.6 * (1 - (p.r - 0.13) / 1));
      else a = 1 - p.age / p.life;
      a *= I.parts || 1;
      if (a <= 0.01) continue;
      const x = this.cx + Math.cos(p.a) * p.r * u, y = this.cy + Math.sin(p.a) * p.r * u;
      const px = this.cx + Math.cos(p.pa ?? p.a) * (p.pr ?? p.r) * u, py = this.cy + Math.sin(p.pa ?? p.a) * (p.pr ?? p.r) * u;
      const col = p.red ? `rgba(255,48,56,${a})` : `rgba(225,225,238,${a * 0.85})`;
      c.strokeStyle = col; c.lineWidth = p.s * (u / 260);
      const tx = x + (px - x) * 2.5, ty = y + (py - y) * 2.5;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(x, y); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(x, y, p.s * 0.8 * (u / 260), 0, TAU); c.fill();
    }
    c.restore();
  }

  drawPulses() {
    const c = this.ctx, u = this.u;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of this.pulses) {
      const a = (1 - p.k) * Math.min(1, p.s);
      c.strokeStyle = `rgba(235,35,45,${0.55 * a})`; c.lineWidth = u * (0.004 + 0.022 * (1 - p.k));
      c.beginPath(); this.circ(p.r); c.stroke();
      c.strokeStyle = `rgba(230,230,240,${0.18 * a})`; c.lineWidth = 1;
      c.beginPath(); this.circ(p.r * 0.965); c.stroke();
    }
    c.restore();
  }
}
GodEye.all = new Set();
GodEye.scanAll = () => GodEye.all.forEach(e => e.scan());
GodEye.QUALITY = QUALITY;

window.GE = window.GE || {};
window.GE.GodEye = GodEye;
})();
