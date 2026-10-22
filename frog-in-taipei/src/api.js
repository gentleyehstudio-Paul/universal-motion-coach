// Lead-capture / coupon / leaderboard API client.
//
//   cfg.api.mode = "mock"  -> everything is faked in localStorage (default; no backend needed)
//   cfg.api.mode = "http"  -> talks to the Cardstox backend at cfg.api.baseUrl
//
// The contract is documented in docs/API.md. Both implementations return the same shapes,
// so switching from mock to the real backend is a one-line config change.
import { fnv1a } from './rng.js';
import { verifyRun } from './verify.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ISO week in Taipei time, e.g. "2026-W43". Leaderboard resets every Monday 00:00 (UTC+8).
export function weekKey(date = new Date()) {
  const d = new Date(date.getTime() + 8 * 3600 * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

export function maskEmail(email) {
  const [u, d] = email.split('@');
  return (u.slice(0, 2) + '***') + '@' + d;
}

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(prefix, seedStr) {
  let h1 = fnv1a(seedStr), h2 = fnv1a(seedStr + '#salt');
  let s = '';
  for (let i = 0; i < 4; i++) { s += B32[h1 & 31]; h1 >>>= 5; }
  s += '-';
  for (let i = 0; i < 4; i++) { s += B32[h2 & 31]; h2 >>>= 5; }
  return `${prefix}-${s}`;
}

const FAKE_NAMES = ['蛙蛙大隊長', '捷運通勤蛙', '忠孝東路蛙', '外送追追追', '珍奶不加糖', '紅燈衝刺蛙', '跳車達人', '北車迷路蛙', '雨天不怕蛙', '跳跳虎'];

// ------------------------------------------------------------------ mock
class MockApi {
  constructor(cfg) { this.cfg = cfg; }

  session() { return LS.get('fit.session', null); }

  async login({ method, email, consents, cardCount, noticeVersion }) {
    await delay(350);
    if (method === 'google') email = email || 'player.demo@gmail.example';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw apiError('invalid_email', '請輸入正確的 Email');
    const id = 'u_' + fnv1a(email.toLowerCase()).toString(16);
    const users = LS.get('fit.mock.users', {});
    const prev = users[id];
    users[id] = {
      id, email: email.toLowerCase(), method, cardCount: cardCount || (prev && prev.cardCount) || null,
      consents: {
        cardstox: !!(consents && consents.cardstox), partner: !!(consents && consents.partner),
        noticeVersion, at: new Date().toISOString(),
      },
      createdAt: (prev && prev.createdAt) || new Date().toISOString(),
    };
    LS.set('fit.mock.users', users);
    const session = { token: 'mock.' + id, user: { id, email: users[id].email, name: maskEmail(users[id].email) } };
    LS.set('fit.session', session);
    return session;
  }

  logout() { try { localStorage.removeItem('fit.session'); } catch { /* ignore */ } }

  async updateProfile({ cardCount }) {
    const s = this.session();
    if (!s) return { ok: false };
    const users = LS.get('fit.mock.users', {});
    if (users[s.user.id]) { users[s.user.id].cardCount = cardCount; LS.set('fit.mock.users', users); }
    return { ok: true };
  }

  async claimCoupon(couponId) {
    await delay(300);
    const s = this.session();
    if (!s) throw apiError('unauthorized', '請先登入');
    const def = this.cfg.coupons[couponId];
    if (!def) throw apiError('unknown_coupon', '找不到這張優惠券');
    const claims = LS.get('fit.mock.claims', {});
    const mine = claims[couponId + ':' + s.user.id];
    if (mine) return { status: 'already', coupon: toCoupon(def, mine) };
    const count = Object.keys(claims).filter((k) => k.startsWith(couponId + ':')).length;
    if (count >= def.supplyLimit) return { status: 'sold_out' };
    const rec = { code: makeCode(def.codePrefix, couponId + s.user.id), at: new Date().toISOString() };
    claims[couponId + ':' + s.user.id] = rec;
    LS.set('fit.mock.claims', claims);
    return { status: 'ok', coupon: toCoupon(def, rec) };
  }

  async submitScore(run) {
    await delay(300);
    const s = this.session();
    if (!s) throw apiError('unauthorized', '請先登入');
    const v = verifyRun(this.cfg, run);
    if (!v.ok) return { accepted: false, reason: v.reason };
    const week = weekKey();
    const board = LS.get('fit.mock.board.' + week, {});
    const prev = board[s.user.id];
    if (!prev || v.score > prev.score) board[s.user.id] = { name: s.user.name, score: v.score, levels: v.levelsWon, at: Date.now() };
    LS.set('fit.mock.board.' + week, board);
    const { rank } = this._rank(week, s.user.id);
    return { accepted: true, score: v.score, best: board[s.user.id].score, rank, week };
  }

  _entries(week) {
    const board = LS.get('fit.mock.board.' + week, {});
    const fake = FAKE_NAMES.map((name, i) => ({
      id: 'fake' + i, name, levels: i < 3 ? 2 : 1,
      score: 2300 - i * 175 - ((fnv1a(name + week) % 90)),
    }));
    const mine = Object.entries(board).map(([id, e]) => ({ id, ...e }));
    return [...fake, ...mine].sort((a, b) => b.score - a.score);
  }

  _rank(week, uid) {
    const all = this._entries(week);
    return { rank: all.findIndex((e) => e.id === uid) + 1, all };
  }

  async leaderboard(week = weekKey()) {
    await delay(200);
    const s = this.session();
    const all = this._entries(week);
    const top = all.slice(0, this.cfg.leaderboard.topN).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, levels: e.levels, me: !!(s && e.id === s.user.id) }));
    let me = null;
    if (s) { const i = all.findIndex((e) => e.id === s.user.id); if (i >= 0) me = { rank: i + 1, score: all[i].score }; }
    return { week, entries: top, me };
  }
}

function toCoupon(def, rec) {
  return {
    code: rec.code, title: def.title, benefit: def.benefit, terms: def.terms,
    validFrom: def.validFrom, validUntil: def.validUntil, claimedAt: rec.at,
    qrPayload: `FROG|${rec.code}`,
  };
}

// ------------------------------------------------------------------ http
class HttpApi {
  constructor(cfg) { this.cfg = cfg; this.base = cfg.api.baseUrl.replace(/\/$/, ''); }
  session() { return LS.get('fit.session', null); }
  async _req(method, path, body) {
    const s = this.session();
    const res = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw apiError(data.error || 'http_' + res.status, data.message || '伺服器忙碌中，請稍後再試');
    return data;
  }
  async login(p) {
    const session = await this._req('POST', '/auth/login', p);
    LS.set('fit.session', session);
    return session;
  }
  logout() { try { localStorage.removeItem('fit.session'); } catch { /* ignore */ } }
  updateProfile(p) { return this._req('PATCH', '/me', p); }
  claimCoupon(id) { return this._req('POST', '/coupons/claim', { couponId: id }); }
  submitScore(run) { return this._req('POST', '/scores', run); }
  leaderboard(week = weekKey()) { return this._req('GET', '/leaderboard?week=' + encodeURIComponent(week)); }
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function apiError(code, message) { const e = new Error(message); e.code = code; return e; }

export function createApi(cfg) {
  return cfg.api.mode === 'http' ? new HttpApi(cfg) : new MockApi(cfg);
}
