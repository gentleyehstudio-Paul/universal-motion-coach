import { createHandlers } from '../access/handlers.mjs';
import { storeFromEnv } from '../access/store.mjs';
import { resendMailer } from '../access/mail.mjs';
import { allowedOrigins } from '../access/origin.mjs';
import { makeCallModel, loadKnowledge } from '../access/model.mjs';

const env = process.env;
let knowledge;
export const handlers = createHandlers({
  env,
  store: storeFromEnv(env),
  mail: resendMailer(env),
  // Public deploys always enforce login + entitlements. There is intentionally no "open" switch here.
  mode: 'enforced',
  callModel: async (b) => makeCallModel(env, (knowledge ??= await loadKnowledge()))(b),
});

const readRaw = async (req) => { let t = ''; for await (const c of req) t += c; return t; };

// Wraps a handler as a Vercel Node function with the same request guards as the local server.
// opts.raw: pass the untouched request text (Stripe signatures) and skip the CSRF header check.
export const route = (method, fn, opts = {}) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== method) return send(405, { error: '不支援的請求方法。' });
  if (method === 'POST' && !opts.raw) {
    const allowed = allowedOrigins(env.SITE_ORIGIN); // e.g. https://mosterlab.com (also accepts the www twin)
    if (req.headers['x-motion-lab'] !== '1') return send(403, { error: '請由 Moster Lab 網站發送。' });
    const from = req.headers.origin;
    if (allowed.length && from && !allowed.includes(from)) return send(403, { error: '來源網址與伺服器設定的網站網址（SITE_ORIGIN）不一致，請站長檢查設定。' });
  }
  try {
    const r = await fn(opts.raw ? { headers: req.headers, rawBody: await readRaw(req) } : { headers: req.headers, body: req.body });
    if (r.cookies) res.setHeader('Set-Cookie', r.cookies);
    send(r.status, r.body);
  } catch (e) {
    send(500, { error: e.expose ? e.message : '服務暫時無法使用，請稍後再試。' });
  }
};
