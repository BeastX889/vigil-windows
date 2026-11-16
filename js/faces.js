// Vigil clock faces, ported from the Android painter (aod/faces/*.kt) to Canvas 2D.
// Every face draws around (cx, cy) in "design pixels" (u = 1/360 of the short side)
// and returns the lowest y it painted, so extras can stack beneath it.

export const FACES = [
  ['stacked', 'Stacked', 'Hours over minutes, one accent digit'],
  ['classic', 'Classic', 'Big time, date beneath'],
  ['thin', 'Thin', 'Hairline digits, accent colon'],
  ['analog', 'Analog', 'Four ticks, two hands'],
  ['analogClassic', 'Analog Classic', 'Numerals and a full tick ring'],
  ['edge', 'Edge', 'Time set along the screen edge'],
  ['calendar', 'Calendar', 'This month, today marked'],
  ['signature', 'Signature', 'Your own line of text'],
  ['image', 'Image', 'A photo of yours, dimmed'],
  ['world', 'World', 'Local time plus one more city'],
];

export const WEIGHTS = [['100', 'Thin'], ['300', 'Light'], ['400', 'Regular'], ['700', 'Bold']];

export const FONTS = {
  system: { title: 'System', stack: '"Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,sans-serif' },
  condensed: { title: 'Condensed', stack: '"Bahnschrift Condensed","Bahnschrift SemiCondensed","Arial Narrow","Roboto Condensed",sans-serif' },
  serif: { title: 'Serif', stack: 'Cambria,Georgia,"Times New Roman",serif' },
  mono: { title: 'Mono', stack: '"Cascadia Mono",Consolas,"SF Mono",monospace' },
  orbitron: { title: 'Orbitron', stack: '"Orbitron",sans-serif', min: 400, max: 900 },
  bebas: { title: 'Bebas Neue', stack: '"Bebas Neue",sans-serif', min: 400, max: 400 },
  playfair: { title: 'Playfair Display', stack: '"Playfair Display",serif', min: 400, max: 900 },
  comfortaa: { title: 'Comfortaa', stack: '"Comfortaa",sans-serif', min: 300, max: 700 },
  spacemono: { title: 'Space Mono', stack: '"Space Mono",monospace', min: 400, max: 700 },
};

export const DATE_STYLES = [
  ['short', 'MON, NOV 16'], ['long', 'Monday, November 16'], ['dayMonth', '16 November'], ['weekday', 'Monday'],
  ['dmy', '16/11/2026'], ['mdy', '11/16/2026'], ['iso', '2026-11-16'],
];

export const PALETTE = [
  ['White', '#f2f2f2'], ['Silver', '#b8bcc4'], ['Coral', '#ff5f4a'], ['Amber', '#ffb13b'],
  ['Gold', '#e8c36a'], ['Lime', '#a6e05a'], ['Mint', '#4fd8b0'], ['Cyan', '#3fd0f0'],
  ['Sky', '#5fa8ff'], ['Indigo', '#8b7cff'], ['Violet', '#c077ff'], ['Rose', '#ff6fa8'],
];

const SANS = '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
const SERIF_ITALIC = 'Georgia,Cambria,"Times New Roman",serif';
const TAU = Math.PI * 2;
const pad2 = n => String(n).padStart(2, '0');

function rgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

/** Wall-clock parts of `date` in a time zone (local when tz is undefined). */
export function zonedParts(date, tz) {
  if (!tz) return { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), h: date.getHours(), mi: date.getMinutes(), s: date.getSeconds(), dow: date.getDay() };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' })
    .formatToParts(date).map(x => [x.type, x.value]));
  const dows = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +p.year, mo: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, dow: dows[p.weekday] };
}

export class FaceContext {
  constructor(ctx, width, height, settings, state) {
    this.ctx = ctx; this.width = width; this.height = height; this.s = settings; this.state = state;
    // Phones are portrait (designed at 360 wide); on landscape monitors the short side is the
    // height, so use a slightly larger divisor to leave room for the date and extras.
    this.u = Math.min(width, height) / (height > width ? 360 : 440) * settings.scale;
    this.cx = width / 2;
    // Portrait screens follow the phone (a little above centre); landscape monitors sit nearer the middle.
    this.cy = height * (height > width ? 0.40 : 0.44);
    this.now = state.now;
    this.t = zonedParts(this.now);
  }
  get primary() { return this.s.primary; }
  get accent() { return this.s.accent; }
  get timeFamily() { return FONTS[this.s.font]?.stack || FONTS.system.stack; }
  get timeWeight() {
    const f = FONTS[this.s.font] || {};
    let w = +this.s.weight;
    if (f.min) w = Math.max(f.min, Math.min(f.max, w));
    return w;
  }

  hours(pad = this.s.use24h || this.s.leadingZero) {
    const h = this.s.use24h ? this.t.h : ((this.t.h + 11) % 12 + 1);
    return pad ? pad2(h) : String(h);
  }
  minutes() { return pad2(this.t.mi); }
  timeText() { return `${this.hours()}:${this.minutes()}`; }
  amPm() { return this.s.use24h ? null : (this.t.h < 12 ? 'AM' : 'PM'); }

  dateText() {
    const d = this.now, st = this.s.dateStyle;
    const t = this.t;
    switch (st) {
      case 'long': return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      case 'dayMonth': return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
      case 'weekday': return d.toLocaleDateString(undefined, { weekday: 'long' });
      case 'dmy': return `${pad2(t.d)}/${pad2(t.mo + 1)}/${t.y}`;
      case 'mdy': return `${pad2(t.mo + 1)}/${pad2(t.d)}/${t.y}`;
      case 'iso': return `${t.y}-${pad2(t.mo + 1)}-${pad2(t.d)}`;
      default: return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toLocaleUpperCase();
    }
  }

  /** Configure the context for text. letterSpacing is in em, like Android. */
  font(size, color, { family = SANS, weight = 400, italic = false, align = 'center', ls = 0, alpha = 1 } = {}) {
    const c = this.ctx;
    c.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
    c.fillStyle = rgba(color, alpha);
    c.textAlign = align;
    c.textBaseline = 'alphabetic';
    if ('letterSpacing' in c) c.letterSpacing = ls ? `${ls * size}px` : '0px';
    return c;
  }
  timeFont(size, color, align = 'center') { return this.font(size, color, { family: this.timeFamily, weight: this.timeWeight, align }); }

  /** Text whose line box is centred on y. */
  textCentered(text, x, y) {
    const m = this.ctx.measureText(text);
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent, desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    this.ctx.fillText(text, x, y + (asc - desc) / 2);
  }
  /** Ink bounds of text relative to its baseline/anchor. */
  ink(text) {
    const m = this.ctx.measureText(text);
    return { left: -m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, top: -m.actualBoundingBoxAscent, bottom: m.actualBoundingBoxDescent, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, adv: m.width };
  }
  /** Text whose glyph ink is centred on y; returns the painted rect. */
  inkCentered(text, x, y) {
    const b = this.ink(text);
    const baseline = y - (b.top + b.bottom) / 2;
    this.ctx.fillText(text, x, baseline);
    return { left: x + b.left, right: x + b.right, top: baseline + b.top, bottom: baseline + b.bottom, width: b.width, height: b.height };
  }
  ellipsize(text, maxW) {
    if (this.ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && this.ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  line(x0, y0, x1, y1, width, color, alpha = 1, round = true) {
    const c = this.ctx;
    c.strokeStyle = rgba(color, alpha); c.lineWidth = width; c.lineCap = round ? 'round' : 'butt';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  circle(x, y, r, { fill, stroke, width = 1, alpha = 1 } = {}) {
    const c = this.ctx;
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = rgba(fill, alpha); c.fill(); }
    if (stroke) { c.strokeStyle = rgba(stroke, alpha); c.lineWidth = width; c.stroke(); }
  }
  dateLine(y, { size = 13, ls = 0.22, alpha = 0.8, weight = 400 } = {}) {
    this.font(size * this.u, this.primary, { ls, alpha, weight });
    this.textCentered(this.dateText(), this.cx, y);
  }
}

/* ------------------------------------------------------------------ digital */

function stacked(f) {
  const { u, cx, cy, ctx } = f;
  const size = 132 * u;
  const hours = f.hours(true), minutes = f.minutes();
  f.timeFont(size, f.primary);
  const hb = f.ink(hours), mb = f.ink(minutes);
  const gap = 6 * u;
  const hoursBaseline = cy - gap / 2 - hb.bottom;
  const minutesBaseline = cy + gap / 2 - mb.top;
  const head = hours.slice(0, -1), tail = hours.slice(-1);
  f.timeFont(size, f.primary, 'left');
  const headW = ctx.measureText(head).width, tailW = ctx.measureText(tail).width;
  const startX = cx - (headW + tailW) / 2;
  ctx.fillText(head, startX, hoursBaseline);
  f.timeFont(size, f.accent, 'left');
  ctx.fillText(tail, startX + headW, hoursBaseline);
  f.timeFont(size, f.primary);
  ctx.fillText(minutes, cx, minutesBaseline);
  let bottom = minutesBaseline + mb.bottom;
  const ap = f.amPm();
  if (ap) { f.font(14 * u, f.primary, { ls: 0.18, alpha: 0.7 }); f.textCentered(ap, cx + mb.width / 2 + 16 * u, minutesBaseline + mb.top + 8 * u); }
  if (f.s.showDate) { const y = bottom + 26 * u; f.dateLine(y); bottom = y + 8 * u; }
  return bottom;
}

function classic(f) {
  const { u, cx, cy } = f;
  f.timeFont(84 * u, f.primary);
  const b = f.inkCentered(f.timeText(), cx, cy);
  const ap = f.amPm();
  if (ap) { f.font(16 * u, f.primary, { align: 'left', ls: 0.12, alpha: 0.75 }); f.ctx.fillText(ap, cx + b.width / 2 + 8 * u, b.top + 14 * u); }
  let bottom = b.bottom;
  if (f.s.showDate) { const y = bottom + 24 * u; f.dateLine(y, { size: 15, ls: 0.14 }); bottom = y + 8 * u; }
  return bottom;
}

function thin(f) {
  const { u, cx, cy, ctx } = f;
  const size = 104 * u;
  const h = f.hours(), m = f.minutes();
  f.timeFont(size, f.primary, 'left');
  const wH = ctx.measureText(h).width, wC = ctx.measureText(':').width, wM = ctx.measureText(m).width;
  const x = cx - (wH + wC + wM) / 2;
  const b = f.ink(`${h}:${m}`);
  const baseline = cy - (b.top + b.bottom) / 2;
  ctx.fillText(h, x, baseline);
  f.timeFont(size, f.accent, 'left'); ctx.fillText(':', x + wH, baseline);
  f.timeFont(size, f.primary, 'left'); ctx.fillText(m, x + wH + wC, baseline);
  let bottom = baseline + b.bottom;
  const ap = f.amPm();
  if (ap) { f.font(14 * u, f.primary, { align: 'left', ls: 0.14, alpha: 0.7 }); ctx.fillText(ap, x + wH + wC + wM + 8 * u, baseline + b.top + 12 * u); }
  if (f.s.showDate) { const y = bottom + 22 * u; f.dateLine(y, { ls: 0.24, alpha: 0.75, weight: 300 }); bottom = y + 8 * u; }
  return bottom;
}

function edge(f) {
  const { u, ctx } = f;
  const size = 118 * u;
  const time = f.timeText();
  const edgeX = 58 * u;
  const centreY = f.height * 0.46;
  f.timeFont(size, f.primary);
  const b = f.ink(time);
  ctx.save(); ctx.translate(edgeX, centreY); ctx.rotate(-Math.PI / 2); f.inkCentered(time, 0, 0); ctx.restore();
  const dateX = edgeX + b.height / 2 + 18 * u;
  if (f.s.showDate) {
    ctx.save(); ctx.translate(dateX, centreY); ctx.rotate(-Math.PI / 2);
    f.font(13 * u, f.primary, { ls: 0.22, alpha: 0.8 }); f.textCentered(f.dateText(), 0, 0); ctx.restore();
  }
  const ap = f.amPm();
  if (ap) {
    ctx.save(); ctx.translate(dateX, centreY); ctx.rotate(-Math.PI / 2);
    f.font(14 * u, f.accent, { ls: 0.18 }); f.textCentered(ap, b.width / 2 + 24 * u, 0); ctx.restore();
  }
  return f.height * 0.72;
}

/* ------------------------------------------------------------------- analog */

function hands(f, r, hourW, minW) {
  const { cx, cy } = f;
  const minute = f.t.mi, hour = f.t.h % 12 + minute / 60;
  const ma = minute / 60 * TAU - TAU / 4, ha = hour / 12 * TAU - TAU / 4;
  f.line(cx, cy, cx + Math.cos(ha) * r * 0.52, cy + Math.sin(ha) * r * 0.52, hourW, f.primary);
  f.line(cx, cy, cx + Math.cos(ma) * r * 0.78, cy + Math.sin(ma) * r * 0.78, minW, f.primary);
  f.circle(cx, cy, hourW * 1.1, { fill: f.accent });
}

function analog(f) {
  const { u, cx, cy } = f;
  const r = 96 * u;
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU;
    f.line(cx + Math.cos(a) * (r - 10 * u), cy + Math.sin(a) * (r - 10 * u), cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 * u, f.primary, 0.55);
  }
  hands(f, r, 4 * u, 3 * u);
  let bottom = cy + r;
  if (f.s.showDate) { const y = bottom + 22 * u; f.dateLine(y); bottom = y + 8 * u; }
  return bottom;
}

function analogClassic(f) {
  const { u, cx, cy } = f;
  const r = 104 * u;
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU, major = i % 5 === 0, len = major ? 10 * u : 5 * u;
    f.line(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len), cx + Math.cos(a) * r, cy + Math.sin(a) * r, major ? 2.2 * u : 1.2 * u, f.primary, major ? 0.8 : 0.35, false);
  }
  f.font(17 * u, f.primary, { weight: 300, alpha: 0.9 });
  const nr = r - 24 * u;
  f.textCentered('12', cx, cy - nr); f.textCentered('3', cx + nr, cy); f.textCentered('6', cx, cy + nr); f.textCentered('9', cx - nr, cy);
  hands(f, r, 4.5 * u, 3 * u);
  let bottom = cy + r;
  if (f.s.showDate) { const y = bottom + 22 * u; f.dateLine(y); bottom = y + 8 * u; }
  return bottom;
}

/* ------------------------------------------------------------------ special */

function firstDayOfWeek() {
  try { const fd = new Intl.Locale(navigator.language).getWeekInfo?.().firstDay ?? new Intl.Locale(navigator.language).weekInfo?.firstDay; if (fd) return fd % 7; } catch { /* */ }
  return 0; // Sunday
}

function calendar(f) {
  const { u, cx, cy, ctx } = f;
  const cell = 30 * u, gridW = cell * 7, left = cx - gridW / 2;
  const { y: yr, mo, d: today } = f.t;
  const title = `${new Date(yr, mo, 1).toLocaleDateString(undefined, { month: 'long' }).toLocaleUpperCase()} ${yr}`;
  let y = cy - 96 * u;
  f.timeFont(44 * u, f.primary); f.inkCentered(f.timeText(), cx, y);
  y += 48 * u;
  f.font(12 * u, f.primary, { weight: 600, ls: 0.2, alpha: 0.85 }); f.textCentered(title, cx, y);
  y += 26 * u;
  const first = firstDayOfWeek();
  f.font(10 * u, f.primary, { alpha: 0.45 });
  for (let i = 0; i < 7; i++) {
    const dow = (first + i) % 7;
    const label = new Date(2023, 0, 1 + dow).toLocaleDateString(undefined, { weekday: 'narrow' }); // 1 Jan 2023 was a Sunday
    f.textCentered(label, left + cell * i + cell / 2, y);
  }
  y += cell * 0.8;
  const offset = (new Date(yr, mo, 1).getDay() - first + 7) % 7;
  const days = new Date(yr, mo + 1, 0).getDate();
  let row = 0;
  for (let day = 1; day <= days; day++) {
    const col = (offset + day - 1) % 7; row = Math.floor((offset + day - 1) / 7);
    const px = left + cell * col + cell / 2, py = y + cell * row + cell / 2;
    if (day === today) { f.circle(px, py, cell * 0.42, { fill: f.accent }); f.font(12 * u, '#000000', { weight: 600 }); }
    else f.font(12 * u, f.primary, { alpha: 0.85 });
    f.textCentered(String(day), px, py);
  }
  void ctx;
  return y + cell * (row + 1) + 6 * u;
}

function signature(f) {
  const { u, cx, cy } = f;
  f.timeFont(64 * u, f.primary);
  const b = f.inkCentered(f.timeText(), cx, cy - 18 * u);
  const ap = f.amPm();
  if (ap) { f.font(13 * u, f.primary, { align: 'left', ls: 0.12, alpha: 0.7 }); f.ctx.fillText(ap, cx + b.width / 2 + 8 * u, b.top + 12 * u); }
  const text = (f.s.customText || '').trim() || 'Stay curious.';
  f.font(26 * u, f.accent, { family: SERIF_ITALIC, italic: true });
  const y = b.bottom + 34 * u;
  f.textCentered(f.ellipsize(text, f.width * 0.86), cx, y);
  let bottom = y + 14 * u;
  if (f.s.showDate) { bottom += 20 * u; f.dateLine(bottom, { size: 12, alpha: 0.7 }); bottom += 8 * u; }
  return bottom;
}

function image(f) {
  const { u, cx, cy, ctx } = f;
  const r = 86 * u, imgCy = cy - 40 * u;
  const img = f.state.faceImage;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, imgCy, r, 0, TAU); ctx.clip();
    const sc = Math.max(2 * r / img.width, 2 * r / img.height);
    ctx.drawImage(img, cx - img.width * sc / 2, imgCy - img.height * sc / 2, img.width * sc, img.height * sc);
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(cx - r, imgCy - r, 2 * r, 2 * r);
    ctx.restore();
  } else {
    f.circle(cx, imgCy, r, { stroke: f.primary, width: 1.5 * u, alpha: 0.35 });
    f.font(12 * u, f.primary, { alpha: 0.5 }); f.textCentered('Pick a photo in Settings', cx, imgCy);
  }
  f.circle(cx, imgCy, r, { stroke: f.accent, width: 1.2 * u, alpha: 0.9 });
  f.timeFont(52 * u, f.primary);
  const b = f.inkCentered(f.timeText(), cx, imgCy + r + 44 * u);
  let bottom = b.bottom;
  if (f.s.showDate) { bottom += 22 * u; f.dateLine(bottom, { size: 12, alpha: 0.75 }); bottom += 8 * u; }
  return bottom;
}

function world(f) {
  const { u, cx, cy } = f;
  f.timeFont(72 * u, f.primary);
  const b = f.inkCentered(f.timeText(), cx, cy - 26 * u);
  const ap = f.amPm();
  if (ap) { f.font(14 * u, f.primary, { align: 'left', ls: 0.12, alpha: 0.7 }); f.ctx.fillText(ap, cx + b.width / 2 + 8 * u, b.top + 12 * u); }
  let y = b.bottom + 20 * u;
  if (f.s.showDate) { f.dateLine(y, { size: 12, alpha: 0.75 }); y += 30 * u; } else y += 12 * u;
  const tz = f.s.worldZone || 'Europe/London';
  let there;
  try { there = zonedParts(f.now, tz); } catch { there = zonedParts(f.now, 'UTC'); }
  const city = tz.split('/').pop().replace(/_/g, ' ');
  const thereTime = f.s.use24h ? `${pad2(there.h)}:${pad2(there.mi)}` : `${(there.h + 11) % 12 + 1}:${pad2(there.mi)} ${there.h < 12 ? 'AM' : 'PM'}`;
  // offset difference in minutes, from the wall-clock difference
  const local = f.t;
  const diffMin = Math.round((Date.UTC(there.y, there.mo, there.d, there.h, there.mi) - Date.UTC(local.y, local.mo, local.d, local.h, local.mi)) / 60000);
  const sign = diffMin >= 0 ? '+' : '−', abs = Math.abs(diffMin);
  const diff = abs === 0 ? 'Same time' : abs % 60 === 0 ? `${sign}${abs / 60}h` : `${sign}${Math.floor(abs / 60)}h${abs % 60}`;
  f.line(cx - 40 * u, y, cx + 40 * u, y, 1 * u, f.primary, 0.25);
  y += 22 * u;
  f.font(11 * u, f.accent, { weight: 600, ls: 0.24 }); f.textCentered(city.toLocaleUpperCase(), cx, y);
  y += 26 * u;
  f.font(32 * u, f.primary, { weight: 300 }); f.inkCentered(thereTime, cx, y);
  y += 26 * u;
  f.font(11 * u, f.primary, { alpha: 0.55 }); f.textCentered(diff, cx, y);
  return y + 8 * u;
}

const PAINTERS = { stacked, classic, thin, analog, analogClassic, edge, calendar, signature, image, world };

/** Extras beneath the face: battery for now (the web has no notifications or media). */
function extras(f, bottom) {
  const { u, cx } = f;
  const bat = f.state.battery;
  if (f.s.showBattery && bat && bat.level != null) {
    const y = Math.min(f.height - 24 * u, bottom + 30 * u);
    const pct = Math.round(bat.level * 100);
    const text = `${pct}%`;
    f.font(12 * u, f.primary, { ls: 0.12, alpha: 0.7 });
    const w = f.ctx.measureText(text).width;
    // small battery glyph
    const bw = 18 * u, bh = 9 * u, gx = cx - (bw + 6 * u + w) / 2, gy = y - bh / 2;
    const c = f.ctx;
    c.strokeStyle = rgba(f.primary, 0.6); c.lineWidth = 1.2 * u;
    c.strokeRect(gx, gy, bw, bh);
    c.fillStyle = rgba(f.primary, 0.6); c.fillRect(gx + bw, gy + bh * 0.3, 1.8 * u, bh * 0.4);
    c.fillStyle = bat.charging ? rgba(f.accent, 0.95) : rgba(pct <= 15 ? '#ff5f4a' : f.primary, 0.75);
    c.fillRect(gx + 1.6 * u, gy + 1.6 * u, Math.max(0, (bw - 3.2 * u) * bat.level), bh - 3.2 * u);
    f.font(12 * u, f.primary, { ls: 0.12, alpha: 0.7, align: 'left' });
    f.textCentered(text + (bat.charging ? '  ·  Charging' : ''), gx + bw + 6 * u, y);
  }
}

/** Draw a full frame. `offset` is the burn-in shift in device px. */
export function drawFrame(ctx, w, h, settings, state, { offset = [0, 0], background = true } = {}) {
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (background && settings.useBackground && state.background) {
    const img = state.background;
    const sc = Math.max(w / img.width, h / img.height);
    ctx.drawImage(img, (w - img.width * sc) / 2, (h - img.height * sc) / 2, img.width * sc, img.height * sc);
    ctx.fillStyle = `rgba(0,0,0,${settings.backgroundDim})`; ctx.fillRect(0, 0, w, h);
  }
  ctx.translate(offset[0], offset[1]);
  const f = new FaceContext(ctx, w, h, settings, state);
  const bottom = (PAINTERS[settings.face] || stacked)(f);
  extras(f, bottom);
  ctx.restore();
}
