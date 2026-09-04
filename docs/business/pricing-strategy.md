# Pricing Strategy & Unit Economics

**Date:** 2026-09-02. All costs are estimates from published list prices; FX at **₹88 = $1**. Every number here is a model, not a promise.

---

## 1. Which model, and why

| Option | Verdict | Reasoning |
| --- | --- | --- |
| **A · Flat monthly subscription per connected ad account** | **CHOSEN** | Our cost driver *is* the connected account (sync volume, API calls, storage, AI tokens). Price tracks cost. Predictable for the customer. Works when the customer's spend is ₹50k/mo or ₹50 lakh/mo. |
| B · Percentage of ad spend | Rejected | Standard in ad tech, wrong here. Spend per advertiser on a four-month-old self-serve platform is small and volatile, so revenue would be tiny and unforecastable. It also creates a perverse incentive — we would be paid more for recommending higher budgets, on a product whose core promise is cutting waste. Sales-heavy to administer. |
| C · Hybrid (base + % over a spend threshold) | Deferred | Right answer for agencies *later*. Adds pricing-page complexity we cannot afford pre-PMF. |
| D · Pure usage-based (per AI analysis / per action) | Rejected as the primary meter | Punishes the exact behaviour we want (running the analysis). Retained as a *secondary* meter for AI-heavy add-ons. |

**Decision: per-connected-ad-account subscription, with plan-level caps on AI analyses and automated actions.** Optmyzr charges per account above 25 *and* caps managed spend; we take the simpler half of that idea.

---

## 2. Price anchors

| Anchor | Price |
| --- | --- |
| Adstudio (multi-platform connector incl. ChatGPT Ads) | **$39/workspace/mo** — the floor for anything that looks like reporting |
| Adalysis (focused Google audit/testing) | ~$99+/mo |
| Optmyzr Essentials | ~$299/mo, ≤25 accounts, ≤$150k managed spend |
| Optmyzr Premium | ~$389/mo, ≤$500k |

We are more specialized than Adstudio and far narrower than Optmyzr. **Correct position: above the connector floor, well below the suite.** A self-serve advertiser spending $2,000/month will not pay $299; they will pay $29–49 to stop wasting $400.

The India wrinkle: an India-registered advertiser at a ₹725/day minimum budget is spending ~₹22k/month. A ₹7,999/month tool is 36% of their ad spend — absurd. **India needs its own price ladder, not a converted one.**

---

## 3. Recommended pricing

Two ladders, one product. Region detected at signup, switchable by the customer.

### Global (USD)

> **As shipped (2026-09-04):** the product sells **Basic $15 / Pro $29 /
> Enterprise $49** per month, with 1 / 5 / 25 ad accounts. `lib/billing/plans.ts`
> is the only source of truth — it is what the entitlement checks enforce. The
> ladder below is the original research that set the *position* (above the
> connector floor, well below the suite); the names and numbers moved down after
> it was written, so read it for the reasoning, not the price list.

| Plan | Price | Ad accounts | AI analyses / mo | Automated actions / mo | Seats | For |
| --- | --- | --- | --- | --- | --- | --- |
| **Free** | $0 | 1 | 5 | 0 (recommend only) | 1 | Diagnostics + dashboard. Real, permanent, useful. Our main acquisition channel |
| **Starter** | **$29/mo** | 1 | 100 | 50 | 2 | Solo advertiser, one brand |
| **Growth** | **$79/mo** | 5 | 500 | 300 | 5 | In-house team, multi-brand |
| **Agency** | **$249/mo** | 25 | 2,500 | 1,500 | 15 | Agency, client reporting, roles, white-label reports |
| **Agency Pro** | **$599/mo** | 100 | 10,000 | 6,000 | unlimited | Larger agency |
| **Enterprise** | custom | custom | custom | custom | custom | SSO, DPA negotiation, dedicated egress IP, SLA |

Annual = 2 months free (17% off). 14-day trial of Growth, no card.

### India (INR) — priced for the local market, not converted

| Plan | Price | Ad accounts | Notes |
| --- | --- | --- | --- |
| **Free** | ₹0 | 1 | Same as global |
| **Starter** | **₹1,499/mo** | 1 | ≈ $17 — deliberately below the $29 global price |
| **Growth** | **₹4,999/mo** | 5 | ≈ $57 |
| **Agency** | **₹14,999/mo** | 25 | ≈ $170 |
| **Agency Pro** | **₹34,999/mo** | 100 | ≈ $398 |

All INR prices exclusive of 18% GST. The brief's suggested ₹1,999 / ₹7,999 / ₹24,999 ladder is close but slightly high at the entry point for advertisers at a ₹22k/month minimum spend — ₹1,499 keeps the tool under 7% of their ad budget, which is the number a performance marketer will actually sanity-check.

**Why Free is permanent and generous:** on a four-month-old ad platform the scarce thing is trust, not features. A free tier that instantly says *"3 of your 7 campaigns aren't serving — here's why"* is the entire top of the funnel. It costs us almost nothing (see §5) because a free account is read-only sync plus deterministic rules with no AI tokens.

---

## 4. Cost model

### Fixed monthly (0 customers)

| Item | Choice | Cost/mo |
| --- | --- | --- |
| Hosting | Vercel Hobby (pre-revenue) → Pro at ~10 customers | $0 → $20 |
| Postgres | Neon free (0.5 GB) → Launch $19 | $0 → $19 |
| Redis / queue | Upstash pay-as-you-go free tier | ~$0 |
| Domain | .com | ~$1.2 |
| Email (transactional) | Resend free 3k/mo → $20 | $0 → $20 |
| Error tracking | Sentry free | $0 |
| **Total fixed, pre-revenue** | | **≈ $1–2/mo (≈ ₹150)** |
| **Total fixed, post-launch** | | **≈ $60/mo (≈ ₹5,300)** |

The MVP infrastructure target of ₹5,000–15,000/month in the brief is **comfortably achievable — in fact roughly 10× more headroom than needed at launch.** Serious spend does not begin until AI usage scales.

### Variable, per connected ad account per month

| Driver | Assumption | Cost |
| --- | --- | --- |
| API sync | 4 syncs/day × ~12 calls = ~1,450 calls/mo. Compute is negligible on Vercel | ~$0.02 |
| Postgres storage | ~50 MB/account/yr of daily facts | ~$0.10 |
| Redis ops | cache + rate-limit counters | ~$0.05 |
| **AI (the only cost that matters)** | Recommendation reasoning + agent Q&A. ~25 calls/mo × ~8k in / 1.5k out tokens | **see below** |
| Email/reports | weekly report + alerts | ~$0.02 |

**AI cost control is the whole game.** Two rules:

1. **The engine is deterministic; the LLM only explains.** Candidate detection, thresholds, projections and risk scoring are pure TypeScript over stored facts — no tokens. The LLM writes the narrative and answers ad-hoc questions.
2. **Route by task.** Explanation and summarization go to a small fast model; only the conversational agent uses a frontier model.

| Tier | Model mix | AI cost / account / mo |
| --- | --- | --- |
| Free | none (deterministic only) | **$0.00** |
| Starter | small model, ~100 analyses | ~$0.35 |
| Growth | small model + some agent | ~$0.90 |
| Agency | mixed, capped | ~$1.60 |

**Blended variable cost ≈ $0.30 (Free) to $1.80 (Agency) per connected account per month.**

### Non-infrastructure costs

| Item | Rate |
| --- | --- |
| Payments (Razorpay domestic) | ~2% + GST |
| Payments (international card / MoR e.g. Paddle) | ~5% + fixed |
| Support | founder time to ~100 customers; ~$3/customer/mo thereafter |

---

## 5. Unit economics by scale

Mix assumption: 55% Starter, 30% Growth, 12% Agency, 3% Agency Pro. Blended global ARPU ≈ **$96/mo**; India-only mix ARPU ≈ **₹4,800 (≈$55)**. Modelled below on a **60/40 global/India revenue split → blended ARPU ≈ $80/mo**.

| Customers | MRR | ARR | Infra (fixed+var) | AI | Payments | Support | **Gross profit/mo** | **Margin** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | $0 | $0 | $2 | $0 | $0 | $0 | −$2 | — |
| 10 | $800 | $9.6k | $60 | $12 | $28 | $0 | **$700** | **88%** |
| 50 | $4,000 | $48k | $115 | $65 | $140 | $0 | **$3,680** | **92%** |
| 100 | $8,000 | $96k | $190 | $135 | $280 | $0 | **$7,395** | **92%** |
| 500 | $40,000 | $480k | $780 | $700 | $1,400 | $1,500 | **$35,620** | **89%** |
| 1,000 | $80,000 | $960k | $1,650 | $1,450 | $2,800 | $3,000 | **$71,100** | **89%** |

**Reading these numbers honestly:**

- Gross margin is ~90% because this is software over an API we do not pay for. That is normal and not a competitive advantage.
- **The business is not cost-constrained; it is acquisition-constrained.** At 100 customers the entire monthly cost base is ~$600 — less than one enterprise SaaS seat. Every real risk lives in the numerator.
- The 500→1,000 rows include support cost because founder-only support breaks somewhere around 100–150 customers. That is a hiring decision, not an infrastructure decision.
- These are *gross* margins. They exclude founder salary, marketing spend, and the cost of the ad account we must fund ourselves for live testing (~$200–500 one-time, see BLOCKERS RED-3).

**Break-even:** fixed costs are ~$60/month, so **one Growth customer covers all infrastructure.** Realistic personal break-even (₹80,000/month founder draw) is **≈ 12–15 customers**.

---

## 6. Discipline rules

1. **Never price on a percentage of ad spend.** It contradicts the product promise.
2. **Never charge for the diagnostics that prove value on day one.** Free tier keeps serving issues, review reasons, and the account health score forever.
3. **Meter what costs us money** — AI analyses and automated actions — and show the counter in the UI, so a cap is never a surprise.
4. **India pricing is set from India, not converted from USD.**
5. **Re-price after 50 paying customers, not before.** We currently have zero evidence about willingness to pay; every number above is an assumption to be tested.
