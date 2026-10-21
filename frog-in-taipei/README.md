# 樹蛙進城｜Frog in Taipei

手機網頁小遊戲：一隻口渴的**翡翠樹蛙**在台北街頭迷路，踩著機車騎士的安全帽跳過車流——先喝一杯，再吃一鍋。
遊戲是 Cardstox 的**名單入口**與**實體店導流**工具：免登入就能玩，打出成績後才引導登入；第二關把玩家帶到「石研室」北車店，用優惠券核銷量測實際來客。

> 純前端靜態網頁（HTML5 Canvas + 原生 ES Modules），**零依賴、零建置、零素材檔**。整包約 230 KB，不需要遊戲伺服器。

---

## 1. 快速開始

```bash
cd frog-in-taipei
python3 -m http.server 8080        # 或 npx serve .
# 打開 http://localhost:8080  （手機用同網段 IP 開啟，或用 Chrome 裝置模擬）
```

⚠️ 要用靜態伺服器開，**不能直接雙擊 `index.html`**（`file://` 無法載入 ES Modules 與 `config/game.json`）。

| 指令 | 作用 |
|---|---|
| `node tools/selftest.mjs [局數] [計時誤差tick]` | 機器人用真實的「按下 / 移動 / 放開」API 把兩關打過、重播比對、並測試防作弊驗證。例：`node tools/selftest.mjs 20 5` 模擬手速誤差 ±5 tick（≈83ms）的玩家 |
| `node tools/verify-replay.mjs run.json` | 後端驗證腳本：吃一份 `POST /scores` 的 body，輸出重播後的分數 |

---

### POC 示範版

目前設定即為 POC 版（`brand.poc: true`）：標題頁顯示「POC 示範版」徽章與說明、`analytics.debug` 已關閉。
- **直接體驗第二關**：標題頁按鈕，或網址加 `?level=2`（方便業主一進來就看到車站場景）。
- **清除試玩資料**：標題頁按鈕，清掉本機的登入、優惠券、圖鑑，讓下一位試玩者從頭開始。
- `?debug=1`：在 console 印出追蹤事件。`?utm_source=xxx` 等參數會附在每個事件上，可用來區分不同業主 / 管道。
- GA4：把 `config/game.json → analytics.measurementId` 填成 `G-XXXXXXXXXX` 即可（事件會同時 `gtag('event', …)`）。
- 正式上線時把 `brand.poc` 改 `false`，標題頁就不再顯示示範內容。

## 2. 怎麼玩

- **單指操作**：按住螢幕「你想去的方向」蓄力 → 越久跳越遠 → 放開起跳。蓄力條上有 **1、2、3 個車身長度**刻度；超過第 3 格（約 3.5 個車身以上，紅色斜線區）會**跳過頭掉到地面**。
- **安全帽只能站 2 秒**（車頂 4 秒）。倒數用腳下光環表示（綠 → 橘 → 紅），剩 1 秒騎士開始甩頭。開局前 10 秒是新手保護，安全帽可站 3 秒。
- **掉到地面**＝被車流的風吹得翻滾（卡通處理，無任何碰撞 / 血腥畫面），扣 1 條命，回到上一個安全落點。共 3 條命。
- **口渴值**＝時間。歸零就失敗，預設 120 秒，撿水滴可補充。第二關改叫「飢餓值」。
- **紅綠燈**：紅燈時車流停下（HUD 右上角有燈號）——是過馬路的好時機。**機車待轉區**是存檔點（掉下去會回到這裡）。
- 畫面上的虛線方框＝「你落地時那台車會在的位置」，綠色圈＝預測踩得到，白色＝會落地，紅色＝跳過頭。

| 關卡 | 場景 | 破關條件 | 獎勵 |
|---|---|---|---|
| 第一關「口渴」 | 一般台北街道（5 排汽車道 → 3 排混合道 → 5 排機車道 → 外送車道） | 外送員經過「露水茶舖」門口、黃色時間窗亮起時，落在他的安全帽或外送箱上 | 圖鑑卡 No.1 翡翠樹蛙 |
| 第二關「肚子餓了」 | 台北車站・忠孝西路（公車更多、3 個待轉區、路邊停車格） | 落在停在石研室門口、有發亮標記的騎士安全帽 → 播放樹蛙走下手扶梯進 B1 的過場 | 圖鑑卡 No.2 莫氏樹蛙＋石研室優惠券（需登入） |

---

## 3. 第一關機制細節（設計文件）

**座標與單位**：世界寬 270 單位，`1 車身 = 34 單位`（轎車長度）。車道高 30。畫面由內側車道（下）往外側車道（上）橫越。

**車流**（`src/sim.js`）
- 每條車道有方向、固定車速、車距範圍；車子種類依權重隨機（taxi / sedan / van / bus / scooter）。越往外側機車越多、越快、越密。
- 同一條車道所有車同速、同樣加減速 → 紅燈時整排平順煞停、車距不變。
- 外送車道**無視紅燈**，並按 `goal.every` 秒定時放出一台外送員（原創配色：靛藍外套＋紫色安全帽＋蜜桃色外送箱）。外送員經過店門口 `goal.window`（x 範圍）時，時間窗亮起（黃色框＋店門發光＋箭頭）。

**跳躍**
- 落點 = 放開瞬間蛙的位置 + 方向向量 × 距離；方向＝蛙指向手指位置，距離＝蓄力時間換算（`chargeSeconds` 內由 0 到 `chargeMaxUnits` 個車身）。
- 滯空 `jumpSeconds`（0.38s）。落地時才判定踩到什麼：先找車（車身外擴 `landAssistPx` 寬容），再找靜態安全區，否則掉地面。車子在滯空期間會繼續移動，所以要「提前量」——畫面上的虛線方框已幫你預測。
- 在同一台車上原地小跳**不會重置**停留倒數。

**落地面／存檔**：落地＝摔跤動畫 0.9 秒、扣命、回到「上一個踩過的平台」（若那台車已開走 → 同車道最近的車 → 最後一個待轉區 / 起點）。掉落後給 0.5 秒緩衝與 1 秒閃爍無敵。

**計分**：每前進一排 +30（只算新排，來回跳不加分）、水滴 +20；通關 +300、剩餘口渴值 ×3、剩餘生命 ×50。排行榜加總兩關。

**確定性（防作弊的基礎）**：模擬以固定 60Hz 步進，所有隨機都走種子化 PRNG，輸入記成 `[tick, 'd'|'m'|'u', x, y]`。同一組 `(設定, 關卡, 種子, 輸入)` 永遠重播出完全相同的結果。

---

## 4. 檔案結構

```
frog-in-taipei/
├─ index.html                 頁面骨架（HUD、蓄力條、畫面容器）
├─ css/style.css              介面樣式（手機直式優先，橫式置中）
├─ config/game.json           ★ 所有可調參數、店家、優惠券、圖鑑卡、關卡
├─ src/
│  ├─ sim.js                  遊戲模擬（無 DOM；瀏覽器與後端共用）
│  ├─ level.js                把關卡的列（rows）轉成世界座標
│  ├─ verify.js               防作弊：重播驗證（無 DOM；後端可直接 import）
│  ├─ render.js               Canvas 繪製、鏡頭、粒子、手扶梯過場
│  ├─ art.js                  程式繪製的所有美術（樹蛙、車、街景）
│  ├─ cards.js                圖鑑卡繪製
│  ├─ share.js                成績圖（1080×1920）與分享 / 下載
│  ├─ main.js                 畫面流程、遊戲迴圈、登入、優惠券、排行榜
│  ├─ api.js                  名單 / 優惠券 / 排行榜 API（mock ＋ http）
│  ├─ analytics.js            數據追蹤（dataLayer / sendBeacon）
│  ├─ audio.js                WebAudio 合成音效（零檔案）
│  └─ rng.js                  種子化隨機數
├─ vendor/qrcode.js           QR code 產生器（qrcode-generator 1.4.4，MIT）
├─ docs/API.md                名單 / 優惠券 / 排行榜 API 規格
├─ docs/ANALYTICS.md          數據追蹤事件清單
├─ tools/                     selftest（機器人＋驗證測試）、verify-replay（後端驗證腳本）
└─ _headers / vercel.json     Cloudflare Pages / Vercel 快取標頭
```

---

## 5. 如何調整

所有參數都在 `config/game.json`，改完重新整理即可（不用重新建置）。

| 想調什麼 | 欄位 | 預設 |
|---|---|---|
| **時間長度**（口渴值） | `thirst.durationSeconds`；單關覆寫：`levels[i].durationSeconds` | 120 秒 |
| 撿水滴補多少 | `thirst.dropRefill` | 12（%） |
| **跳躍距離上限 / 過頭門檻** | `frog.jumpMaxUnits` / `frog.overshootAtUnits` | 3 / 3.5 車身 |
| 蓄力速度 | `frog.chargeSeconds`（蓄到 `chargeMaxUnits` 所需秒數） | 1.5 秒 / 4.5 車身 |
| 落地寬容度（越大越好踩） | `frog.landAssistPx` | 4 px |
| **安全帽停留秒數** | `stay.helmet`（車頂：`stay.roof`） | 2 / 4 秒 |
| 新手保護 | `stay.tutorialSeconds` / `stay.tutorialHelmet` | 10 秒 / 3 秒 |
| 生命數 | `lives` | 3 |
| **整體車流密度 / 車速** | `traffic.densityMultiplier` / `traffic.speedMultiplier` | 1.0 / 1.0 |
| 單一車道 | `levels[i].rows[j]`：`dir`、`speed`、`gap`（車距，車身為單位）、`kinds`（車種權重） | — |
| 紅綠燈週期 | `levels[i].light` `{green, yellow, red}`（秒） | 8 / 1 / 4.5（第一關） |
| 外送員出現頻率與時間窗 | `levels[0].goal.every` / `goal.window`（x 範圍） | 6.5 秒 / [100,190] |
| 水滴數量 | `levels[i].drops` | 12 / 14 |
| 計分 | `score.*` | — |

> ⚠️ 凡是影響玩法的欄位（上表前 12 列等）都會進入 `cfgHash`。**上線後改參數，舊版快取的玩家成績會被排行榜拒收**（`config_mismatch`）——這是設計：確保大家用同一套規則。設定檔已設定為 `no-cache`，重新整理就會拿到新版。

**難度參考**（`node tools/selftest.mjs 20 <誤差>`，機器人是完美計畫＋人為計時誤差）：誤差 3 tick → 兩關通關率約 85–90%；6 tick → 60–80%；10 tick → 約 15%。時間（120 秒）幾乎不是瓶頸，**生命數才是**；若測試後覺得太難，優先調 `landAssistPx`、`lives` 或車流密度。

### 替換店家與優惠券（不用改程式）

- **第一關手搖飲店**：`levels[0].store`（`name` 店名、`drink` 招牌飲料）。招牌繪製在 `src/art.js → paintShopCurb`，文字來自設定檔。
- **第二關石研室**：`levels[1].store`（`name`、`signText`、`placeholder`）。**取得品牌書面授權前請維持 `placeholder: true`**（畫面會標「示意佔位」）。取得授權後，要換成正式招牌 / 門市外觀，在 `paintStationCurb` 把程式繪製的招牌換成 `drawImage(正式圖)` 即可。
- **優惠券**：`coupons["shiyanshi-bt-01"]` —— 標題、優惠內容、條款、起訖日、`supplyLimit` 發放總量、`codePrefix`。要換另一張券：新增一筆並把 `levels[1].reward.coupon` 指過去。
- **冠名贊助**：同理只改 JSON（店名、`drink`、優惠券）。
- **個資告知與同意文字**：`privacy.*`。
- **圖鑑卡**：`cards[]`（名稱、學名、說明、配色）。卡圖由 `src/cards.js` 依配色繪製。

### 新增關卡

1. 在 `config/game.json → levels` 新增一個物件（複製第一關改即可）：`rows`（由下往上：`island` → `lane` / `zone` / `parking` …）、`light`、`goal`、`reward`、`theme`。
2. `goal.type` 目前有兩種：`delivery`（外送員時間窗）與 `parked`（落在有 `goalBay` 的停車格）。新增玩法 → 在 `src/sim.js` 的 `_standOnVehicle` 加一個判斷。
3. 新場景 → 在 `src/art.js` 加一個 `paintXxxCurb()`，並在 `paintWorld` 依 `theme` 呼叫；新車種 → 加到 `KINDS` 並在 `drawVehicle` 加繪製。
4. 若要超過兩關：`src/main.js` 的流程目前以 `levels.length - 1` 判斷最後一關；`level1_complete / level2_complete` 事件名稱在 `onLevelEnd` 中，可依需要擴充。

---

## 6. 後端與資料（mock → 正式）

- 目前 `api.mode = "mock"`：登入、優惠券（每人限領、總量上限）、排行榜（含重播驗證）全部在瀏覽器 localStorage 模擬，方便完整走過流程。
- 正式串接：改 `api.mode = "http"` 與 `api.baseUrl`。規格見 [`docs/API.md`](docs/API.md)，後端驗證分數時直接 import `src/verify.js`。
- Google 登入：`api.googleClientId` 設定後，http 模式會載入 Google Identity Services 取得 ID token 傳給 `/auth/login`。**這段只寫了串接點，尚未對真實 Client ID 測過。**

## 7. 數據追蹤

9 個指定事件＋3 個輔助事件，見 [`docs/ANALYTICS.md`](docs/ANALYTICS.md)。預設推入 `dataLayer`（GA4 / GTM），也可設定 `analytics.beaconUrl` 送到自己的端點。上線前把 `analytics.debug` 改 `false`。

## 8. 部署

純靜態，任何靜態主機都行。

- **Cloudflare Pages**：連 Git repo → Build command 留空、Build output directory 填 `frog-in-taipei`（或把這個資料夾單獨成 repo 填 `/`）。`_headers` 已附好。自訂網域設 `game.cardstox.com.tw`。
- **Vercel**：Framework preset 選 *Other*，Root Directory 設 `frog-in-taipei`，不需 build。`vercel.json` 已附好。
- 效能：首次載入約 230 KB（含 QR code 套件 56 KB），無圖片 / 字型 / 音檔，4G 下 3 秒內可玩。字型使用系統中文字體。

## 9. 智慧財產與品牌檢查表

- ✅ 沒有任何寶可夢角色、名稱、卡圖、道具或造型；樹蛙依真實翡翠樹蛙繪製（翠綠背、白肚邊、金黃眼＋橘框、橫向瞳孔、趾端圓形吸盤）。參考圖只借用「俯視像素風」的美術方向，沒有使用其任何素材。
- ✅ 外送員為原創配色（靛藍＋紫＋蜜桃＋薄荷），沒有使用任何真實外送平台的色組、Logo 或保溫箱圖樣。
- ✅ 手搖飲店「露水茶舖」與飲料「翡翠露」為原創；沒有任何真實手搖品牌。
- ✅ 石研室招牌目前是**佔位圖**（標示「示意佔位」），待書面授權後才換正式 Logo / 門市外觀。
- ✅ 遊戲名稱「樹蛙進城／Frog in Taipei」，未使用 Frogger、跳一跳等名稱。
- ✅ 樹蛙在火鍋店只是客人：過場畫面只有手扶梯與店門，**沒有鍋、食材或任何「蛙被吃」暗示**；HUD 的第二關計量器用「飢餓值」＋橘色水滴圖示，不放食物圖案。
- ✅ 掉落一律卡通翻滾＋文字提示，無碰撞、輾壓或血腥畫面。
- 🔎 圖鑑卡的物種說明為一般性描述，標註「上線前再核對」，請找專業資料來源（如台灣兩棲類保育資料）核實後再公開。

## 10. 已知限制 / 後續（尚未做）

- 雨天變化（雨衣騎士、安全帽較滑）：已預留 `light`／車種結構，**未實作**，留給後續版本。
- 音效是 WebAudio 合成的簡單音，未使用 Kenney / freesound 的 CC0 素材；要換，改 `src/audio.js` 內各函式即可。
- Email 登入在 mock 模式不做信箱驗證；正式版請依 `docs/API.md` 做一次性連結 / 驗證碼，避免亂填他人信箱。
- 優惠券的「店員核銷」介面（掃 QR）未做，僅定義 API（`/coupons/redeem`）。
- 直式為主要版型；橫式可玩，但畫面只顯示較短的一段街景。
- 個資告知、活動辦法、優惠內容皆為**草稿 / 示意**，上線前需法務與店家確認。
