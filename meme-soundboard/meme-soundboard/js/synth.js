/*
  Built-in sounds, generated in the browser with the Web Audio API.
  No files needed. Turn them off in config.js (showStarterSounds / showDemoMusic).
*/
(() => {
'use strict';
const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
const SR = 44100;
if (!OAC) { window.SoundboardSynth = null; return; }

function offline(dur){ return new OAC(2, Math.ceil(SR * dur), SR); }
function rendered(c){
  return new Promise((res, rej) => {
    c.oncomplete = e => res(e.renderedBuffer);
    try { const p = c.startRendering(); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
  });
}
function noiseBuf(c, dur){
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function shaper(c, amt){
  const ws = c.createWaveShaper(), n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amt) / Math.tanh(amt); }
  ws.curve = curve; return ws;
}
function hold(g, t, a, peak, d, rel){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + d - rel);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
}

const sfx = {
  async airhorn(){
    const c = offline(1.9), out = c.createGain(), ws = shaper(c, 3), lp = c.createBiquadFilter();
    out.gain.value = 0.5; lp.type = 'lowpass'; lp.frequency.value = 3600;
    out.connect(ws); ws.connect(lp); lp.connect(c.destination);
    for (const [t, d] of [[0, 0.2], [0.27, 0.2], [0.54, 1.2]]) {
      const g = c.createGain(); hold(g, t, 0.015, 0.25, d, 0.05); g.connect(out);
      for (const f of [370, 415.3, 466.2, 554.4]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.93, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
        o.detune.value = Math.random() * 12 - 6;
        o.connect(g); o.start(t); o.stop(t + d + 0.02);
      }
    }
    return rendered(c);
  },
  async trombone(){
    const c = offline(3.2), out = c.createGain(); out.gain.value = 0.7; out.connect(c.destination);
    for (const [f, t, d] of [[293.7, 0, 0.42], [277.2, 0.48, 0.42], [261.6, 0.96, 0.42], [246.9, 1.44, 1.55]]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.96, t); o.frequency.linearRampToValueAtTime(f, t + 0.08);
      if (d > 1) {
        o.frequency.linearRampToValueAtTime(f * 0.95, t + d);
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.035, t + 0.45);
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + d + 0.05);
      }
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
      lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(1500, t + 0.12); lp.frequency.exponentialRampToValueAtTime(650, t + d);
      const g = c.createGain(); hold(g, t, 0.05, 0.38, d, 0.12);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02);
    }
    return rendered(c);
  },
  async badum(){
    const c = offline(1.9), out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    const nb = noiseBuf(c, 1.6);
    const tom = (t, f0, f1) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.18);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.85, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.34);
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = 1600;
      ng.gain.setValueAtTime(0.3, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, 0, 0.08);
    };
    tom(0, 230, 125); tom(0.17, 165, 85);
    const t = 0.38;
    const k = c.createOscillator(), kg = c.createGain();
    k.frequency.setValueAtTime(130, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    kg.gain.setValueAtTime(0.0001, t); kg.gain.exponentialRampToValueAtTime(0.9, t + 0.004); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    k.connect(kg); kg.connect(out); k.start(t); k.stop(t + 0.4);
    const n = c.createBufferSource(), hp = c.createBiquadFilter(), pk = c.createBiquadFilter(), g = c.createGain();
    n.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 5200; pk.type = 'peaking'; pk.frequency.value = 9000; pk.gain.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
    n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(out); n.start(t);
    return rendered(c);
  },
  async boom(){
    const c = offline(2.3), ws = shaper(c, 2.6), out = c.createGain();
    out.gain.value = 0.95; ws.connect(out); out.connect(c.destination);
    const echo = c.createDelay(1), fb = c.createGain(), elp = c.createBiquadFilter();
    echo.delayTime.value = 0.16; fb.gain.value = 0.32; elp.type = 'lowpass'; elp.frequency.value = 500;
    ws.connect(echo); echo.connect(elp); elp.connect(fb); fb.connect(echo); elp.connect(out);
    const sweep = (type, mul, peak) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type;
      o.frequency.setValueAtTime(115 * mul, 0); o.frequency.exponentialRampToValueAtTime(40 * mul, 0.5);
      g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(peak, 0.008); g.gain.exponentialRampToValueAtTime(0.0001, 2.1);
      o.connect(g); g.connect(ws); o.start(0); o.stop(2.15);
    };
    sweep('sine', 1, 1); sweep('triangle', 2, 0.25);
    const n = c.createBufferSource(), lp = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = noiseBuf(c, 0.12); lp.type = 'lowpass'; lp.frequency.value = 900;
    ng.gain.setValueAtTime(0.6, 0); ng.gain.exponentialRampToValueAtTime(0.0001, 0.1);
    n.connect(lp); lp.connect(ng); ng.connect(ws); n.start(0);
    return rendered(c);
  },
  async crickets(){
    const c = offline(2.8), out = c.createGain(); out.gain.value = 0.32; out.connect(c.destination);
    const cricket = (f, offset, pan) => {
      let dest = out;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(out); dest = p; }
      for (let t = offset; t < 2.6; t += 0.62) {
        for (let k = 0; k < 3; k++) {
          const s = t + k * 0.055, o = c.createOscillator(), g = c.createGain();
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.6, s + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
          o.connect(g); g.connect(dest); o.start(s); o.stop(s + 0.05);
        }
      }
    };
    cricket(4400, 0.05, -0.5); cricket(4760, 0.33, 0.5);
    return rendered(c);
  },
  async buzzer(){
    const c = offline(1.4), lp = c.createBiquadFilter(), out = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 2200; out.gain.value = 0.3;
    lp.connect(out); out.connect(c.destination);
    for (const [t, d] of [[0, 0.32], [0.42, 0.85]]) {
      const g = c.createGain(); hold(g, t, 0.01, 0.5, d, 0.05); g.connect(lp);
      for (const f of [98, 103.5, 196]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + d + 0.02); }
    }
    return rendered(c);
  }
};

const starters = [
  ['airhorn', 'Air Horn', '#ff5a36'], ['boom', 'Boom', '#8b5cff'], ['trombone', 'Sad Trombone', '#2f86ff'],
  ['badum', 'Ba Dum Tss', '#ffb800'], ['buzzer', 'Wrong Buzzer', '#ff4fa3'], ['crickets', 'Crickets', '#16b886']
];

/* An 8-bar lo-fi loop, rendered once and folded so it loops cleanly. Resolves {blob, duration}. */
const BPM = 88, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 8, LOOP = BAR * BARS;
let demoPromise = null;
function demoLoop(){
  if (demoPromise) return demoPromise;
  demoPromise = (async () => {
    const tail = 2.5, c = offline(LOOP + tail);
    const mix = c.createGain(), warm = c.createBiquadFilter();
    mix.gain.value = 0.6; warm.type = 'lowpass'; warm.frequency.value = 3200; warm.Q.value = 0.4;
    mix.connect(warm); warm.connect(c.destination);
    const midi = m => 440 * Math.pow(2, (m - 69) / 12);
    const nb = noiseBuf(c, 1);
    const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
    const roots = [41, 40, 38, 36];
    const keys = (t0, notes, vel) => notes.forEach((m, i) => {
      const s = t0 + i * 0.014, f = midi(m);
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
      o.frequency.value = f; o.detune.value = Math.random() * 8 - 4;
      o2.type = 'triangle'; o2.frequency.value = f * 2; g2.gain.value = 0.18;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.1 * vel, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.028 * vel, s + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, s + 2.2);
      o2.connect(g2); g2.connect(g); o.connect(g); g.connect(mix);
      o.start(s); o2.start(s); o.stop(s + 2.3); o2.stop(s + 2.3);
    });
    const bass = (s, d, m) => {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.value = midi(m);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
      o.connect(g); g.connect(mix); o.start(s); o.stop(s + d + 0.02);
    };
    const kick = s => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(120, s); o.frequency.exponentialRampToValueAtTime(45, s + 0.12);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.75, s + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.connect(g); g.connect(mix); o.start(s); o.stop(s + 0.4);
    };
    const snare = s => {
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      n.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.35, s + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
      n.connect(bp); bp.connect(g); g.connect(mix); n.start(s, Math.random() * 0.5, 0.25);
    };
    const hat = (s, v) => {
      const n = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      n.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 7000;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(v, s + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.045);
      n.connect(hp); hp.connect(g); g.connect(mix); n.start(s, Math.random() * 0.5, 0.06);
    };
    for (let b = 0; b < BARS; b++) {
      const t0 = b * BAR, ci = b % 4;
      keys(t0, chords[ci], 1); keys(t0 + BEAT * 2.5, chords[ci], 0.55);
      bass(t0, BEAT * 2.2, roots[ci]); bass(t0 + BEAT * 2.5, BEAT * 1.3, roots[ci] + 7);
      kick(t0); kick(t0 + BEAT * 2.5); snare(t0 + BEAT); snare(t0 + BEAT * 3);
      for (let h = 0; h < 8; h++) hat(t0 + h * BEAT / 2 + (h % 2 ? BEAT * 0.08 : 0), h % 2 ? 0.05 : 0.09);
    }
    const crb = c.createBuffer(1, Math.ceil(SR * (LOOP + tail)), SR), cd = crb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() < 0.00035 ? (Math.random() * 2 - 1) * 0.45 : 0) + (Math.random() * 2 - 1) * 0.004;
    const cr = c.createBufferSource(); cr.buffer = crb; cr.connect(c.destination); cr.start(0);
    const buf = await rendered(c);
    const L = Math.round(LOOP * SR), T = buf.length - L, chans = [];
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch), a = new Float32Array(L);
      a.set(src.subarray(0, L));
      for (let i = 0; i < T && i < L; i++) a[i] += src[L + i];
      chans.push(a);
    }
    return { blob: wav(chans, SR), duration: LOOP };
  })();
  demoPromise.catch(() => { demoPromise = null; });
  return demoPromise;
}

function wav(chans, sr){
  const n = chans[0].length, nc = chans.length, bytes = n * nc * 2;
  const buf = new ArrayBuffer(44 + bytes), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < nc; ch++) {
    const s = Math.max(-1, Math.min(1, chans[ch][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

window.SoundboardSynth = { sfx, starters, demoLoop, demoDuration: LOOP };
})();
