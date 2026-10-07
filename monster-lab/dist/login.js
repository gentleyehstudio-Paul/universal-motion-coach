import { requestLogin, verifyLogin, fetchStatus } from './access.mjs?v=2';

const $ = (id) => document.getElementById(id);
const next = (() => { const n = new URLSearchParams(location.search).get('next') || '/pricing'; return /^\/[a-z0-9/_-]*$/i.test(n) && !n.startsWith('//') ? n : '/pricing'; })();

// Landing from the emailed link: the token is in the fragment (never sent to servers or logs),
// and is only spent when this script POSTs it — so mail scanners that open links can't burn it.
const token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) {
  history.replaceState(null, '', location.pathname);
  $('loginForm').hidden = true;
  $('loginLead').textContent = '登入中…';
  verifyLogin(token).then(() => { location.replace(next); }).catch((e) => {
    $('loginLead').textContent = e.message; $('loginForm').hidden = false;
  });
} else {
  fetchStatus().then((s) => { if (s.access?.user) $('loginLead').textContent = `目前已登入：${s.access.user}。要換帳號可重新輸入。`; }).catch(() => {});
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button'); btn.disabled = true; $('loginNote').textContent = '寄送中…';
  try {
    const r = await requestLogin($('loginEmail').value);
    $('loginNote').textContent = '已寄出。請到信箱點連結登入（沒收到請看垃圾信件匣）。';
    if (r.devLink) { const a = document.createElement('a'); a.href = r.devLink; a.textContent = '〔開發模式〕直接登入'; $('loginNote').append(' ', a); }
  } catch (err) { $('loginNote').textContent = err.message; } finally { btn.disabled = false; }
});
