import { fetchStatus, redeem, requestLogin, logout, startCheckout, openPortal } from './access.mjs?v=4';

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
  $('redeemEmailWrap').hidden = !!a.user;
  $('redeemBtn').textContent = a.user ? '兌換' : '寄登入連結並兌換';
  $('goApp').hidden = !(a.user && a.valid);
  $('accessState').textContent = !enforced ? '目前為本機模式，不需登入。'
    : a.error ? a.error
    : !a.user ? '尚未登入。登入後才能兌換優惠碼或訂閱。'
    : a.plan ? `${a.user}　·　${a.planLabel}，剩餘 ${a.remaining} 次分析。已綁定在你的帳號，上傳頁不用再輸入優惠碼。` : `${a.user}　·　尚無方案。`;
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
// One form, one entry: logged out -> email + code in a single step (code is redeemed when the link is opened);
// logged in -> just the code.
$('redeemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = $('redeemNote'), code = $('redeemInput').value, btn = $('redeemBtn');
  btn.disabled = true; note.textContent = '處理中…';
  try {
    if (!status?.access?.user) {
      const email = $('redeemEmail').value.trim();
      if (!email) throw new Error('請輸入 Email。');
      await requestLogin(email, code, '/app/');
      note.textContent = `已寄到 ${email}。到信箱點連結登入後，優惠碼會自動兌換並帶你去上傳影片。`;
    } else {
      const r = await redeem(code);
      $('redeemInput').value = ''; note.innerHTML = `已啟用「${r.planLabel}」，剩餘 ${r.remaining} 次分析。<strong>不用在上傳頁再輸入優惠碼</strong>，直接 <a href="/app/">前往上傳影片 ↗</a>`;
      refresh();
    }
  } catch (err) { note.textContent = err.message; } finally { btn.disabled = false; }
});
if (new URLSearchParams(location.search).get('paid')) $('accessState').textContent = '付款完成，方案開通中（通常幾秒內）…';
refresh();
if (new URLSearchParams(location.search).get('paid')) setTimeout(refresh, 4000);
