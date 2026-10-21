// node tools/selftest.mjs [runs=12] [timingNoiseTicks=0]
// 1. a planning bot plays both levels through the real press/move/release API
// 2. every run is replayed from its input log and must match exactly (determinism)
// 3. the anti-cheat verifier must accept honest runs and reject tampered ones
import { readFileSync } from 'node:fs';
import { replay, configHash } from '../src/sim.js';
import { verifyRun } from '../src/verify.js';
import { runBot } from './bot.mjs';

const cfg = JSON.parse(readFileSync(new URL('../config/game.json', import.meta.url)));
const N = Number(process.argv[2] || 12);
const NOISE = Number(process.argv[3] || 0);
const hash = configHash(cfg);
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('  FAIL:', msg); } };

for (const li of [0, 1]) {
  let won = 0, secs = [], falls = 0, det = true;
  const lose = {};
  let sample = null;
  for (let seed = 1; seed <= N; seed++) {
    const s = runBot(cfg, li, seed, { noise: NOISE });
    if (s.status === 'won') { won++; secs.push(s.t / 60); if (!sample && s.t >= cfg.leaderboard.minWinTicks) sample = s; } else lose[s.reason] = (lose[s.reason] || 0) + 1;
    falls += s.stats.falls;
    const r = replay(cfg, li, seed, s.inputs);
    if (r.status !== s.status || r.score !== s.score || r.t !== s.t) det = false;
  }
  const avg = secs.length ? (secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(1) : '-';
  console.log(`level ${li + 1}: bot won ${won}/${N}, avg clear ${avg}s, avg falls ${(falls / N).toFixed(1)}, losses ${JSON.stringify(lose)}, replay deterministic: ${det}`);
  check(det, 'replay mismatch');

  if (!sample) console.log('  (no bot run slower than minWinTicks — leaderboard verification checks skipped)');
  if (sample) {
    const seg = { level: li, seed: sample.seed, cfgHash: hash, ticks: sample.t, inputs: sample.inputs };
    const ok = verifyRun(cfg, { segments: [seg] });
    check(ok.ok && ok.score === sample.score, 'honest run should verify with the same score');
    // tampering
    check(verifyRun(cfg, { segments: [{ ...seg, ticks: seg.ticks - 120 }] }).reason === 'tick_mismatch', 'faked duration must be rejected');
    check(!verifyRun(cfg, { segments: [{ ...seg, cfgHash: 'deadbeef' }] }).ok, 'other tuning must be rejected');
    const fast = runBot(cfg, li, 1);
    if (fast.t < cfg.leaderboard.minWinTicks) check(verifyRun(cfg, { segments: [{ level: li, seed: 1, cfgHash: hash, ticks: fast.t, inputs: fast.inputs }] }).reason === 'implausibly_fast', 'sub-8s win must be rejected');
    check(!verifyRun(cfg, { segments: [{ ...seg, inputs: [[0, 'd', 10, 10], [1, 'u', 0, 0], ...Array.from({ length: 300 }, (_, i) => [2 + (i >> 4), 'u', 0, 0])] }] }).ok, 'superhuman input rate must be rejected');
    check(verifyRun(cfg, { segments: [seg, seg] }).reason === 'duplicate_level', 'duplicate level must be rejected');
    const shifted = seg.inputs.map((i) => [i[0], i[1], i[2] + 25, i[3]]);
    const t = verifyRun(cfg, { segments: [{ ...seg, inputs: shifted }] });
    check(!t.ok || t.score !== sample.score, 'edited inputs must not keep the same score');
  }
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
