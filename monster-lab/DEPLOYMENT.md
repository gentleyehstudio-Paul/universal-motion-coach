# Deployment (Vercel Preview first, then domain + payments)

## What runs where

- `dist/` — static site: landing `/`, workspace `/app/`, pricing `/pricing`. Pose tracking stays in the browser.
- `api/*.mjs` — Vercel serverless functions: `status`, `redeem`, `review`. They always enforce access tickets.
- `server.mjs` — local-only server (owner use). Defaults to **open** (no tickets); set `ML_ACCESS_MODE=enforced` + `ACCESS_SECRET` to test the gate locally. It also keeps the image-generation route, which is **not** ported to Vercel (hidden in the first-release UI).

## Vercel settings

- Root Directory: `monster-lab` · Framework: Other · Build command: empty · Output directory: `dist` · Install command: empty.
- Environment variables (Production + Preview), all server-only:
  - `ACCESS_SECRET` — long random string (e.g. `openssl rand -base64 48`). Signs tickets and promo codes. Changing it invalidates every issued code/ticket.
  - `OPENAI_API_KEY`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — add Upstash Redis from the Vercel Marketplace (it sets these, or the `KV_REST_API_*` names, for you). **Required**: without a persistent store the API returns 503 instead of granting access.
  - `SITE_ORIGIN` — set after the domain is connected, e.g. `https://your-domain.com` (blocks cross-origin POSTs).
  - optional: `OPENAI_VISION_MODEL`.

## Known deployment risks (check on the first Preview)

1. **Request size.** Vercel functions accept ~4.5 MB request bodies; `/api/review` receives up to 36 JPEG frames plus the pose series. If real clips exceed that, lower the frame count/JPEG quality in `dist/coach.mjs`, or host `api/` on a long-running host instead (Railway/Fly — the handlers in `access/` are host-agnostic).
2. **Duration.** `vercel.json` asks for 300 s; the Hobby plan caps lower. A Pro plan (or Fluid compute) is likely needed for slow reviews.
3. **Knowledge notes.** `knowledge/*.md` is git-ignored (private). Without those files the basketball review runs without the reference notes. To include them, add them to the repo privately (keep the repo private) or inject via a build step.

## Owner tools until payments are connected

```sh
export ACCESS_SECRET=...            # same value as the deployment
node scripts/issue.mjs promo 20      # 20 free single-analysis promo codes
node scripts/issue.mjs ticket monthly "王小明"   # send the printed ticket to a paying customer
node scripts/issue.mjs ticket project "王小明"
```

Customers paste a ticket under 「已經是會員？」 on `/pricing` (or the box in the workspace).

## Checks

```sh
node check.mjs && node check-ai.mjs && node check-access.mjs
```
