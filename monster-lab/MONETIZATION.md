# Plans, access model and what is still missing

| Plan | Price (NT$) | Access | How it is granted today |
|---|---|---|---|
| 優惠碼體驗 | 0 | 1 AI analysis per code, ticket valid 14 days | self-serve: `/pricing` or workspace → enter code |
| 月費方案 | 399 / month | 30 analyses / calendar month | owner issues a ticket (`scripts/issue.mjs`) |
| 專案陪跑 | 1,500 / project | in-person setup + coaching (venue excluded) + 60 days of 30 analyses/month | owner issues a ticket after booking/payment |

Limits and prices live only in `access/plans.mjs`.

## How the gate works

A **ticket** is an HMAC-signed, expiring token (`access/tickets.mjs`). Promo codes (`MOSTER-XXXXXXXX-XXXX`) are also HMAC-checked, so no code list needs syncing; a code maps to a fixed ticket id, so redeeming repeatedly can never create extra credits. Usage (single credit, monthly quota) is counted in Redis; a failed or invalid analysis refunds its credit. The public API fails closed (503) when `ACCESS_SECRET` or the persistent store is missing.

## Not built yet (needs your accounts/decisions)

1. **Login.** Today access = possessing a ticket in the browser (localStorage). Losing the browser means re-pasting the ticket. Real accounts (email magic link, e.g. Supabase/Clerk) are the next step before monthly goes self-serve.
2. **Payments.** Connect a provider, then have its webhook call `issueTicket(secret, {plan:'monthly', ...})` and email/show the ticket; renewals extend `exp`; refunds/cancellation write `revoked:<ticketId>` in the store. Options: Stripe (cards, TWD, subscriptions) or ECPay/NewebPay (local methods; subscription handling is more manual). Project plan is better as a booking + invoice link than checkout.
3. **Domain.** After connecting, set `SITE_ORIGIN` and fill `LINKS` in `dist/pricing.js`.
4. Terms/privacy pages (images go to OpenAI on request) before public launch.

## Suggestions

- Add a **pay-per-use single analysis** (e.g. NT$99–149) between free and monthly: people who won't subscribe still convert.
- Keep the monthly quota (30) as a cost guard; check real OpenAI cost per review on Preview, then confirm NT$399 margin.
- Project plan: state the service area and travel assumptions on the page.
