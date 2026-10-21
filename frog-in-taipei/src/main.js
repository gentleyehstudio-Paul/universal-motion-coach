// 樹蛙進城 | Frog in Taipei — app shell: screens, game loop, login / coupon / leaderboard flow.
import { Sim, configHash, DT } from './sim.js';
import { Renderer } from './render.js';
import { drawFrogSide, drawFrogHeadIcon } from './art.js';
import { drawCard } from './cards.js';
import { makeShareImage, shareCanvas } from './share.js';
import { createApi, weekKey } from './api.js';
import { audio } from './audio.js';
import { initAnalytics, track } from './analytics.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let cfg, api, renderer, hash;
let sim = null;
let mode = 'boot'; // boot | title | intro | play | pause | ending | cut | result
let run = { segments: {} };
let cutT = 0, endTimer = 0, levelStartedAt = 0;
let pointerDown = false;
let lastRank = null;
let loginPromptShown = false;
const lifeIcon = { url: '' };

// ------------------------------------------------------------------ persistence
const save = (() => {
  let d = { cards: {}, tutorialDone: false, cardCount: null, best: {} };
  try { d = { ...d, ...JSON.parse(localStorage.getItem('fit.save') || '{}') }; } catch { /* ignore */ }
  return {
    get: () => d,
    set(patch) { d = { ...d, ...patch }; try { localStorage.setItem('fit.save', JSON.stringify(d)); } catch { /* ignore */ } },
  };
})();

// ------------------------------------------------------------------ boot
async function boot() {
  cfg = await (await fetch('config/game.json', { cache: 'no-cache' })).json();
  hash = configHash(cfg);
  initAnalytics(cfg.analytics);
  api = createApi(cfg);
  renderer = new Renderer($('#game'));
  lifeIcon.url = drawFrogHeadIcon(22).toDataURL();
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 150));
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });
  bindInput();
  bindLayer();
  track('site_enter', { referrer: document.referrer || '' });
  startAttract();
  showTitle();
  if (new URLSearchParams(location.search).get('level') === '2') actions.skip2(); // demo link straight to level 2
  requestAnimationFrame(loop);
  window.__game = { get sim() { return sim; }, get run() { return run; }, cfg, renderer, api, get mode() { return mode; } }; // handy for debugging / tests
}

function layout() {
  const { cssW, cssH } = renderer.resize(window.innerWidth, window.innerHeight);
  const st = $('#stage');
  st.style.width = cssW + 'px';
  st.style.height = cssH + 'px';
}

function startAttract() {
  sim = new Sim(cfg, 0, 20261021);
  renderer.setSim(sim);
  renderer.cam = Math.max(-34, sim.lay.H - renderer.viewH); // show the start of the street
}

// ------------------------------------------------------------------ main loop
let last = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (ts - last) / 1000 || 0.016);
  last = ts;
  if (!sim) return;

  if (mode === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 8 && sim.status === 'play') { sim.step(); acc -= DT; n++; }
    if (n >= 8) acc = 0;
    flushEvents();
    updateHud();
    renderer.frame(sim, dt);
    if (sim.status !== 'play') onLevelEnd();
  } else if (mode === 'ending') {
    endTimer -= dt;
    flushEvents();
    renderer.frame(sim, dt);
    if (endTimer <= 0) showResult();
  } else if (mode === 'cut') {
    cutT += dt;
    if (renderer.cutscene(cutT, sim.L)) showResult();
  } else if (mode === 'title') {
    // attract mode: traffic keeps flowing behind the title
    acc += dt;
    while (acc >= DT) { sim.step(); acc -= DT; sim.thirst = 100; sim.events.length = 0; }
    renderer.frame(sim, dt);
  } else if (sim) {
    renderer.frame(sim, dt);
  }
}

function flushEvents() {
  if (!sim.events.length) return;
  renderer.onEvents(sim.events);
  audio.onEvents(sim.events);
  for (const e of sim.events) {
    if (e.k === 'jump' && !save.get().tutorialDone) { save.set({ tutorialDone: true }); $('#hint').hidden = true; }
    if (e.k === 'fall') toast(e.reason === 'slip' ? '安全帽停太久，滑下來了！' : e.reason === 'carried' ? '被車載走了！' : e.reason === 'over' ? '跳過頭，掉到地面！' : '沒踩到，掉到地面！');
    if (e.k === 'light' && e.s === 'red') audio.tick();
  }
  sim.events.length = 0;
}

// ------------------------------------------------------------------ HUD
let hudBuilt = false;
function buildHud() {
  const lv = sim.L;
  $('#meter-fill').style.width = '100%';
  $('.meter-ico').style.background = lv.theme === 'station' ? '#ffb347' : '#59c8ff';
  hudBuilt = true;
}
function updateHud() {
  if (!hudBuilt) buildHud();
  const dur = sim.L.durationSeconds ?? cfg.thirst.durationSeconds;
  const pct = sim.thirst;
  $('#meter-fill').style.width = pct.toFixed(1) + '%';
  $('#meter-text').textContent = `${sim.L.meter} ${Math.ceil((pct / 100) * dur)}s`;
  const low = pct < cfg.thirst.lowWarning;
  $('#meter').classList.toggle('low', low);
  document.body.classList.toggle('lowthirst', low && sim.status === 'play');
  $('#score').textContent = sim.score;
  const lives = $('#lives');
  if (lives.childElementCount !== cfg.lives) lives.innerHTML = Array.from({ length: cfg.lives }, () => `<img src="${lifeIcon.url}" alt="">`).join('');
  [...lives.children].forEach((im, i) => im.classList.toggle('lost', i >= sim.lives));
  $('#light').className = sim.light.state;

  const f = sim.frog;
  const ch = $('#charge');
  if (f.state === 'charge') {
    ch.hidden = false;
    const maxPx = cfg.frog.chargeMaxUnits * sim.U;
    const px = sim.chargePx(f.charge);
    const fill = $('#charge-fill');
    fill.style.width = (px / maxPx) * 100 + '%';
    fill.classList.toggle('over', px / sim.U > cfg.frog.overshootAtUnits);
  } else ch.hidden = true;
}

// ------------------------------------------------------------------ input
function bindInput() {
  const cv = $('#game');
  const pos = (e) => renderer.toWorld(e.clientX, e.clientY);
  cv.addEventListener('pointerdown', (e) => {
    if (mode === 'cut') { cutT = 99; return; }
    if (mode !== 'play') return;
    e.preventDefault();
    audio.unlock();
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointerDown = true;
    const p = pos(e);
    sim.press(p.x, p.y);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointerDown || mode !== 'play') return;
    const p = pos(e);
    sim.move(p.x, p.y);
  });
  const up = () => {
    if (!pointerDown) return;
    pointerDown = false;
    if (mode === 'play') sim.release();
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  $('#btn-pause').addEventListener('click', () => pause());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'play') pause(); });
}

// ------------------------------------------------------------------ layer helpers
function show(html, cls = '') {
  const l = $('#layer');
  l.innerHTML = `<div class="veil ${cls}"></div><div class="sheet">${html}</div>`;
  l.hidden = false;
}
function hide() { const l = $('#layer'); l.hidden = true; l.innerHTML = ''; }
function showModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="veil" data-act="closeModal"></div><div class="sheet"><button class="xbtn" data-act="closeModal" aria-label="關閉">✕</button>${html}</div>`;
  m.hidden = false;
}
function hideModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
let toastT = 0;
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

function bindLayer() {
  for (const sel of ['#layer', '#modal']) {
    $(sel).addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      audio.unlock();
      audio.ui();
      const fn = actions[b.dataset.act];
      if (fn) fn(b, e);
    });
  }
}

// ------------------------------------------------------------------ title
function showTitle() {
  mode = 'title';
  $('#hud').hidden = true; $('#charge').hidden = true; $('#hint').hidden = true;
  document.body.classList.remove('lowthirst');
  const logo = document.createElement('canvas');
  logo.width = 150; logo.height = 120; logo.className = 'logo-frog';
  const c = logo.getContext('2d');
  c.imageSmoothingEnabled = false;
  drawFrogSide(c, 80, 96, 5);
  // helmet pedestal
  c.fillStyle = '#8c5be0'; c.beginPath(); c.ellipse(86, 104, 46, 12, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(96, 98, 14, 3);
  show(`
    <div class="center" id="logo-slot"></div>
    ${cfg.brand.poc ? '<div class="center"><span class="poc-badge">POC 示範版</span></div>' : ''}
    <h1>樹蛙進城<small>FROG IN TAIPEI</small></h1>
    <p class="center">一隻口渴的翡翠樹蛙在台北街頭迷路了。<br>踩著騎士的安全帽，跳過車流——先喝一杯，再吃一鍋！</p>
    <div class="steps">
      <div><b>👆</b>點住想去的方向<br>蓄力</div>
      <div><b>🐸</b>放開起跳<br>最遠 3 個車身</div>
      <div><b>⏱</b>安全帽只能站 2 秒</div>
    </div>
    <button class="btn" data-act="start">開始遊戲</button>
    <div class="row">
      <button class="btn sec" data-act="cards">圖鑑卡</button>
      <button class="btn sec" data-act="leaderboard">本週排行榜</button>
      <button class="btn sec" data-act="mute">${audio.muted ? '🔇' : '🔊'}</button>
    </div>
    <p class="muted center" style="margin-top:12px">免登入就能玩・單指操作・約 2–5 分鐘一局</p>
    ${cfg.brand.poc ? `<p class="poc-note">${esc(cfg.brand.pocNotice)}</p>
    <div class="row"><button class="btn sec" data-act="skip2">直接體驗第二關</button><button class="btn sec" data-act="reset">清除試玩資料</button></div>` : ''}
  `);
  $('#logo-slot').appendChild(logo);
}

// ------------------------------------------------------------------ run / level flow
function newSeed() { return (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0; }

function startRun() {
  run = { segments: {} };
  loginPromptShown = false;
  lastRank = null;
  track('game_start', { level: 1 });
  showIntro(0);
}

function showIntro(levelIdx) {
  const L = cfg.levels[levelIdx];
  sim = new Sim(cfg, levelIdx, newSeed());
  renderer.setSim(sim);
  renderer.cam = Math.max(-34, sim.lay.H - renderer.viewH);
  hudBuilt = false;
  mode = 'intro';
  $('#hud').hidden = true; $('#charge').hidden = true;
  const tut = cfg.stay.tutorialSeconds;
  show(`
    <h2>${esc(L.title)}</h2>
    <p class="center">${esc(L.subtitle)}</p>
    <ul class="break">
      <li><span>🎯 目標</span><b style="text-align:right;max-width:70%">${esc(L.goalHint)}</b></li>
      <li><span>❤️ 生命</span><b>${cfg.lives} 條</b></li>
      <li><span>⏱ ${esc(L.meter)}</span><b>${L.durationSeconds ?? cfg.thirst.durationSeconds} 秒（撿水滴可補充）</b></li>
      <li><span>🪖 安全帽停留</span><b>${cfg.stay.helmet} 秒（前 ${tut} 秒新手 ${cfg.stay.tutorialHelmet} 秒）</b></li>
    </ul>
    <p class="muted center">紅燈時車流會停下來——正是過馬路的好時機。停在機車待轉區可以存檔。</p>
    <button class="btn" data-act="go">出發！</button>
  `, 'clear');
}

function beginLevel() {
  hide();
  mode = 'play';
  acc = 0;
  levelStartedAt = performance.now();
  $('#hud').hidden = false;
  updateHud();
  if (!save.get().tutorialDone && sim.levelIdx === 0) $('#hint').hidden = false;
  else $('#hint').hidden = true;
  if (sim.levelIdx === 0) banner('前 10 秒新手保護：安全帽可以多停 1 秒', 3500);
  else banner(sim.L.goalHint, 3800);
}

let bannerT = 0;
function banner(text, ms) {
  const b = $('#banner');
  b.textContent = text; b.hidden = false;
  clearTimeout(bannerT);
  bannerT = setTimeout(() => (b.hidden = true), ms);
}

function pause() {
  if (mode !== 'play') return;
  if (pointerDown) { pointerDown = false; sim.release(); }
  mode = 'pause';
  $('#charge').hidden = true;
  show(`
    <h2>暫停中</h2>
    <button class="btn" data-act="resume">繼續</button>
    <div class="row">
      <button class="btn sec" data-act="retry">重玩本關</button>
      <button class="btn sec" data-act="mute">${audio.muted ? '🔇 開啟音效' : '🔊 關閉音效'}</button>
    </div>
    <button class="btn sec" data-act="quit">回到首頁</button>
  `);
}

function onLevelEnd() {
  const won = sim.status === 'won';
  document.body.classList.remove('lowthirst');
  $('#charge').hidden = true; $('#hint').hidden = true; $('#banner').hidden = true;
  run.segments[sim.levelIdx] = { level: sim.levelIdx, seed: sim.seed, cfgHash: hash, ticks: sim.t, inputs: sim.inputs, score: sim.score, status: sim.status };
  const L = sim.L;
  const params = { level: sim.levelIdx + 1, score: sim.score, seconds: Math.round(sim.t / 60), falls: sim.stats.falls, drops: sim.stats.drops, lives_left: sim.lives };
  if (won) {
    const d = save.get();
    save.set({ cards: { ...d.cards, [L.reward.card]: true }, best: { ...d.best, [sim.levelIdx]: Math.max(d.best[sim.levelIdx] || 0, sim.score) } });
    track(sim.levelIdx === 0 ? 'level1_complete' : 'level2_complete', params);
  } else track('level_fail', { ...params, reason: sim.reason });
  if (won && sim.levelIdx === 1) { mode = 'ending'; endTimer = 0.9; sim.__cut = true; }
  else { mode = 'ending'; endTimer = won ? 1.0 : 0.8; }
}

// After the win flash, level 2 plays the escalator cutscene first.
function showResult() {
  if (sim.__cut) { sim.__cut = false; mode = 'cut'; cutT = 0; $('#hud').hidden = true; return; }
  _showResult2();
}
function _showResult2() {
  mode = 'result';
  $('#hud').hidden = true;
  const won = sim.status === 'won';
  const L = sim.L;
  const seg = run.segments[sim.levelIdx];
  const total = Object.values(run.segments).reduce((a, s) => a + s.score, 0);
  const b = sim.breakdown;
  const card = won ? cfg.cards.find((c) => c.id === L.reward.card) : null;
  const finalWin = won && sim.levelIdx === cfg.levels.length - 1;
  const failText = sim.reason === 'thirst'
    ? (sim.levelIdx === 0 ? '口渴到跳不動了…' : '肚子餓到沒力氣了…')
    : '被車流的風吹得暈頭轉向…';

  let html = won ? `<h2>🎉 ${esc(L.title.split('｜')[0])} 過關！</h2>` : `<h2>${esc(failText)}</h2>`;
  html += `<div class="big-score">${seg.score}<small>分</small></div>`;
  if (won && b) {
    html += `<ul class="break">
      <li><span>前進路程</span><b>+${b.progress - b.drops * cfg.score.drop}</b></li>
      <li><span>水滴 × ${b.drops}</span><b>+${b.drops * cfg.score.drop}</b></li>
      <li><span>通關獎勵</span><b>+${b.clear}</b></li>
      <li><span>剩餘${esc(L.meter)}</span><b>+${b.thirst}</b></li>
      <li><span>剩餘生命 × ${sim.lives}</span><b>+${b.lives}</b></li>
      <li class="total"><span>本次累計</span><b>${total}</b></li></ul>`;
  } else if (!won) {
    html += `<p class="center muted">到達第 ${sim.bestRow + 1} / ${sim.lay.rows.length} 排車流・撿到 ${sim.stats.drops} 顆水滴</p>`;
  }

  if (card) {
    html += `<div class="cardshow" id="card-slot"></div>
      <p class="center"><b>解鎖圖鑑卡 No.${card.no}・${esc(card.name)}</b><br><span class="muted">${sim.levelIdx === 0 ? '翡翠露喝到啦！樹蛙補滿水分，繼續往火鍋前進。' : '成功搭手扶梯下 B1！'}</span></p>`;
  }
  if (finalWin) html += couponPanelHtml();

  // single-choice stratification question (anonymous until login)
  const cc = save.get().cardCount;
  html += `<div class="panel"><h3>順便問一下：你目前持有多少張卡牌？</h3><div class="chips">${cfg.cardCountOptions
    .map((o) => `<button class="chip ${cc === o.id ? 'on' : ''}" data-act="cardcount" data-v="${o.id}">${esc(o.label)}</button>`).join('')}</div></div>`;

  html += loginPanelHtml(won);

  if (won && !finalWin) html += `<button class="btn" data-act="next">前往第二關 ▶</button>`;
  else html += `<button class="btn" data-act="${won ? 'again' : 'retry'}">${won ? '再玩一次' : '再挑戰一次'}</button>`;
  html += `<div class="row">
      <button class="btn sec" data-act="share">分享成績</button>
      <button class="btn sec" data-act="leaderboard">排行榜</button>
      <button class="btn sec" data-act="cards">圖鑑卡</button></div>`;
  if (!won || finalWin) html += `<button class="btn sec" data-act="quit">回到首頁</button>`;

  html += `<div class="panel cta"><h3>${esc(cfg.brand.cardstoxCta)}</h3><p>Cardstox 幫你追蹤手上卡牌的行情與價值。</p><button class="btn sun" data-act="cardstox">${esc(cfg.brand.cardstoxButton)} ▶</button></div>`;

  show(html, '');
  if (card) { const slot = $('#card-slot'); if (slot) slot.appendChild(drawCard(card, { total: cfg.cards.length })); }
  if (!api.session() && !loginPromptShown) { loginPromptShown = true; track('login_prompt_view', { level: sim.levelIdx + 1, won }); }
  if (api.session()) afterLoginTasks(true);
}

// ---- login prompt / coupon panels
function loginPanelHtml(won) {
  const s = api.session();
  if (s) {
    return `<div class="panel login" id="login-slot"><h3>✅ 已登入：${esc(s.user.name)}</h3>
      <p id="rank-line" class="muted">${lastRank ? `本週排行榜第 <b>${lastRank.rank}</b> 名（最佳 ${lastRank.best} 分）` : '成績上傳中…'}</p></div>`;
  }
  return `<div class="panel login" id="login-slot"><h3>登入保存成績、進排行榜、收集圖鑑卡</h3>
    <p class="muted">用 Email 或 Google 登入就能上榜、保存圖鑑卡，${cfg.levels[1].reward.coupon ? '還能領取石研室優惠券。' : '還有機會拿到店家優惠。'}</p>
    <button class="btn" data-act="login">登入 / 註冊（免費）</button>
    <p class="muted center" style="margin-top:8px">不登入也能繼續玩喔</p></div>`;
}

function couponPanelHtml() {
  const id = cfg.levels[1].reward.coupon;
  const def = cfg.coupons[id];
  const s = api.session();
  if (!s) {
    return `<div class="panel coupon locked" id="coupon-slot"><h3>🎟 ${esc(def.title)}</h3><span class="tag">限量 ${def.supplyLimit} 張・每人限領 1 次</span>
      <p>登入後即可領取專屬代碼與 QR code，到北車店 B1 出示給店員核銷。</p>
      <button class="btn sun" data-act="login">登入並領取優惠券</button></div>`;
  }
  return `<div class="panel coupon" id="coupon-slot"><h3>🎟 ${esc(def.title)}</h3><p><span class="spin" style="border-color:#bbb;border-top-color:#333"></span>領取中…</p></div>`;
}

function couponFilledHtml(r) {
  if (r.status === 'sold_out') return `<h3>🎟 優惠券已被領完</h3><p>這次來晚了一步，歡迎關注 Cardstox 後續活動！</p>`;
  const c = r.coupon;
  let qr = '';
  try {
    const q = window.qrcode(0, 'M'); q.addData(c.qrPayload); q.make();
    qr = `<img alt="優惠券 QR code" src="${q.createDataURL(6, 2)}">`;
  } catch { qr = ''; }
  return `<h3>🎟 ${esc(c.title)}</h3>${r.status === 'already' ? '<span class="tag">你已領取過，這是你的專屬券</span>' : '<span class="tag">領取成功！</span>'}
    <div class="code">${esc(c.code)}</div>${qr}
    <p>${esc(c.benefit)}</p>
    <p class="muted">有效期限：${esc(c.validFrom)} ～ ${esc(c.validUntil)}</p>
    <ul>${c.terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

let afterBusy = false;
async function afterLoginTasks(initial) {
  if (afterBusy) return;
  afterBusy = true;
  try {
    // upload the score (server replays the run before accepting it)
    const payload = { week: weekKey(), segments: Object.values(run.segments).map(({ level, seed, cfgHash, ticks, inputs }) => ({ level, seed, cfgHash, ticks, inputs })) };
    const res = await api.submitScore(payload);
    if (res.accepted) {
      lastRank = { rank: res.rank, best: res.best };
      const el = $('#rank-line');
      if (el) el.innerHTML = `本週排行榜第 <b>${res.rank}</b> 名（最佳 ${res.best} 分）`;
      if (!initial) toast(`成績已上傳・本週第 ${res.rank} 名`);
    } else {
      const el = $('#rank-line');
      if (el) el.textContent = '這筆成績未通過驗證，沒有列入排行榜。';
    }
  } catch (e) { const el = $('#rank-line'); if (el) el.textContent = e.message; }
  // coupon after a final win
  const slot = $('#coupon-slot');
  if (slot && mode === 'result' && sim.status === 'won' && sim.levelIdx === cfg.levels.length - 1) {
    try {
      const r = await api.claimCoupon(cfg.levels[1].reward.coupon);
      slot.classList.remove('locked');
      slot.innerHTML = couponFilledHtml(r);
      if (r.status === 'ok') track('coupon_claim', { coupon_id: cfg.levels[1].reward.coupon });
    } catch (e) { slot.innerHTML = `<h3>🎟 優惠券</h3><p class="err">${esc(e.message)}</p>`; }
  }
  afterBusy = false;
}

// ------------------------------------------------------------------ login modal
function openLogin() {
  const p = cfg.privacy;
  showModal(`
    <h2>登入保存成績</h2>
    <p class="center muted">登入後成績會進入每週排行榜，圖鑑卡也會幫你保存。</p>
    <button class="btn google" data-act="google">使用 Google 登入（示範）</button>
    <p class="muted center" style="margin:10px 0 0">或使用 Email</p>
    <label class="field">Email
      <input id="login-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
    </label>
    <label class="check"><input type="checkbox" id="c-cardstox"><span>${esc(p.consentCardstox)}<br><small class="muted">（選填）</small></span></label>
    <label class="check"><input type="checkbox" id="c-partner"><span>${esc(p.consentPartner)}<br><small class="muted">（選填；不勾選也可領取優惠券）</small></span></label>
    <details class="notice"><summary>${esc(p.noticeTitle)}</summary><dl>${p.notice.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>
    <p class="muted">按下登入，即表示你已閱讀上方「個人資料蒐集告知」。${esc(cfg.brand.contestNote)}</p>
    <div class="err" id="login-err"></div>
    <button class="btn" id="login-go" data-act="emailLogin">登入</button>
  `);
}

// Real Google sign-in (only used when api.mode = "http"). The mock API fakes Google.
// NOTE: this hook is not exercised by the automated checks — test it against a real client id.
async function googleIdToken() {
  const id = cfg.api.googleClientId;
  if (!id) throw new Error('尚未設定 Google 登入（config.api.googleClientId），請先使用 Email 登入');
  if (!window.google) {
    await new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = 'https://accounts.google.com/gsi/client';
      el.onload = res; el.onerror = () => rej(new Error('無法載入 Google 登入，請改用 Email'));
      document.head.appendChild(el);
    });
  }
  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({ client_id: id, callback: (r) => resolve(r.credential) });
    window.google.accounts.id.prompt((n) => {
      if (n.isNotDisplayed() || n.isSkippedMoment()) reject(new Error('Google 登入視窗被瀏覽器阻擋，請改用 Email'));
    });
  });
}

async function doLogin(method) {
  const err = $('#login-err');
  const btn = $('#login-go');
  const email = ($('#login-email').value || '').trim();
  if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = '請輸入正確的 Email'; return; }
  err.textContent = '';
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>登入中…';
  try {
    const idToken = method === 'google' && cfg.api.mode === 'http' ? await googleIdToken() : undefined;
    await api.login({
      method, email: method === 'email' ? email : undefined, idToken,
      consents: { cardstox: $('#c-cardstox').checked, partner: $('#c-partner').checked },
      cardCount: save.get().cardCount, noticeVersion: cfg.privacy.version,
    });
    track('login_complete', { method, consent_cardstox: $('#c-cardstox').checked, consent_partner: $('#c-partner').checked });
    hideModal();
    toast('登入成功！');
    if (mode === 'result') _showResult2(); // re-render with the logged-in state
    else if (mode === 'title') showTitle();
  } catch (e) {
    err.textContent = e.message;
    btn.disabled = false; btn.textContent = '登入';
  }
}

// ------------------------------------------------------------------ leaderboard / cards / share
async function openLeaderboard() {
  showModal(`<h2>本週排行榜</h2><p class="center muted">${weekKey()}・每週一 00:00 重置</p><p class="center"><span class="spin" style="border-color:#bbb;border-top-color:#333"></span>載入中…</p>`);
  try {
    const r = await api.leaderboard();
    const s = api.session();
    const inList = r.entries.some((e) => e.me);
    $('#modal .sheet').innerHTML = `<button class="xbtn" data-act="closeModal" aria-label="關閉">✕</button>
      <h2>本週排行榜</h2><p class="center muted">${esc(r.week)}・每週一 00:00 重置</p>
      <ol class="lb" style="padding:0">${r.entries.map((e) => `<li class="${e.me ? 'me' : ''}"><i>${e.rank}</i><span>${esc(e.name)}${e.levels >= 2 ? ' ⭐' : ''}</span><span>${e.score}</span></li>`).join('')}</ol>
      ${s && r.me && !inList ? `<ol class="lb"><li class="me"><i>${r.me.rank}</i><span>${esc(s.user.name)}（你）</span><span>${r.me.score}</span></li></ol>` : ''}
      ${s ? '' : '<button class="btn" data-act="login">登入後把成績放上榜</button>'}
      <p class="muted">⭐ = 兩關全破。${esc(cfg.brand.contestNote)}</p>`;
  } catch (e) { $('#modal .sheet').insertAdjacentHTML('beforeend', `<p class="err">${esc(e.message)}</p>`); }
}

function openCards() {
  const d = save.get();
  showModal(`<h2>台灣蛙類圖鑑</h2><p class="center muted">已收集 ${cfg.cards.filter((c) => d.cards[c.id]).length} / ${cfg.cards.length}</p><div class="cardgrid" id="cg"></div>
    <p class="muted center" style="margin-top:10px">更多卡片陸續推出。圖鑑資料僅供娛樂，上線前會再與專家核對。</p>`);
  const g = $('#cg');
  cfg.cards.forEach((c, i) => {
    g.appendChild(drawCard(c, { locked: !d.cards[c.id], total: cfg.cards.length, lockHint: `完成第 ${i + 1} 關即可解鎖。` }));
  });
}

async function openShare() {
  const total = Object.values(run.segments).reduce((a, s) => a + s.score, 0);
  const won1 = run.segments[0] && run.segments[0].status === 'won';
  const won2 = run.segments[1] && run.segments[1].status === 'won';
  const lines = [];
  if (won2) lines.push('兩關全破！成功搭手扶梯下 B1');
  else if (won1) lines.push('第一關過關・喝到翡翠露了');
  else lines.push(`跳過 ${sim ? sim.bestRow : 0} 排車流，還沒喝到飲料…`);
  const card = sim && sim.status === 'won' ? cfg.cards.find((c) => c.id === sim.L.reward.card) : null;
  const cv = makeShareImage({
    score: total, title: won2 ? '我通關了！' : won1 ? '我的成績' : '我的成績', lines: lines.filter(Boolean), url: cfg.brand.url, cardName: card && card.name,
  });
  showModal(`<h2>分享成績</h2><img class="share-preview" id="sp" alt="成績圖片"><button class="btn" data-act="doShare">分享 / 儲存圖片</button>
    <p class="muted center">可直接分享到 IG 限動、Threads、LINE；不支援時會自動下載圖片。</p>`);
  $('#sp').src = cv.toDataURL('image/png');
  openShare.cv = cv;
}

// ------------------------------------------------------------------ actions
const actions = {
  start() { audio.unlock(); startRun(); },
  skip2() { audio.unlock(); run = { segments: {} }; loginPromptShown = false; track('game_start', { level: 2, via: 'poc_shortcut' }); showIntro(1); },
  reset() {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('fit.')) localStorage.removeItem(k); } catch { /* ignore */ }
    location.reload();
  },
  go() { beginLevel(); },
  resume() { hide(); mode = 'play'; acc = 0; },
  retry() { track('retry', { level: sim.levelIdx + 1 }); showIntro(sim.levelIdx); },
  again() { startRun(); },
  next() { const n = sim.levelIdx + 1; track('game_start', { level: n + 1 }); showIntro(n); },
  quit() { startAttract(); showTitle(); },
  mute(b) { audio.setMuted(!audio.muted); if (mode === 'title') showTitle(); else if (mode === 'pause') pause2(); },
  cards() { openCards(); },
  leaderboard() { openLeaderboard(); },
  share() { openShare(); },
  async doShare() {
    const r = await shareCanvas(openShare.cv, { text: `我在「樹蛙進城」拿到 ${Object.values(run.segments).reduce((a, s) => a + s.score, 0)} 分！${cfg.brand.url}` });
    if (r !== 'cancelled') { track('share_score', { method: r }); toast(r === 'downloaded' ? '圖片已下載' : '已分享'); }
  },
  login() { openLogin(); },
  google() { doLogin('google'); },
  emailLogin() { doLogin('email'); },
  closeModal() { hideModal(); },
  cardstox() {
    track('click_cardstox', { from: 'result' });
    window.open(cfg.brand.cardstoxUrl, '_blank', 'noopener');
  },
  async cardcount(b) {
    const v = b.dataset.v;
    save.set({ cardCount: v });
    track('card_count_answer', { bucket: v });
    document.querySelectorAll('.chip[data-act="cardcount"]').forEach((c) => c.classList.toggle('on', c === b));
    try { await api.updateProfile({ cardCount: v }); } catch { /* anonymous: stored locally, sent at login */ }
  },
};
function pause2() { mode = 'play'; pause(); }

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:0;color:#fff;padding:24px">載入失敗：${esc(e.message)}。請透過靜態伺服器開啟（見 README），不要直接用 file:// 開啟。</p>`);
});
