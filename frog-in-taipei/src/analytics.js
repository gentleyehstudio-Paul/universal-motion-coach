// Event tracking. Every event is pushed to window.dataLayer (GA4 / GTM friendly),
// optionally beaconed to your own endpoint, and logged in debug mode.
// See docs/ANALYTICS.md for the event dictionary.
let cfg = { debug: false, dataLayerName: 'dataLayer', beaconUrl: '' };
let utm = {};
const sessionId = Math.random().toString(36).slice(2, 10);

export const EVENTS = [
  'site_enter',          // 進站
  'game_start',          // 開始遊戲
  'level1_complete',     // 完成第一關
  'level2_complete',     // 完成第二關
  'login_prompt_view',   // 看到登入提示
  'login_complete',      // 完成登入
  'coupon_claim',        // 領取優惠券
  'share_score',         // 分享成績
  'click_cardstox',      // 點擊前往 Cardstox
];

export function initAnalytics(c) {
  cfg = { ...cfg, ...c };
  try {
    const p = new URLSearchParams(location.search);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) if (p.get(k)) utm[k] = p.get(k);
  } catch { /* ignore */ }
}

export function track(event, params = {}) {
  const payload = { event, session_id: sessionId, ts: Date.now(), ...utm, ...params };
  try {
    const dl = (window[cfg.dataLayerName] = window[cfg.dataLayerName] || []);
    dl.push(payload);
  } catch { /* ignore */ }
  if (cfg.beaconUrl) {
    try { navigator.sendBeacon(cfg.beaconUrl, JSON.stringify(payload)); } catch { /* ignore */ }
  }
  if (cfg.debug) console.log('[track]', event, params);
}
