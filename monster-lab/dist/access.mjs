// Browser side of the access layer. The session lives in an HttpOnly cookie set by the
// server; the page only ever sees {user, plan, remaining} from /api/status.
const post = async (path, data = {}) => {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Motion-Lab': '1' }, body: JSON.stringify(data) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || '服務暫時無法使用。');
  return b;
};
export async function fetchStatus() {
  const r = await fetch('/api/status');
  if (!r.ok) throw new Error('status');
  return r.json();
}
// code (optional promo) is checked immediately and redeemed automatically when the emailed link is opened;
// next (/app/ or /pricing) is where that link sends the person afterwards.
export const requestLogin = (email, code = '', next = '') => post('/api/auth/request', { email, code, next });
export const verifyLogin = (token) => post('/api/auth/verify', { token });
export const logout = () => post('/api/auth/logout');
export const redeem = (code) => post('/api/redeem', { code: String(code || '').trim() });
export const startCheckout = (plan) => post('/api/checkout', { plan }).then((b) => { location.href = b.url; });
export const openPortal = () => post('/api/portal').then((b) => { location.href = b.url; });
