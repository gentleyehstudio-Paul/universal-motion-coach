// A simple planning bot. Used by selftest to prove that both levels are winnable
// and the replay is deterministic. It "plays" through the same press/move/release
// API as a finger would, so the recorded inputs are a real replay log.
import { Sim, KINDS, HZ, DT } from '../src/sim.js';

function lightAt(sim, k) {
  // light state k ticks from now
  const Lc = sim.L.light;
  let st = sim.light.state, t = sim.light.t;
  for (let i = 0; i < k; i++) {
    t++;
    if (t >= Lc[st] * HZ) { st = st === 'green' ? 'yellow' : st === 'yellow' ? 'red' : 'green'; t = 0; }
  }
  return st;
}

// x position of every vehicle for ticks 0..n
function trajectories(sim, n) {
  const acc = sim.cfg.traffic.accel * DT;
  const states = [];
  const out = new Map();
  let st = sim.light.state, lt = sim.light.t;
  const Lc = sim.L.light;
  for (let i = 0; i <= n; i++) {
    states.push(st);
    lt++;
    if (lt >= Lc[st] * HZ) { st = st === 'green' ? 'yellow' : st === 'yellow' ? 'red' : 'green'; lt = 0; }
  }
  for (const v of sim.vehicles) {
    const xs = [v.x];
    let x = v.x, vx = v.vx;
    for (let i = 1; i <= n; i++) {
      if (!v.parked) {
        const lane = v.lane;
        const target = lane.ignoreLight || states[i] !== 'red' ? lane.vx : 0;
        if (vx < target) vx = Math.min(target, vx + acc); else if (vx > target) vx = Math.max(target, vx - acc);
        x += vx * DT;
      }
      xs.push(x);
    }
    out.set(v.id, xs);
  }
  return out;
}

function plan(sim) {
  const f = sim.frog, F = sim.cfg.frog, U = sim.U, lay = sim.lay;
  const N = Math.round(F.jumpSeconds * HZ);
  const maxC = Math.round(F.chargeSeconds * HZ * (F.jumpMaxUnits / F.chargeMaxUnits)) + 4;
  const traj = trajectories(sim, maxC + N + 2);
  const cur = f.vid ? sim.vehicleById(f.vid) : null;
  let best = null;
  const stayLeft = f.stay === Infinity ? 1e9 : f.stay;
  for (let c = 4; c <= maxC; c += 2) {
    if (c + 2 > stayLeft) break;
    const raw = sim.chargePx(c);
    if (raw / U > F.overshootAtUnits) break;
    const d = Math.max(F.minJumpUnits * U, Math.min(raw, F.jumpMaxUnits * U));
    // frog position at launch
    let lx = f.x, ly = f.y;
    if (cur) lx = traj.get(cur.id)[c] + f.ox;
    for (let a = -85; a <= 85; a += 5) {
      const th = (a * Math.PI) / 180;
      const ux = Math.sin(th), uy = -Math.cos(th);
      const tx = Math.min(sim.W - 6, Math.max(6, lx + ux * d));
      const ty = Math.min(lay.boundsBottom, Math.max(lay.boundsTop, ly + uy * d));
      const ahead = c + N;
      // platform at landing?
      let hit = null, margin = 0, bd = 1e9;
      for (const v of sim.vehicles) {
        const xs = traj.get(v.id);
        const px = xs[Math.min(ahead, xs.length - 1)];
        const nx = (tx - px) / (v.w / 2), ny = (ty - v.y) / (v.h / 2);
        if (Math.abs(nx) > 0.8 || Math.abs(ny) > 0.8) continue;
        const dd = nx * nx + ny * ny;
        if (dd < bd) { bd = dd; hit = v; margin = 1 - Math.max(Math.abs(nx), Math.abs(ny)); }
      }
      let kind = null;
      if (hit) kind = hit.kind;
      else {
        const si = sim._findStatic(tx, ty);
        if (si >= 0) { kind = 'static'; margin = 0.5; }
      }
      if (!kind) continue;
      // would the carrier leave the screen soon after landing?
      if (hit && !hit.parked) {
        const xs = traj.get(hit.id);
        const px = xs[Math.min(ahead, xs.length - 1)];
        const stay = KINDS[hit.kind].stay === 'helmet' ? sim.cfg.stay.helmet : sim.cfg.stay.roof;
        const exit = px + hit.vx * stay;
        if (exit < 20 || exit > sim.W - 20) continue;
      }
      let goal = 0;
      if (hit && ((sim.L.goal.type === 'delivery' && hit.kind === 'delivery') || hit.goal)) {
        if (sim.L.goal.type === 'delivery') {
          const px = traj.get(hit.id)[Math.min(ahead, traj.get(hit.id).length - 1)];
          const w = sim.L.goal.window;
          if (px >= w[0] + 6 && px <= w[1] - 6) goal = 1000;
        } else goal = 1000;
      }
      const gain = f.y - ty;
      const s = goal + gain * 2 + (kind === 'static' ? 6 : 0) + margin * 12 - c * 0.05 - Math.abs(a) * 0.05;
      if (!best || s > best.s) best = { s, c, ux, uy, ty, tx, gain };
    }
  }
  return best;
}

export function runBot(cfg, levelIdx, seed, { maxSeconds = 400, noise = 0 } = {}) {
  const sim = new Sim(cfg, levelIdx, seed);
  let ns = (seed * 7919) >>> 0;
  const gauss = () => { // deterministic noise, independent from the sim rng
    ns = (Math.imul(ns, 1664525) + 1013904223) >>> 0; const u = (ns + 1) / 4294967297;
    ns = (Math.imul(ns, 1664525) + 1013904223) >>> 0; const v = (ns + 1) / 4294967297;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  let pl = null, state = 'idle', cnt = 0, waited = 0;
  while (sim.status === 'play' && sim.t < maxSeconds * HZ) {
    const f = sim.frog;
    if (f.state === 'stand' && state === 'idle') {
      const p = plan(sim);
      if (p && (p.gain > 1 || waited > 90 || (f.stay !== Infinity && f.stay < 40))) {
        pl = { ...p, c: Math.max(3, p.c + Math.round(gauss() * noise)) }; cnt = 0; state = 'charging';
        sim.press(f.x + p.ux * 100, f.y + p.uy * 100);
        waited = 0;
      } else waited++;
    } else if (f.state === 'charge' && state === 'charging') {
      cnt++;
      if (cnt >= pl.c) {
        sim.move(f.x + pl.ux * 100, f.y + pl.uy * 100);
        sim.release();
        state = 'idle';
      }
    } else if (f.state !== 'charge' && state === 'charging') {
      state = 'idle'; // slipped while charging
    }
    sim.step();
    sim.events.length = 0;
  }
  return sim;
}
