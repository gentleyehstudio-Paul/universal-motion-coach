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
    if (p.get('debug') === '1') cfg.debug = true; // ?debug=1 prints events to the console
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) if (p.get(k)) utm[k] = p.get(k);
  } catch { /* ignore */ }
  if (cfg.measurementId) {
    // GA4: events are mirrored through gtag in addition to dataLayer
    const el = document.createElement('script');
    el.async = true;
    el.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.measurementId);
    document.head.appendChild(el);
    window[cfg.dataLayerName] = window[cfg.dataLayerName] || [];
    window.gtag = function () { window[cfg.dataLayerName].push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', cfg.measurementId);
  }
}

export function track(event, params = {}) {
  const payload = { event, session_id: sessionId, ts: Date.now(), ...utm, ...params };
  try {
    const dl = (window[cfg.dataLayerName] = window[cfg.dataLayerName] || []);
    dl.push(payload);
  } catch { /* ignore */ }
  if (cfg.measurementId && window.gtag) window.gtag('event', event, { ...utm, ...params });
  if (cfg.beaconUrl) {
    try { navigator.sendBeacon(cfg.beaconUrl, JSON.stringify(payload)); } catch { /* ignore */ }
  }
  if (cfg.debug) console.log('[track]', event, params);
}
