import assert from 'node:assert/strict';
import { issueTicket, verifyTicket, makePromoCode, parsePromoCode } from './access/tickets.mjs';
import { memoryStore } from './access/store.mjs';
import { createHandlers } from './access/handlers.mjs';

const S = 'test-secret', T0 = Date.UTC(2026, 9, 7);
const frames = [0, 1, 2].map((time) => ({ time, image: 'data:image/jpeg;base64,/9j/2Q==' }));
const motion = [0, 1, 2].map((t) => [t, null, null, null, null]);
const reviewBody = { sport: 'basketball', hand: 'right', view: 'side', consent: true, frames, motion };
const goodModel = async () => JSON.stringify({ summary: 'ok', observations: [], uncertainties: [], corrections: [], practice: {} });
const make = (over = {}) => {
  let now = T0; const calls = { n: 0 };
  const h = createHandlers({ env: { ACCESS_SECRET: S, OPENAI_API_KEY: 'k' }, store: { ...memoryStore(), persistent: true }, mode: 'enforced', now: () => now, callModel: async (b) => { calls.n++; return (over.model || goodModel)(b); } });
  return { h, calls, advance: (ms) => { now += ms; } };
};
const auth = (t) => ({ authorization: `Bearer ${t}` });

// tickets
const t = issueTicket(S, { plan: 'monthly' }, T0);
assert.equal(verifyTicket(S, t, T0).plan, 'monthly');
assert.equal(verifyTicket('other', t, T0), null, 'wrong secret');
assert.equal(verifyTicket(S, t, T0 + 40 * 86400e3), null, 'expired');
assert.equal(verifyTicket(S, t.slice(0, -2) + 'xx', T0), null, 'tampered');
const forged = Buffer.from(JSON.stringify({ v: 1, id: 'x', plan: 'project', exp: 9e9 })).toString('base64url') + '.' + t.split('.')[1];
assert.equal(verifyTicket(S, forged, T0), null, 'payload swap');

// promo codes
const code = makePromoCode(S);
assert.ok(parsePromoCode(S, code));
assert.ok(parsePromoCode(S, code.toLowerCase().replace(/-/g, ' ')), 'forgiving format');
assert.equal(parsePromoCode(S, code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A')), null, 'bad check group');
assert.equal(parsePromoCode('other', code), null);
assert.equal(parsePromoCode(S, 'MOSTER-AAAAAAAA-AAAA'), null);

// promo → exactly one analysis
{
  const { h, calls } = make();
  const r = await h.redeem({ body: { code } });
  assert.equal(r.status, 200); assert.equal(r.body.remaining, 1);
  assert.equal((await h.redeem({ body: { code } })).body.ticket, r.body.ticket, 'redeem is idempotent');
  assert.equal((await h.review({ headers: {}, body: reviewBody })).status, 402, 'no ticket');
  assert.equal((await h.review({ headers: auth(r.body.ticket), body: reviewBody })).status, 200);
  assert.equal((await h.review({ headers: auth(r.body.ticket), body: reviewBody })).status, 402, 'second use blocked');
  assert.equal((await h.redeem({ body: { code } })).body.remaining, 0, 're-redeem cannot refill');
  assert.equal(calls.n, 1);
  assert.equal((await h.redeem({ body: { code: 'nonsense' } })).status, 400);
}
// failed analysis refunds the credit; consent required before spending
{
  let fail = true;
  const { h } = make({ model: async () => { if (fail) throw Object.assign(new Error('upstream'), { status: 502 }); return goodModel(); } });
  const { ticket } = (await h.redeem({ body: { code } })).body;
  assert.equal((await h.review({ headers: auth(ticket), body: { ...reviewBody, consent: false } })).status, 400);
  assert.equal((await h.review({ headers: auth(ticket), body: reviewBody })).status, 502);
  fail = false;
  assert.equal((await h.review({ headers: auth(ticket), body: reviewBody })).status, 200, 'credit refunded after failure');
}
// invalid payload also refunds
{
  const { h } = make();
  const { ticket } = (await h.redeem({ body: { code } })).body;
  assert.equal((await h.review({ headers: auth(ticket), body: { ...reviewBody, frames: [] } })).status, 400);
  assert.equal((await h.review({ headers: auth(ticket), body: reviewBody })).status, 200);
}
// monthly quota resets next month
{
  const { h, advance } = make();
  const ticket = issueTicket(S, { plan: 'monthly', id: 'm1' }, T0);
  for (let i = 0; i < 30; i++) assert.equal((await h.review({ headers: auth(ticket), body: reviewBody })).status, 200);
  assert.equal((await h.review({ headers: auth(ticket), body: reviewBody })).status, 402, '31st blocked');
  assert.equal((await h.status({ headers: auth(ticket) })).body.access.remaining, 0);
  advance(26 * 86400e3);
  assert.equal((await h.review({ headers: auth(ticket), body: reviewBody })).status, 200, 'new month');
}
// fail closed when misconfigured; open mode for local owner use
{
  const h = createHandlers({ env: { OPENAI_API_KEY: 'k' }, store: memoryStore(), mode: 'enforced', callModel: goodModel });
  assert.equal((await h.review({ headers: {}, body: reviewBody })).status, 503);
  assert.equal((await h.redeem({ body: { code } })).status, 503);
  const open = createHandlers({ env: { OPENAI_API_KEY: 'k' }, store: memoryStore(), mode: 'open', callModel: goodModel });
  assert.equal((await open.review({ headers: {}, body: reviewBody })).status, 200);
}
console.log('access checks passed');
