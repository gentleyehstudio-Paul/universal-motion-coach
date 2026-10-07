// Sends the sign-in email through Resend's REST API (no SDK). Needs RESEND_API_KEY and
// MAIL_FROM on a domain verified in Resend (e.g. "Moster Lab <login@your-domain.com>").
export function resendMailer(env, fetchImpl = fetch) {
  return {
    configured: !!(env.RESEND_API_KEY && env.MAIL_FROM),
    async send({ to, subject, text }) {
      const r = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }) });
      if (!r.ok) throw Object.assign(new Error('登入信寄送失敗，請稍後再試。'), { expose: true });
    },
  };
}
export const loginMail = (link) => ({
  subject: 'Moster Lab 登入連結',
  text: `點下方連結登入 Moster Lab（15 分鐘內有效，只能使用一次）：\n\n${link}\n\n如果不是你本人要求登入，請忽略這封信，不會有任何改變。`,
});
