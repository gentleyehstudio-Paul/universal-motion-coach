import { createHandlers } from '../access/handlers.mjs';
import { storeFromEnv } from '../access/store.mjs';
import { makeCallModel, loadKnowledge } from '../access/model.mjs';

const env = process.env;
let knowledge;
export const handlers = createHandlers({
  env,
  store: storeFromEnv(env),
  // Public deploys always enforce tickets. There is intentionally no "open" switch here.
  mode: 'enforced',
  callModel: async (b) => makeCallModel(env, (knowledge ??= await loadKnowledge()))(b),
});

// Wraps a handler as a Vercel Node function with the same request guards as the local server.
export const route = (method, fn) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== method) return send(405, { error: '不支援的請求方法。' });
  if (method === 'POST') {
    const site = env.SITE_ORIGIN; // e.g. https://moster-lab.com — set once the domain is connected
    if (req.headers['x-motion-lab'] !== '1' || (site && req.headers.origin && req.headers.origin !== site)) return send(403, { error: '請由 Moster Lab 網站發送。' });
  }
  try {
    const r = await fn({ headers: req.headers, body: req.body });
    send(r.status, r.body);
  } catch (e) {
    send(500, { error: '服務暫時無法使用，請稍後再試。' });
  }
};
