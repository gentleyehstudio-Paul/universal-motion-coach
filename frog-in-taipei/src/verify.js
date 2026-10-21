// Server-side anti-cheat. Pure JS, no DOM: the Cardstox backend can import this
// file in Node (see tools/verify-replay.mjs) or a Worker. The mock API uses the
// very same function in the browser.
//
// A "run" is { segments: [ { level, seed, cfgHash, ticks, inputs: [[tick,kind,x,y]...] } ] }.
// The server never trusts the submitted score: it replays every segment with the
// deterministic simulation and takes the score from the replay.
import { replay, configHash, HZ } from './sim.js';

export function verifyRun(cfg, run) {
  const fail = (reason) => ({ ok: false, reason });
  if (!run || !Array.isArray(run.segments) || run.segments.length === 0) return fail('empty_run');
  if (run.segments.length > cfg.levels.length) return fail('too_many_segments');
  const hash = configHash(cfg);
  let total = 0, levelsWon = 0;
  const seen = new Set();
  for (const seg of run.segments) {
    if (!Number.isInteger(seg.level) || seg.level < 0 || seg.level >= cfg.levels.length) return fail('bad_level');
    if (seen.has(seg.level)) return fail('duplicate_level');
    seen.add(seg.level);
    if (seg.cfgHash !== hash) return fail('config_mismatch');
    if (!Number.isInteger(seg.seed) || !Array.isArray(seg.inputs)) return fail('bad_segment');
    if (seg.inputs.length > 4000) return fail('too_many_inputs');

    // basic shape / monotonic checks
    let last = -1, downs = 0, jumps = 0;
    for (const i of seg.inputs) {
      if (!Array.isArray(i) || i.length !== 4) return fail('bad_input');
      const [t, k, x, y] = i;
      if (!Number.isInteger(t) || t < last || t > 60 * HZ * 10) return fail('bad_input_time');
      if (!['d', 'm', 'u'].includes(k)) return fail('bad_input_kind');
      if (k !== 'u' && (!(x >= -50 && x <= 400) || !(y >= -50 && y <= 2000))) return fail('bad_input_pos');
      last = t;
      if (k === 'd') downs++;
      if (k === 'u') jumps++;
    }
    // a human can't release more than ~10 times a second
    if (jumps > last / 6 + 12 || downs > last / 6 + 12) return fail('implausible_input_rate');

    const sim = replay(cfg, seg.level, seg.seed, seg.inputs);
    if (seg.ticks !== undefined && Math.abs(seg.ticks - sim.t) > 1) return fail('tick_mismatch');
    if (sim.status === 'won') {
      if (sim.t < (cfg.leaderboard.minWinTicks || 480)) return fail('implausibly_fast');
      levelsWon++;
    }
    total += sim.score;
  }
  return { ok: true, score: total, levelsWon, hash };
}
