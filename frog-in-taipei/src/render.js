// Draws a Sim onto a canvas. Game art is rendered at a fixed logical size
// (270 x viewH) into an offscreen canvas, then blitted with nearest-neighbour
// scaling so it stays crisp pixel art; text is drawn afterwards at full
// resolution so the Chinese labels stay sharp.
import { PAL, paintWorld, drawVehicle, drawFrogTop, drawFrogSide, drawDrop, fr } from './art.js';
import { HZ } from './sim.js';

const LW = 270;
const TOP_PAD = -34; // lets the camera scroll a little past the curb so the HUD never hides the goal
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.octx = this.off.getContext('2d');
    this.viewH = 480;
    this.scale = 1;
    this.cam = 0;
    this.time = 0;
    this.parts = [];
    this.pops = [];
    this.world = null;
    this.labels = [];
    this.blinkT = 0;
  }

  resize(availW, availH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    // portrait phones see 400-560 logical rows; landscape shows a shorter slice so the field stays large
    this.viewH = clamp(Math.round((LW * availH) / availW), availW > availH ? 300 : 400, 560);
    this.scale = Math.min(availW / LW, availH / this.viewH);
    const cssW = Math.floor(LW * this.scale), cssH = Math.floor(this.viewH * this.scale);
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.off.width = LW;
    this.off.height = this.viewH;
    this.cssW = cssW; this.cssH = cssH;
    return { cssW, cssH };
  }

  setSim(sim) {
    const w = paintWorld(sim.lay, sim.L, 11 + sim.levelIdx);
    this.world = w.canvas;
    this.labels = w.labels;
    this.parts = []; this.pops = [];
    this.cam = clamp(sim.frog.y - this.viewH * 0.62, TOP_PAD, sim.lay.H - this.viewH);
  }

  toWorld(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * LW,
      y: ((clientY - r.top) / r.height) * this.viewH + Math.round(this.cam),
    };
  }

  // -------------------------------------------------------------- events
  onEvents(events) {
    for (const e of events) {
      if (e.k === 'land') this._burst(e.x, e.y, 6, '#ffffff', 0.9);
      else if (e.k === 'jump') this._burst(e.x, e.y, 4, '#e9e6d8', 0.6);
      else if (e.k === 'drop') { this._burst(e.x, e.y, 10, PAL.water2, 1.4); this._pop('+20', e.x, e.y - 8, '#bff3ff'); }
      else if (e.k === 'fall') {
        for (let i = 0; i < 12; i++) this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.5) * 1.5, life: 0.7, col: '#ffffff', size: 2, line: true });
        this._pop(e.reason === 'slip' ? '滑落！' : e.reason === 'over' ? '跳過頭！' : '呼～', e.x, e.y - 12, '#ffe08a');
      } else if (e.k === 'checkpoint') this._pop('存檔！', e.x, e.y - 10, '#c8ffb0');
      else if (e.k === 'win') {
        for (let i = 0; i < 46; i++) this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3.5, vy: -Math.random() * 3.2 - 0.6, life: 1.3, col: ['#ffd23f', '#4fcf63', '#59c8ff', '#ff7a7a', '#fff'][i % 5], size: 2, g: 0.07 });
      }
    }
  }

  _burst(x, y, n, col, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({ x, y, vx: Math.cos(a) * 0.9, vy: Math.sin(a) * 0.9 - 0.2, life: life * (0.5 + Math.random() * 0.5), col, size: 1 });
    }
  }
  _pop(text, x, y, color) { this.pops.push({ text, x, y, t: 0, color }); }

  // -------------------------------------------------------------- frame
  frame(sim, dt) {
    this.time += dt;
    const c = this.octx, W = LW, vh = this.viewH, f = sim.frog;
    const target = clamp(f.y - vh * 0.62, TOP_PAD, sim.lay.H - vh);
    this.cam += (target - this.cam) * Math.min(1, dt * 5);
    const cam = Math.round(this.cam);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#2a2f3f';
    c.fillRect(0, 0, W, vh);
    c.drawImage(this.world, 0, -cam);
    c.translate(0, -cam);

    this._goalDecor(c, sim);

    for (const d of sim.drops) if (!d.taken && d.y > cam - 10 && d.y < cam + vh + 10) drawDrop(c, d.x, d.y, this.time);

    const red = sim.light.state === 'red';
    for (const v of sim.vehicles) {
      if (v.y < cam - 20 || v.y > cam + vh + 20) continue;
      const carrying = v.id === f.vid;
      const shake = carrying && f.stay !== Infinity && f.stay < 60 && KINDS_HELMET(v);
      drawVehicle(c, v, this.time, { braking: red && !(v.lane && v.lane.ignoreLight), shake });
      if (v.goal) this._goalMark(c, v, sim);
      else if (v.kind === 'delivery') this._deliveryMark(c, v, sim);
    }

    this._aim(c, sim);
    this._frog(c, sim);
    this._edgeWarn(c, sim);
    this._particles(c, dt);

    // blit to the display canvas
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, W, vh, 0, 0, this.cv.width, this.cv.height);
    this._text(ctx, cam);
  }

  _goalDecor(c, sim) {
    const g = sim.L.goal, lay = sim.lay;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    if (g.type === 'delivery') {
      const lane = sim.lanes.find((l) => l.delivery);
      const y0 = lane.row.y;
      const open = sim.windowOpen;
      c.fillStyle = open ? `rgba(255,226,90,${0.22 + 0.18 * pulse})` : 'rgba(255,226,90,0.07)';
      c.fillRect(g.window[0], y0, g.window[1] - g.window[0], lane.row.h);
      c.fillStyle = open ? '#ffe25a' : 'rgba(255,226,90,0.55)';
      for (const x of g.window) for (let y = y0 + 1; y < y0 + lane.row.h; y += 5) c.fillRect(x, y, 1, 3);
      if (lay.doorRect && open) {
        const d = lay.doorRect;
        c.fillStyle = `rgba(255,240,150,${0.3 + 0.3 * pulse})`;
        c.fillRect(d.x, d.y, d.w, d.h);
      }
    } else if (lay.doorRect) {
      const d = lay.doorRect;
      c.fillStyle = `rgba(255,240,150,${0.10 + 0.14 * pulse})`;
      c.fillRect(d.x, d.y, d.w, d.h);
    }
  }

  _goalMark(c, v, sim) {
    const b = Math.round(Math.sin(this.time * 7) * 2);
    const x = Math.round(v.x), y = Math.round(v.y);
    c.strokeStyle = `rgba(255,226,90,${0.6 + 0.4 * Math.sin(this.time * 8)})`;
    c.lineWidth = 1;
    c.strokeRect(x - 8.5, y - 11.5, 17, 23);
    // bouncing arrow
    fr(c, x - 1, y - 20 + b, 3, 4, '#ffe25a'); fr(c, x - 3, y - 17 + b, 7, 1, '#ffe25a'); fr(c, x - 2, y - 16 + b, 5, 1, '#ffe25a'); fr(c, x - 1, y - 15 + b, 3, 1, '#ffe25a');
    // shop bag icon
    fr(c, x + 7, y - 4, 6, 7, '#d94b3d'); fr(c, x + 8, y - 6, 4, 2, '#f0f0f0'); fr(c, x + 9, y - 3, 2, 2, '#fff');
  }

  _deliveryMark(c, v, sim) {
    if (!sim.windowOpen) return;
    const b = Math.round(Math.sin(this.time * 9) * 1.5);
    const x = Math.round(v.x), y = Math.round(v.y);
    fr(c, x - 1, y - 18 + b, 3, 4, '#ffe25a'); fr(c, x - 3, y - 15 + b, 7, 1, '#ffe25a'); fr(c, x - 2, y - 14 + b, 5, 1, '#ffe25a'); fr(c, x - 1, y - 13 + b, 3, 1, '#ffe25a');
  }

  _frog(c, sim) {
    const f = sim.frog;
    if (f.state === 'dead') return;
    const x = Math.round(f.x), y = Math.round(f.y);
    const onVeh = f.vid !== 0;
    const lift = (onVeh ? 3 : 1) + Math.round(f.z);
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.28)';
    const sw = 6 - Math.min(2, f.z / 6);
    c.fillRect(x - sw, y + 2, sw * 2, 3);

    c.save();
    c.translate(x, y - lift + 2);
    let rot = f.face;
    let squash = 0, stretch = 0;
    if (f.state === 'charge') squash = Math.min(1, f.charge / 40);
    else if (f.state === 'jump') stretch = Math.sin((f.jump.n / f.jump.N) * Math.PI);
    else if (f.state === 'tumble') rot = f.tt * 0.42;
    else if (f.state === 'won') { c.translate(0, -Math.abs(Math.sin(this.time * 9)) * 4); }
    if (f.state === 'stand' || f.state === 'charge') {
      // face towards the aim point while charging
      if (f.state === 'charge') rot = Math.atan2(f.ay - f.y, f.ax - f.x) + Math.PI / 2;
      else rot = f.face;
    }
    if (f.state !== 'tumble') rot = Math.round(rot / (Math.PI / 4)) * (Math.PI / 4);
    c.rotate(rot);
    if (f.inv > 0 && Math.floor(f.inv / 5) % 2 === 0) c.globalAlpha = 0.55;
    const blink = ((Math.floor(this.time * 2.3) % 7) === 0) && (this.time % 0.43) < 0.12;
    drawFrogTop(c, { squash, stretch, blink });
    c.restore();

    // stay countdown ring
    if ((f.state === 'stand' || f.state === 'charge') && f.stay !== Infinity) {
      const ratio = clamp(f.stay / f.stayMax, 0, 1);
      const secs = f.stay / HZ;
      c.save();
      c.translate(x, y - lift + 2);
      c.lineWidth = 1.6;
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = secs < 0.5 ? '#ff4d4d' : secs < 1 ? '#ffa733' : '#bfffd0';
      c.beginPath(); c.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio); c.stroke();
      c.restore();
    }
  }

  _aim(c, sim) {
    const a = sim.aimInfo();
    if (!a) return;
    const f = sim.frog, U = sim.U;
    const col = a.over ? '#ff4d4d' : a.hit === 'ground' ? '#ffffff' : '#7dff8f';
    if (a.ghost) {
      c.strokeStyle = a.hit === 'veh' ? '#7dff8f' : 'rgba(255,255,255,0.6)';
      c.lineWidth = 1;
      c.setLineDash([2, 2]);
      c.strokeRect(Math.round(a.ghost.x - a.ghost.w / 2) + 0.5, Math.round(a.ghost.y - a.ghost.h / 2) + 0.5, a.ghost.w, a.ghost.h);
      c.setLineDash([]);
    }
    // 1 / 2 / 3 body-length ticks along the aim line
    for (let i = 1; i <= 3; i++) {
      const px = f.x + a.ux * U * i, py = f.y + a.uy * U * i;
      const passed = a.raw >= U * i;
      fr(c, Math.round(px) - 1, Math.round(py) - 1, 3, 3, passed ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)');
    }
    c.setLineDash([2, 3]);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(a.tx, a.ty); c.stroke();
    c.setLineDash([]);
    // landing marker
    const r = 5 + Math.sin(this.time * 12) * 0.8;
    c.strokeStyle = col; c.lineWidth = 1.5;
    c.beginPath(); c.arc(a.tx, a.ty, r, 0, Math.PI * 2); c.stroke();
    fr(c, Math.round(a.tx), Math.round(a.ty), 1, 1, col);
  }

  _edgeWarn(c, sim) {
    const f = sim.frog;
    if (!f.vid || (f.state !== 'stand' && f.state !== 'charge')) return;
    const v = sim.vehicleById(f.vid);
    if (!v || Math.abs(v.vx) < 1) return;
    const eta = v.vx > 0 ? (sim.W - f.x) / v.vx : f.x / -v.vx;
    if (eta > 1.6) return;
    const left = v.vx < 0;
    const blink = Math.floor(this.time * 8) % 2 === 0;
    if (!blink) return;
    const x = left ? 3 : sim.W - 7, y = Math.round(f.y);
    c.fillStyle = '#ff4d4d';
    for (let i = 0; i < 5; i++) c.fillRect(left ? x + (4 - i) : x + i, y - (2 - Math.abs(i - 2)) - 0, 1, (2 - Math.abs(i - 2)) * 2 + 1);
  }

  _particles(c, dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g;
      c.fillStyle = p.col;
      if (p.line) c.fillRect(Math.round(p.x), Math.round(p.y), 4, 1);
      else c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1);
  }

  _text(ctx, cam) {
    const sx = this.cv.width / LW, sy = this.cv.height / this.viewH;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const font = (px, w) => `${w || 800} ${Math.round(px * sx)}px system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    for (const l of this.labels) {
      const y = l.y - cam;
      if (y < -12 || y > this.viewH + 12) continue;
      ctx.font = font(l.size, l.weight);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, sx * 1.3);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(l.text, l.x * sx, y * sy);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x * sx, y * sy);
    }
    for (const p of this.pops) {
      ctx.globalAlpha = 1 - p.t * p.t;
      ctx.font = font(9, 900);
      ctx.lineWidth = Math.max(2, sx * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      const x = p.x * sx, y = (p.y - cam - p.t * 14) * sy;
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
      ctx.globalAlpha = 1;
    }
  }

  // -------------------------------------------------------------- cutscene
  // Frog rides the escalator down to B1. Returns true once finished.
  cutscene(t, L) {
    const c = this.octx, W = LW, vh = this.viewH;
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.labels = [];
    const labels = [];
    fr(c, 0, 0, W, vh, '#2a2f3f');
    // station wall tiles
    for (let y = 0; y < vh; y += 16) for (let x = 0; x < W; x += 16) fr(c, x, y, 15, 15, ((x + y) / 16) % 2 ? '#3a4157' : '#343b50');
    fr(c, 0, 0, W, 34, '#1b1f2c');
    for (let x = 10; x < W; x += 54) { fr(c, x, 12, 30, 6, '#fff4c8'); fr(c, x, 18, 30, 2, 'rgba(255,244,200,0.3)'); }
    labels.push({ text: '台北車站', x: W / 2, y: 52, size: 10, color: '#f3ead4', weight: 900 });

    // escalator band
    const slope = 0.62, x0 = -10, y0 = vh * 0.24;
    const bandY = (x) => y0 + (x - x0) * slope;
    for (let x = 0; x < W; x += 2) {
      const yy = Math.round(bandY(x));
      fr(c, x, yy, 2, 26, '#1c212e');
      fr(c, x, yy + 2, 2, 3, '#d8d3c2'); fr(c, x, yy + 23, 2, 3, '#d8d3c2');
      const step = Math.floor((x + t * 38) / 10) % 2;
      fr(c, x, yy + 6, 2, 16, step ? '#aab3cc' : '#7f89a8');
    }
    for (let x = 0; x < W; x += 2) { const yy = Math.round(bandY(x)); fr(c, x, yy - 8, 2, 2, '#0e1118'); fr(c, x, yy - 7, 2, 1, '#4a5168'); }

    // frog
    const ride = Math.min(1, t / 2.6);
    const fx = Math.round(30 + ride * 150);
    const end = clamp((t - 2.6) / 0.6, 0, 1);
    const fy = Math.round(bandY(fx) + 6 - Math.sin(end * Math.PI) * 16);
    const fxx = fx + Math.round(end * 40);
    const fyy = end > 0 ? Math.round(bandY(fx) + 6 + end * (bandY(fx + 40) - bandY(fx)) - Math.sin(end * Math.PI) * 16) : fy;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(fxx - 14, fyy + 1, 28, 3);
    drawFrogSide(c, fxx, fyy, 2, { blink: Math.floor(t * 3) % 5 === 0 });

    // B1 door
    const doorA = clamp((t - 1.2) / 1.2, 0, 1);
    const dx = 150, dy = vh * 0.66;
    fr(c, dx, dy, 110, 70, '#2c2530'); fr(c, dx + 4, dy + 4, 102, 62, `rgb(${Math.round(70 + 120 * doorA)},${Math.round(45 + 80 * doorA)},${Math.round(40 + 30 * doorA)})`);
    for (let i = 0; i < 6; i++) fr(c, dx + 8 + i * 17, dy + 8, 2, 54, 'rgba(0,0,0,0.18)');
    fr(c, dx + 4, dy + 4, 102, 12, '#54545c');
    labels.push({ text: L.store.signText || L.store.name, x: dx + 55, y: dy + 10, size: 9.5, color: '#fff7e0', weight: 900 });
    labels.push({ text: 'B1', x: 36, y: vh * 0.66 + 10, size: 22, color: '#ffe25a', weight: 900 });
    labels.push({ text: '歡迎光臨！', x: dx + 55, y: dy + 44, size: 12, color: '#fff7e0', weight: 900 });

    const fade = clamp((t - 3.6) / 0.7, 0, 1);
    if (fade > 0) { c.fillStyle = `rgba(255,248,230,${fade})`; c.fillRect(0, 0, W, vh); }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, W, vh, 0, 0, this.cv.width, this.cv.height);
    const keep = this.pops; this.pops = [];
    const saved = this.labels; this.labels = labels;
    ctx.globalAlpha = 1 - fade;
    this._text(ctx, 0);
    ctx.globalAlpha = 1;
    this.labels = saved; this.pops = keep;
    return t >= 4.3;
  }
}

function KINDS_HELMET(v) { return v.kind === 'scooter' || v.kind === 'delivery'; }
