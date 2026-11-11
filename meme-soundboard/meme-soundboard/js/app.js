/*
  Meme Soundboard — app logic.
  You shouldn't need to edit this file: buttons and songs are set in config.js.
*/
(() => {
'use strict';

/* ================= basics ================= */
const CFG = window.SOUNDBOARD_CONFIG || {};
const SYN = window.SoundboardSynth || null;
const $ = s => document.querySelector(s);
const COLORS = ['#ff5a36','#ffb800','#2f86ff','#16b886','#ff4fa3','#8b5cff','#ff8a1f','#12aebf'];
const KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm';
const RANK = { config: 0, user: 1, starter: 2 };
const LOCAL = location.protocol === 'file:';          // opened by double-clicking index.html
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const pad2 = n => String(n).padStart(2, '0');
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;
const isAudioFile = f => (f.type && f.type.startsWith('audio/')) || AUDIO_EXT.test(f.name);

const store = {
  get(k, d){ try { const v = localStorage.getItem('msb:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v){ try { localStorage.setItem('msb:' + k, JSON.stringify(v)); } catch (e) {} }
};
const S = {
  sfxVol: store.get('sfxVol', 0.9),
  musicVol: store.get('musicVol', 0.6),
  duck: store.get('duck', true),
  solo: store.get('solo', false),
  mode: store.get('mode', 'all'),
  hidden: store.get('hidden', []),
  overrides: store.get('overrides', {})
};
const saveS = k => store.set(k, S[k]);

let items = [];
const byId = id => items.find(i => i.id === id);
const isHidden = it => S.hidden.includes(it.id);
const isEmptySlot = it => it.kind === 'sfx' && it.source === 'config' && !it.fill && it.status === 'missing';
const blobOf = it => it.blob || it.fill || null;
const sorted = kind => items.filter(i => i.kind === kind && !isHidden(i) && !(kind === 'music' && i.source === 'config' && i.status === 'missing'))
  .sort((a, b) => (RANK[a.source] - RANK[b.source]) || ((a.order || 0) - (b.order || 0)) || ((a.added || 0) - (b.added || 0)));
const sfxList = () => sorted('sfx');
const musicList = () => sorted('music');

function cleanName(file){
  return String(file).replace(/^.*\//, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}
function refresh(it){
  if (it.source === 'user') return;
  const o = S.overrides[it.id] || {};
  it.color = o.color || it.cfgColor || COLORS[(it.order || 0) % COLORS.length];
  if (it.kind === 'music') { it.name = o.name || it.cfgName || cleanName(it.file || 'Song'); return; }
  it.name = o.name || it.cfgName || (it.fill ? it.fillName : '')
    || (it.source === 'config' && it.status !== 'missing' ? cleanName(it.file) : '')
    || 'Slot ' + pad2((it.order || 0) + 1);
}
function fmt(t){
  if (!isFinite(t) || t < 0) t = 0;
  return Math.floor(t / 60) + ':' + pad2(Math.floor(t % 60));
}
let toastT;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600);
}
let renderQueued = false;
function scheduleRender(){
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderAll(); });
}

/* ================= audio graph ================= */
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, master, sfxBus, musicBus, duckNode, analyser, musicRouted = false, duckLevel = 1;

function initCtx(){
  if (ctx || !AC) return ctx;
  try {
    ctx = new AC();
    master = ctx.createGain();
    analyser = ctx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.72;
    master.connect(analyser); analyser.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfxVol; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = S.musicVol; musicBus.connect(master);
    duckNode = ctx.createGain(); duckNode.connect(musicBus);
  } catch (e) { ctx = null; }
  return ctx;
}
function unlock(){
  initCtx();
  if (ctx && ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
}
['pointerup', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
function routeMusic(){
  // Opened straight from a folder (file://), browsers mute songs routed through Web Audio, so play them directly.
  if (musicRouted || LOCAL || !initCtx()) return;
  try { ctx.createMediaElementSource(audio).connect(duckNode); musicRouted = true; audio.volume = 1; }
  catch (e) { musicRouted = false; }
}
function applyMusicVolume(){
  if (musicRouted) musicBus.gain.setTargetAtTime(S.musicVol, ctx.currentTime, 0.02);
  else audio.volume = Math.max(0, Math.min(1, S.musicVol * duckLevel));
}

/* ================= decoding ================= */
const buffers = new Map(), decoding = new Map();
const bufKey = it => it.id + (it.fill ? ':fill:' + it.fillStamp : '');
function decode(ab){
  return new Promise((res, rej) => {
    try { const r = ctx.decodeAudioData(ab, res, rej); if (r && r.then) r.then(res, rej); } catch (e) { rej(e); }
  });
}
function getBuffer(it){
  const key = bufKey(it);
  if (buffers.has(key)) return Promise.resolve(buffers.get(key));
  if (decoding.has(key)) return decoding.get(key);
  const p = (async () => {
    let buf;
    if (it.synth) buf = await SYN.sfx[it.synth]();
    else {
      let ab;
      const b = blobOf(it);
      if (b) ab = await new Response(b).arrayBuffer();
      else {
        let r;
        try { r = await fetch(it.url, { cache: 'no-cache' }); }
        catch (e) { const err = new Error('missing'); err.missing = true; throw err; }
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.includes('text/html')) { const err = new Error('missing'); err.missing = true; throw err; }
        ab = await r.arrayBuffer();
      }
      buf = await decode(ab);
    }
    buffers.set(key, buf);
    return buf;
  })();
  decoding.set(key, p);
  p.catch(() => {}).then(() => decoding.delete(key));
  return p;
}

/* Does a file from config.js exist? */
function probeWithElement(url){
  return new Promise(res => {
    const a = new Audio();
    let done = false;
    const fin = (ok, d) => { if (done) return; done = true; a.removeAttribute('src'); res({ ok, duration: d }); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => fin(true, isFinite(a.duration) ? a.duration : null);
    a.onerror = () => fin(false);
    setTimeout(() => fin(true, null), 6000);
    a.src = url;
  });
}
async function probeHead(url){
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (r.status === 405 || r.status === 501) return { ok: true };
    const ct = r.headers.get('content-type') || '';
    return { ok: r.ok && !ct.includes('text/html') };
  } catch (e) { return { ok: false }; }
}
async function checkConfigSfx(it){
  if (LOCAL || !ctx) {
    const r = await probeWithElement(it.url);
    it.status = r.ok ? 'ok' : 'missing';
  } else {
    try { await getBuffer(it); it.status = 'ok'; }        // fetch + decode now, so the first tap is instant
    catch (e) { it.status = e && e.missing ? 'missing' : 'bad'; }
  }
  refresh(it); scheduleRender();
}
async function checkConfigMusic(it){
  const r = LOCAL ? await probeWithElement(it.url) : await probeHead(it.url);
  it.status = r.ok ? 'ok' : 'missing';
  if (r.duration) it.duration = r.duration;
  scheduleRender();
}

/* ================= meme playback ================= */
const playing = new Map();   // id -> {src|el, start, dur}
const padEls = new Map();
let visiblePads = [];

function finish(id, rec){
  if (playing.get(id) === rec) { playing.delete(id); setPadState(id); updateDuck(); }
}
async function playSfx(it){
  unlock();
  if (isEmptySlot(it)) { pickForSlot(it); return; }
  if (it.status === 'bad' && !it.fill) { toast(`“${it.name}” won't play. Check that ${it.file} is a real audio file.`); return; }
  if (S.solo) stopAllSfx(true);
  stopSfx(it.id);
  const useElement = !ctx || (LOCAL && it.source === 'config' && !it.fill);
  if (useElement) { playWithElement(it); return; }
  let buf;
  try { buf = await getBuffer(it); }
  catch (e) {
    if (e && e.missing) { it.status = 'missing'; refresh(it); scheduleRender(); toast(`${it.file} isn't in sounds/memes/ yet.`); }
    else toast(`Couldn't play “${it.name}”. Try an MP3, WAV or M4A file.`);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(sfxBus);
  const rec = { src, start: ctx.currentTime, dur: buf.duration || 0.001 };
  playing.set(it.id, rec);
  src.onended = () => finish(it.id, rec);
  src.start();
  setPadState(it.id); updateDuck(); kick();
}
function playWithElement(it){
  const b = blobOf(it);
  const url = b ? (it.objUrl || (it.objUrl = URL.createObjectURL(b))) : it.url;
  if (!url) { toast('This browser can’t play the built-in sounds. Add your own MP3s instead.'); return; }
  const el = new Audio(url);
  el.volume = S.sfxVol;
  const rec = { el };
  playing.set(it.id, rec);
  el.onended = () => finish(it.id, rec);
  el.onerror = () => {
    finish(it.id, rec);
    if (it.source === 'config' && !it.fill) { it.status = 'missing'; refresh(it); scheduleRender(); toast(`${it.file} isn't in sounds/memes/ yet.`); }
  };
  const p = el.play();
  if (p && p.catch) p.catch(() => finish(it.id, rec));
  setPadState(it.id); updateDuck(); kick();
}
function stopSfx(id){
  const r = playing.get(id); if (!r) return;
  playing.delete(id);
  try {
    if (r.el) { r.el.onended = r.el.onerror = null; r.el.pause(); }
    else { r.src.onended = null; r.src.stop(); }
  } catch (e) {}
  setPadState(id);
}
function stopAllSfx(silent){
  [...playing.keys()].forEach(stopSfx);
  if (!silent) updateDuck();
}
function setPadState(id){
  const el = padEls.get(id); if (!el) return;
  const on = playing.has(id);
  el.classList.toggle('playing', on);
  if (!on) el.style.setProperty('--p', 0);
}
function updateDuck(){
  const target = (S.duck && playing.size) ? 0.28 : 1;
  if (musicRouted && duckNode) {
    const t = ctx.currentTime;
    try {
      duckNode.gain.cancelScheduledValues(t);
      duckNode.gain.setValueAtTime(duckNode.gain.value, t);
      duckNode.gain.setTargetAtTime(target, t, target < 1 ? 0.04 : 0.35);
    } catch (e) { duckNode.gain.value = target; }
  } else {
    duckLevel = target; applyMusicVolume();
  }
}

/* ================= animation loop: pad progress + LCD visualiser ================= */
let raf = 0, fbins = null;
const viz = $('#viz'), vctx = viz.getContext('2d');
function kick(){ if (!raf) raf = requestAnimationFrame(tick); }
function tick(){
  raf = 0;
  let active = false;
  for (const [id, r] of playing) {
    const el = padEls.get(id);
    let p = 0;
    if (r.el) p = r.el.duration ? r.el.currentTime / r.el.duration : 0;
    else if (ctx) p = (ctx.currentTime - r.start) / r.dur;
    if (el) el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(4));
    active = true;
  }
  if (!audio.paused) active = true;
  drawViz(active);
  if (active) kick();
}
function drawViz(active){
  const w = viz.clientWidth, h = viz.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (viz.width !== Math.round(w * dpr)) { viz.width = Math.round(w * dpr); viz.height = Math.round(h * dpr); }
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vctx.clearRect(0, 0, w, h);
  const live = active && analyser && (musicRouted || [...playing.values()].some(r => r.src));
  if (live) {
    if (!fbins) fbins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(fbins);
  }
  const N = 26, gap = 3, bw = (w - gap * (N - 1)) / N, seg = 3, sgap = 2;
  const rows = Math.floor((h + sgap) / (seg + sgap));
  const now = performance.now() / 1000;
  for (let i = 0; i < N; i++) {
    let v = 0;
    if (live) {
      const idx = Math.min(fbins.length - 1, 1 + Math.floor(Math.pow(i / N, 1.6) * fbins.length * 0.72));
      v = fbins[idx] / 255;
    } else if (active) {
      // songs played straight from a folder can't be measured, so show a gentle idle wave
      v = 0.25 + 0.2 * Math.sin(now * 3 + i * 0.6) * Math.sin(now * 1.3 + i * 0.21);
    }
    const lit = Math.round(v * rows);
    for (let r = 0; r < rows; r++) {
      vctx.fillStyle = r < lit ? '#ffb547' : 'rgba(255,181,71,0.13)';
      vctx.fillRect(i * (bw + gap), h - (r + 1) * (seg + sgap) + sgap, bw, seg);
    }
  }
}

/* ================= background music ================= */
let currentId = null, seeking = false;
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const MODES = {
  all: { label: 'Repeat all', icon: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/>' },
  one: { label: 'Repeat one song', icon: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2zm-4-2V9h-1l-2 1v1h1.5v4z"/>' },
  shuffle: { label: 'Shuffle', icon: '<path d="M10.6 9.2 5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4-1.4 1.4 3.1 3.1-2 2H20v-5.5l-2 2z"/>' }
};

function readyURL(t){
  if (t.objUrl) return t.objUrl;
  if (t.blob) return (t.objUrl = URL.createObjectURL(t.blob));
  return t.url || null;
}
function prepareDemo(t){
  if (!SYN) return Promise.resolve(null);
  return SYN.demoLoop().then(r => { t.blob = r.blob; t.duration = r.duration; scheduleRender(); return readyURL(t); });
}
function playTrack(i){
  const list = musicList(); if (!list.length) return;
  i = ((i % list.length) + list.length) % list.length;
  const t = list[i];
  routeMusic(); applyMusicVolume();
  currentId = t.id;
  const go = url => {
    if (!url || currentId !== t.id) { if (!url) toast(`Couldn't load “${t.name}”.`); return; }
    if (audio.getAttribute('src') !== url) audio.src = url; else audio.currentTime = 0;
    audio.loop = S.mode === 'one';
    const p = audio.play();
    if (p && p.catch) p.catch(err => { if (err && err.name !== 'AbortError') toast('Tap play to start the music.'); });
  };
  const url = readyURL(t);
  if (url) go(url); else if (t.demo) prepareDemo(t).then(go); else go(null);
  setMediaMeta(t);
  renderMusic();
}
const currentIndex = () => musicList().findIndex(t => t.id === currentId);
function nextTrack(){
  const list = musicList(); if (!list.length) return;
  let i = currentIndex();
  if (list.length === 1 && i === 0) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  if (S.mode === 'shuffle' && list.length > 1) { let j; do { j = Math.floor(Math.random() * list.length); } while (j === i); i = j; }
  else i = i + 1;
  playTrack(i);
}
function prevTrack(){
  if (audio.currentTime > 3 && currentId) { audio.currentTime = 0; return; }
  const i = currentIndex();
  playTrack(i < 0 ? 0 : i - 1);
}
function togglePlay(){
  const cur = byId(currentId);
  if (!cur || isHidden(cur)) {
    if (musicList().length) playTrack(0); else { openDeck(); toast('Add a song to the playlist first.'); }
    return;
  }
  if (audio.paused) { routeMusic(); const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
  else audio.pause();
}
audio.addEventListener('ended', () => { if (S.mode !== 'one') nextTrack(); });
audio.addEventListener('play', () => { renderTransport(); renderMusic(); kick(); });
audio.addEventListener('pause', () => { renderTransport(); renderMusic(); });
audio.addEventListener('timeupdate', renderTime);
audio.addEventListener('loadedmetadata', () => {
  const t = byId(currentId);
  if (t && isFinite(audio.duration) && !t.duration) { t.duration = audio.duration; renderMusic(); }
  renderTime();
});
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  const t = byId(currentId);
  if (t && t.source === 'config') toast(`Couldn't play “${t.name}”. Check that ${t.file} is in sounds/music/.`);
  else toast(`Couldn't play “${t ? t.name : 'this song'}”. The file may be in a format this browser can't read.`);
});

function setMediaMeta(t){
  try { if ('mediaSession' in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: CFG.title || 'Meme Soundboard' }); } catch (e) {}
}
try {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
  }
} catch (e) {}

function probeDuration(blob){
  return new Promise(res => {
    const a = document.createElement('audio'), u = URL.createObjectURL(blob);
    let done = false;
    const fin = v => { if (done) return; done = true; URL.revokeObjectURL(u); res(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : null);
    a.onerror = () => fin(null);
    setTimeout(() => fin(null), 5000);
    a.src = u;
  });
}

/* ================= rendering ================= */
const grid = $('#grid'), q = $('#q');
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>';

function renderPads(){
  const term = q.value.trim().toLowerCase();
  const editing = document.body.classList.contains('editing');
  const list = sfxList().filter(i => !term || i.name.toLowerCase().includes(term));
  visiblePads = list;
  grid.textContent = ''; padEls.clear();
  if (!list.length) {
    const d = document.createElement('div'); d.className = 'empty';
    if (term) {
      d.innerHTML = '<strong></strong><span>Try a different word, or clear the search.</span>';
      d.querySelector('strong').textContent = `Nothing matches “${q.value.trim()}”`;
    } else {
      d.innerHTML = '<strong>No meme sounds yet</strong><span>Add your MP3s and each one becomes a pad named after the file.</span><button class="btn primary" type="button" data-add="sfx">Add meme sounds</button>';
    }
    grid.append(d);
  }
  list.forEach((it, n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.id = it.id;
    const key = n < KEYS.length ? `<span class="key" aria-hidden="true">${KEYS[n].toUpperCase()}</span>` : '';
    const empty = isEmptySlot(it), checking = it.status === 'checking' && !it.fill;
    if (empty || checking) {
      b.className = 'pad slot';
      b.innerHTML = key + (empty ? `<span class="plus" aria-hidden="true">${PLUS}</span>` : '')
        + `<span class="label"></span><span class="hint">${empty ? 'Tap to add a sound' : 'Loading…'}</span>`;
      b.querySelector('.label').textContent = it.name;
      b.setAttribute('aria-label', editing ? `Edit ${it.name}` : empty ? `${it.name} is empty. Add a sound` : `Play ${it.name}`);
    } else {
      b.className = 'pad';
      b.style.setProperty('--pad', it.color);
      const len = it.name.length, word = Math.max(...it.name.split(/\s+/).map(w => w.length));
      b.innerHTML = '<span class="led" aria-hidden="true"></span>'
        + (it.source === 'starter' ? '<span class="tag">Starter</span>' : '')
        + key
        + `<span class="label${len > 24 || word > 11 ? ' xs' : len > 12 || word > 7 ? ' s' : ''}"></span>`
        + '<span class="bar" aria-hidden="true"><i></i></span>';
      b.querySelector('.label').textContent = it.name;
      b.setAttribute('aria-label', (editing ? 'Edit ' : 'Play ') + it.name);
      if (playing.has(it.id)) b.classList.add('playing');
    }
    grid.append(b); padEls.set(it.id, b);
  });
  renderCount();
}

function renderCount(){
  const all = sfxList(), empty = all.filter(isEmptySlot).length, ready = all.length - empty, songs = musicList().length;
  $('#count').textContent = `${ready} ${ready === 1 ? 'sound' : 'sounds'}${empty ? ` · ${empty} empty` : ''} · ${songs} ${songs === 1 ? 'song' : 'songs'}`;
  $('#restore').hidden = !items.some(i => i.source !== 'user' && isHidden(i));
}

function renderMusic(){
  const list = musicList(), pl = $('#playlist');
  pl.textContent = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.innerHTML = '<p class="pl-empty">No songs yet. Add MP3s here, tap one, and it keeps playing while you hit the pads.</p>';
    pl.append(li);
  }
  list.forEach((t, i) => {
    const li = document.createElement('li');
    const cur = t.id === currentId;
    li.innerHTML = `<button class="track${cur ? ' current' : ''}" type="button"><span class="num">${cur ? (audio.paused ? 'II' : '▶') : pad2(i + 1)}</span><span class="t-name"></span><span class="dur">${t.duration ? fmt(t.duration) : ''}</span></button>`
      + '<button class="rm" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg></button>';
    li.querySelector('.track').dataset.id = t.id;
    li.querySelector('.rm').dataset.rm = t.id;
    li.querySelector('.t-name').textContent = t.name;
    li.querySelector('.track').setAttribute('aria-label', `${cur && !audio.paused ? 'Now playing' : 'Play'} ${t.name}`);
    li.querySelector('.rm').setAttribute('aria-label', `Remove ${t.name}`);
    pl.append(li);
  });
  const t = byId(currentId), idx = currentIndex();
  setMarquee($('#lcd-name'), t ? t.name : (list.length ? 'Pick a song below' : 'Add songs below'));
  setMarquee($('#mini-name'), t ? t.name : (list.length ? 'Tap to pick a song' : 'Tap to add songs'));
  $('#lcd-trk').textContent = `TRK ${idx >= 0 ? pad2(idx + 1) : '--'}/${list.length ? pad2(list.length) : '--'}`;
  renderTransport();
  renderCount();
}
function renderAll(){ renderPads(); renderMusic(); }

function renderTransport(){
  const on = !audio.paused && !!currentId;
  const label = on ? 'Pause music' : 'Play music';
  ['#play', '#mini-play'].forEach(s => { const b = $(s); b.innerHTML = on ? ICON_PAUSE : ICON_PLAY; b.setAttribute('aria-label', label); });
  const status = !currentId ? 'NO SONG' : on ? '▶ PLAYING' : 'II PAUSED';
  $('#lcd-status').textContent = status;
  $('#mini-status').textContent = !currentId ? 'BACKGROUND MUSIC' : status;
  $('#seek').disabled = !currentId;
  const m = MODES[S.mode] || MODES.all;
  $('#mode-icon').innerHTML = m.icon;
  $('#mode-label').textContent = m.label;
  $('#mode').setAttribute('aria-label', `Playback mode: ${m.label}. Tap to change.`);
}
function renderTime(){
  const d = audio.duration, c = audio.currentTime;
  $('#lcd-time').textContent = fmt(c);
  $('#lcd-dur').textContent = fmt(d);
  if (!seeking) {
    const v = isFinite(d) && d > 0 ? Math.round(c / d * 1000) : 0;
    const s = $('#seek'); s.value = v; s.style.setProperty('--fill', (v / 10) + '%');
  }
}
function setMarquee(el, text){
  const mq = el.querySelector('.mq'), a = mq.querySelector('.a'), b = mq.querySelector('.b');
  if (a.textContent === text && el.dataset.checked === '1') return;
  a.textContent = text; b.textContent = text;
  mq.classList.remove('run'); el.dataset.checked = '0';
  requestAnimationFrame(() => {
    if (!el.clientWidth) return;
    el.dataset.checked = '1';
    if (!reduceMotion && a.offsetWidth > el.clientWidth + 2) {
      mq.style.setProperty('--dur', Math.max(6, text.length * 0.38) + 's');
      mq.classList.add('run');
    }
  });
}
function recheckMarquees(){ ['#lcd-name', '#mini-name'].forEach(s => { const el = $(s); el.dataset.checked = '0'; setMarquee(el, el.querySelector('.a').textContent); }); }

/* ================= storage (IndexedDB, this device only) ================= */
let dbp = null, dbOK = true;
function db(){
  if (!dbp) dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('meme-soundboard', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
    } catch (e) { rej(e); }
  });
  return dbp;
}
async function tx(mode, fn){
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('items', mode);
    const req = fn(t.objectStore('items'));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  });
}
async function dbPutUser(it){
  const data = await new Response(it.blob).arrayBuffer();
  return tx('readwrite', s => s.put({ id: it.id, kind: it.kind, name: it.name, color: it.color, type: it.blob.type || 'audio/mpeg', data, duration: it.duration || null, added: it.added }));
}
async function dbPutFill(it){
  const data = await new Response(it.fill).arrayBuffer();
  return tx('readwrite', s => s.put({ id: 'fill:' + it.id, kind: 'fill', target: it.id, name: it.fillName, type: it.fill.type || 'audio/mpeg', data, added: Date.now() }));
}
const dbDel = id => tx('readwrite', s => s.delete(id));
const dbAll = () => tx('readonly', s => s.getAll());
function storageFailed(){
  dbOK = false;
  $('#store-note').textContent = 'This browser isn’t saving sounds added with the buttons, so they last until you close the page. Files in the sounds folder always load.';
}

/* ================= adding & removing ================= */
async function addFiles(fileList, kind){
  const files = [...fileList].filter(isAudioFile);
  if (!files.length) { toast('Those files aren’t audio. Pick MP3, WAV or M4A files.'); return; }
  let seed = items.filter(i => i.kind === 'sfx').length, n = 0, unsaved = 0;
  for (const f of files) {
    const it = {
      id: 'u:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      kind, name: cleanName(f.name), color: COLORS[(seed++) % COLORS.length],
      source: 'user', blob: f, added: Date.now() + n
    };
    if (kind === 'music') it.duration = await probeDuration(f);
    items.push(it); n++;
    if (dbOK) { try { await dbPutUser(it); } catch (e) { unsaved++; } }
    if (kind === 'sfx' && ctx) getBuffer(it).catch(() => toast(`Couldn't read “${it.name}”. Try an MP3, WAV or M4A file.`));
  }
  renderAll();
  const what = kind === 'sfx' ? (n === 1 ? 'meme sound' : 'meme sounds') : (n === 1 ? 'song' : 'songs');
  toast(unsaved ? `Added ${n} ${what}. ${unsaved} couldn't be saved on this device, so ${unsaved === 1 ? 'it lasts' : 'they last'} until you close the page.`
                : kind === 'music' && !currentId ? `Added ${n} ${what}. Tap one to start the music.` : `Added ${n} ${what}.`);
}

let slotTarget = null;
function pickForSlot(it){ slotTarget = it; $('#file-slot').click(); }
function setFill(it, blob, name){
  if (it.objUrl) { URL.revokeObjectURL(it.objUrl); it.objUrl = null; }
  it.fill = blob; it.fillName = name; it.fillStamp = Date.now();
  refresh(it);
}
$('#file-slot').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0], it = slotTarget;
  e.target.value = ''; slotTarget = null;
  if (!f || !it) return;
  if (!isAudioFile(f)) { toast('That file isn’t audio. Pick an MP3, WAV or M4A file.'); return; }
  setFill(it, f, cleanName(f.name));
  scheduleRender();
  let saved = true;
  if (dbOK) { try { await dbPutFill(it); } catch (err) { saved = false; } } else saved = false;
  toast(saved ? `“${it.name}” is ready.` : `“${it.name}” is ready until you close the page.`);
  if (ctx) getBuffer(it).catch(() => toast(`Couldn't read “${it.name}”. Try an MP3, WAV or M4A file.`));
});

async function clearFill(it){
  stopSfx(it.id); updateDuck();
  buffers.delete(bufKey(it));
  setFill(it, null, '');
  if (dbOK) { try { await dbDel('fill:' + it.id); } catch (e) {} }
}
async function removeItem(it){
  if (it.kind === 'sfx') { stopSfx(it.id); updateDuck(); }
  if (it.kind === 'music' && it.id === currentId) {
    audio.pause(); audio.removeAttribute('src'); try { audio.load(); } catch (e) {}
    currentId = null; renderTime();
  }
  if (it.source === 'user') {
    items = items.filter(x => x !== it);
    buffers.delete(bufKey(it));
    if (it.objUrl) URL.revokeObjectURL(it.objUrl);
    if (dbOK) { try { await dbDel(it.id); } catch (e) {} }
  } else {
    if (!S.hidden.includes(it.id)) S.hidden.push(it.id);
    saveS('hidden');
  }
}

/* ================= edit dialog ================= */
let editItem = null, editColor = null, lastFocus = null;
const modal = $('#modal'), mName = $('#m-name'), mFile = $('#m-file'), mDel = $('#m-del');
function openEditor(it){
  editItem = it; editColor = it.color; lastFocus = document.activeElement;
  mName.value = it.name;
  const sw = $('#m-swatches'); sw.textContent = '';
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.style.setProperty('--c', c);
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', 'Color ' + (i + 1));
    b.setAttribute('aria-checked', String(c.toLowerCase() === String(editColor || '').toLowerCase()));
    b.onclick = () => { editColor = c; sw.querySelectorAll('.sw').forEach(x => x.setAttribute('aria-checked', String(x === b))); };
    sw.append(b);
  });
  mFile.textContent = '';
  if (it.source === 'config') {
    mFile.append('File: ');
    const code = document.createElement('code'); code.textContent = 'sounds/memes/' + it.file; mFile.append(code);
    mFile.append(it.fill ? ' (using a sound added on this device instead)' : it.status === 'missing' ? ' (not in the folder yet)' : '');
  } else mFile.textContent = it.source === 'user' ? 'Added on this device.' : 'Built-in sound.';
  mDel.textContent = it.source === 'user' ? 'Delete' : (it.source === 'config' && it.fill) ? 'Remove sound' : 'Hide button';
  modal.hidden = false;
  setTimeout(() => { mName.focus(); mName.select(); }, 30);
}
function closeEditor(){ modal.hidden = true; editItem = null; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('#m-cancel').onclick = closeEditor;
modal.addEventListener('click', e => { if (e.target === modal) closeEditor(); });
$('#m-save').onclick = async () => {
  const it = editItem; if (!it) return;
  const name = mName.value.trim() || it.name, color = editColor || it.color;
  if (it.source === 'user') {
    it.name = name; it.color = color;
    if (dbOK) { try { await dbPutUser(it); } catch (e) {} }
  } else {
    S.overrides[it.id] = { name, color }; saveS('overrides'); refresh(it);
  }
  closeEditor(); renderPads();
};
mName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#m-save').click(); } });
mDel.onclick = async () => {
  const it = editItem; if (!it) return;
  const name = it.name;
  if (it.source === 'config' && it.fill) { await clearFill(it); closeEditor(); renderAll(); toast(`Removed the sound from “${name}”.`); return; }
  await removeItem(it); closeEditor(); renderAll();
  toast(it.source === 'user' ? `Deleted “${name}”.` : `Hid “${name}”. Use “Show hidden buttons” at the bottom to bring it back.`);
};

/* ================= wiring ================= */
grid.addEventListener('click', e => {
  if (e.target.closest('[data-add]')) { $('#file-sfx').click(); return; }
  const b = e.target.closest('.pad'); if (!b) return;
  const it = byId(b.dataset.id); if (!it) return;
  if (document.body.classList.contains('editing')) openEditor(it); else playSfx(it);
});
q.addEventListener('input', renderPads);

$('#add-sfx').onclick = () => $('#file-sfx').click();
$('#add-music').onclick = () => $('#file-music').click();
$('#file-sfx').addEventListener('change', e => { addFiles(e.target.files, 'sfx'); e.target.value = ''; });
$('#file-music').addEventListener('change', e => { addFiles(e.target.files, 'music'); e.target.value = ''; });
$('#stop-sfx').onclick = () => stopAllSfx();

$('#edit').onclick = () => {
  const on = !document.body.classList.contains('editing');
  document.body.classList.toggle('editing', on);
  $('#edit').setAttribute('aria-pressed', String(on));
  $('#edit').textContent = on ? 'Done editing' : 'Edit buttons';
  $('#edit-hint').hidden = !on;
  renderPads();
};
$('#restore').onclick = () => { S.hidden = []; saveS('hidden'); renderAll(); toast('Hidden buttons are back.'); };

const sfxVol = $('#sfx-vol'), musicVol = $('#music-vol');
sfxVol.value = S.sfxVol; musicVol.value = S.musicVol;
sfxVol.addEventListener('input', () => {
  S.sfxVol = +sfxVol.value; saveS('sfxVol');
  if (sfxBus) sfxBus.gain.setTargetAtTime(S.sfxVol, ctx.currentTime, 0.02);
  for (const r of playing.values()) if (r.el) r.el.volume = S.sfxVol;
});
musicVol.addEventListener('input', () => { S.musicVol = +musicVol.value; saveS('musicVol'); applyMusicVolume(); });
$('#solo').checked = S.solo;
$('#solo').addEventListener('change', e => { S.solo = e.target.checked; saveS('solo'); });
$('#duck').checked = S.duck;
$('#duck').addEventListener('change', e => { S.duck = e.target.checked; saveS('duck'); updateDuck(); });

$('#play').onclick = togglePlay;
$('#mini-play').onclick = togglePlay;
$('#next').onclick = () => { if (musicList().length) nextTrack(); };
$('#prev').onclick = () => { if (musicList().length) prevTrack(); };
$('#mode').onclick = () => {
  const order = ['all', 'one', 'shuffle'];
  S.mode = order[(order.indexOf(S.mode) + 1) % order.length]; saveS('mode');
  audio.loop = S.mode === 'one';
  renderTransport();
  toast(MODES[S.mode].label + '.');
};
const seek = $('#seek');
seek.addEventListener('input', () => {
  seeking = true;
  seek.style.setProperty('--fill', (seek.value / 10) + '%');
  if (isFinite(audio.duration)) $('#lcd-time').textContent = fmt(seek.value / 1000 * audio.duration);
});
seek.addEventListener('change', () => {
  if (isFinite(audio.duration)) audio.currentTime = seek.value / 1000 * audio.duration;
  seeking = false;
});

$('#playlist').addEventListener('click', async e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { const it = byId(rm.dataset.rm); if (it) { await removeItem(it); renderAll(); toast(`Removed “${it.name}”.`); } return; }
  const tr = e.target.closest('.track'); if (!tr) return;
  if (tr.dataset.id === currentId) togglePlay();
  else playTrack(musicList().findIndex(t => t.id === tr.dataset.id));
});

const deck = $('#deck'), scrim = $('#scrim');
function openDeck(){ deck.classList.add('open'); scrim.classList.add('show'); requestAnimationFrame(() => { recheckMarquees(); drawViz(!audio.paused); }); }
function closeDeck(){ deck.classList.remove('open'); scrim.classList.remove('show'); requestAnimationFrame(recheckMarquees); }
$('#mini-open').onclick = openDeck;
$('#mini-expand').onclick = openDeck;
$('#deck-close').onclick = closeDeck;
scrim.onclick = closeDeck;

/* drag & drop: onto the music deck = songs, onto an empty slot = that slot, anywhere else = new meme pads */
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
window.addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  document.body.dataset.drop = e.target.closest && e.target.closest('.deck') ? 'music' : 'sfx';
});
window.addEventListener('dragleave', e => { if (!e.relatedTarget) delete document.body.dataset.drop; });
window.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  delete document.body.dataset.drop;
  const slotEl = e.target.closest && e.target.closest('.pad.slot');
  if (slotEl) {
    const it = byId(slotEl.dataset.id), f = [...e.dataTransfer.files].find(isAudioFile);
    if (it && f) {
      setFill(it, f, cleanName(f.name)); scheduleRender();
      if (dbOK) dbPutFill(it).catch(() => {});
      if (ctx) getBuffer(it).catch(() => {});
      toast(`“${it.name}” is ready.`);
      return;
    }
  }
  addFiles(e.dataTransfer.files, e.target.closest && e.target.closest('.deck') ? 'music' : 'sfx');
});

/* keyboard */
document.addEventListener('keydown', e => {
  if (!modal.hidden) { if (e.key === 'Escape') closeEditor(); return; }
  if (e.target.matches && e.target.matches('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { stopAllSfx(); if (deck.classList.contains('open')) closeDeck(); return; }
  if (e.key === ' ') { if (e.target.closest && e.target.closest('button')) return; e.preventDefault(); togglePlay(); return; }
  const i = KEYS.indexOf(e.key.toLowerCase());
  if (i >= 0 && visiblePads[i] && !e.repeat) {
    e.preventDefault();
    const it = visiblePads[i], el = padEls.get(it.id);
    if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 110); }
    if (document.body.classList.contains('editing')) openEditor(it); else playSfx(it);
  }
});
window.addEventListener('resize', () => { recheckMarquees(); drawViz(!audio.paused); });

/* ================= boot ================= */
async function boot(){
  if (CFG.title) { $('#title').textContent = CFG.title; document.title = CFG.title; }
  initCtx();

  (Array.isArray(CFG.memes) ? CFG.memes : []).forEach((m, i) => {
    if (!m || !m.file) return;
    items.push({ id: 'c:' + m.file, kind: 'sfx', source: 'config', file: m.file, order: i,
      url: 'sounds/memes/' + String(m.file).split('/').map(encodeURIComponent).join('/'),
      cfgName: (m.name || '').trim(), cfgColor: m.color, status: 'checking' });
  });
  (Array.isArray(CFG.music) ? CFG.music : []).forEach((m, i) => {
    if (!m || !m.file) return;
    items.push({ id: 'cm:' + m.file, kind: 'music', source: 'config', file: m.file, order: i,
      url: 'sounds/music/' + String(m.file).split('/').map(encodeURIComponent).join('/'),
      cfgName: (m.name || '').trim(), status: 'checking' });
  });
  if (SYN && CFG.showStarterSounds !== false) {
    SYN.starters.forEach(([synth, name, color], i) =>
      items.push({ id: 's:' + synth, kind: 'sfx', source: 'starter', synth, cfgName: name, cfgColor: color, order: i }));
  }
  if (SYN && CFG.showDemoMusic !== false) {
    items.push({ id: 's:lofi', kind: 'music', source: 'starter', demo: true, cfgName: 'Lo-fi Loop (demo)', order: 99, duration: SYN.demoDuration });
  }
  items.forEach(refresh);
  renderAll();
  drawViz(false);

  // sounds added earlier with the buttons on this device
  try {
    const recs = (await dbAll()) || [];
    recs.forEach(r => {
      const blob = new Blob([r.data], { type: r.type || 'audio/mpeg' });
      if (r.kind === 'fill') { const t = byId(r.target); if (t) setFill(t, blob, r.name); return; }
      items.push({ id: r.id, kind: r.kind, source: 'user', name: r.name, color: r.color, blob, duration: r.duration, added: r.added });
    });
  } catch (e) { storageFailed(); }
  renderAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(recheckMarquees);

  // check which files from config.js are really in the sounds folder
  await Promise.all(items.filter(i => i.source === 'config').map(i => i.kind === 'sfx' ? checkConfigSfx(i) : checkConfigMusic(i)));
  const missingSongs = items.filter(i => i.kind === 'music' && i.source === 'config' && i.status === 'missing');
  if (missingSongs.length) console.warn('[soundboard] Songs listed in config.js but not found in sounds/music/:', missingSongs.map(i => i.file).join(', '));

  // warm up the rest so the first tap is instant
  if (ctx) for (const it of sfxList()) { if (!isEmptySlot(it) && !(LOCAL && it.source === 'config' && !it.fill)) { try { await getBuffer(it); } catch (e) {} } }
  const demo = byId('s:lofi');
  if (demo && !isHidden(demo)) prepareDemo(demo).catch(() => {});
}
boot();

/* installable app + offline: only works when served over http(s), not when opened from a folder */
try {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
} catch (e) {}
})();
