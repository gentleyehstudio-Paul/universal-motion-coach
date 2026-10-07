// Browser side of the access layer: keeps the ticket in localStorage and talks to /api.
const KEY = 'ml_ticket';
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const getTicket = read;
export const setTicket = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };
export const authHeaders = () => (read() ? { Authorization: `Bearer ${read()}` } : {});

export async function fetchStatus() {
  const r = await fetch('/api/status', { headers: authHeaders() });
  if (!r.ok) throw new Error('status');
  return r.json();
}
// Accepts either a promo code (MOSTER-…) or a ticket pasted from the owner.
export async function redeem(input) {
  const v = String(input || '').trim();
  if (!v) throw new Error('請輸入優惠碼或存取碼。');
  if (v.includes('.')) { setTicket(v); return fetchStatus(); }
  const r = await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Motion-Lab': '1' }, body: JSON.stringify({ code: v }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || '無法兌換。');
  setTicket(b.ticket);
  return fetchStatus();
}
