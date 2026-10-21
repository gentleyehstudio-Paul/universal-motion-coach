#!/usr/bin/env node
// Backend-side score verification. The Cardstox API can run this logic in Node, a
// Cloudflare Worker or any JS runtime — it imports the exact same simulation the
// browser plays, so a score only counts if the recorded inputs really produce it.
//
//   node tools/verify-replay.mjs run.json
//
// run.json = the body of POST /scores:  { "week": "...", "segments": [ { level, seed, cfgHash, ticks, inputs } ] }
import { readFileSync } from 'node:fs';
import { verifyRun } from '../src/verify.js';

const cfg = JSON.parse(readFileSync(new URL('../config/game.json', import.meta.url)));
const file = process.argv[2];
if (!file) { console.error('usage: node tools/verify-replay.mjs run.json'); process.exit(2); }
const res = verifyRun(cfg, JSON.parse(readFileSync(file, 'utf8')));
console.log(JSON.stringify(res, null, 2));
process.exit(res.ok ? 0 : 1);
