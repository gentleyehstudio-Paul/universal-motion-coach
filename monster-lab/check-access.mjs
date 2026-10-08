import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { issueTicket, verifyTicket, makePromoCode, parsePromoCode } from './access/tickets.mjs';
import { signSession, verifySession, normalizeEmail } from './access/session.mjs';
import { verifyWebhook } from './access/stripe.mjs';
import { memoryStore } from './access/store.mjs';
import { createHandlers } from './access/handlers.mjs';

const S = 'test-secret', T0 = Date.UTC(2026, 9, 7), DAY = 86400e3;
const frames = [0, 1, 2].map((time) => ({ time, image: 'data:image/jpeg;base64,/9j/2Q==' }));
const motion = [0, 1, 2].map((t) => [t, null, null, null, null]);
const reviewBody = { sport: 'basketball', hand: 'right', view: 'side', consent: true, frames, motion };
const goodModel = async () => JSON.stringify({ summary: 'ok', observations: [], uncertainties: [], corrections: [], practice: {} });
const WH = 'whsec_test';

function make(over = {}) {
  let now = T0; const calls = { n: 0 }, sent = [], stripeCalls = [];
  const store = { ...memoryStore(), persistent: true };
  const h = createHandlers({
    env: { ACCESS_SECRET: S, OPENAI_API_KEY: 'k', SITE_ORIGIN: 'https://lab.example', STRIPE_SECRET_KEY: 'sk', STRIPE_PRICE_MONTHLY: 'price_1', STRIPE_WEBHOOK_SECRET: WH, ...over.env },
    store, mode: 'enforced', now: () => now,
    mail: { configured: true, send: async (m) => sent.push(m) },
    fetch: async (url, init) => { stripeCalls.push({ url, body: String(init.body) }); return { ok: true, json: async () => ({ url: 'https://stripe.test/pay', id: 'x' }) }; },
    callModel: async (b) => { calls.n++; return (over.model || goodModel)(b); },
  });
  const cookieFor = (email) => ({ cookie: `ml_session=${signSession(S, email, now)}` });
  return { h, store, calls, sent, stripeCalls, cookieFor, advance: (ms) => { now += ms; }, now: () => now };
}
const sign = (body, t) => `t=${Math.floor(t / 1000)},v1=${createHmac('sha256', WH).update(`${Math.floor(t / 1000)}.${body}`).digest('hex')}`;

// tickets & promo codes (unchanged primitives)
const t = issueTicket(S, { plan: 'monthly' }, T0);
assert.equal(verifyTicket(S, t, T0).plan, 'monthly');
assert.equal(verifyTicket('other', t, T0), null);
assert.equal(verifyTicket(S, t, T0 + 40 * DAY), null);
const code = makePromoCode(S);
assert.ok(parsePromoCode(S, code));
assert.equal(parsePromoCode('other', code), null);

// sessions
assert.equal(normalizeEmail(' A@B.co '), 'a@b.co');
assert.equal(normalizeEmail('not-an-email'), null);
assert.equal(normalizeEmail('a@b.co\nBcc: x@y.z'), null, 'header injection');
const sess = signSession(S, 'a@b.co', T0);
assert.equal(verifySession(S, sess, T0).sub, 'a@b.co');
assert.equal(verifySession(S, sess, T0 + 31 * DAY), null, 'expired');
assert.equal(verifySession('other', sess, T0), null);
assert.equal(verifySession(S, t, T0), null, 'a ticket is not a session');

// magic-link login
{
  const { h, sent } = make();
  assert.equal((await h.authRequest({ headers: {}, body: { email: 'nope' } })).status, 400);
  const r = await h.authRequest({ headers: {}, body: { email: 'Fan@Example.com' } });
  assert.deepEqual(r.body, { sent: true });
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'fan@example.com');
  const link = /https:\/\/lab\.example\/login#token=(\S+)/.exec(sent[0].text);
  assert.ok(link, 'link points at the configured origin');
  const v = await h.authVerify({ body: { token: link[1] } });
  assert.equal(v.status, 200); assert.equal(v.body.email, 'fan@example.com');
  assert.match(v.cookies[0], /HttpOnly; SameSite=Lax.*Secure/);
  assert.equal((await h.authVerify({ body: { token: link[1] } })).status, 400, 'single use');
  assert.equal((await h.authVerify({ body: { token: 'garbage' } })).status, 400);
  for (let i = 0; i < 4; i++) await h.authRequest({ headers: {}, body: { email: 'fan@example.com' } });
  assert.equal((await h.authRequest({ headers: {}, body: { email: 'fan@example.com' } })).status, 429, 'per-email rate limit');
  const cookie = v.cookies[0].split(';')[0];
  assert.equal((await h.status({ headers: { cookie } })).body.access.user, 'fan@example.com');
  assert.equal((await h.status({ headers: {} })).body.access.user, null);
  assert.match((await h.logout()).cookies[0], /Max-Age=0/);
}
// no mail provider on a public deploy => 503, never leak the link
{
  const h2 = createHandlers({ env: { ACCESS_SECRET: S, SITE_ORIGIN: 'https://lab.example' }, store: { ...memoryStore(), persistent: true }, mode: 'enforced', mail: { configured: false } });
  const r = await h2.authRequest({ headers: {}, body: { email: 'a@b.co' } });
  assert.equal(r.status, 503); assert.equal(r.body.devLink, undefined);
}

// one-step flow: email + promo code together, redeemed automatically on login
{
  const { h, sent } = make();
  assert.equal((await h.authRequest({ headers: {}, body: { email: 'a@b.co', code: 'MOSTER-AAAAAAAA-AAAA' } })).status, 400, 'bad code is rejected before any email is sent');
  assert.equal(sent.length, 0);
  assert.equal((await h.authRequest({ headers: {}, body: { email: 'a@b.co', code, next: '/app/' } })).status, 200);
  const tok = /token=(\S+)/.exec(sent[0].text)[1];
  const v = await h.authVerify({ body: { token: tok } });
  assert.equal(v.body.redeemed.remaining, 1); assert.equal(v.body.next, '/app/');
  const me = { cookie: v.cookies[0].split(';')[0] };
  assert.equal((await h.status({ headers: me })).body.access.remaining, 1, 'credit is there without a second code entry');
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 200);
  // open-redirect guard: only known in-site destinations are kept
  await h.authRequest({ headers: {}, body: { email: 'x@y.co', next: 'https://evil.example' } });
  const t2 = /token=(\S+)/.exec(sent[1].text)[1];
  assert.equal((await h.authVerify({ body: { token: t2 } })).body.next, '');
}
// promo → account → exactly one analysis
{
  const { h, calls, cookieFor } = make();
  const me = cookieFor('a@b.co'), other = cookieFor('c@d.co');
  assert.equal((await h.redeem({ headers: {}, body: { code } })).status, 401, 'login required');
  assert.equal((await h.review({ headers: {}, body: reviewBody })).status, 401);
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 402, 'no grant yet');
  assert.equal((await h.redeem({ headers: me, body: { code: 'bad' } })).status, 400);
  assert.equal((await h.redeem({ headers: me, body: { code } })).body.remaining, 1);
  assert.equal((await h.redeem({ headers: me, body: { code } })).body.remaining, 1, 'idempotent');
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 200);
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 402);
  assert.equal((await h.redeem({ headers: other, body: { code } })).body.remaining, 0, 'same code on another account shares the single credit');
  assert.equal(calls.n, 1);
}
// failed analysis refunds
{
  let fail = true;
  const { h, cookieFor } = make({ model: async () => { if (fail) throw Object.assign(new Error('upstream'), { status: 502 }); return goodModel(); } });
  const me = cookieFor('a@b.co'); await h.redeem({ headers: me, body: { code } });
  assert.equal((await h.review({ headers: me, body: { ...reviewBody, consent: false } })).status, 400);
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 502);
  fail = false;
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 200);
}
// owner-issued ticket works as a redeemable code; monthly quota resets
{
  const { h, cookieFor, advance } = make();
  const me = cookieFor('a@b.co');
  await h.redeem({ headers: me, body: { code: issueTicket(S, { plan: 'monthly', id: 'm1' }, T0) } });
  for (let i = 0; i < 30; i++) assert.equal((await h.review({ headers: me, body: reviewBody })).status, 200);
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 402);
  advance(26 * DAY);
  const me2 = cookieFor('a@b.co');
  assert.equal((await h.review({ headers: me2, body: reviewBody })).status, 200, 'new month');
}

// Stripe: checkout + webhook lifecycle
{
  const { h, cookieFor, stripeCalls, now, advance } = make();
  const me = cookieFor('a@b.co');
  assert.equal((await h.checkout({ headers: {} })).status, 401);
  const c = await h.checkout({ headers: me });
  assert.equal(c.body.url, 'https://stripe.test/pay');
  assert.match(stripeCalls[0].body, /client_reference_id=a%40b\.co/);
  assert.match(stripeCalls[0].body, /mode=subscription/);

  const post = (event, t = now()) => { const raw = JSON.stringify(event); return h.stripeWebhook({ headers: { 'stripe-signature': sign(raw, t) }, rawBody: raw }); };
  assert.equal((await h.stripeWebhook({ headers: { 'stripe-signature': 't=1,v1=00' }, rawBody: '{}' })).status, 400, 'bad signature');
  assert.equal((await post({ id: 'e0', type: 'x' }, now() - 3600e3)).status, 400, 'stale timestamp');

  // invoice before checkout -> asks Stripe to retry
  const paid = { id: 'e2', type: 'invoice.paid', data: { object: { customer: 'cus_1', subscription: 'sub_1', lines: { data: [{ period: { end: Math.floor((T0 + 30 * DAY) / 1000) } }] } } } };
  assert.equal((await post(paid)).status, 500);

  const done = { id: 'e1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', client_reference_id: 'a@b.co' } } };
  assert.equal((await post(done)).status, 200);
  assert.equal((await post(done)).body.duplicate, true, 'idempotent');
  assert.equal((await h.status({ headers: me })).body.access.plan, 'monthly');
  assert.equal((await h.checkout({ headers: me })).status, 409, 'already subscribed');
  assert.equal((await h.portal({ headers: me })).body.url, 'https://stripe.test/pay');
  assert.equal((await post(paid)).status, 200);

  advance(36 * DAY); // past initial 35-day window, no renewal
  assert.equal((await h.status({ headers: cookieFor('a@b.co') })).body.access.plan, undefined, 'lapsed');
  advance(-36 * DAY);
  assert.equal((await post({ id: 'e3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } })).status, 200);
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 402, 'canceled sub revoked');
  assert.equal((await h.checkout({ headers: me })).status, 200, 'can resubscribe');
}
assert.ok(verifyWebhook(WH, '{"a":1}', sign('{"a":1}', T0), T0));
assert.equal(verifyWebhook(WH, '{"a":2}', sign('{"a":1}', T0), T0), null, 'body tamper');

// Single paid analysis (one-time Stripe payment)
{
  const { h, cookieFor, stripeCalls, now, calls } = make({ env: { STRIPE_PRICE_SINGLE: 'price_single' } });
  const me = cookieFor('a@b.co');
  const c = await h.checkout({ headers: me, body: { plan: 'single' } });
  assert.equal(c.status, 200);
  assert.match(stripeCalls[0].body, /mode=payment/); assert.match(stripeCalls[0].body, /price_single/);
  assert.equal((await make().h.checkout({ headers: make().cookieFor('a@b.co'), body: { plan: 'single' } })).status, 503, 'price not configured');
  const post = (event) => { const raw = JSON.stringify(event); return h.stripeWebhook({ headers: { 'stripe-signature': sign(raw, now()) }, rawBody: raw }); };
  const pay = (id, status = 'paid', type = 'checkout.session.completed') => ({ id: `ev_${id}_${status}_${type}`, type, data: { object: { id: 'cs_' + id, mode: 'payment', payment_status: status, payment_intent: 'pi_' + id, client_reference_id: 'a@b.co' } } });
  assert.equal((await post(pay('1', 'unpaid'))).body.pending, true);
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 402, 'unpaid grants nothing');
  assert.equal((await post(pay('1'))).status, 200);
  assert.equal((await post(pay('2'))).status, 200);
  const st = (await h.status({ headers: me })).body.access;
  assert.equal(st.plan, 'single'); assert.equal(st.remaining, 2, 'purchases stack');
  assert.equal((await h.review({ headers: me, body: reviewBody })).status, 200);
  assert.equal((await h.status({ headers: me })).body.access.remaining, 1);
  assert.equal((await post(pay('3', 'paid', 'checkout.session.async_payment_succeeded'))).status, 200);
  assert.equal((await h.status({ headers: me })).body.access.remaining, 2);
  // refund revokes that purchase only
  assert.equal((await post({ id: 'ev_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_2' } } })).status, 200);
  assert.equal((await h.status({ headers: me })).body.access.remaining, 1);
  assert.equal(calls.n, 1);
}
// fail closed; open mode for local owner use
{
  const h = createHandlers({ env: { OPENAI_API_KEY: 'k' }, store: memoryStore(), mode: 'enforced', mail: { configured: false }, callModel: goodModel });
  assert.equal((await h.review({ headers: {}, body: reviewBody })).status, 503);
  assert.equal((await h.authRequest({ headers: {}, body: { email: 'a@b.co' } })).status, 503);
  const open = createHandlers({ env: { OPENAI_API_KEY: 'k' }, store: memoryStore(), mode: 'open', mail: { configured: false }, callModel: goodModel });
  assert.equal((await open.review({ headers: {}, body: reviewBody })).status, 200);
  assert.equal((await open.status({ headers: {} })).body.access.valid, true);
}
console.log('access checks passed');
