// Deterministic, DOM-free game simulation (fixed 60 Hz).
//
// A run is fully described by (config, level, seed, inputs). The same module is
// used by the browser (to play) and by tools/verify-replay.mjs (so the backend
// can replay a submitted run before accepting it onto the weekly leaderboard).
//
// Coordinates: x grows right, y grows DOWN. The frog starts at the bottom island
// (inner lanes) and works its way up to the curb (outer lanes / shop).
import { mulberry32, fnv1a } from './rng.js';
import { buildLayout, rowIndexAt } from './level.js';

export const HZ = 60;
export const DT = 1 / HZ;
const TUMBLE_TICKS = 54;
const PICKUP_R = 10;

// Every vehicle is a platform the frog can ride; sizes are in world units (1 car = 34).
export const KINDS = {
  sedan:    { w: 32, h: 17 },
  taxi:     { w: 34, h: 17 },
  van:      { w: 38, h: 18 },
  bus:      { w: 64, h: 19 },
  scooter:  { w: 17, h: 10 },
  delivery: { w: 21, h: 11 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v * 10) / 10;

// Hash of every parameter that affects the simulation. Stored with each score so
// the server can reject runs recorded against a different tuning.
export function configHash(cfg) {
  const pick = {
    world: cfg.world, frog: cfg.frog, stay: cfg.stay, lives: cfg.lives,
    thirst: cfg.thirst, score: cfg.score, traffic: cfg.traffic, levels: cfg.levels,
  };
  return fnv1a(JSON.stringify(pick)).toString(16).padStart(8, '0');
}

export class Sim {
  constructor(cfg, levelIdx, seed) {
    this.cfg = cfg;
    this.levelIdx = levelIdx;
    this.L = cfg.levels[levelIdx];
    this.lay = buildLayout(cfg, levelIdx);
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.U = cfg.world.unit;
    this.W = this.lay.W;

    this.t = 0;
    this.status = 'play'; // play | won | lost
    this.reason = '';
    this.score = 0;
    this.lives = cfg.lives;
    this.thirst = 100;
    this.bestRow = 0;
    this.events = [];
    this.inputs = [];
    this.nextId = 1;
    this.vehicles = [];
    this.lanes = [];
    this.drops = [];
    this.stats = { jumps: 0, falls: 0, drops: 0 };
    this.light = { state: 'green', t: 0 };
    this.windowOpen = false;
    this.breakdown = null;

    const dur = this.L.durationSeconds ?? cfg.thirst.durationSeconds;
    this.thirstPerTick = 100 / (dur * HZ);
    this.spd = cfg.traffic.speedMultiplier || 1;
    this.dens = cfg.traffic.densityMultiplier || 1;

    this._buildTraffic();
    this._placeDrops();

    const isl = this.lay.statics.find((s) => s.kind === 'island');
    this.checkpoint = { sidx: this.lay.statics.indexOf(isl), x: this.W / 2, y: isl.y + isl.h / 2 };
    this.frog = {
      x: this.checkpoint.x, y: this.checkpoint.y, z: 0,
      state: 'stand', vid: 0, sidx: this.checkpoint.sidx, ox: 0, oy: 0,
      stay: Infinity, stayMax: Infinity, charge: 0, ax: 0, ay: 0,
      face: 0, jump: null, tt: 0, wind: 0, inv: 0,
      last: { sidx: this.checkpoint.sidx, x: this.checkpoint.x, y: this.checkpoint.y },
    };
  }

  // ---------------------------------------------------------------- setup
  _pick(weights) {
    const keys = Object.keys(weights);
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = this.rng() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return keys[keys.length - 1];
  }

  _gapPx(lane) {
    const [a, b] = lane.gap;
    return (a + this.rng() * (b - a)) * this.U / this.dens;
  }

  _addVehicle(lane, kind, x, extra) {
    const k = KINDS[kind];
    const v = {
      id: this.nextId++, kind, lane, x, y: lane ? lane.y : 0,
      w: k.w, h: k.h, dir: lane ? lane.dir : 1,
      vx: lane ? lane.vx : 0, c: (this.rng() * 8) | 0, goal: false, parked: false, vert: false,
      ...extra,
    };
    this.vehicles.push(v);
    return v;
  }

  _buildTraffic() {
    const W = this.W;
    for (const row of this.lay.rows) {
      if (row.t === 'lane') {
        const lane = {
          row, y: row.cy, dir: row.dir, vx: row.dir * row.speed * this.spd, gap: row.gap,
          kinds: row.kinds, ignoreLight: !!row.ignoreLight, delivery: !!row.delivery,
          last: null, nextGap: 0, dTimer: 0,
        };
        if (lane.delivery) lane.dTimer = Math.round((this.L.goal.firstAt ?? 3) * HZ);
        this.lanes.push(lane);
        // initial fill, measured along the direction of travel
        let s = -10 + this.rng() * this.U;
        let first = null;
        while (s < W + 20) {
          const kind = this._pick(lane.kinds);
          const k = KINDS[kind];
          const c = s + k.w / 2;
          const v = this._addVehicle(lane, kind, lane.dir > 0 ? c : W - c);
          if (!first) first = v;
          s += k.w + this._gapPx(lane);
        }
        lane.last = first;
        lane.nextGap = this._gapPx(lane);
      } else if (row.t === 'parking') {
        row.bays.forEach((bx, i) => {
          const v = this._addVehicle(null, 'scooter', bx, {
            y: row.cy, w: 10, h: 17, vert: true, parked: true, dir: 1, vx: 0,
            goal: i === row.goalBay,
          });
          v.lane = null;
        });
      }
    }
  }

  _placeDrops() {
    const rows = this.lay.rows.filter((r) => r.t === 'lane');
    const n = this.L.drops ?? 12;
    for (let k = 0; k < n; k++) {
      const row = rows[Math.min(rows.length - 1, Math.floor(((k + 0.5) * rows.length) / n))];
      this.drops.push({
        id: k, x: 24 + this.rng() * (this.W - 48), y: row.cy + (this.rng() - 0.5) * 8, taken: false,
      });
    }
  }

  // ---------------------------------------------------------------- input
  // Inputs are recorded as [tick, kind, x, y] and applied at the start of that tick.
  press(x, y, record = true) {
    x = r1(x); y = r1(y);
    if (record) this.inputs.push([this.t, 'd', x, y]);
    const f = this.frog;
    if (this.status !== 'play') return;
    if (f.state === 'stand') {
      f.state = 'charge';
      f.charge = 0;
      f.ax = x; f.ay = y;
      this.events.push({ k: 'charge' });
    }
  }

  move(x, y, record = true) {
    x = r1(x); y = r1(y);
    if (record) this.inputs.push([this.t, 'm', x, y]);
    const f = this.frog;
    if (f.state === 'charge') { f.ax = x; f.ay = y; }
  }

  release(record = true) {
    if (record) this.inputs.push([this.t, 'u', 0, 0]);
    if (this.status !== 'play') return;
    if (this.frog.state === 'charge') this._launch();
  }

  applyInput(inp) {
    if (inp[1] === 'd') this.press(inp[2], inp[3], false);
    else if (inp[1] === 'm') this.move(inp[2], inp[3], false);
    else this.release(false);
  }

  // ---------------------------------------------------------------- queries
  chargePx(ticks) {
    const F = this.cfg.frog;
    const rate = (F.chargeMaxUnits * this.U) / (F.chargeSeconds * HZ);
    return Math.min(ticks * rate, F.chargeMaxUnits * this.U);
  }

  // Where the current charge would land, and what is there (for the aim preview).
  aimInfo() {
    const f = this.frog;
    if (f.state !== 'charge') return null;
    const j = this._plan();
    const N = Math.round(this.cfg.frog.jumpSeconds * HZ);
    const ahead = N * DT;
    let hit = 'ground';
    let ghost = null;
    if (!j.over) {
      const v = this._findVehicle(j.tx, j.ty, ahead);
      if (v) hit = 'veh';
      else if (this._findStatic(j.tx, j.ty) >= 0) hit = 'static';
    }
    // ghost: where the nearest vehicle of the target lane will be when we land
    let best = null, bd = 1e9;
    for (const v of this.vehicles) {
      if (Math.abs(v.y - j.ty) > 14) continue;
      const px = v.x + v.vx * ahead;
      const d = Math.abs(px - j.tx);
      if (d < bd) { bd = d; best = { x: px, y: v.y, w: v.w, h: v.h, id: v.id }; }
    }
    if (best && bd < 60) ghost = best;
    return { ...j, hit, ghost, units: j.raw / this.U };
  }

  _plan() {
    const f = this.frog, F = this.cfg.frog, U = this.U, lay = this.lay;
    const dx = f.ax - f.x, dy = f.ay - f.y;
    const len = Math.hypot(dx, dy);
    let ux = 0, uy = -1;
    if (len > 10) { ux = dx / len; uy = dy / len; }
    const raw = this.chargePx(f.charge);
    const over = raw / U > F.overshootAtUnits;
    const d = over ? raw : Math.max(F.minJumpUnits * U, Math.min(raw, F.jumpMaxUnits * U));
    const tx = clamp(f.x + ux * d, 6, this.W - 6);
    const ty = clamp(f.y + uy * d, lay.boundsTop, lay.boundsBottom);
    return { ux, uy, raw, d, over, tx, ty };
  }

  _findVehicle(px, py, ahead) {
    const as = this.cfg.frog.landAssistPx;
    let best = null, bd = 1e9;
    for (const v of this.vehicles) {
      const ax = v.x + v.vx * ahead;
      const nx = (px - ax) / (v.w / 2 + as);
      const ny = (py - v.y) / (v.h / 2 + as);
      if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
      const d = nx * nx + ny * ny;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  _findStatic(px, py) {
    const ss = this.lay.statics;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return i;
    }
    return -1;
  }

  vehicleById(id) {
    for (const v of this.vehicles) if (v.id === id) return v;
    return null;
  }

  // How long the frog may stay on one vehicle. stay.vehicle <= 0 turns the limit off.
  _stayTicks() {
    const S = this.cfg.stay;
    let sec = S.vehicle;
    if (!(sec > 0)) return Infinity;
    if (this.t < S.tutorialSeconds * HZ) sec = Math.max(sec, S.tutorialVehicle || 0);
    return Math.round(sec * HZ);
  }

  _inWindow(v) {
    const w = this.L.goal.window;
    return v.x >= w[0] && v.x <= w[1];
  }

  // ---------------------------------------------------------------- actions
  _launch() {
    const f = this.frog;
    const p = this._plan();
    const N = Math.round(this.cfg.frog.jumpSeconds * HZ);
    f.jump = {
      sx: f.x, sy: f.y, tx: p.tx, ty: p.ty, n: 0, N, over: p.over, d: p.d,
      from: f.vid, stayLeft: f.stay, stayMax: f.stayMax,
    };
    f.face = Math.atan2(p.uy, p.ux) + Math.PI / 2;
    f.state = 'jump';
    f.vid = 0; f.sidx = -1;
    this.stats.jumps++;
    this.events.push({ k: 'jump', x: f.x, y: f.y, over: p.over, units: p.raw / this.U });
  }

  _standOnVehicle(v, tx, ty, respawn = false) {
    const f = this.frog, j = f.jump;
    // the frog sits where it landed (clamped onto the vehicle); on a delivery bike it sits on the box
    let ox = clamp(tx - v.x, -v.w / 2 + 4, v.w / 2 - 4);
    let oy = clamp(ty - v.y, -v.h / 2 + 3, v.h / 2 - 3);
    if (v.kind === 'delivery') { ox = -5 * v.dir; oy = 0; }
    f.state = 'stand'; f.vid = v.id; f.sidx = -1; f.ox = ox; f.oy = oy;
    f.x = v.x + ox; f.y = v.y + oy; f.z = 0; f.jump = null;
    if (j && j.from === v.id) { f.stay = j.stayLeft; f.stayMax = j.stayMax; }
    else { f.stay = this._stayTicks(); f.stayMax = f.stay; }
    f.last = { vid: v.id, lane: v.lane, x: f.x, y: f.y };
    if (respawn) return;
    this.events.push({ k: 'land', x: f.x, y: f.y, kind: v.kind });
    this._progress(f.y);

    const g = this.L.goal;
    if ((g.type === 'delivery' && v.kind === 'delivery' && this._inWindow(v)) || (g.type === 'parked' && v.goal)) {
      this._win();
    }
  }

  _standOnStatic(si, tx, ty) {
    const f = this.frog, s = this.lay.statics[si];
    f.state = 'stand'; f.vid = 0; f.sidx = si; f.ox = 0; f.oy = 0;
    f.x = tx; f.y = ty; f.z = 0; f.jump = null;
    f.stay = Infinity; f.stayMax = Infinity;
    f.last = { sidx: si, x: tx, y: ty };
    this.events.push({ k: 'land', x: tx, y: ty, kind: s.kind });
    this._progress(ty);
  }

  _progress(y) {
    const r = rowIndexAt(this.lay, y);
    if (r > this.bestRow) {
      this.score += (r - this.bestRow) * this.cfg.score.perRow;
      this.bestRow = r;
    }
  }

  _fall(reason) {
    const f = this.frog;
    if (f.state === 'tumble') return;
    f.state = 'tumble'; f.tt = 0; f.vid = 0; f.sidx = -1; f.z = 0; f.jump = null;
    // the wind of passing traffic pushes the frog sideways
    let dir = 1, bd = 1e9;
    for (const l of this.lanes) {
      const d = Math.abs(l.y - f.y);
      if (d < bd) { bd = d; dir = l.dir; }
    }
    f.wind = dir * 0.7;
    this.lives--;
    this.stats.falls++;
    this.events.push({ k: 'fall', reason, x: f.x, y: f.y, lives: this.lives });
  }

  _respawn() {
    const f = this.frog, ls = f.last;
    f.jump = null;
    let v = ls.vid ? this.vehicleById(ls.vid) : null;
    const inView = (u) => u && u.x > 16 && u.x < this.W - 16;
    if (!inView(v) && ls.lane) {
      v = null;
      let bd = 1e9;
      for (const u of this.vehicles) {
        if (u.lane !== ls.lane || !inView(u)) continue;
        const d = Math.abs(u.x - ls.x);
        if (d < bd) { bd = d; v = u; }
      }
    }
    if (v) {
      f.jump = null;
      this._standOnVehicle(v, v.x, v.y, true);
      if (f.stay !== Infinity) { f.stay += 30; f.stayMax = f.stay; } // a little grace after the tumble
    } else {
      // nothing to ride: back to the start island (the only fixed safe spot)
      const cp = ls.sidx !== undefined && ls.sidx >= 0 ? ls : this.checkpoint;
      this._standOnStatic(cp.sidx, cp.x, cp.y);
    }
    f.inv = 60;
    this.events.push({ k: 'respawn', x: f.x, y: f.y });
  }

  _win() {
    if (this.status !== 'play') return;
    const S = this.cfg.score;
    const thirstBonus = Math.round(this.thirst * S.perThirstPct);
    const lifeBonus = this.lives * S.perLife;
    this.breakdown = {
      progress: this.score, clear: S.clear, thirst: thirstBonus, lives: lifeBonus,
      drops: this.stats.drops,
    };
    this.score += S.clear + thirstBonus + lifeBonus;
    this.status = 'won';
    this.frog.state = 'won';
    this.events.push({ k: 'win', x: this.frog.x, y: this.frog.y });
  }

  _lose(reason) {
    if (this.status !== 'play') return;
    this.status = 'lost';
    this.reason = reason;
    this.frog.state = 'dead';
    this.events.push({ k: 'lose', reason });
  }

  // ---------------------------------------------------------------- tick
  step() {
    if (this.status !== 'play') return;
    this.t++;
    const W = this.W;

    // traffic light
    const Lc = this.L.light, lt = this.light;
    lt.t++;
    if (lt.t >= Lc[lt.state] * HZ) {
      lt.state = lt.state === 'green' ? 'yellow' : lt.state === 'yellow' ? 'red' : 'green';
      lt.t = 0;
      this.events.push({ k: 'light', s: lt.state });
    }
    const red = lt.state === 'red';
    const acc = this.cfg.traffic.accel * DT;

    // vehicles
    let open = false;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.parked) continue;
      const lane = v.lane;
      const target = lane.ignoreLight || !red ? lane.vx : 0;
      if (v.vx < target) v.vx = Math.min(target, v.vx + acc);
      else if (v.vx > target) v.vx = Math.max(target, v.vx - acc);
      v.x += v.vx * DT;
      if (v.dir > 0 ? v.x - v.w / 2 > W + 2 : v.x + v.w / 2 < -2) {
        if (lane.last === v) lane.last = null;
        this.vehicles.splice(i, 1);
        if (this.frog.vid === v.id && (this.frog.state === 'stand' || this.frog.state === 'charge')) this._fall('carried');
      } else if (v.kind === 'delivery' && this._inWindow(v)) open = true;
    }
    this.windowOpen = open;

    // spawning
    for (const lane of this.lanes) {
      const last = lane.last;
      const trail = last ? (lane.dir > 0 ? last.x - last.w / 2 : W - (last.x + last.w / 2)) : 1e9;
      if (lane.delivery && lane.dTimer > 0) lane.dTimer--;
      const wantDelivery = lane.delivery && lane.dTimer <= 0;
      if (wantDelivery ? trail + 2 >= 10 : trail + 2 >= lane.nextGap) {
        const kind = wantDelivery ? 'delivery' : this._pick(lane.kinds);
        const c = -2 - KINDS[kind].w / 2;
        const v = this._addVehicle(lane, kind, lane.dir > 0 ? c : W - c);
        lane.last = v;
        lane.nextGap = this._gapPx(lane);
        if (wantDelivery) lane.dTimer = Math.round(this.L.goal.every * HZ);
      }
    }

    // frog
    const f = this.frog;
    if (f.inv > 0) f.inv--;
    if (f.state === 'stand' || f.state === 'charge') {
      if (f.vid) {
        const v = this.vehicleById(f.vid);
        if (v) { f.x = v.x + f.ox; f.y = v.y + f.oy; }
      }
      if (f.state === 'charge') f.charge = Math.min(f.charge + 1, 9999);
      if (f.stay !== Infinity) {
        f.stay--;
        if (f.stay <= 0) this._fall('slip');
      }
      if (f.state !== 'tumble' && (f.x < -4 || f.x > W + 4)) this._fall('carried');
    } else if (f.state === 'jump') {
      const j = f.jump;
      j.n++;
      const p = j.n / j.N;
      f.x = j.sx + (j.tx - j.sx) * p;
      f.y = j.sy + (j.ty - j.sy) * p;
      f.z = 4 * (10 + j.d * 0.12) * p * (1 - p);
      if (j.n >= j.N) this._land();
    } else if (f.state === 'tumble') {
      f.tt++;
      f.x = clamp(f.x + f.wind, 4, W - 4);
      if (f.tt >= TUMBLE_TICKS) {
        if (this.lives <= 0) this._lose('lives');
        else this._respawn();
      }
    }

    // droplets
    if (f.state !== 'tumble' && f.state !== 'won' && f.state !== 'dead') {
      for (const d of this.drops) {
        if (d.taken) continue;
        if ((d.x - f.x) ** 2 + (d.y - f.y) ** 2 < PICKUP_R * PICKUP_R) {
          d.taken = true;
          this.stats.drops++;
          this.thirst = Math.min(100, this.thirst + this.cfg.thirst.dropRefill);
          this.score += this.cfg.score.drop;
          this.events.push({ k: 'drop', x: d.x, y: d.y });
        }
      }
    }

    // thirst
    if (this.status === 'play') {
      this.thirst -= this.thirstPerTick;
      if (this.thirst <= 0) { this.thirst = 0; this._lose('thirst'); }
    }
  }

  _land() {
    const f = this.frog, j = f.jump;
    if (!j.over) {
      const v = this._findVehicle(j.tx, j.ty, 0);
      if (v) return this._standOnVehicle(v, j.tx, j.ty);
      const si = this._findStatic(j.tx, j.ty);
      if (si >= 0) return this._standOnStatic(si, j.tx, j.ty);
    }
    f.x = j.tx; f.y = j.ty;
    this._fall(j.over ? 'over' : 'miss');
  }
}

// Replays a recorded run headlessly. Used by the backend to verify scores.
export function replay(cfg, levelIdx, seed, inputs, maxTicks = 60 * 600) {
  const s = new Sim(cfg, levelIdx, seed);
  let i = 0;
  while (s.status === 'play' && s.t < maxTicks) {
    while (i < inputs.length && inputs[i][0] <= s.t) s.applyInput(inputs[i++]);
    s.step();
    s.events.length = 0;
  }
  return s;
}
