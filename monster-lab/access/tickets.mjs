import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PLANS } from './plans.mjs';

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (secret, data) => createHmac('sha256', secret).update(data).digest();
const eq = (a, b) => a.length === b.length && timingSafeEqual(a, b);

// A ticket is a signed, expiring bearer token: base64url(payload).base64url(hmac).
// Payload: {v, id, plan, exp (unix s), note?}. Created by promo redemption or, later,
// by the payment webhook; verified statelessly. Usage/revocation live in the store.
export function issueTicket(secret, { plan, id, days, note }, now = Date.now()) {
  if (!secret) throw new Error('ACCESS_SECRET 未設定。');
  const p = PLANS[plan];
  if (!p) throw new Error(`未知方案：${plan}`);
  const payload = { v: 1, id: id || randomBytes(9).toString('base64url'), plan, exp: Math.floor(now / 1000) + 86400 * (days ?? p.ticketDays) };
  if (note) payload.note = String(note).slice(0, 60);
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(sign(secret, body))}`;
}

export function verifyTicket(secret, token, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 600) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  if (!eq(Buffer.from(mac, 'base64url'), sign(secret, body))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (p?.v !== 1 || !PLANS[p.plan] || typeof p.id !== 'string' || !(p.exp * 1000 > now)) return null;
  return p;
}

// Promo codes: MOSTER-XXXXXXXX-CCCC. The check group is an HMAC of the random body, so
// codes need no database list to validate — only the single analysis credit is tracked.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const toBase32 = (buf, n) => Array.from(buf.subarray(0, n), (x) => ALPHABET[x % 32]).join('');
const checkOf = (secret, body) => toBase32(sign(secret, `promo:${body}`), 4);
export const normalizeCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function makePromoCode(secret) {
  if (!secret) throw new Error('ACCESS_SECRET 未設定。');
  const body = toBase32(randomBytes(8), 8);
  return `MOSTER-${body}-${checkOf(secret, body)}`;
}
export function parsePromoCode(secret, input) {
  const n = normalizeCode(input);
  const m = /^MOSTER([A-Z2-9]{8})([A-Z2-9]{4})$/.exec(n);
  if (!m || !secret || !eq(Buffer.from(checkOf(secret, m[1])), Buffer.from(m[2]))) return null;
  // Deterministic ticket id: redeeming the same code twice yields the same ticket,
  // so the single analysis credit can never be duplicated by re-redeeming.
  return { body: m[1], ticketId: 'p' + createHash('sha256').update(`promo:${m[1]}`).digest('base64url').slice(0, 16) };
}
