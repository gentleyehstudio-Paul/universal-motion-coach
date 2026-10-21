# 數據追蹤事件清單

所有事件由 `src/analytics.js` 的 `track(event, params)` 送出：

1. 推入 `window.dataLayer`（GA4 / GTM 可直接接，名稱可在 `analytics.dataLayerName` 改）。
2. 若 `analytics.beaconUrl` 有值，同時 `navigator.sendBeacon` 一份 JSON 到你自己的端點。
3. `analytics.debug = true` 時印在 console（上線前請改 `false`）。

每個事件都自動帶：`session_id`（每次開啟一組隨機碼）、`ts`（毫秒時間戳）、以及網址上的 `utm_source / utm_medium / utm_campaign / utm_content`（有的話）。
**不會帶任何個資**（沒有 Email）。

## 必要事件（需求規格指定的 9 個）

| # | 需求 | event | 何時觸發 | 額外參數 |
|---|---|---|---|---|
| 1 | 進站 | `site_enter` | 頁面載入完成 | `referrer` |
| 2 | 開始遊戲 | `game_start` | 按「開始遊戲」（`level:1`）；進入第二關時再送一次（`level:2`） | `level` |
| 3 | 完成第一關 | `level1_complete` | 第一關通關 | `level, score, seconds, falls, drops, lives_left` |
| 4 | 完成第二關 | `level2_complete` | 第二關通關（搭上手扶梯） | 同上 |
| 5 | 看到登入提示 | `login_prompt_view` | 結算畫面出現登入面板（未登入者，每局一次） | `level, won` |
| 6 | 完成登入 | `login_complete` | Email / Google 登入成功 | `method, consent_cardstox, consent_partner` |
| 7 | 領取優惠券 | `coupon_claim` | 優惠券**首次**領取成功 | `coupon_id` |
| 8 | 分享成績 | `share_score` | 分享圖成功分享或下載 | `method`（`shared` / `downloaded`） |
| 9 | 點擊前往 Cardstox | `click_cardstox` | 按結算畫面的 Cardstox 按鈕 | `from` |

## 輔助事件（方便分析漏斗，可忽略）

| event | 何時 | 參數 |
|---|---|---|
| `level_fail` | 關卡失敗（口渴值歸零或生命用完） | `level, score, seconds, falls, drops, reason`（`thirst` / `lives`） |
| `retry` | 失敗後按重試 | `level` |
| `card_count_answer` | 回答「持有多少張卡」 | `bucket`（`none/1-50/51-500/500+`） |

## 建議漏斗

`site_enter → game_start → level1_complete → login_prompt_view → login_complete → level2_complete → coupon_claim → （門市核銷，由後端 /coupons/redeem 提供）`

實體導流的關鍵指標是 **`coupon_claim → 核銷` 轉換率**，核銷資料在後端（見 `docs/API.md` §4）。

## 接 GA4 的最小做法

在 `index.html` 加上標準 gtag 片語即可（事件已經在 `dataLayer` 裡）；或用 GTM 建立「自訂事件」觸發條件，事件名稱就是上表的 `event` 欄位。
