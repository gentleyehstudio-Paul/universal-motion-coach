// Minimal key/value store used for credit usage, monthly quota and revocation.
// Memory store: local dev/tests only. Upstash Redis (REST): works on Vercel serverless.
export function memoryStore() {
  const m = new Map();
  const live = (k) => { const e = m.get(k); if (e && e.exp && e.exp < Date.now()) { m.delete(k); return null; } return e ?? null; };
  return {
    kind: 'memory', persistent: false,
    async setNX(k, v, ttlSec) { if (live(k)) return false; m.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 }); return true; },
    async set(k, v, ttlSec) { m.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 }); },
    async get(k) { return live(k)?.v ?? null; },
    async take(k) { const v = live(k)?.v ?? null; m.delete(k); return v; },
    async del(k) { m.delete(k); },
    async incr(k, by = 1, ttlSec) { const e = live(k); const v = (e ? Number(e.v) : 0) + by; m.set(k, { v, exp: e?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) }); return v; },
  };
}

export function upstashStore(url, token, fetchImpl = fetch) {
  const cmd = async (args) => {
    const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('權限資料庫暫時無法使用。');
    return j.result;
  };
  return {
    kind: 'upstash', persistent: true,
    async setNX(k, v, ttlSec) { return (await cmd(['SET', k, String(v), 'NX', ...(ttlSec ? ['EX', String(ttlSec)] : [])])) === 'OK'; },
    async set(k, v, ttlSec) { await cmd(['SET', k, String(v), ...(ttlSec ? ['EX', String(ttlSec)] : [])]); },
    async get(k) { return cmd(['GET', k]); },
    async take(k) { return cmd(['GETDEL', k]); },
    async del(k) { await cmd(['DEL', k]); },
    async incr(k, by = 1, ttlSec) { const v = await cmd(['INCRBY', k, String(by)]); if (ttlSec) await cmd(['EXPIRE', k, String(ttlSec), 'NX']); return Number(v); },
  };
}

export function storeFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? upstashStore(url, token) : memoryStore();
}
