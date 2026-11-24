/* ═══════════════════════════════════════════════════════════════
   GOD EYE · audio.js — Процедурный Dark-Ambient OST и тактильные UI SFX
   100% Web Audio API без внешних файлов: 3 генеративных саундтрека + SFX
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE;
const $ = GE.$, $$ = GE.$$;

const TRACKS = {
  oculus: { name: 'OCULUS DRONE',   sub: 'Dark Ambient · D-minor' },
  signal: { name: 'BLACK SIGNAL',   sub: 'Tactical Pulse · 88 BPM' },
  ghost:  { name: 'GHOST TERMINAL', sub: 'Cyber-Noir · Sonar' },
};

let ctx = null;
let master = null;
let ostBus = null;
let sfxBus = null;
let reverb = null;
let delayL = null, delayR = null, delayFb = null;
let playing = false;
let trackNodes = [];
let trackTimers = [];
let lastHoverTs = 0;

function cfg() {
  if (!GE.settings.audio) {
    GE.settings.audio = { ost: false, sfx: true, track: 'oculus', ostVol: 38, sfxVol: 55 };
  }
  return GE.settings.audio;
}

function saveCfg() {
  try { GE.saveSettings(); } catch {}
}

function makeReverbImpulse(ac, seconds = 3.2, decay = 2.6) {
  const rate = ac.sampleRate, len = Math.floor(rate * seconds);
  const buf = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      const white = Math.random() * 2 - 1;
      lp = lp * 0.72 + white * 0.28; // тёплый тёмный хвост реверба
      data[i] = lp * env;
    }
  }
  return buf;
}

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.008;
  comp.release.value = 0.22;

  master = ctx.createGain();
  master.gain.value = 0.9;
  comp.connect(master);
  master.connect(ctx.destination);

  ostBus = ctx.createGain();
  ostBus.gain.value = 0.0001;
  ostBus.connect(comp);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = (cfg().sfxVol / 100) * 0.42;
  sfxBus.connect(comp);

  // Пространственный тёмный реверб
  reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, 3.4, 2.5);
  const revGain = ctx.createGain();
  revGain.gain.value = 0.46;
  reverb.connect(revGain);
  revGain.connect(ostBus);

  // Стерео-дилей для арпеджио и сонар-пинга
  delayL = ctx.createDelay(1.5);
  delayR = ctx.createDelay(1.5);
  delayL.delayTime.value = 0.34;
  delayR.delayTime.value = 0.51;
  delayFb = ctx.createGain();
  delayFb.gain.value = 0.34;
  const dFilt = ctx.createBiquadFilter();
  dFilt.type = 'lowpass';
  dFilt.frequency.value = 1850;
  delayL.connect(dFilt);
  dFilt.connect(delayR);
  delayR.connect(delayFb);
  delayFb.connect(delayL);
  const dWet = ctx.createGain();
  dWet.gain.value = 0.28;
  delayL.connect(dWet);
  delayR.connect(dWet);
  dWet.connect(ostBus);

  return ctx;
}

function stopTrackNodes() {
  trackTimers.forEach(id => clearInterval(id));
  trackTimers = [];
  const now = ctx ? ctx.currentTime : 0;
  trackNodes.forEach(n => {
    try {
      if (n.gain && n.gain.setTargetAtTime) n.gain.setTargetAtTime(0.0001, now, 0.18);
      if (n.stop) n.stop(now + 0.65);
    } catch {}
  });
  trackNodes = [];
}

function playPadNote(ac, freq, dur, vol, dest, type = 'triangle', cutoff = 900) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const filt = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = type; osc.frequency.value = freq;
  osc2.type = 'sine'; osc2.frequency.value = freq * 1.0035;
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(cutoff * 0.45, now);
  filt.frequency.exponentialRampToValueAtTime(cutoff, now + dur * 0.45);
  filt.frequency.exponentialRampToValueAtTime(cutoff * 0.35, now + dur);

  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(vol, now + Math.min(1.6, dur * 0.32));
  g.gain.setTargetAtTime(0.0001, now + dur * 0.65, dur * 0.18);

  osc.connect(filt); osc2.connect(filt);
  filt.connect(g);
  g.connect(dest);
  if (reverb) g.connect(reverb);
  osc.start(now); osc2.start(now);
  osc.stop(now + dur + 0.8); osc2.stop(now + dur + 0.8);
}

function playPluck(ac, freq, dur, vol, dest, toDelay = true) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const filt = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filt.type = 'lowpass';
  filt.Q.value = 3.2;
  filt.frequency.setValueAtTime(freq * 4.5, now);
  filt.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.15), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(vol, now + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(filt); filt.connect(g);
  g.connect(dest);
  if (toDelay && delayL) g.connect(delayL);
  if (reverb) g.connect(reverb);
  osc.start(now); osc.stop(now + dur + 0.06);
}

/* ─────────── ТРЕК 1: OCULUS DRONE (Dark Ambient · D minor) ─────────── */
function startOculus(ac) {
  const now = ac.currentTime;
  const bed = ac.createGain(); bed.gain.value = 0.22; bed.connect(ostBus);
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 260; filt.Q.value = 1.4;
  filt.connect(bed); filt.connect(reverb);

  // LFO плавно открывает и закрывает фильтр дрона
  const lfo = ac.createOscillator();
  const lfoG = ac.createGain();
  lfo.frequency.value = 0.065;
  lfoG.gain.value = 145;
  lfo.connect(lfoG); lfoG.connect(filt.frequency);
  lfo.start(now);

  // Глубокий D1 саб + расстроенная квинта D2 / A2
  const freqs = [
    { f: 36.71, t: 'sine', v: 0.55 },
    { f: 73.42, t: 'sawtooth', v: 0.14 },
    { f: 73.68, t: 'sawtooth', v: 0.14 },
    { f: 110.0, t: 'triangle', v: 0.16 },
  ];
  trackNodes.push(bed, lfo);
  freqs.forEach(x => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = x.t; o.frequency.value = x.f; g.gain.value = x.v;
    o.connect(g); g.connect(filt);
    o.start(now);
    trackNodes.push(o, g);
  });

  // Прогрессия мрачных кинематографичных аккордов Dm9 → Bbmaj7 → Gm9 → Asus4
  const chords = [
    [146.83, 174.61, 220.00, 329.63],
    [116.54, 174.61, 220.00, 293.66],
    [196.00, 233.08, 293.66, 349.23],
    [110.00, 146.83, 220.00, 261.63],
  ];
  const shimmer = [587.33, 659.25, 698.46, 880.00, 523.25];
  let ci = 0;

  const fireChord = () => {
    if (!playing) return;
    const ch = chords[ci++ % chords.length];
    ch.forEach((f, idx) => {
      setTimeout(() => {
        if (playing) playPadNote(ac, f, 7.2, 0.048, ostBus, 'triangle', 760);
      }, idx * 240);
    });
    // Редкая кристаллическая нота наверху
    if (Math.random() < 0.72) {
      setTimeout(() => {
        if (!playing) return;
        const n = shimmer[Math.floor(Math.random() * shimmer.length)];
        playPadNote(ac, n, 4.2, 0.018, ostBus, 'sine', 1600);
      }, 2400 + Math.random() * 1800);
    }
  };
  fireChord();
  trackTimers.push(setInterval(fireChord, 6800));
}

/* ─────────── ТРЕК 2: BLACK SIGNAL (Tactical Pulse · 88 BPM) ─────────── */
function startSignal(ac) {
  const now = ac.currentTime;
  const bed = ac.createGain(); bed.gain.value = 0.16; bed.connect(ostBus);
  const sub = ac.createOscillator();
  sub.type = 'sine'; sub.frequency.value = 36.71;
  const subG = ac.createGain(); subG.gain.value = 0.45;
  sub.connect(subG); subG.connect(bed); sub.start(now);
  trackNodes.push(bed, sub, subG);

  // 88 BPM → 16-я нота = 170.45 ms, 8-я нота = 340.9 ms
  const arpPatterns = [
    [146.83, 220.00, 261.63, 293.66, 261.63, 220.00, 174.61, 220.00],
    [116.54, 174.61, 220.00, 293.66, 220.00, 174.61, 146.83, 174.61],
    [130.81, 196.00, 261.63, 329.63, 261.63, 196.00, 164.81, 196.00],
    [110.00, 164.81, 220.00, 261.63, 220.00, 174.61, 164.81, 146.83],
  ];
  let step = 0;

  const tick = () => {
    if (!playing) return;
    const t = ac.currentTime;
    const bar = Math.floor(step / 16) % arpPatterns.length;
    const pat = arpPatterns[bar];
    const inBar = step % 16;

    // Глубокий приглушённый тактический пульс-бочка на 0, 6, 8, 12
    if (inBar === 0 || inBar === 6 || inBar === 8) {
      const k = ac.createOscillator(), kg = ac.createGain();
      k.type = 'sine';
      k.frequency.setValueAtTime(inBar === 0 ? 96 : 78, t);
      k.frequency.exponentialRampToValueAtTime(34, t + 0.14);
      kg.gain.setValueAtTime(inBar === 0 ? 0.24 : 0.13, t);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      k.connect(kg); kg.connect(ostBus);
      k.start(t); k.stop(t + 0.24);
    }

    // Аналоговое арпеджио на чётных шагах
    if (inBar % 2 === 0) {
      const freq = pat[(inBar / 2) % pat.length];
      playPluck(ac, freq, 0.32, 0.068, ostBus, true);
    }

    // Тёмный пэд на начале каждого второго такта
    if (inBar === 0) {
      playPadNote(ac, pat[0] * 0.5, 5.4, 0.055, ostBus, 'triangle', 540);
      playPadNote(ac, pat[2], 5.4, 0.025, ostBus, 'sine', 920);
    }
    step++;
  };
  tick();
  trackTimers.push(setInterval(tick, 170));
}

/* ─────────── ТРЕК 3: GHOST TERMINAL (Cyber-Noir · Sonar) ─────────── */
function startGhost(ac) {
  const now = ac.currentTime;
  const bed = ac.createGain(); bed.gain.value = 0.2; bed.connect(ostBus);

  // Мягкий тёплый атмосферный шум-комната (vinyl / radio air)
  const bufLen = ac.sampleRate * 4;
  const nBuf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = nBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufLen; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.025;
  }
  const noise = ac.createBufferSource();
  noise.buffer = nBuf; noise.loop = true;
  const nFilt = ac.createBiquadFilter();
  nFilt.type = 'bandpass'; nFilt.frequency.value = 420; nFilt.Q.value = 0.7;
  const nGain = ac.createGain(); nGain.gain.value = 0.18;
  noise.connect(nFilt); nFilt.connect(nGain); nGain.connect(bed);
  noise.start(now);

  // Холодный глубокий гул C#1 / G#1
  const o1 = ac.createOscillator(), g1 = ac.createGain();
  o1.type = 'sine'; o1.frequency.value = 34.65; g1.gain.value = 0.42;
  o1.connect(g1); g1.connect(bed); o1.start(now);

  const o2 = ac.createOscillator(), g2 = ac.createGain();
  o2.type = 'triangle'; o2.frequency.value = 103.83; g2.gain.value = 0.07;
  const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 240;
  o2.connect(f2); f2.connect(g2); g2.connect(bed); g2.connect(reverb); o2.start(now);

  trackNodes.push(bed, noise, nGain, o1, g1, o2, g2);

  // Редкий глубокий сонар-пинг с эхом
  const sonarNotes = [277.18, 311.13, 415.30, 554.37, 207.65];
  let si = 0;
  const ping = () => {
    if (!playing) return;
    const f = sonarNotes[si++ % sonarNotes.length];
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.042, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g); g.connect(reverb); if (delayL) g.connect(delayL);
    o.start(t); o.stop(t + 2.6);
  };
  setTimeout(ping, 600);
  trackTimers.push(setInterval(ping, 4600));
}

function startOst(trackId) {
  const ac = ensureCtx();
  if (!ac) return;
  stopTrackNodes();
  const c = cfg();
  const id = TRACKS[trackId] ? trackId : (TRACKS[c.track] ? c.track : 'oculus');
  c.track = id;
  c.ost = true;
  playing = true;
  saveCfg();

  const targetVol = (c.ostVol / 100) * 0.65;
  ostBus.gain.cancelScheduledValues(ac.currentTime);
  ostBus.gain.setTargetAtTime(Math.max(0.0001, targetVol), ac.currentTime, 0.45);

  if (id === 'oculus') startOculus(ac);
  else if (id === 'signal') startSignal(ac);
  else startGhost(ac);

  syncUI();
}

function stopOst() {
  const c = cfg();
  c.ost = false;
  playing = false;
  saveCfg();
  if (ctx && ostBus) {
    ostBus.gain.cancelScheduledValues(ctx.currentTime);
    ostBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
  }
  stopTrackNodes();
  syncUI();
}

function toggleOst() {
  if (playing) {
    sfx('click');
    stopOst();
    GE.toast('Саундтрек выключен', 'info');
  } else {
    startOst(cfg().track);
    sfx('boot');
    GE.toast(`OST: ${TRACKS[cfg().track].name}`, 'ok');
  }
}

/* ─────────── ТАКТИЛЬНЫЕ UI SFX ─────────── */
function sfx(type = 'click') {
  const c = cfg();
  if (!c.sfx || c.sfxVol <= 0) return;
  const ac = ensureCtx();
  if (!ac || ac.state === 'suspended') return;
  const now = ac.currentTime;

  if (type === 'hover') {
    if (now - lastHoverTs < 0.08) return;
    lastHoverTs = now;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1180, now);
    o.frequency.exponentialRampToValueAtTime(720, now + 0.022);
    g.gain.setValueAtTime(0.018, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);
    o.connect(g); g.connect(sfxBus);
    o.start(now); o.stop(now + 0.03);
    return;
  }

  if (type === 'click') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, now);
    o.frequency.exponentialRampToValueAtTime(68, now + 0.032);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    o.connect(g); g.connect(sfxBus);
    o.start(now); o.stop(now + 0.045);
    return;
  }

  if (type === 'tab') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, now);
    o.frequency.exponentialRampToValueAtTime(680, now + 0.048);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    o.connect(g); g.connect(sfxBus);
    o.start(now); o.stop(now + 0.075);
    return;
  }

  if (type === 'scan') {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, now);
    o.frequency.exponentialRampToValueAtTime(440, now + 0.24);
    f.type = 'bandpass'; f.Q.value = 3.5;
    f.frequency.setValueAtTime(220, now);
    f.frequency.exponentialRampToValueAtTime(1200, now + 0.26);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.13, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    o.connect(f); f.connect(g); g.connect(sfxBus);
    if (reverb) g.connect(reverb);
    o.start(now); o.stop(now + 0.38);
    return;
  }

  if (type === 'found' || type === 'success') {
    [587.33, 880.00].forEach((freq, i) => {
      const t = now + i * 0.075;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(g); g.connect(sfxBus);
      if (reverb) g.connect(reverb);
      o.start(t); o.stop(t + 0.4);
    });
    return;
  }

  if (type === 'alert' || type === 'error') {
    [138.59, 103.83].forEach((freq, i) => {
      const t = now + i * 0.13;
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = 540;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.25);
    });
    return;
  }

  if (type === 'pivot' || type === 'graph') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(523.25, now);
    o.frequency.exponentialRampToValueAtTime(783.99, now + 0.09);
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    o.connect(g); g.connect(sfxBus);
    o.start(now); o.stop(now + 0.16);
    return;
  }

  if (type === 'eye') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(146.83, now);
    o.frequency.exponentialRampToValueAtTime(55, now + 0.55);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    o.connect(g); g.connect(sfxBus);
    if (reverb) g.connect(reverb);
    o.start(now); o.stop(now + 0.7);
    return;
  }

  if (type === 'boot') {
    [73.42, 146.83, 220.00, 293.66].forEach((freq, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(freq * 0.96, now);
      o.frequency.exponentialRampToValueAtTime(freq, now + 0.45);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.075 / (i * 0.35 + 1), now + 0.16);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
      o.connect(g); g.connect(sfxBus);
      if (reverb) g.connect(reverb);
      o.start(now); o.stop(now + 1.6);
    });
  }
}

function setTrack(id) {
  if (!TRACKS[id]) return;
  const c = cfg();
  c.track = id;
  saveCfg();
  if (playing) startOst(id);
  else syncUI();
  sfx('tab');
}

function setOstVol(v) {
  const c = cfg();
  c.ostVol = Math.max(0, Math.min(100, Number(v) || 0));
  saveCfg();
  if (ctx && ostBus && playing) {
    ostBus.gain.setTargetAtTime(Math.max(0.0001, (c.ostVol / 100) * 0.65), ctx.currentTime, 0.08);
  }
  syncUI();
}

function setSfxVol(v) {
  const c = cfg();
  c.sfxVol = Math.max(0, Math.min(100, Number(v) || 0));
  saveCfg();
  if (ctx && sfxBus) {
    sfxBus.gain.setTargetAtTime((c.sfxVol / 100) * 0.42, ctx.currentTime, 0.05);
  }
  syncUI();
}

function setSfxEnabled(on) {
  const c = cfg();
  c.sfx = !!on;
  saveCfg();
  syncUI();
  if (c.sfx) sfx('tab');
}

function syncUI() {
  const c = cfg();
  const ctl = $('#audio-ctl');
  const lbl = $('#audio-lbl');
  const st = $('#ap-state');
  if (ctl) ctl.classList.toggle('playing', playing);
  if (lbl) lbl.textContent = playing ? TRACKS[c.track].name.split(' ')[0] : 'OST OFF';
  if (st) st.textContent = playing ? 'ACTIVE' : 'STANDBY';

  $$('#ap-tracks [data-track]').forEach(b => b.classList.toggle('on', b.dataset.track === c.track));
  const ov = $('#ap-ost-vol'), sv = $('#ap-sfx-vol'), so = $('#ap-sfx-on');
  if (ov) ov.value = c.ostVol;
  if (sv) sv.value = c.sfxVol;
  if (so) so.checked = c.sfx;
  const op = $('#ap-ost-pct'), sp = $('#ap-sfx-pct');
  if (op) op.textContent = c.ostVol + '%';
  if (sp) sp.textContent = c.sfxVol + '%';

  // Синхронизация с разделом Настройки
  const sOst = $('#set-audio-ost'), sSfx = $('#set-audio-sfx'), sTr = $('#set-audio-track');
  const sOv = $('#set-audio-ost-vol'), sSv = $('#set-audio-sfx-vol');
  if (sOst) sOst.checked = playing;
  if (sSfx) sSfx.checked = c.sfx;
  if (sTr) sTr.value = c.track;
  if (sOv) sOv.value = c.ostVol;
  if (sSv) sSv.value = c.sfxVol;
}

function init() {
  syncUI();

  // Верхняя кнопка OST вкл/выкл
  $('#audio-toggle')?.addEventListener('click', toggleOst);

  // Поповер выбора трека и громкости
  const pop = $('#audio-pop');
  $('#audio-pop-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    pop?.classList.toggle('hidden');
    sfx('tab');
  });
  document.addEventListener('click', e => {
    if (pop && !pop.classList.contains('hidden') && !e.target.closest('#audio-ctl')) {
      pop.classList.add('hidden');
    }
  });

  $('#ap-tracks')?.addEventListener('click', e => {
    const b = e.target.closest('[data-track]');
    if (!b) return;
    if (!playing) startOst(b.dataset.track);
    else setTrack(b.dataset.track);
  });
  $('#ap-ost-vol')?.addEventListener('input', e => setOstVol(e.target.value));
  $('#ap-sfx-vol')?.addEventListener('input', e => setSfxVol(e.target.value));
  $('#ap-sfx-on')?.addEventListener('change', e => setSfxEnabled(e.target.checked));
  $('#ap-test')?.addEventListener('click', () => { ensureCtx(); sfx('found'); });

  // Привязки в разделе Настройки
  $('#set-audio-ost')?.addEventListener('change', e => { if (e.target.checked) startOst(cfg().track); else stopOst(); });
  $('#set-audio-sfx')?.addEventListener('change', e => setSfxEnabled(e.target.checked));
  $('#set-audio-track')?.addEventListener('change', e => setTrack(e.target.value));
  $('#set-audio-ost-vol')?.addEventListener('input', e => setOstVol(e.target.value));
  $('#set-audio-sfx-vol')?.addEventListener('input', e => setSfxVol(e.target.value));

  // Глобальная клавиша Alt+M — быстрый mute/unmute саундтрека
  document.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь')) {
      e.preventDefault();
      toggleOst();
    }
  });

  // Автоматическое «пробуждение» AudioContext на первом жесте пользователя + делегированные UI-звуки
  let unlocked = false;
  document.addEventListener('pointerdown', () => {
    if (!unlocked) {
      unlocked = true;
      if (cfg().ost && !playing) startOst(cfg().track);
    }
  }, { passive: true });

  document.addEventListener('click', e => {
    if (e.target.closest('#audio-toggle, #audio-pop-btn, #ap-test')) return;
    if (e.target.closest('#hero-eye')) { sfx('eye'); return; }
    if (e.target.closest('.pivot-link')) { sfx('pivot'); return; }
    if (e.target.closest('.tabs button, .seg button, .type-tab, .nav a')) { sfx('tab'); return; }
    if (e.target.closest('button, .eng-open, .chip, .pb-step input')) { sfx('click'); return; }
  });

  // Еле слышный микро-звук при наведении на пункты меню
  $('#nav')?.addEventListener('mouseover', e => {
    if (e.target.closest('a')) sfx('hover');
  });
}

GE.audio = {
  TRACKS,
  init,
  toggleOst,
  startOst,
  stopOst,
  setTrack,
  setOstVol,
  setSfxVol,
  setSfxEnabled,
  sfx,
  isPlaying: () => playing,
};
})();
