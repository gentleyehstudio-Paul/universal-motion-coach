import { PLANS } from './plans.mjs';

// A grant = one entitlement on an account: {id, plan, exp (ms)}. Usage counters and
// revocation are keyed by grant id, so the same grant can't be double-spent.
const key = (email) => `ent:${email}`;
export async function getGrants(store, email) {
  try { const g = JSON.parse(await store.get(key(email)) || '[]'); return Array.isArray(g) ? g.filter((x) => PLANS[x?.plan] && typeof x.id === 'string') : []; } catch { return []; }
}
// Insert or extend (never shorten) a grant. Returns the stored list.
export async function upsertGrant(store, email, grant, now = Date.now()) {
  const list = (await getGrants(store, email)).filter((g) => g.exp > now - 90 * 86400e3);
  const i = list.findIndex((g) => g.id === grant.id);
  if (i >= 0) list[i] = { ...list[i], exp: Math.max(list[i].exp, grant.exp) }; else list.push({ id: grant.id, plan: grant.plan, exp: grant.exp });
  await store.set(key(email), JSON.stringify(list.slice(-20)));
  return list;
}
