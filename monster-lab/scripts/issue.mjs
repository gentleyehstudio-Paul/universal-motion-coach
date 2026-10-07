#!/usr/bin/env node
// Owner tool. Needs ACCESS_SECRET (same value as the deployment); `grant` also needs the
// deployment's Upstash credentials (UPSTASH_REDIS_REST_URL / _TOKEN). Never commit or paste secrets.
//   node scripts/issue.mjs promo [count]                       free single-analysis promo codes
//   node scripts/issue.mjs grant <email> monthly|project [days] give a signed-up customer a plan directly
//   node scripts/issue.mjs ticket monthly|project [note]       a code the customer pastes in after login
//   node scripts/issue.mjs revoke <grant-id>                   switch a grant off (refund / abuse)
import { makePromoCode, issueTicket } from '../access/tickets.mjs';
import { normalizeEmail } from '../access/session.mjs';
import { storeFromEnv } from '../access/store.mjs';
import { upsertGrant } from '../access/accounts.mjs';
import { PLANS } from '../access/plans.mjs';
import { randomBytes } from 'node:crypto';

const secret = process.env.ACCESS_SECRET;
const [kind, a, b, c] = process.argv.slice(2);
const usage = () => { console.error('用法：promo [數量] | grant <email> monthly|project [天數] | ticket monthly|project [備註] | revoke <grant-id>'); process.exit(1); };
if (!secret) { console.error('請先設定環境變數 ACCESS_SECRET。'); process.exit(1); }
const persistent = () => { const s = storeFromEnv(); if (!s.persistent) { console.error('找不到 UPSTASH_REDIS_REST_URL／TOKEN，無法寫入正式資料庫。'); process.exit(1); } return s; };

if (kind === 'promo') {
  for (let i = 0; i < Math.min(Number(a) || 1, 200); i++) console.log(makePromoCode(secret));
} else if (kind === 'ticket' && ['monthly', 'project'].includes(a)) {
  console.log(issueTicket(secret, { plan: a, note: b }));
} else if (kind === 'grant' && normalizeEmail(a) && ['monthly', 'project'].includes(b)) {
  const days = Number(c) || PLANS[b].ticketDays;
  await upsertGrant(persistent(), normalizeEmail(a), { id: `manual_${randomBytes(6).toString('base64url')}`, plan: b, exp: Date.now() + days * 86400e3 });
  console.log(`已為 ${normalizeEmail(a)} 開通 ${PLANS[b].label}（${days} 天）。`);
} else if (kind === 'revoke' && a) {
  await persistent().set(`revoked:${a}`, '1'); console.log(`已停用 ${a}`);
} else usage();
