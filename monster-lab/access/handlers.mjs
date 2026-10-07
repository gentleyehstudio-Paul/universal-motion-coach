import { PLANS, publicPlans } from './plans.mjs';
import { verifyTicket, parsePromoCode } from './tickets.mjs';
import { normalizeEmail, sha, newLoginToken, signSession, verifySession, readCookie, sessionCookie, SESSION_COOKIE } from './session.mjs';
import { getGrants, upsertGrant } from './accounts.mjs';
import { loginMail } from './mail.mjs';
import { createCheckout, createPortal, verifyWebhook } from './stripe.mjs';
import { validateFrames, validateReview } from '../ai-policy.mjs';

const fail = (status, error) => ({ status, body: { error } });
const monthKey = (now) => new Date(now).toISOString().slice(0, 7);
const DAY = 86400e3;
const clientIp = (h) => String(h['x-forwarded-for'] || h['x-real-ip'] || 'local').split(',')[0].trim().slice(0, 64);

// ctx: { env, store, mail, now?, mode: 'open'|'enforced', callModel?, fetch? }
// 'open' (local owner use) skips login/entitlements; 'enforced' (public deploy) requires both.
export function createHandlers(ctx) {
  const now = () => (ctx.now ? ctx.now() : Date.now());
  const env = ctx.env, secret = env.ACCESS_SECRET, enforced = ctx.mode === 'enforced';
  const store = ctx.store;
  // Trusted origin only (never the Host header): it ends up inside emailed login links.
  const origin = () => (env.SITE_ORIGIN || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')).replace(/\/$/, '');
  const secure = () => origin().startsWith('https://');
  const misconfigured = () => enforced && (!secret || !store.persistent) ? '權限服務尚未設定完成（ACCESS_SECRET／資料庫）。' : null;
  const userOf = (headers) => verifySession(secret, readCookie(headers.cookie, SESSION_COOKIE), now())?.sub ?? null;

  async function grantState(g) {
    const plan = PLANS[g.plan];
    if (g.exp <= now() || (await store.get(`revoked:${g.id}`))) return null;
    const used = plan.period === 'month' ? Number(await store.get(`quota:${g.id}:${monthKey(now())}`) || 0) : (await store.get(`used:${g.id}`)) ? 1 : 0;
    return { grant: g, plan, remaining: Math.max(0, plan.reviews - used) };
  }
  // Prefer renewable (monthly/project) grants that still have quota, then one-time ones.
  async function bestGrant(email) {
    const states = (await Promise.all((await getGrants(store, email)).map(grantState))).filter(Boolean);
    const rank = (s) => (s.remaining > 0 ? 0 : 2) + (s.plan.period === 'month' ? 0 : 1);
    return states.sort((a, b) => rank(a) - rank(b) || b.grant.exp - a.grant.exp)[0] ?? null;
  }
  // One-time grants (promo, single) stack: show the total credits left, not just the first grant's.
  const oneTimeCredits = async (email) => (await Promise.all((await getGrants(store, email)).map(grantState))).filter((x) => x && x.plan.period !== 'month').reduce((n, x) => n + x.remaining, 0);
  const hasActiveSubscription = async (email) => (await Promise.all((await getGrants(store, email)).filter((g) => g.id.startsWith('sub_')).map(grantState))).some(Boolean);

  async function rateLimit(key, limit, ttl) { return (await store.incr(key, 1, ttl)) <= limit; }

  return {
    async status({ headers }) {
      const access = { mode: ctx.mode, plans: publicPlans(), user: null };
      const bad = misconfigured();
      if (bad) access.error = bad;
      else if (!enforced) access.valid = true;
      else {
        const email = userOf(headers);
        access.user = email;
        access.valid = false;
        if (email) {
          const s = await bestGrant(email).catch(() => null);
          if (s) Object.assign(access, { valid: s.remaining > 0, plan: s.plan.id, planLabel: s.plan.label, remaining: s.plan.period === 'month' ? s.remaining : await oneTimeCredits(email), expiresAt: s.grant.exp, canManageBilling: !!(await store.get(`cust:${email}`)) });
        }
      }
      return { status: 200, body: { configured: !!env.OPENAI_API_KEY, provider: 'OpenAI', access } };
    },

    // --- email login (magic link) ---
    async authRequest({ headers, body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      const email = normalizeEmail(body?.email);
      if (!email) return fail(400, '請輸入有效的 Email。');
      if (!origin() && !ctx.devLogin) return fail(503, '網站網址（SITE_ORIGIN）尚未設定。');
      if (!(await rateLimit(`rl:email:${sha(email)}`, 5, 3600)) || !(await rateLimit(`rl:ip:${sha(clientIp(headers))}`, 30, 3600))) return fail(429, '要求次數過多，請一小時後再試。');
      const token = newLoginToken();
      await store.set(`login:${sha(token)}`, email, 900);
      const link = `${origin() || ctx.devLogin}/login#token=${token}`;
      const generic = { sent: true };
      if (ctx.mail.configured) await ctx.mail.send({ to: email, ...loginMail(link) });
      else if (ctx.devLogin) { console.log(`[dev login] ${email}: ${link}`); generic.devLink = link; }
      else return fail(503, '寄信服務尚未設定（RESEND_API_KEY／MAIL_FROM）。');
      return { status: 200, body: generic }; // same answer for any address: no account enumeration
    },
    async authVerify({ body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      const token = typeof body?.token === 'string' ? body.token.slice(0, 100) : '';
      const email = token ? await store.take(`login:${sha(token)}`) : null;
      if (!email) return fail(400, '登入連結無效或已過期，請重新取得。');
      return { status: 200, body: { email }, cookies: [sessionCookie(signSession(secret, email, now()), { secure: secure() })] };
    },
    async logout() { return { status: 200, body: { ok: true }, cookies: [sessionCookie('', { secure: secure() })] }; },

    // --- redeem a promo code or an owner-issued ticket into the signed-in account ---
    async redeem({ headers, body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      const email = userOf(headers);
      if (!email) return fail(401, '請先登入再兌換。');
      const input = String(body?.code ?? '').trim();
      let grant = null;
      if (input.includes('.')) {
        const t = verifyTicket(secret, input, now());
        if (t) grant = { id: t.id, plan: t.plan, exp: t.exp * 1000 };
      } else {
        const p = parsePromoCode(secret, input);
        if (p) grant = { id: p.ticketId, plan: 'trial', exp: now() + PLANS.trial.ticketDays * DAY };
      }
      if (!grant) return fail(400, '代碼無效，請確認是否輸入完整。');
      if (await store.get(`revoked:${grant.id}`)) return fail(400, '此代碼已停用。');
      await upsertGrant(store, email, grant, now());
      const s = await bestGrant(email);
      return { status: 200, body: { plan: grant.plan, planLabel: PLANS[grant.plan].label, remaining: s?.remaining ?? 0 } };
    },

    // --- paid analysis ---
    async review({ headers, body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      if (!env.OPENAI_API_KEY) return fail(503, '尚未設定伺服器 OPENAI_API_KEY；未傳送任何畫面。');
      if (body?.consent !== true) return fail(400, '必須先同意將選取畫面送至 OpenAI。');
      let reserved = null;
      if (enforced) {
        const email = userOf(headers);
        if (!email) return fail(401, '請先登入。');
        const s = await bestGrant(email);
        if (!s) return fail(402, '需要優惠碼或訂閱才能使用 AI 影片分析。');
        const { grant, plan } = s;
        const spent = plan.period === 'month' ? '本月分析次數已用完，下月自動恢復。' : '此優惠碼的免費分析已使用。';
        if (s.remaining <= 0) return fail(402, spent);
        if (plan.period === 'month') {
          const key = `quota:${grant.id}:${monthKey(now())}`;
          if (await store.incr(key, 1, 40 * 86400) > plan.reviews) { await store.incr(key, -1); return fail(402, spent); }
          reserved = () => store.incr(key, -1);
        } else {
          if (!(await store.setNX(`used:${grant.id}`, now(), 90 * 86400))) return fail(402, spent);
          reserved = () => store.del(`used:${grant.id}`);
        }
      }
      try {
        validateFrames(body);
        const review = validateReview(JSON.parse(await ctx.callModel(body)), body.sport);
        return { status: 200, body: { review } };
      } catch (e) {
        if (reserved) await reserved().catch(() => {}); // failed analysis never costs a credit
        const status = Number.isInteger(e.status) && e.status >= 400 && e.status < 600 ? e.status : 400;
        return fail(status, e.name === 'TimeoutError' ? '服務處理逾時；本次不扣除分析次數，請稍後再試。' : e.message);
      }
    },

    // --- Stripe: monthly subscription ---
    async checkout({ headers, body }) {
      const bad = misconfigured();
      if (bad) return fail(503, bad);
      const plan = body?.plan === 'single' ? 'single' : 'monthly';
      const price = plan === 'single' ? env.STRIPE_PRICE_SINGLE : env.STRIPE_PRICE_MONTHLY;
      if (!env.STRIPE_SECRET_KEY || !price) return fail(503, '線上付款尚未開通。');
      const email = userOf(headers);
      if (!email) return fail(401, '請先登入再購買。');
      if (plan === 'monthly' && await hasActiveSubscription(email)) return fail(409, '你已有進行中的月費方案；可在「管理訂閱」調整。');
      const s = await createCheckout(env, { email, origin: origin(), plan }, ctx.fetch);
      return { status: 200, body: { url: s.url } };
    },
    async portal({ headers }) {
      const email = userOf(headers);
      if (!email) return fail(401, '請先登入。');
      const customer = await store.get(`cust:${email}`);
      if (!customer) return fail(404, '找不到訂閱紀錄。');
      const s = await createPortal(env, { customer, origin: origin() }, ctx.fetch);
      return { status: 200, body: { url: s.url } };
    },
    // rawBody must be the exact bytes Stripe sent (signature is over the raw text).
    async stripeWebhook({ headers, rawBody }) {
      const event = verifyWebhook(env.STRIPE_WEBHOOK_SECRET, rawBody, headers['stripe-signature'], now());
      if (!event) return fail(400, 'invalid signature');
      if (await store.get(`evt:${event.id}`)) return { status: 200, body: { received: true, duplicate: true } };
      const o = event.data?.object ?? {};
      if (event.type === 'checkout.session.completed' && o.mode === 'subscription' && o.subscription) {
        const email = normalizeEmail(o.client_reference_id);
        if (!email) return fail(400, 'no account reference');
        await store.set(`cust:${email}`, o.customer);
        await store.set(`custemail:${o.customer}`, email);
        await upsertGrant(store, email, { id: `sub_${o.subscription}`, plan: 'monthly', exp: now() + 35 * DAY }, now());
      } else if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && o.mode === 'payment') {
        // Single analysis. Paid immediately for cards; delayed methods complete later (async_payment_succeeded).
        if (o.payment_status !== 'paid') { await store.set(`evt:${event.id}`, '1', 7 * 86400); return { status: 200, body: { received: true, pending: true } }; }
        const email = normalizeEmail(o.client_reference_id);
        if (!email) return fail(400, 'no account reference');
        const id = `pay_${o.id}`;
        await upsertGrant(store, email, { id, plan: 'single', exp: now() + PLANS.single.ticketDays * DAY }, now());
        if (o.payment_intent) await store.set(`pi:${o.payment_intent}`, id);
      } else if (event.type === 'charge.refunded' && o.payment_intent) {
        const id = await store.get(`pi:${o.payment_intent}`);
        if (id) await store.set(`revoked:${id}`, '1');
      } else if (event.type === 'invoice.paid') {
        const sub = o.subscription || o.parent?.subscription_details?.subscription;
        const end = o.lines?.data?.[0]?.period?.end;
        if (sub && end) {
          const email = await store.get(`custemail:${o.customer}`);
          if (!email) return fail(500, 'account not linked yet'); // Stripe retries; checkout event will arrive
          await upsertGrant(store, email, { id: `sub_${sub}`, plan: 'monthly', exp: end * 1000 + 3 * DAY }, now());
        }
      } else if (event.type === 'customer.subscription.deleted' && o.id) {
        await store.set(`revoked:sub_${o.id}`, '1');
      }
      await store.set(`evt:${event.id}`, '1', 7 * 86400);
      return { status: 200, body: { received: true } };
    },
  };
}
