# Cardstox 名單 / 優惠券 / 排行榜 API 規格（v0.1 草案）

遊戲是純靜態網頁，唯一需要後端的三件事：**名單收集（登入）**、**優惠券發放與核銷**、**每週排行榜**。
前端目前使用 mock（`config/game.json` → `api.mode = "mock"`，資料存在瀏覽器 localStorage），
後端完成後把 `api.mode` 改成 `"http"`、`api.baseUrl` 指到下列端點即可，**不需要改程式**（見 `src/api.js`，兩種實作回傳相同格式）。

- Base URL：`https://api.cardstox.com.tw/v1/frog`（可在設定檔調整）
- 格式：JSON（UTF-8）。需登入的端點帶 `Authorization: Bearer <token>`。
- 錯誤：HTTP 4xx/5xx，body 為 `{ "error": "<code>", "message": "<給玩家看的中文訊息>" }`。
- CORS：允許 `https://game.cardstox.com.tw`（`POST/GET/PATCH`、`Authorization` / `Content-Type` 標頭）。

---

## 1. `POST /auth/login` — Email / Google 登入並寫入名單

不需 token。**Email 與 Google 共用同一個端點**；同一個 Email 重複登入視為同一個人（upsert）。

Request
```json
{
  "method": "email",                // "email" | "google"
  "email": "player@example.com",    // method=email 必填
  "idToken": null,                  // method=google 必填：Google Identity Services 的 ID token（後端驗證，取 email）
  "consents": {
    "cardstox": false,              // 「同意 Cardstox 寄送行情與優惠資訊」— 預設 false，玩家自行勾選
    "partner": false                // 「同意石研室寄送餐廳優惠資訊」— 預設 false，玩家自行勾選
  },
  "cardCount": "1-50",              // 「你目前持有多少張卡牌？」none | 1-50 | 51-500 | 500+ | null
  "noticeVersion": "2026-10-draft"  // 玩家看到的個資告知版本（config.privacy.version）
}
```

Response `200`
```json
{
  "token": "<JWT or opaque>",
  "user": { "id": "u_6d1c6249", "email": "player@example.com", "name": "pl***@example.com" }
}
```

後端必須：
1. 兩個同意欄位**分開存**，並記錄 `noticeVersion` 與 **同意時間戳**（`consents.at`），日後可舉證。
2. **只有勾選 `partner` 的名單才能提供給石研室**；未勾選者不得外流。
3. 重複登入時，**不要把已同意改回未同意**，除非玩家明確撤回（建議另提供撤回端點 / 信件連結）。
4. 需要做 Email 驗證時（避免亂填他人信箱），可改成「寄一次性連結 / 驗證碼」流程；前端 `login()` 回傳形狀不變，只要 token 在驗證後才發出。
5. 錯誤碼：`invalid_email`（400）、`invalid_google_token`（401）、`rate_limited`（429）。

## 2. `PATCH /me` — 更新分層問題（已登入）

```json
{ "cardCount": "51-500" }
```
Response `200` `{ "ok": true }`。未登入玩家的作答只存在本機，登入時隨 `/auth/login` 一起送出。

## 3. `POST /coupons/claim` — 領取優惠券

需 token。**每人限領一次**；總量上限由後端控管（設定檔 `coupons.<id>.supplyLimit` 只是前端顯示/mock 用，**以後端為準**）。

Request `{ "couponId": "shiyanshi-bt-01" }`

Response `200`
```json
{
  "status": "ok",                    // "ok" 新領取 | "already" 已領過（回傳同一張）| "sold_out" 已發完
  "coupon": {
    "code": "FROG-FD4T-QF4E",
    "title": "石研室 北車店 招待優惠券",
    "benefit": "…",
    "terms": ["…"],
    "validFrom": "2026-11-01",
    "validUntil": "2026-12-31",
    "claimedAt": "2026-11-03T10:21:00.000Z",
    "qrPayload": "FROG|FROG-FD4T-QF4E"   // 前端用這個字串產生 QR code
  }
}
```
- `code`：不可猜測（建議 8 碼以上、排除易混淆字元，並在後端存雜湊 / 唯一索引）。
- `sold_out` 時不含 `coupon`。
- 只有**通關第二關**的玩家在前端會看到領券按鈕；後端若要強制，可要求 `POST /scores` 先驗證過 level 2 通關（見下）。

## 4. `POST /coupons/redeem` — 門市核銷（店員端）

給石研室店員的掃碼工具使用（另一組 API key，**不是**玩家 token）。

```json
{ "code": "FROG-FD4T-QF4E", "storeId": "shiyanshi-bt" }
```
Response `200` `{ "status": "redeemed", "redeemedAt": "…" }`；
`409 already_redeemed`、`404 unknown_code`、`410 expired`。
核銷事件就是量測「實際來客」的依據：建議另外回傳 `claimedAt → redeemedAt` 供 Cardstox 計算轉換率。

## 5. `POST /scores` — 上傳成績（含防作弊重播）

需 token。**客戶端不送「分數」，只送可重播的操作紀錄；分數由伺服器重播算出。**

Request
```json
{
  "week": "2026-W43",
  "segments": [
    {
      "level": 0,                   // 0 = 第一關, 1 = 第二關
      "seed": 3735928559,           // 該局的隨機種子（車流、水滴位置全由它決定）
      "cfgHash": "a1b2c3d4",        // 前端算出的「影響玩法的設定」雜湊
      "ticks": 1843,                // 該局總 tick 數（60Hz）
      "inputs": [[12,"d",120.3,402.1],[40,"m",118.0,380.0],[58,"u",0,0]]   // [tick, 'd'按下|'m'移動|'u'放開, 世界座標 x, y]
    }
  ]
}
```
Response `200`
```json
{ "accepted": true, "score": 1495, "best": 1495, "rank": 6, "week": "2026-W43" }
```
未通過：`{ "accepted": false, "reason": "tick_mismatch" }`（HTTP 200 即可，前端會顯示「這筆成績未通過驗證」）。

### 伺服器驗證邏輯（直接複用前端的程式）

`src/verify.js` 與 `src/sim.js` **不依賴瀏覽器**，後端（Node / Cloudflare Worker / Vercel Function）可以直接 import：

```js
import { verifyRun } from './src/verify.js';
const result = verifyRun(config, body);   // { ok, score, levelsWon } 或 { ok:false, reason }
```
命令列試跑：`node tools/verify-replay.mjs run.json`。

`verifyRun` 會檢查：
| 檢查 | reason |
|---|---|
| 設定雜湊與伺服器當前設定不同（玩家用舊版 / 改過參數） | `config_mismatch` |
| 重播後的 tick 數與回報不符（亂報時間） | `tick_mismatch` |
| 通關時間低於 `leaderboard.minWinTicks`（預設 8 秒；人類做不到） | `implausibly_fast` |
| 放開次數 > 每秒約 10 次（腳本連點） | `implausible_input_rate` |
| 輸入的時間戳不單調、座標超出畫面、關卡重複 / 超出 | `bad_input_time` / `bad_input_pos` / `duplicate_level` / `bad_level` |

**分數一律取重播結果**；改輸入只會得到另一個（通常更低的）分數。
建議後端另外做：每個帳號每週最多 N 次上傳、同一 `seed` 不可重複使用、保留原始 `inputs` 供人工審核（活動辦法已註明主辦方保有審核權）。

排行榜每個玩家取本週最高分；兩關都通關者在榜上以 ⭐ 標示。

## 6. `GET /leaderboard?week=2026-W43` — 每週排行榜

選填 token（有帶時回傳 `me`）。

```json
{
  "week": "2026-W43",
  "entries": [
    { "rank": 1, "name": "ab***@gmail.com", "score": 2238, "levels": 2, "me": false }
  ],
  "me": { "rank": 6, "score": 1495 }
}
```
- `name`：必須是**遮罩後**的顯示名稱（不得回傳完整 Email）。
- 週別以台北時間（UTC+8）計算，週一 00:00 重置。前端有 `weekKey()` 可對照。

---

## 個資與合規備忘（上線前請法務確認）

- 前端的「個人資料蒐集告知」文字在 `config/game.json → privacy.notice`，目前是**草稿**。
- 兩個行銷同意**預設不勾選、分開記錄**，不勾選仍可登入、玩遊戲、領券。
- 「持卡量」只用於分層統計；`login_prompt` 之前的作答是匿名事件（`card_count_answer`，只含區間，不含任何識別資訊）。
- 提供撤回同意 / 刪除資料的管道（告知中的聯絡信箱目前是示意）。
- 優惠券內容、有效期限、總量、石研室名稱與 Logo 皆為示意；**取得石研室書面授權前**請維持佔位圖。
