import { fetchStatus, redeem, logout, startCheckout, openPortal } from './access.mjs?v=3';

// Fill once a booking/contact channel exists (LINE, form, ...). The project plan is booked, not checked out.
const PROJECT_LINK = '';

const $ = (id) => document.getElementById(id);
let status = null;

function render() {
  const a = status?.access || {};
  const enforced = a.mode === 'enforced';
  $('loginLink').hidden = !enforced || !!a.user;
  $('logoutBtn').hidden = !a.user;
  $('portalBtn').hidden = !a.canManageBilling;
  $('ticketForm').hidden = !a.user;
  $('accessState').textContent = !enforced ? '目前為本機模式，不需登入。'
    : a.error ? a.error
    : !a.user ? '尚未登入。登入後才能兌換優惠碼或訂閱。'
    : a.plan ? `${a.user}　·　${a.planLabel}，剩餘 ${a.remaining} 次分析。` : `${a.user}　·　尚無方案。`;
  $('redeemNote').textContent = enforced && !a.user ? '請先登入再兌換。' : '';
  const sg = document.querySelector('[data-cta="single"]');
  if (sg) { sg.textContent = a.user ? '購買 NT$129 / 次' : '登入後購買'; sg.setAttribute('aria-disabled', String(!enforced || !!a.error)); }
  const m = document.querySelector('[data-cta="monthly"]'), p = document.querySelector('[data-cta="project"]');
  if (m) { m.textContent = !a.user ? '登入後訂閱' : a.plan === 'monthly' ? '目前方案' : '訂閱 NT$399 / 月'; m.setAttribute('aria-disabled', String(!!status?.checkoutOff || a.plan === 'monthly')); }
  if (p) { if (PROJECT_LINK) { p.href = PROJECT_LINK; p.rel = 'noopener'; p.textContent = '預約洽談'; } else { p.textContent = '即將開放預約'; p.setAttribute('aria-disabled', 'true'); } }
}
async function refresh() { try { status = await fetchStatus(); } catch { status = null; } render(); }

for (const plan of ['single', 'monthly']) document.querySelector(`[data-cta="${plan}"]`).addEventListener('click', async (e) => {
  e.preventDefault();
  const a = status?.access || {};
  if (!a.user) { location.href = '/login?next=/pricing'; return; }
  try { await startCheckout(plan); } catch (err) { $('accessState').textContent = err.message; }
});
$('portalBtn').addEventListener('click', () => openPortal().catch((err) => { $('accessState').textContent = err.message; }));
$('logoutBtn').addEventListener('click', async () => { await logout().catch(() => {}); refresh(); });
async function submitCode(e, input, note) {
  e.preventDefault();
  if (!status?.access?.user) { location.href = '/login?next=/pricing'; return; }
  note.textContent = '驗證中…';
  try {
    const r = await redeem(input.value);
    input.value = ''; note.innerHTML = `已啟用「${r.planLabel}」。<a href="/app/">前往上傳影片 ↗</a>`;
    refresh();
  } catch (err) { note.textContent = err.message; }
}
$('redeemForm').addEventListener('submit', (e) => submitCode(e, $('redeemInput'), $('redeemNote')));
$('ticketForm').addEventListener('submit', (e) => submitCode(e, $('ticketInput'), $('ticketNote')));
if (new URLSearchParams(location.search).get('paid')) $('accessState').textContent = '付款完成，方案開通中（通常幾秒內）…';
refresh();
if (new URLSearchParams(location.search).get('paid')) setTimeout(refresh, 4000);
