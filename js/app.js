import { FACES, FONTS, WEIGHTS, DATE_STYLES, PALETTE, drawFrame, zonedParts } from './faces.js';

/* ---------------- settings ---------------- */
const prefers24h = (() => { try { return !new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12; } catch { return true; } })();
const DEFAULTS = {
  face: 'stacked', primary: '#f2f2f2', accent: '#ff5f4a', use24h: prefers24h, leadingZero: false,
  weight: '100', font: 'system', dateStyle: 'short', showDate: true, showBattery: true,
  customText: '', worldZone: 'Europe/London', scale: 1,
  brightness: 1, mode: 'always', peekSeconds: 10, scheduleStart: '07:00', scheduleEnd: '23:00',
  pixelShift: true, keepAwake: true, useBackground: false, backgroundDim: 0.78, seenWelcome: false,
};
const KEY = 'vigil.settings';
const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: settings last this session */ } }
function setS(patch) { Object.assign(S, patch); save(); redraw(true); refreshDrawer(); }

/* ---------------- live state ---------------- */
const state = { now: new Date(), battery: null, faceImage: null, background: null };
const canvas = document.getElementById('clock');
const ctx = canvas.getContext('2d');
let shiftStep = 0;
let peekUntil = 0;
let lastMinute = -1;

async function imgFromDataUrl(url) {
  if (!url) return null;
  const im = new Image();
  // decode() can stall while the window is hidden or minimized, so wait on load with a timeout instead.
  const ok = await new Promise(r => { const t = setTimeout(() => r(im.complete && im.naturalWidth > 0), 3000); im.onload = () => { clearTimeout(t); r(true); }; im.onerror = () => { clearTimeout(t); r(false); }; im.src = url; });
  return ok ? im : null;
}
async function loadImages() {
  try {
    state.faceImage = await imgFromDataUrl(localStorage.getItem('vigil.faceImage'));
    state.background = await imgFromDataUrl(localStorage.getItem('vigil.background'));
  } catch { /* storage blocked */ }
}

/* ---------------- visibility rules ---------------- */
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
function inSchedule(d) {
  const t = d.getHours() * 60 + d.getMinutes(), a = toMin(S.scheduleStart), b = toMin(S.scheduleEnd);
  return a === b ? true : a < b ? (t >= a && t < b) : (t >= a || t < b);
}
function clockVisible(now) {
  if (S.mode === 'peek') return Date.now() < peekUntil;
  if (S.mode === 'scheduled') return inSchedule(now) || Date.now() < peekUntil;
  return true;
}

/* ---------------- drawing ---------------- */
const SHIFT = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
function redraw(force) {
  state.now = new Date();
  const minute = state.now.getMinutes();
  if (minute !== lastMinute) { lastMinute = minute; if (S.pixelShift) shiftStep = (shiftStep + 1) % SHIFT.length; }
  const w = canvas.width, h = canvas.height;
  const u = Math.min(w, h) / 360;
  const off = S.pixelShift ? [SHIFT[shiftStep][0] * 4 * u, SHIFT[shiftStep][1] * 4 * u] : [0, 0];
  drawFrame(ctx, w, h, S, state, { offset: off });
  const vis = clockVisible(state.now);
  canvas.classList.toggle('off', !vis);
  canvas.style.opacity = vis ? String(S.brightness) : '0';
  void force;
}
function loop() {
  redraw();
  setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
}

/* ---------------- keep awake ---------------- */
let wakeLock = null, wakeStatus = 'off';
async function updateWake() {
  if (!S.keepAwake) { try { await wakeLock?.release(); } catch { /* */ } wakeLock = null; wakeStatus = 'off'; refreshWake(); return; }
  if (!('wakeLock' in navigator)) { wakeStatus = 'unsupported'; refreshWake(); return; }
  if (wakeLock && !wakeLock.released) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeStatus = 'on';
    wakeLock.addEventListener('release', () => { wakeStatus = document.visibilityState === 'visible' && S.keepAwake ? 'retry' : 'off'; refreshWake(); });
  } catch { wakeStatus = 'blocked'; }
  refreshWake();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { updateWake(); redraw(true); } });

/* ---------------- battery ---------------- */
(async () => {
  try {
    if (!navigator.getBattery) return;
    const b = await navigator.getBattery();
    const upd = () => { state.battery = { level: b.level, charging: b.charging }; redraw(true); };
    b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); upd();
  } catch { /* not available */ }
})();

/* ---------------- idle / input ---------------- */
let idleTimer = 0;
function activity() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (document.getElementById('drawer').hidden) document.body.classList.add('idle'); }, 3000);
  if (S.mode !== 'always') { const was = clockVisible(new Date()); peekUntil = Date.now() + S.peekSeconds * 1000; if (!was) redraw(true); }
}
['mousemove', 'mousedown', 'touchstart', 'wheel'].forEach(e => window.addEventListener(e, activity, { passive: true }));

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => { /* not allowed here */ });
}
canvas.addEventListener('dblclick', toggleFullscreen);
document.addEventListener('fullscreenchange', setHudIcons);

function cycleFace(d) {
  const i = FACES.findIndex(f => f[0] === S.face);
  setS({ face: FACES[(i + d + FACES.length) % FACES.length][0] });
  flash(FACES[(i + d + FACES.length) % FACES.length][1]);
}
let flashEl = null;
function flash(text) {
  flashEl?.remove();
  flashEl = Object.assign(document.createElement('div'), { textContent: text });
  Object.assign(flashEl.style, { position: 'fixed', left: '50%', top: '24px', transform: 'translateX(-50%)', background: 'rgba(17,18,22,.85)', border: '1px solid #2a2c34', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', color: '#ececf1', zIndex: 7, transition: 'opacity .5s' });
  document.body.append(flashEl);
  const el = flashEl; setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 1100);
}

window.addEventListener('keydown', e => {
  activity();
  if (e.target.closest?.('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'f') { e.preventDefault(); toggleFullscreen(); }
  else if (k === 's' || k === ',') { e.preventDefault(); openDrawer(); }
  else if (k === 'escape') closeDrawer();
  else if (e.key === 'ArrowRight') cycleFace(1);
  else if (e.key === 'ArrowLeft') cycleFace(-1);
});
window.addEventListener('resize', () => { sizeCanvas(); redraw(true); });

/* ---------------- HUD ---------------- */
const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};
function setHudIcons() {
  document.getElementById('btnSettings').innerHTML = ICON.gear;
  document.getElementById('btnFull').innerHTML = document.fullscreenElement ? ICON.exit : ICON.full;
  document.getElementById('btnFull').title = document.fullscreenElement ? 'Exit full screen (F)' : 'Full screen (F)';
}
document.getElementById('btnFull').addEventListener('click', toggleFullscreen);
document.getElementById('btnSettings').addEventListener('click', () => openDrawer());

/* ---------------- settings drawer ---------------- */
const drawer = document.getElementById('drawer');
const body = document.getElementById('drawerBody');
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && el.append(c instanceof Node ? c : document.createTextNode(c)));
  return el;
}
const toggle = (key, label, sub) => h('label', { class: 'row' },
  h('span', {}, label, sub ? h('small', {}, sub) : null),
  h('span', { class: 'toggle' }, h('input', { type: 'checkbox', checked: S[key], onchange: e => { setS({ [key]: e.target.checked }); if (key === 'keepAwake') updateWake(); } }), h('i')));
const seg = (key, opts, onPick) => h('div', { class: 'seg' }, opts.map(([v, l]) =>
  h('button', { type: 'button', 'aria-pressed': String(String(S[key]) === String(v)), onclick: () => { setS({ [key]: v }); onPick && onPick(v); } }, l)));
const select = (key, opts) => h('select', { onchange: e => setS({ [key]: e.target.value }), 'aria-label': key }, opts.map(([v, l]) => h('option', { value: v, selected: String(S[key]) === String(v) }, l)));
const range = (key, min, max, step, fmt) => {
  const out = h('small', {}, fmt(S[key]));
  const inp = h('input', { type: 'range', min, max, step, value: S[key], oninput: e => { S[key] = +e.target.value; out.textContent = fmt(S[key]); save(); redraw(true); } , onchange: () => refreshPreviews() });
  return [inp, out];
};

let previewTimer = 0;
const previews = [];
function refreshPreviews() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    for (const { canvas: c, face } of previews) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth * dpr || 320, hh = Math.round(w * 10 / 16);
      c.width = w; c.height = hh;
      drawFrame(c.getContext('2d'), w, hh, { ...S, face, scale: 1.45 }, { ...state, now: new Date() }, { background: true });
    }
  }, 60);
}

async function pickImage(key, maxSide, quality) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.click();
  await new Promise(r => inp.addEventListener('change', r, { once: true }));
  const f = inp.files?.[0]; if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', quality);
    try { localStorage.setItem(key, url); } catch { alert('That photo is too large to remember. Try a smaller one.'); return; }
    await loadImages();
    if (key === 'vigil.background') setS({ useBackground: true }); else { redraw(true); refreshDrawer(); }
  } catch { alert('That file couldn’t be opened as an image.'); }
}

let zones = null;
function timeZones() {
  if (zones) return zones;
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney']; }
  return zones;
}

function buildDrawer() {
  previews.length = 0;
  body.innerHTML = '';
  // Faces
  const faces = h('div', { class: 'faces' }, FACES.map(([id, title, blurb]) => {
    const c = h('canvas');
    previews.push({ canvas: c, face: id });
    return h('button', { class: 'face', type: 'button', title: blurb, 'aria-pressed': String(S.face === id), onclick: () => setS({ face: id }) }, c, h('span', {}, title));
  }));
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Clock face'), faces));

  // Face-specific options
  const extra = h('div', { class: 'sec' });
  if (S.face === 'signature') extra.append(h('h3', {}, 'Your line'), h('input', { type: 'text', maxlength: '60', value: S.customText, placeholder: 'Stay curious.', style: { width: '100%' }, oninput: e => { S.customText = e.target.value; save(); redraw(true); }, onchange: refreshPreviews }));
  if (S.face === 'image') extra.append(h('h3', {}, 'Photo'), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => pickImage('vigil.faceImage', 700, 0.85) }, state.faceImage ? 'Change photo' : 'Choose a photo'),
    state.faceImage ? h('button', { class: 'btn', type: 'button', onclick: () => { try { localStorage.removeItem('vigil.faceImage'); } catch { /* */ } state.faceImage = null; redraw(true); refreshDrawer(); } }, 'Remove') : null));
  if (S.face === 'world') {
    extra.append(h('h3', {}, 'Second city'), select('worldZone', timeZones().map(z => [z, z.replace(/_/g, ' ')])));
    extra.querySelector('select').style.maxWidth = '100%'; extra.querySelector('select').style.width = '100%';
  }
  if (extra.childNodes.length) body.append(extra);

  // Colours
  const sw = key => h('div', { class: 'swatches' }, PALETTE.map(([name, hex]) => h('button', { class: 'sw', type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(S[key] === hex), style: { background: hex }, onclick: () => setS({ [key]: hex }) })));
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Colours'), h('div', { class: 'lbl' }, 'Digits'), sw('primary'), h('div', { class: 'lbl' }, 'Accent'), sw('accent')));

  // Time
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Time'),
    h('div', { class: 'row' }, h('span', {}, 'Format'), seg('use24h', [[false, '12-hour'], [true, '24-hour']])),
    S.use24h ? null : toggle('leadingZero', 'Leading zero', 'Show 09:30 instead of 9:30'),
    h('div', { class: 'row' }, h('span', {}, 'Font'), select('font', Object.entries(FONTS).map(([k, v]) => [k, v.title]))),
    h('div', { class: 'lbl' }, 'Weight'), seg('weight', WEIGHTS),
    h('div', { class: 'row' }, h('span', {}, 'Size'), ...range('scale', 0.6, 1.8, 0.05, v => Math.round(v * 100) + '%'))));

  // Date & extras
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Date & extras'),
    toggle('showDate', 'Show date'),
    S.showDate ? h('div', { class: 'row' }, h('span', {}, 'Style'), select('dateStyle', DATE_STYLES)) : null,
    toggle('showBattery', 'Show battery', navigator.getBattery ? 'Laptops only' : 'Not available on this device')));

  // Background
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Background photo'),
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => pickImage('vigil.background', 1920, 0.82) }, state.background ? 'Change photo' : 'Choose a photo'),
      state.background ? h('button', { class: 'btn', type: 'button', onclick: () => { try { localStorage.removeItem('vigil.background'); } catch { /* */ } state.background = null; setS({ useBackground: false }); } }, 'Remove') : null),
    state.background ? toggle('useBackground', 'Show behind the clock') : null,
    state.background ? h('div', { class: 'row' }, h('span', {}, 'Darken'), ...range('backgroundDim', 0.3, 0.95, 0.01, v => Math.round(v * 100) + '%')) : null));

  // Display
  const wakeEl = h('div', { class: 'status', id: 'wakeStatus' });
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Display'),
    h('div', { class: 'lbl' }, 'When to show the clock'),
    seg('mode', [['always', 'Always'], ['peek', 'On move'], ['scheduled', 'Scheduled']]),
    h('p', { class: 'hint' }, { always: 'The clock is always on screen.', peek: 'The screen stays black until you move the mouse or press a key.', scheduled: 'The clock shows only between the hours below. Move the mouse to peek.' }[S.mode]),
    S.mode === 'peek' || S.mode === 'scheduled' ? h('div', { class: 'row' }, h('span', {}, 'Peek for'), select('peekSeconds', [[5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute']])) : null,
    S.mode === 'scheduled' ? h('div', { class: 'row' }, h('span', {}, 'From'), h('input', { type: 'time', value: S.scheduleStart, onchange: e => setS({ scheduleStart: e.target.value || '07:00' }) }), h('span', {}, 'to'), h('input', { type: 'time', value: S.scheduleEnd, onchange: e => setS({ scheduleEnd: e.target.value || '23:00' }) })) : null,
    h('div', { class: 'row' }, h('span', {}, 'Brightness'), ...range('brightness', 0.08, 1, 0.01, v => Math.round(v * 100) + '%')),
    toggle('pixelShift', 'Burn-in protection', 'Nudges the clock a few pixels every minute'),
    toggle('keepAwake', 'Keep the screen on', 'Stops Windows dimming or sleeping the display'),
    wakeEl));

  // Help
  body.append(h('div', { class: 'sec' }, h('h3', {}, 'Shortcuts'),
    h('p', { class: 'hint', style: { lineHeight: '1.9' } }, h('kbd', {}, 'F'), ' full screen  ', h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' change face  ', h('kbd', {}, 'S'), ' settings  ', h('kbd', {}, 'Esc'), ' close'),
    h('p', { class: 'hint' }, 'Vigil 1.0 · © 2026 LumioLab · No accounts, no tracking. Your settings and photos stay on this PC. ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener', style: { color: 'var(--muted)' } }, 'Privacy policy'))));

  refreshWake();
  requestAnimationFrame(refreshPreviews); refreshPreviews();
}
function refreshWake() {
  const el = document.getElementById('wakeStatus'); if (!el) return;
  const t = { on: 'Screen will stay on while Vigil is open', off: 'Off: Windows may dim or sleep the screen', unsupported: 'Not supported on this device', blocked: 'Windows didn’t allow it (battery saver?)', retry: 'Paused. It resumes when you return to Vigil' }[wakeStatus];
  el.className = 'status' + (wakeStatus === 'on' ? ' on' : '');
  el.innerHTML = ''; el.append(h('i'), t);
}
function refreshDrawer() {
  if (drawer.hidden) return;
  const scroll = body.scrollTop;
  buildDrawer();
  body.scrollTop = scroll;
}
function openDrawer() { drawer.hidden = false; document.body.classList.add('drawer-open'); document.body.classList.remove('idle'); buildDrawer(); drawer.querySelector('.face[aria-pressed="true"]')?.focus({ preventScroll: true }); }
function closeDrawer() { drawer.hidden = true; document.body.classList.remove('drawer-open'); activity(); }
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
canvas.addEventListener('click', () => { if (!drawer.hidden) closeDrawer(); });

/* ---------------- boot ---------------- */
(async () => {
  // Offline cache first, so nothing below can hold it up.
  const devHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw=1');
  if ('serviceWorker' in navigator && !devHost) navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
  setHudIcons();
  sizeCanvas();
  await loadImages();
  try { await document.fonts.load(`100 40px ${FONTS[S.font]?.stack || 'sans-serif'}`); } catch { /* */ }
  loop();
  activity();
  updateWake();
  // Wake locks need a user gesture on some systems: retry on first input.
  window.addEventListener('pointerdown', updateWake, { once: true });
  window.addEventListener('keydown', updateWake, { once: true });
  if (!S.seenWelcome) {
    const w = document.getElementById('welcome'); w.hidden = false;
    document.getElementById('welcomeOk').addEventListener('click', () => { w.hidden = true; setS({ seenWelcome: true }); });
  }
  // Fonts finish loading after first paint: redraw so the right face shows.
  document.fonts.addEventListener?.('loadingdone', () => { redraw(true); refreshPreviews(); });
})();
void zonedParts;
