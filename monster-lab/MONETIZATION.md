# Plans, access model and what is still missing

| Plan | Price (NT$) | Access | How it is granted today |
|---|---|---|---|
| 優惠碼體驗 | 0 | 1 AI analysis per code, ticket valid 14 days | self-serve: `/pricing` or workspace → enter code |
| 單次分析 | 129 | 1 AI analysis per purchase, valid 90 days, purchases stack | self-serve Stripe one-time Checkout |
| 月費方案 | 399 / month | 30 analyses / calendar month | self-serve Stripe subscription |
| 專案陪跑 | 1,500 / project | in-person setup + coaching (venue excluded) + 60 days of 30 analyses/month | owner issues a ticket after booking/payment |

Limits and prices live only in `access/plans.mjs`.

## How it works now

- **Login**: email magic link (no passwords). `/api/auth/request` emails a one-time link (15 min); the token sits in the URL fragment and is spent by a POST, so mail scanners can't burn it. A signed HttpOnly cookie keeps you signed in 30 days. Per-email and per-IP rate limits apply; the response is identical for any address.
- **Accounts hold grants** (`{id, plan, exp}`): a promo code, an owner-issued ticket, a Stripe subscription, or a manual `grant` all become a grant on the signed-in email. Usage (single credit, monthly quota) and revocation are counted per grant id in Redis; a failed analysis refunds its credit. Promo codes map to a fixed grant id, so one code can never yield more than one free analysis even if several accounts redeem it.
- **Stripe**: `/api/checkout` creates a hosted Checkout Session for the monthly price; the webhook (signature-verified, idempotent) creates/extends the grant on `checkout.session.completed` and `invoice.paid` (period end + 3 days grace) and revokes it on `customer.subscription.deleted`. `/api/portal` opens Stripe's customer portal for cancel/card changes.
- The public API fails closed (503) when `ACCESS_SECRET` or the persistent store is missing.
- Monthly quota counts per calendar month (UTC), not per billing anniversary.

## Not built yet

1. **Project plan payment** stays manual: book/invoice, then `scripts/issue.mjs grant <email> project`. Fill `PROJECT_LINK` in `dist/pricing.js` with your booking channel.
2. **Refunds**: a full refund of a single analysis revokes that purchase automatically (`charge.refunded`). Monthly refunds, partial refunds and disputes are not handled; revoke manually with `scripts/issue.mjs revoke <grant-id>`.
3. **Taiwan local payment methods** (ECPay/NewebPay, convenience-store, ATM) — Stripe covers cards; add later if customers ask.
4. **Terms/privacy pages**, and a receipt/invoice policy (統一發票) before public launch.
5. Domain: set `SITE_ORIGIN`, then verify the domain in Resend.

## Suggestions

- NT$129 for a single analysis is my placeholder: change `priceTWD` in `access/plans.mjs` and the Stripe price together. Sanity-check it against real OpenAI cost per review and keep it clearly above the per-analysis cost of the monthly plan (NT$399 / 30 ≈ NT$13).
- Check real OpenAI cost per review on Preview, then confirm the NT$399 margin at 30 analyses/month.
