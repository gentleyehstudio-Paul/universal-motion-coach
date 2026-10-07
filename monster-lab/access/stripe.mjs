import { createHmac, timingSafeEqual } from 'node:crypto';

// Stripe via plain REST (form-encoded) — no SDK, so it runs anywhere fetch exists.
async function stripe(env, path, params, fetchImpl = fetch) {
  const body = new URLSearchParams();
  const add = (k, v) => { if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) add(`${k}[${k2}]`, v2); else if (v !== undefined) body.append(k, String(v)); };
  for (const [k, v] of Object.entries(params)) add(k, v);
  const r = await fetchImpl(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('付款服務暫時無法使用，請稍後再試。'), { expose: true });
  return j;
}
export const createCheckout = (env, { email, origin, plan }, f) => stripe(env, 'checkout/sessions', {
  mode: plan === 'monthly' ? 'subscription' : 'payment',
  'line_items[0][price]': plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_SINGLE, 'line_items[0][quantity]': 1,
  customer_email: email, client_reference_id: email, success_url: `${origin}/pricing?paid=1`, cancel_url: `${origin}/pricing`,
  allow_promotion_codes: 'true',
}, f);
export const createPortal = (env, { customer, origin }, f) => stripe(env, 'billing_portal/sessions', { customer, return_url: `${origin}/pricing` }, f);

// Stripe-Signature: t=<unix>,v1=<hmac_sha256(secret, `${t}.${rawBody}`)>[,v1=...]
export function verifyWebhook(secret, rawBody, header, now = Date.now(), toleranceSec = 300) {
  if (!secret || typeof header !== 'string') return null;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const ok = parts.some(([k, v]) => k === 'v1' && v && v.length === expected.length * 2 && timingSafeEqual(Buffer.from(v, 'hex'), expected));
  if (!ok) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}
