// All artwork is drawn from code (rects + discs), so the game ships with zero
// image files. Everything here is original: the frog is modelled on the real
// 翡翠樹蛙 (green back, pale belly, golden eyes with orange rim), the delivery
// rider uses an invented indigo/peach/mint scheme, shops are fictional.
import { mulberry32 } from './rng.js';

export const PAL = {
  asphalt: '#4a4f5c', asphalt2: '#434854', asphalt3: '#525867',
  line: '#e9e6d8', yellow: '#f2c230',
  grass: '#5fae4a', grass2: '#4b9a3d', grass3: '#78c45c',
  curb: '#c9c4b4', curb2: '#a9a496', tile: '#bdb8a8', tile2: '#b1ac9c',
  frog: '#4fcf63', frog2: '#2f9e4a', frog3: '#8ae89a', belly: '#f2f7dc',
  eyeRim: '#ff8a2a', eye: '#f6d55c', ink: '#1f2430',
  water: '#59c8ff', water2: '#b8ecff',
};

const CAR_COLORS = ['#e8553d', '#4d8fd6', '#f1eee4', '#2f3441', '#8e6bd1', '#3fb68b', '#c4c8d2', '#e08a2e'];
const HELMETS = ['#e8553d', '#f1eee4', '#4d8fd6', '#f2c230', '#2f3441', '#3fb68b', '#e07ab0', '#8e6bd1'];
const JACKETS = ['#2f3441', '#6b7280', '#3f7d5a', '#a65d3f', '#4d5f8f', '#7a4a7a', '#b5a642', '#566'];

export const fr = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

// filled ellipse, pixel-snapped, in units of `s` device px
function disc(c, cx, cy, rx, ry, col, s = 1) {
  c.fillStyle = col;
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y < y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    if (x1 > x0) c.fillRect(x0 * s, y * s, (x1 - x0) * s, s);
  }
}

// ------------------------------------------------------------------ frog
// Top-down, facing up (-y). Origin = centre.
export function drawFrogTop(c, { squash = 0, stretch = 0, blink = false } = {}) {
  const sx = 1 + squash * 0.18 - stretch * 0.12, sy = 1 - squash * 0.2 + stretch * 0.25;
  c.save();
  c.scale(sx, sy);
  const G = PAL.frog, G2 = PAL.frog2, B = PAL.belly;
  // hind legs (folded)
  for (const m of [-1, 1]) {
    c.save(); c.scale(m, 1);
    disc(c, 5, 4, 3, 4.5, G2);
    disc(c, 5.5, 7.5, 2.5, 1.6, G2);
    fr(c, 5, 9, 2, 1, B); fr(c, 7, 8, 1, 1, B); fr(c, 3, 9, 1, 1, B);   // toe pads
    c.restore();
  }
  disc(c, 0, 1.5, 4.8, 6.2, G);        // body
  disc(c, 0, 0.5, 2.6, 3.6, PAL.frog3); // back highlight
  fr(c, -5, 0, 1, 5, B); fr(c, 4, 0, 1, 5, B); // pale flank line
  // front legs
  for (const m of [-1, 1]) {
    c.save(); c.scale(m, 1);
    fr(c, 4, -3, 2, 4, G2);
    fr(c, 5, 0, 3, 2, G2);
    fr(c, 7, 1, 2, 2, B); fr(c, 6, 3, 1, 1, B);
    c.restore();
  }
  disc(c, 0, -4.5, 4.2, 3.4, G);       // head
  fr(c, -3, -7, 6, 1, B);              // pale lip line
  // eyes
  for (const m of [-1, 1]) {
    c.save(); c.scale(m, 1);
    disc(c, 2.8, -6, 2.4, 2.3, PAL.eyeRim);
    disc(c, 2.8, -6, 1.7, 1.6, PAL.eye);
    if (!blink) fr(c, 1, -6, 3, 1, PAL.ink); // horizontal slit pupil
    c.restore();
  }
  c.restore();
}

// Side view, facing right. Origin = feet-centre. `s` = pixel size in device px.
export function drawFrogSide(c, x, y, s, { blink = false, palette } = {}) {
  const P = palette || { g: PAL.frog, g2: PAL.frog2, g3: PAL.frog3, b: PAL.belly };
  c.save();
  c.translate(x, y);
  const D = (cx, cy, rx, ry, col) => disc(c, cx, cy, rx, ry, col, s);
  const Rr = (rx, ry, w, h, col) => fr(c, rx * s, ry * s, w * s, h * s, col);
  // hind leg (folded thigh + long foot with toe pads)
  D(-7, -5, 6.5, 5, P.g2); D(-8, -6.5, 4, 2.5, P.g);
  Rr(-15, -1, 10, 2, P.g2); D(-15.5, -0.5, 1.3, 1.1, P.b); D(-13, 0, 1.1, 0.9, P.b);
  // body: pale belly peeks out under the green back
  D(0, -6.5, 11.5, 8, P.b);
  D(0, -9, 11.5, 7.5, P.g);
  D(-1, -11.5, 7.5, 3, P.g3);
  // head
  D(9, -10, 7, 5.2, P.g);
  Rr(4, -7, 13, 1, P.b);                       // pale lip line
  D(11, -9, 4.5, 2.5, P.g);
  // golden eye with orange rim and horizontal pupil
  D(8, -14.2, 3.4, 3.2, PAL.eyeRim);
  D(8, -14.2, 2.5, 2.3, PAL.eye);
  if (!blink) Rr(6.5, -14.5, 3.5, 1, PAL.ink); else Rr(5.5, -14, 5, 1, P.g2);
  Rr(15, -11, 1, 1, P.g2);                      // nostril
  // front leg + toe pads
  Rr(5, -5, 2.5, 5, P.g2); Rr(3.5, -1.5, 8, 1.8, P.g2);
  D(11.5, -0.6, 1.3, 1.1, P.b); D(8.5, -0.2, 1.1, 0.9, P.b); D(5.5, -0.2, 1.1, 0.9, P.b);
  c.restore();
}

// ------------------------------------------------------------------ vehicles
export function drawVehicle(c, v, time, opt = {}) {
  const braking = opt.braking && Math.abs(v.vx) < 1 && !v.parked;
  c.save();
  c.translate(Math.round(v.x), Math.round(v.y));
  if (v.vert) c.rotate(-Math.PI / 2);
  else if (v.dir < 0) c.scale(-1, 1);
  const hw = Math.floor(v.vert ? v.h / 2 : v.w / 2); // along travel axis
  const tail = braking ? '#ff3b3b' : '#9b2a2a';
  // soft shadow
  c.fillStyle = 'rgba(0,0,0,0.22)';
  if (v.vert) c.fillRect(-9, -4, 18, 11); else c.fillRect(-Math.floor(v.w / 2) + 1, -Math.floor(v.h / 2) + 2, v.w, v.h);

  switch (v.kind) {
    case 'taxi':  carBody(c, v, '#f7c51e', '#ffd84a', tail, 'taxi'); break;
    case 'sedan': carBody(c, v, CAR_COLORS[v.c], lighten(CAR_COLORS[v.c]), tail); break;
    case 'van':   vanBody(c, v, tail); break;
    case 'bus':   busBody(c, v, tail); break;
    case 'scooter':  scooterBody(c, v, time, opt, false, tail); break;
    case 'delivery': scooterBody(c, v, time, opt, true, tail); break;
  }
  c.restore();
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.min(255, v + 38);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function carBody(c, v, body, roof, tail, taxi) {
  const w = v.w, h = v.h, x0 = -(w >> 1), y0 = -(h >> 1);
  fr(c, x0 + 1, y0, w - 2, h, body); fr(c, x0, y0 + 1, w, h - 2, body);
  fr(c, x0 + 7, y0 + 2, w - 18, h - 4, roof);             // cabin roof
  fr(c, x0 + w - 11, y0 + 2, 4, h - 4, '#2b3a55');        // windshield
  fr(c, x0 + 4, y0 + 2, 3, h - 4, '#2b3a55');             // rear glass
  fr(c, x0 + w - 5, y0 + 2, 3, h - 4, roof);              // hood
  fr(c, x0 + w - 1, y0 + 1, 1, 3, '#fff6a8'); fr(c, x0 + w - 1, y0 + h - 4, 1, 3, '#fff6a8');
  fr(c, x0, y0 + 1, 1, 3, tail); fr(c, x0, y0 + h - 4, 1, 3, tail);
  if (taxi) {
    fr(c, -3, -3, 6, 6, '#fff'); fr(c, -2, -1, 4, 1, PAL.ink); fr(c, -2, 1, 4, 1, PAL.ink);
    for (let i = 0; i < 4; i++) fr(c, x0 + 8 + i * 4, y0 + 1, 2, 1, i % 2 ? PAL.ink : '#fff');
  }
}

function vanBody(c, v, tail) {
  const w = v.w, h = v.h, x0 = -(w >> 1), y0 = -(h >> 1);
  fr(c, x0 + 1, y0, w - 2, h, '#f2f0e6'); fr(c, x0, y0 + 1, w, h - 2, '#f2f0e6');
  fr(c, x0 + 3, y0 + 2, w - 15, h - 4, '#dcd9ca');
  fr(c, x0 + 3, y0 + 2, w - 15, 1, '#c9c5b4');
  fr(c, x0 + w - 11, y0 + 2, 4, h - 4, '#2b3a55');
  fr(c, x0 + w - 6, y0 + 2, 4, h - 4, '#f2f0e6');
  fr(c, x0 + w - 1, y0 + 1, 1, 3, '#fff6a8'); fr(c, x0 + w - 1, y0 + h - 4, 1, 3, '#fff6a8');
  fr(c, x0, y0 + 1, 1, 3, tail); fr(c, x0, y0 + h - 4, 1, 3, tail);
  fr(c, x0 + 8, y0 + 7, 14, 4, '#7fb5e6');
}

function busBody(c, v, tail) {
  const w = v.w, h = v.h, x0 = -(w >> 1), y0 = -(h >> 1);
  fr(c, x0 + 1, y0, w - 2, h, '#4d94d8'); fr(c, x0, y0 + 1, w, h - 2, '#4d94d8');
  fr(c, x0 + 3, y0 + 2, w - 8, h - 4, '#d9ecf8');
  fr(c, x0 + 3, y0 + (h >> 1) - 1, w - 8, 2, '#f4a623');
  for (let i = 0; i < 3; i++) { fr(c, x0 + 7 + i * 17, y0 + 4, 11, h - 8, '#eef6fb'); fr(c, x0 + 7 + i * 17, y0 + 4, 11, 1, '#b8cde0'); }
  fr(c, x0 + w - 4, y0 + 2, 3, h - 4, '#2b3a55');
  fr(c, x0 + w - 1, y0 + 1, 1, 3, '#fff6a8'); fr(c, x0 + w - 1, y0 + h - 4, 1, 3, '#fff6a8');
  fr(c, x0, y0 + 1, 1, 4, tail); fr(c, x0, y0 + h - 5, 1, 4, tail);
}

function scooterBody(c, v, time, opt, delivery, tail) {
  const shake = opt.shake ? ((Math.floor(time * 14) % 2) ? 1 : -1) : 0;
  const body = delivery ? '#ece4d8' : CAR_COLORS[v.c];
  const jacket = delivery ? '#3b4ac8' : JACKETS[v.c];
  const helmet = delivery ? '#8c5be0' : HELMETS[(v.c + (v.id % 3)) % 8];
  if (delivery) {
    // delivery box (original peach box with a mint wave stripe)
    fr(c, -10, -5, 9, 10, '#f6c8a0'); fr(c, -10, -5, 9, 1, '#e3ab7c'); fr(c, -10, 4, 9, 1, '#e3ab7c');
    fr(c, -9, -1, 7, 2, '#50d0b0'); fr(c, -8, -2, 1, 1, '#50d0b0'); fr(c, -5, 1, 1, 1, '#50d0b0');
    fr(c, -11, -3, 1, 2, tail); fr(c, -11, 1, 1, 2, tail);
    fr(c, -1, -2, 6, 4, body);
  } else {
    fr(c, -8, -3, 8, 6, body); fr(c, -8, -3, 8, 1, lighten(CAR_COLORS[v.c]));
    fr(c, -9, -2, 1, 4, tail);
  }
  const fx = delivery ? 4 : 5;
  fr(c, fx, -3, 3, 6, body); fr(c, fx + 3, -1, 1, 2, '#fff6a8');
  fr(c, fx, -5, 1, 10, '#20242d');                 // handlebar
  // rider: shoulders, arms, helmet
  fr(c, -3 + (delivery ? 2 : 0), -4, 5, 8, jacket);
  fr(c, 2 + (delivery ? 2 : 0), -4, 3, 2, jacket); fr(c, 2 + (delivery ? 2 : 0), 2, 3, 2, jacket);
  const hx = delivery ? 1 : -1;
  disc(c, hx + shake, 0, 3.2, 3.2, helmet);
  fr(c, hx + shake + 1, -1, 1, 2, 'rgba(255,255,255,0.55)');
}

// ------------------------------------------------------------------ small things
export function drawDrop(c, x, y, t) {
  const b = Math.round(Math.sin(t * 4 + x) * 1.5);
  const cx = Math.round(x), cy = Math.round(y) + b;
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(cx - 3, cy + 6, 6, 2);
  fr(c, cx - 1, cy - 6, 2, 2, PAL.water);
  fr(c, cx - 2, cy - 4, 4, 2, PAL.water);
  fr(c, cx - 3, cy - 2, 6, 5, PAL.water);
  fr(c, cx - 2, cy + 3, 4, 1, PAL.water);
  fr(c, cx - 2, cy - 1, 1, 3, PAL.water2);
  const tw = (Math.floor(t * 6 + x) % 4);
  if (tw === 0) { fr(c, cx + 4, cy - 5, 1, 3, '#fff'); fr(c, cx + 3, cy - 4, 3, 1, '#fff'); }
}

export function drawFrogHeadIcon(size = 22) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const s = size / 22;
  c.scale(s, s);
  const D = (cx, cy, rx, ry, col) => disc(c, cx, cy, rx, ry, col);
  D(11, 13, 9, 7, PAL.frog);
  fr(c, 4, 17, 14, 1, PAL.belly);
  for (const m of [-1, 1]) {
    D(11 + m * 5, 6, 3.6, 3.6, PAL.eyeRim);
    D(11 + m * 5, 6, 2.6, 2.6, PAL.eye);
    fr(c, 11 + m * 5 - 2, 6, 4, 1, PAL.ink);
  }
  return cv;
}

// ------------------------------------------------------------------ world backdrop
// Painted once per level into an offscreen canvas of world size.
export function paintWorld(layout, levelCfg, seed = 7) {
  const { W, H, curbH, rows } = layout;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const rnd = mulberry32(seed);
  const labels = [];

  fr(c, 0, 0, W, H, PAL.asphalt);
  for (let i = 0; i < W * H / 40; i++) {
    const x = (rnd() * W) | 0, y = (rnd() * H) | 0;
    fr(c, x, y, 1, 1, rnd() < 0.5 ? PAL.asphalt2 : PAL.asphalt3);
  }

  rows.forEach((r, i) => {
    const below = rows[i - 1];
    if (r.t === 'island') paintIsland(c, r, W, rnd);
    else if (r.t === 'zone') paintZone(c, r, W, labels);
    else if (r.t === 'parking') paintParking(c, r, W);
    // lane boundary lines
    if (r.t === 'lane' && below && below.t === 'lane') {
      const opposite = below.dir !== r.dir;
      const y = Math.round(r.y + r.h);
      if (opposite && r.speed > 50 === below.speed > 50 && (i % 5 === 0)) {
        fr(c, 0, y - 1, W, 1, PAL.yellow); fr(c, 0, y + 1, W, 1, PAL.yellow);
      } else {
        for (let x = 4; x < W; x += 14) fr(c, x, y, 8, 1, PAL.line);
      }
    }
    if (r.t === 'lane' && below && below.t !== 'lane') {
      fr(c, 0, Math.round(r.y + r.h) - 1, W, 1, PAL.line);
    }
    if (r.t === 'lane' && rows[i + 1] && rows[i + 1].t !== 'lane') {
      fr(c, 0, Math.round(r.y), W, 1, PAL.line);
    }
  });

  // sidewalk below the start island
  const pb = layout.padBottom;
  fr(c, 0, H - pb, W, pb, PAL.tile);
  for (let x = 0; x < W; x += 12) fr(c, x, H - pb, 1, pb, PAL.tile2);
  for (let y = H - pb; y < H; y += 11) fr(c, 0, y, W, 1, PAL.tile2);
  fr(c, 0, H - pb, W, 3, PAL.curb); fr(c, 0, H - pb + 3, W, 1, PAL.curb2);

  if (levelCfg.theme === 'street') paintShopCurb(c, layout, levelCfg, labels, rnd);
  else paintStationCurb(c, layout, levelCfg, labels, rnd);

  return { canvas: cv, labels };
}

function paintIsland(c, r, W, rnd) {
  fr(c, 10, r.y, W - 20, r.h, PAL.curb);
  fr(c, 12, r.y + 2, W - 24, r.h - 4, PAL.grass);
  for (let i = 0; i < 90; i++) {
    const x = 13 + ((rnd() * (W - 28)) | 0), y = r.y + 3 + ((rnd() * (r.h - 6)) | 0);
    fr(c, x, y, 1, 1, rnd() < 0.5 ? PAL.grass2 : PAL.grass3);
  }
  // shrubs & a tree
  for (const bx of [28, 64, 205, 240]) {
    disc(c, bx, r.y + r.h / 2 + 2, 7, 5, PAL.grass2); disc(c, bx - 1, r.y + r.h / 2, 5, 3.5, PAL.grass3);
  }
  disc(c, 40, r.y + r.h / 2, 9, 8, '#3d8a3a'); disc(c, 38, r.y + r.h / 2 - 2, 6, 5, '#58a850');
  disc(c, 232, r.y + r.h / 2, 9, 8, '#3d8a3a'); disc(c, 230, r.y + r.h / 2 - 2, 6, 5, '#58a850');
  fr(c, 12, r.y + 2, W - 24, 1, '#7acb5e');
}

function paintZone(c, r, W, labels) {
  const x = r.x, y = r.y + 2, w = r.w, h = r.h - 4;
  fr(c, x, y, w, h, '#7a4b4b');
  for (let i = 0; i < w * h / 9; i++) fr(c, x + ((Math.sin(i * 12.9) * 43758) % 1 + 1) % 1 * w | 0, y + ((Math.sin(i * 78.2) * 24634) % 1 + 1) % 1 * h | 0, 1, 1, '#8a5a5a');
  fr(c, x, y, w, 1, PAL.line); fr(c, x, y + h - 1, w, 1, PAL.line);
  fr(c, x, y, 1, h, PAL.line); fr(c, x + w - 1, y, 1, h, PAL.line);
  // scooter pictogram
  for (const px of [x + 14, x + w - 14]) {
    fr(c, px - 5, y + h / 2 - 1, 8, 3, PAL.line); fr(c, px + 2, y + h / 2 - 3, 2, 7, PAL.line); fr(c, px - 3, y + h / 2 - 4, 3, 3, PAL.line);
  }
  labels.push({ text: '機車待轉區', x: x + w / 2, y: y + h / 2 + 0.5, size: 8.5, color: '#fff1d6', weight: 800 });
  // little flag = checkpoint
  fr(c, x + w - 9, y + 3, 1, 6, '#e8e8e8'); fr(c, x + w - 8, y + 3, 4, 3, '#ffcf3a');
}

function paintParking(c, r, W) {
  fr(c, 0, r.y, W, r.h, '#565b68');
  for (const bx of r.bays) {
    fr(c, bx - 9, r.y + 3, 1, r.h - 6, PAL.line); fr(c, bx + 8, r.y + 3, 1, r.h - 6, PAL.line);
  }
  fr(c, 0, r.y + r.h - 1, W, 1, PAL.line);
}

function paintShopCurb(c, layout, L, labels, rnd) {
  const { W, curbH } = layout;
  const walkH = 22;
  fr(c, 0, 0, W, curbH, '#6d5a52');
  // neighbouring buildings
  const blocks = [[0, 96, '#8d6b5a', '#f0c27a'], [198, 72, '#5f7592', '#e9e3b0']];
  for (const [bx, bw, col, win] of blocks) {
    fr(c, bx, 0, bw, curbH - walkH, col);
    fr(c, bx, curbH - walkH - 3, bw, 3, 'rgba(0,0,0,0.25)');
    for (let wx = bx + 8; wx < bx + bw - 12; wx += 20) for (let wy = 8; wy < curbH - walkH - 14; wy += 22) {
      fr(c, wx, wy, 12, 12, '#2c3446'); fr(c, wx + 1, wy + 1, 10, 10, rnd() < 0.5 ? win : '#6f8fb0');
    }
  }
  // the shop
  const sx = 96, sw = 102, sy = 6;
  fr(c, sx, sy, sw, curbH - walkH - sy, '#f3ead7');
  fr(c, sx, sy, sw, 3, '#d6c9a8');
  fr(c, sx + 2, sy + 4, sw - 4, 20, '#2f6b4f');            // signboard
  fr(c, sx + 3, sy + 5, sw - 6, 18, '#3e8a64');
  labels.push({ text: L.store.name, x: sx + sw / 2 + 6, y: sy + 11, size: 12, color: '#fff7d6', weight: 900 });
  labels.push({ text: `${L.store.drink} ・ 手搖茶飲`, x: sx + sw / 2 + 6, y: sy + 20, size: 6.5, color: '#d7f5d4', weight: 700 });
  // cup icon
  fr(c, sx + 8, sy + 8, 10, 12, '#e9fff0'); fr(c, sx + 9, sy + 12, 8, 7, '#6fe3a2'); fr(c, sx + 12, sy + 4, 1, 6, '#e9fff0'); fr(c, sx + 12, sy + 4, 4, 1, '#e9fff0');
  // awning
  const ay = curbH - walkH - 24;
  for (let i = 0; i < 17; i++) fr(c, sx + 1 + i * 6, ay, 6, 12, i % 2 ? '#f7f1de' : '#3e8a64');
  for (let i = 0; i < 17; i++) { fr(c, sx + 1 + i * 6, ay + 12, 6, 2, i % 2 ? '#f7f1de' : '#3e8a64'); fr(c, sx + 2 + i * 6, ay + 14, 4, 1, i % 2 ? '#f7f1de' : '#3e8a64'); }
  // window + door
  fr(c, sx + 6, ay + 17, 24, 8, '#9fd6e8'); fr(c, sx + 6, ay + 17, 24, 1, '#d6f0f8');
  fr(c, sx + sw - 30, ay + 17, 24, 8, '#9fd6e8');
  fr(c, 130, ay + 15, 34, 10, '#3a2f2a'); fr(c, 132, ay + 17, 30, 8, '#ffe6a8');
  // sidewalk
  fr(c, 0, curbH - walkH, W, walkH, PAL.tile);
  for (let x = 0; x < W; x += 12) fr(c, x, curbH - walkH, 1, walkH, PAL.tile2);
  for (let y = curbH - walkH; y < curbH; y += 11) fr(c, 0, y, W, 1, PAL.tile2);
  fr(c, 0, curbH - 3, W, 3, PAL.curb); fr(c, 0, curbH - 1, W, 1, PAL.curb2);
  // planters
  for (const px of [18, 80, 214, 252]) { fr(c, px - 5, curbH - walkH + 5, 10, 8, '#8a5a3c'); disc(c, px, curbH - walkH + 4, 7, 5, '#3d8a3a'); }
  // door window markers (used by renderer to glow when the delivery rider is in the time window)
  layout.doorRect = { x: 112, y: ay + 15, w: 80, h: 12 };
}

function paintStationCurb(c, layout, L, labels, rnd) {
  const { W, curbH } = layout;
  const walkH = 22;
  fr(c, 0, 0, W, curbH, '#9c9484');
  // station facade
  fr(c, 0, 0, W, curbH - walkH, '#d9d2c0');
  fr(c, 0, 0, W, 10, '#8c8472'); fr(c, 0, 10, W, 2, '#6e675a');
  for (let x = 6; x < W; x += 22) { fr(c, x, 14, 14, curbH - walkH - 18, '#b9b19c'); fr(c, x + 2, 16, 10, curbH - walkH - 22, '#2f3b52'); fr(c, x + 3, 17, 4, curbH - walkH - 24, '#4d6288'); }
  for (const px of [36, 184]) { fr(c, px, 11, 60, 15, '#4a4538'); fr(c, px + 1, 12, 58, 13, '#6d6554'); }
  labels.push({ text: '台北車站', x: 66, y: 18, size: 8, color: '#f3ead4', weight: 900 });
  labels.push({ text: '忠孝西路', x: 214, y: 18, size: 8, color: '#f3ead4', weight: 900 });
  // escalator entrance (descends to B1)
  const ex = 128, ew = 60, ey = curbH - walkH - 34;
  fr(c, ex - 2, ey - 2, ew + 4, 36, '#4a4538');
  fr(c, ex, ey, ew, 34, '#1d2230');
  for (let i = 0; i < 7; i++) { fr(c, ex + 4, ey + 4 + i * 4, ew - 8, 2, i % 2 ? '#6b7388' : '#3c4358'); }
  fr(c, ex + 2, ey, 2, 34, '#c8c3b4'); fr(c, ex + ew - 4, ey, 2, 34, '#c8c3b4');
  labels.push({ text: 'B1 ▼', x: ex + ew / 2, y: ey - 7, size: 8, color: '#2a2418', weight: 900 });
  layout.doorRect = { x: ex, y: ey, w: ew, h: 34 };
  // shop sign (placeholder until the brand authorises its logo / storefront)
  const bx = 196, bw = 70, by = ey + 4;
  fr(c, bx, by, bw, 28, '#3a3a3f'); fr(c, bx + 2, by + 2, bw - 4, 24, '#54545c');
  fr(c, bx + 3, by + 3, bw - 6, 22, '#6a6a74');
  for (let i = 0; i < bw - 6; i += 6) fr(c, bx + 3 + i, by + 3, 3, 2, '#7d7d88');
  labels.push({ text: L.store.signText || L.store.name, x: bx + bw / 2, y: by + 12, size: 9.5, color: '#fff7e0', weight: 900 });
  labels.push({ text: '［示意佔位］', x: bx + bw / 2, y: by + 21, size: 6.2, color: '#ffd9a0', weight: 700 });
  // sidewalk
  fr(c, 0, curbH - walkH, W, walkH, PAL.tile);
  for (let x = 0; x < W; x += 10) fr(c, x, curbH - walkH, 1, walkH, PAL.tile2);
  for (let y = curbH - walkH; y < curbH; y += 10) fr(c, 0, y, W, 1, PAL.tile2);
  fr(c, 0, curbH - 3, W, 3, PAL.curb); fr(c, 0, curbH - 1, W, 1, PAL.curb2);
  // bus shelter
  fr(c, 18, curbH - walkH + 3, 40, 3, '#8aa0b8'); fr(c, 18, curbH - walkH + 6, 2, 8, '#6d7f94'); fr(c, 56, curbH - walkH + 6, 2, 8, '#6d7f94');
  for (const px of [96, 112]) disc(c, px, curbH - walkH + 8, 6, 5, '#3d8a3a');
}
