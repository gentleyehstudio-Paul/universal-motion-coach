import { redeem, fetchStatus, setTicket } from './access.mjs?v=1';

// Set these once payment/booking channels exist. Until then the buttons stay honest.
// monthly: payment-provider checkout link; project: booking/contact link (LINE, form, ...).
const LINKS = { monthly: '', project: '' };

for (const a of document.querySelectorAll('[data-cta]')) {
  const href = LINKS[a.dataset.cta];
  if (href) { a.href = href; a.rel = 'noopener'; } else if (a.dataset.cta === 'project') { a.textContent = '即將開放預約'; a.setAttribute('aria-disabled', 'true'); } else a.setAttribute('aria-disabled', 'true');
}

const $ = (id) => document.getElementById(id);
const describe = (s) => {
  const a = s.access || {};
  if (a.mode !== 'enforced') return '目前為本機模式，不需存取碼。';
  return a.valid ? `已啟用「${a.planLabel}」，剩餘 ${a.remaining} 次分析。` : '貼上你收到的存取碼即可啟用。';
};
async function submit(e, input, note) {
  e.preventDefault();
  const isPromo = e.currentTarget.id === 'redeemForm';
  note.textContent = '驗證中…';
  try {
    const s = await redeem(input.value);
    if (s.access?.mode === 'enforced' && !s.access.valid) { setTicket(''); throw new Error('存取碼無效或已過期。'); }
    input.value = ''; note.textContent = '';
    $('accessState').textContent = describe(s);
    if (isPromo) note.innerHTML = '兌換成功！<a href="/app/">前往上傳影片 ↗</a>';
  } catch (err) { note.textContent = err.message; }
}
$('redeemForm').addEventListener('submit', (e) => submit(e, $('redeemInput'), $('redeemNote')));
$('ticketForm').addEventListener('submit', (e) => submit(e, $('ticketInput'), $('ticketNote')));
fetchStatus().then((s) => { $('accessState').textContent = describe(s); }).catch(() => {});
