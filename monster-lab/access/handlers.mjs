import { PLANS, publicPlans } from './plans.mjs';
import { issueTicket, verifyTicket, parsePromoCode } from './tickets.mjs';
import { validateFrames, validateReview, REVIEW_PROMPT } from '../ai-policy.mjs';

const fail = (status, error) => ({ status, body: { error } });
const monthKey = (now) => new Date(now).toISOString().slice(0, 7);
const bearer = (headers) => /^Bearer\s+(\S+)$/i.exec(headers.authorization || '')?.[1] ?? null;

// ctx: { env, store, now?, mode: 'open' | 'enforced', callModel?(body)->Promise<review JSON text> }
// 'open' (local owner use) skips tickets entirely; 'enforced' (public deploy) requires them.
export function createHandlers(ctx) {
  const now = () => (ctx.now ? ctx.now() : Date.now());
  const secret = ctx.env.ACCESS_SECRET;
  const enforced = ctx.mode === 'enforced';
  // Public deploys must fail closed: no secret or no persistent store means no paid access.
  const misconfigured = () => enforced && (!secret || !ctx.store.persistent) ? '權限服務尚未設定完成（ACCESS_SECRET／資料庫）。' : null;

  async function inspect(token) {
    const t = verifyTicket(secret, token, now());
    if (!t) return null;
    if (await ctx.store.get(`revoked:${t.id}`)) return null;
    const plan = PLANS[t.plan];
    const used = plan.period === 'month' ? Number(await ctx.store.get(`quota:${t.id}:${monthKey(now())}`) || 0) : (await ctx.store.get(`used:${t.id}`)) ? 1 : 0;
    return { ticket: t, plan, remaining: Math.max(0, plan.reviews - used), expiresAt: t.exp * 1000 };
  }

  return {
    async status({ headers }) {
      const access = { mode: ctx.mode, plans: publicPlans() };
      const bad = misconfigured();
      if (bad) access.error = bad;
      else if (enforced) {
        const s = await inspect(bearer(headers)).catch(() => null);
        if (s) Object.assign(access, { valid: true, plan: s.plan.id, planLabel: s.plan.label, remaining: s.remaining, expiresAt: s.expiresAt });
        else access.valid = false;
      }
      return { status: 200, body: { configured: !!ctx.env.OPENAI_API_KEY, provider: 'OpenAI', access } };
    },

    async redeem({ body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      const p = parsePromoCode(secret, body?.code);
      if (!p) return fail(400, '優惠碼無效，請確認是否輸入完整。');
      if (await ctx.store.get(`revoked:${p.ticketId}`)) return fail(400, '此優惠碼已停用。');
      const ticket = issueTicket(secret, { plan: 'trial', id: p.ticketId }, now());
      const s = await inspect(ticket);
      return { status: 200, body: { ticket, plan: 'trial', planLabel: PLANS.trial.label, remaining: s.remaining } };
    },

    async review({ headers, body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      if (!ctx.env.OPENAI_API_KEY) return fail(503, '尚未設定伺服器 OPENAI_API_KEY；未傳送任何畫面。');
      if (body?.consent !== true) return fail(400, '必須先同意將選取畫面送至 OpenAI。');
      let reserved = null;
      if (enforced) {
        const s = await inspect(bearer(headers));
        if (!s) return fail(402, '需要有效的優惠碼或訂閱才能使用 AI 影片分析。');
        if (s.remaining <= 0) return fail(402, s.plan.period === 'month' ? '本月分析次數已用完，下月自動恢復。' : '此優惠碼的免費分析已使用。');
        const { ticket, plan } = s;
        if (plan.period === 'month') {
          const key = `quota:${ticket.id}:${monthKey(now())}`;
          if (await ctx.store.incr(key, 1, 40 * 86400) > plan.reviews) { await ctx.store.incr(key, -1); return fail(402, '本月分析次數已用完，下月自動恢復。'); }
          reserved = () => ctx.store.incr(key, -1);
        } else {
          if (!(await ctx.store.setNX(`used:${ticket.id}`, now(), 90 * 86400))) return fail(402, '此優惠碼的免費分析已使用。');
          reserved = () => ctx.store.del(`used:${ticket.id}`);
        }
      }
      try {
        validateFrames(body);
        const review = validateReview(JSON.parse(await ctx.callModel(body)), body.sport);
        return { status: 200, body: { review } };
      } catch (e) {
        // Analysis did not complete: give the credit back (never silently charge for failures).
        if (reserved) await reserved().catch(() => {});
        const status = Number.isInteger(e.status) && e.status >= 400 && e.status < 600 ? e.status : 400;
        return fail(status, e.name === 'TimeoutError' ? '服務處理逾時；本次不扣除分析次數，請稍後再試。' : e.message);
      }
    },
  };
}
export { REVIEW_PROMPT };
