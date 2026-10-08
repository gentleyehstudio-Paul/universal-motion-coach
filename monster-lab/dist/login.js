import { requestLogin, verifyLogin, fetchStatus } from './access.mjs?v=4';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const safeNext = (n) => (['/app/', '/pricing'].includes(n) ? n : '');
const next = safeNext(params.get('next')) || '/app/';
const step = (n) => { for (const i of [1, 2, 3]) $('flow' + i).classList.toggle('on', i === n); };

// Promo links: /login?code=MOSTER-... pre-fills the field.
if (params.get('code')) $('loginCode').value = params.get('code');
const label = () => { $('loginBtn').textContent = $('loginCode').value.trim() ? '寄登入連結並兌換優惠碼' : '寄登入連結'; };
$('loginCode').addEventListener('input', label); label();

// Landing from the emailed link: the token is in the fragment (never sent to servers or logs) and is
// only spent when this script POSTs it, so mail scanners that open links can't burn it.
const token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) {
  history.replaceState(null, '', location.pathname);
  $('loginForm').hidden = true; step(3);
  $('loginLead').textContent = '登入中…';
  verifyLogin(token).then((r) => {
    $('loginLead').textContent = r.redeemed ? `登入成功，已兌換「${r.redeemed.planLabel}」（剩餘 ${r.redeemed.remaining} 次分析）。正在前往…` : r.redeemError ? `登入成功。${r.redeemError}` : '登入成功，正在前往…';
    setTimeout(() => location.replace(safeNext(r.next) || next), r.redeemError ? 2500 : 900);
  }).catch((e) => { $('loginLead').textContent = e.message; $('loginForm').hidden = false; step(1); });
} else {
  fetchStatus().then((s) => { if (s.access?.user) $('loginLead').textContent = `目前已登入：${s.access.user}。要換帳號可重新輸入。`; }).catch(() => {});
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('loginBtn'); btn.disabled = true; $('loginNote').textContent = '寄送中…';
  try {
    const email = $('loginEmail').value.trim();
    const r = await requestLogin(email, $('loginCode').value, next);
    $('loginForm').hidden = true; $('sentBox').hidden = false; step(2);
    $('loginLead').hidden = true;
    $('sentText').textContent = `已寄到 ${email}。請到信箱點連結（沒收到請看垃圾信件匣）。${$('loginCode').value.trim() ? '優惠碼已確認，登入後會自動兌換。' : ''}`;
    if (r.devLink) { const a = document.createElement('a'); a.href = r.devLink; a.textContent = '〔開發模式〕直接登入'; $('sentText').append(' ', a); }
  } catch (err) { $('loginNote').textContent = err.message; } finally { btn.disabled = false; }
});
$('resendBtn').addEventListener('click', () => { $('sentBox').hidden = true; $('loginForm').hidden = false; $('loginLead').hidden = false; step(1); });
