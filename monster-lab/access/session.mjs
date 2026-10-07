import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const b64 = (b) => Buffer.from(b).toString('base64url');
// Separate HMAC key per purpose so a session cookie can never be replayed as a ticket.
const mac = (secret, purpose, data) => createHmac('sha256', createHmac('sha256', secret).update(`ml:${purpose}`).digest()).update(data).digest();
const eq = (a, b) => a.length === b.length && timingSafeEqual(a, b);

export const SESSION_COOKIE = 'ml_session';
export const SESSION_DAYS = 30;

export function normalizeEmail(input) {
  const e = String(input ?? '').trim().toLowerCase();
  return e.length <= 254 && /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]{2,}$/.test(e) ? e : null;
}
export const sha = (s) => createHash('sha256').update(String(s)).digest('base64url');
export const newLoginToken = () => randomBytes(32).toString('base64url');

export function signSession(secret, email, now = Date.now()) {
  const body = b64(JSON.stringify({ v: 1, sub: email, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 }));
  return `${body}.${b64(mac(secret, 'session', body))}`;
}
export function verifySession(secret, token, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 600) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !eq(Buffer.from(sig, 'base64url'), mac(secret, 'session', body))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p?.v === 1 && normalizeEmail(p.sub) && p.exp * 1000 > now ? p : null; } catch { return null; }
}
export const readCookie = (header, name) => {
  for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); }
  return null;
};
export const sessionCookie = (value, { secure }) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? SESSION_DAYS * 86400 : 0}${secure ? '; Secure' : ''}`;
