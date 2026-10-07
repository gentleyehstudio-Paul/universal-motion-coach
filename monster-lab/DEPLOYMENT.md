# Deployment (Vercel Preview first, then domain + payments)

## What runs where

- `dist/` — static site: landing `/`, workspace `/app/`, pricing `/pricing`. Pose tracking stays in the browser.
- `api/**/*.mjs` — Vercel serverless functions: `status`, `auth/{request,verify,logout}`, `redeem`, `review`, `checkout`, `portal`, `stripe/webhook`. They always enforce email login + entitlements.
- `server.mjs` — local-only server (owner use). Defaults to **open** (no tickets); set `ML_ACCESS_MODE=enforced` + `ACCESS_SECRET` (+ `ML_DEV_LOGIN=1`, which prints/returns the login link instead of emailing it) to test login and the gate locally. It also keeps the image-generation route, which is **not** ported to Vercel (hidden in the first-release UI).

## Vercel settings

- Root Directory: `monster-lab` · Framework: Other · Build command: empty · Output directory: `dist` · Install command: empty.
- Environment variables (Production + Preview), all server-only:
  - `ACCESS_SECRET` — long random string (e.g. `openssl rand -base64 48`). Signs tickets and promo codes. Changing it invalidates every issued code/ticket.
  - `OPENAI_API_KEY`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — add Upstash Redis from the Vercel Marketplace (it sets these, or the `KV_REST_API_*` names, for you). **Required**: without a persistent store the API returns 503 instead of granting access.
  - `SITE_ORIGIN` — e.g. `https://your-domain.com`. **Required for login**: login links in emails are built from it (never from the request Host header). Without a custom domain yet, Vercel's `VERCEL_URL` is used as a fallback.
  - `RESEND_API_KEY`, `MAIL_FROM` — sign-in emails via [Resend](https://resend.com) (`MAIL_FROM` like `Moster Lab <login@your-domain.com>`, on a domain verified in Resend; Resend's test sender only mails your own address).
  - Stripe (monthly plan): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY` (a recurring TWD price, NT$399/month, created in the Stripe dashboard), `STRIPE_WEBHOOK_SECRET`.
  - optional: `OPENAI_VISION_MODEL`.

## Known deployment risks (check on the first Preview)

1. **Request size.** Vercel functions accept ~4.5 MB request bodies; `/api/review` receives up to 36 JPEG frames plus the pose series. If real clips exceed that, lower the frame count/JPEG quality in `dist/coach.mjs`, or host `api/` on a long-running host instead (Railway/Fly — the handlers in `access/` are host-agnostic).
2. **Duration.** `vercel.json` asks for 300 s; the Hobby plan caps lower. A Pro plan (or Fluid compute) is likely needed for slow reviews.
3. **Knowledge notes.** `knowledge/*.md` are now committed so the deployed review uses them. **Keep this GitHub repository private** — they are your training material.

## Stripe setup

1. Dashboard → Product catalogue → create "Moster Lab 月費" with a recurring monthly price of NT$399 → copy its `price_...` id into `STRIPE_PRICE_MONTHLY`.
2. Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook` with events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted` → copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal → enable (lets subscribers cancel/update cards from 「管理訂閱」).
4. Test with Stripe test keys and card `4242 4242 4242 4242` on a Preview deployment before switching to live keys. The webhook reads the raw request body to check Stripe's signature; confirm on the first Preview that Stripe's test event returns 200 (if it returns 400, Vercel parsed the body first and the raw-body read needs adjusting).

## Owner tools

```sh
export ACCESS_SECRET=...            # same value as the deployment
node scripts/issue.mjs promo 20      # 20 free single-analysis promo codes
node scripts/issue.mjs grant fan@example.com project 60   # needs UPSTASH_* env: gives that account the project plan
node scripts/issue.mjs ticket monthly "王小明"            # a code the customer pastes after logging in
node scripts/issue.mjs revoke manual_xxxxxx               # switch a grant off
```

Customers must be logged in to redeem a promo code or ticket (`/pricing` or the box in the workspace).

## Checks

```sh
node check.mjs && node check-ai.mjs && node check-access.mjs
```
