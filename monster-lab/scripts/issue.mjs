#!/usr/bin/env node
// Owner tool until payments are connected. Needs ACCESS_SECRET in the environment
// (the same value the deployment uses). Never commit or paste the secret.
//   node scripts/issue.mjs promo [count]                 -> free single-analysis promo codes
//   node scripts/issue.mjs ticket monthly|project [note] -> a ticket to send a paying customer
import { makePromoCode, issueTicket } from '../access/tickets.mjs';
const secret = process.env.ACCESS_SECRET;
const [kind, a, b] = process.argv.slice(2);
if (!secret) { console.error('請先設定環境變數 ACCESS_SECRET。'); process.exit(1); }
if (kind === 'promo') {
  for (let i = 0; i < Math.min(Number(a) || 1, 200); i++) console.log(makePromoCode(secret));
} else if (kind === 'ticket' && ['monthly', 'project'].includes(a)) {
  console.log(issueTicket(secret, { plan: a, note: b }));
  console.error('把這串 ticket 交給客戶；他在網站「已有存取碼」欄位貼上即可。');
} else {
  console.error('用法：promo [數量] | ticket monthly|project [備註]'); process.exit(1);
}
