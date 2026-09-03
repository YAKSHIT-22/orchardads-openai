# SHOULD WE BUILD THIS?

**Decision gate — Phase 32.** Date: 2026-09-02. Based on `docs/research/openai-ads-api-analysis.md`, `partner-access-checklist.md`, `BLOCKERS.md`, `docs/business/*`, `docs/deployment/india-architecture.md`.

---

## Verdict: **BUILD — but not the product as specified.**

**Overall score: 72 / 100.**

| Dimension | Score | Reasoning |
| --- | --- | --- |
| **Technical feasibility** | **85** | The API is genuinely good: clean REST, cursor pagination, an official OpenAPI spec, real write endpoints, dedicated state transitions, and typed serving-issue and review-reason enums that hand us a diagnostics engine for free. Deductions: no live verification yet, no documented error bodies, five spec changes in three months |
| **Commercial feasibility** | **65** | Real advertisers, real pain, real money — but spend per advertiser is small, so willingness to pay is unproven and ARPU is capped near $80/month |
| **API accessibility** | **90** | **The best news in this report.** Customer-issued API key, no vendor approval, no minimum spend, no partner gate for the read/optimize loop. This was expected to be the blocker; it is not |
| **Competition** | **60** | Window open but not empty. Connectors already at $39/month; agentic competitors exist; incumbents will add connectors. The specialist middle is unclaimed |
| **Monetization** | **70** | Account-based subscription works; ~90% gross margin; but the entry tier is genuinely small money and India pricing must be low |
| **Startup cost** | **95** | ~₹150/month pre-revenue, ~₹5,300/month at launch. Break-even at 12–15 customers. Essentially no capital risk |
| **India feasibility** | **80** | Nothing published restricts an Indian vendor; India advertiser access opened **2026-08-31** — a genuine local beachhead. Deduction for GST/export/FEMA overhead and unconfirmed tax questions |
| **International scalability** | **85** | Serverless, us-east, CDN. Company residency and server residency are decoupled. MoR removes global tax complexity |
| **Risk** | **45** *(lower is worse)* | **The dominant risk is OpenAI shipping native optimization inside Ads Manager.** Secondary: ROAS is unobtainable, no OAuth, weekly API churn, thin statistical power at small budgets |

### Be skeptical — the case against

1. **Platform risk is existential, not theoretical.** OpenAI is four months into self-serve and shipping API features weekly. Recommendations and auto-budgeting are obvious next moves for their own console. A large part of our v1 could be absorbed. The only durable defence is workflow (multi-account, approvals, roles, audit, client reporting, history beyond console retention), not analysis.
2. **ROAS does not exist and the brief is built on it.** The dashboard mock, the landing-page copy, and the "reduce CPA without increasing budget" agent story all assume revenue data. `ConversionSummaryRowBody` returns three integers and no value field. Every competitor showing ROAS on this data is inferring it or wiring in another source silently.
3. **This API has no keywords.** Roughly half of Optmyzr's surface — n-grams, search terms, negative harvesting, match types, quality score, impression share — has no analogue. A ported PPC tool will be visibly hollow.
4. **The market is small today.** ~$720k ARR at 1,000 customers on plausible assumptions. A good bootstrapped outcome for one founder in India; a poor venture outcome.
5. **Nothing has been verified against live traffic.** Zero calls made. That is a launch blocker, not a detail.

### The case for

1. **Access is unusually open** for a platform this valuable. That will not stay true.
2. **India opened two days ago.** No global vendor has localized. This is the sharpest timing edge available and it decays fast.
3. **The diagnostics wedge is real and cheap.** ~30 typed serving-issue codes plus an enum of ad-review failure reasons produce value the second a key is pasted — before any history exists. That solves the hardest problem in analytics SaaS: day-one emptiness.
4. **Cost of being wrong is ~₹150/month.** The asymmetry is extreme.
5. **The category is bigger than the platform.** Architected as "one adapter, many assistant ad platforms", this inherits AI-assistant advertising generally.

---

## BUILD NOW

Everything below works today with a customer-issued API key and zero OpenAI approval.

| # | Feature | Endpoints |
| --- | --- | --- |
| 1 | Auth, organizations, roles, 2FA, sessions | ours |
| 2 | Connect an OpenAI Ads account by API key; validate; encrypt at rest | `GET /ad_account` |
| 3 | Multi-account workspace (one key per account) | `GET /ad_accounts`, `GET /ad_account` |
| 4 | Background sync of campaigns, ad groups, ads | `GET /campaigns`, `/ad_groups`, `/ads` + `include[]=serving_issues` |
| 5 | Delivery insights: spend, impressions, clicks, CTR, CPC, CPM at 4 scopes, 4 granularities | `GET /*/insights` |
| 6 | Conversion counts → **CPA and CVR** joined at daily grain | `POST /conversions/insights` |
| 7 | **Serving-issue diagnostics — "why isn't this running?"** | serving-issue enums |
| 8 | **Ad-review recovery — "why was this rejected and how do I fix it"** | `review_status`, `review.reason` enum |
| 9 | Budget pacing and exhaustion-date projection | campaign budgets + `spend_limit_windows.spent_micros` |
| 10 | Account health score from real signals only | derived |
| 11 | Deterministic recommendation engine: waste, pacing, bid/budget mis-allocation, creative fatigue, tracking gaps, serving faults | derived |
| 12 | Risk engine + approval workflow + audit log | ours |
| 13 | Safe execution: budget update, bid update, pause/activate | `POST /campaigns/{id}`, `/ad_groups/{id}`, `/activate`, `/pause` |
| 14 | Rollback via before-state capture | GET before write |
| 15 | AI analyst (read-only tools, structured outputs, number-grounded) | ours + our reads |
| 16 | Alerts and anomaly detection on spend, CPC, CTR, CPA | derived |
| 17 | Scheduled reports (dashboard, PDF, CSV, email) | derived |
| 18 | Optimization rules engine, configurable, approval-gated | ours |
| 19 | Billing, plans, usage metering | ours |
| 20 | Landing page, pricing, onboarding, docs | ours |

## WAIT — behind an interface, no fake implementation

| Feature | Gate | Our stand-in |
| --- | --- | --- |
| Bulk edits | Bulk API is limited preview, per-account, `404` otherwise | `BulkExecutor` interface; sequential idempotent REST implementation now |
| One-click "Connect with OpenAI" | No published OAuth client registration | `CredentialProvider` interface; `OAuthProvider` stubbed |
| Creating pixels / Conversions API keys | `404` until enabled | Read-only conversion diagnostics; tell the customer what to create |
| Creating conversion-optimized campaigns | `403 Conversion bidding is not enabled` | Detect and surface an explicit enablement card |
| Auto-fixing brand/favicon | `403` until enabled | Diagnose and hand over the exact fix |
| **ROAS / revenue** | No value field in any read endpoint | `RevenueSource` connector interface (Shopify / GA4 / CSV), empty until connected |
| Product-feed and catalog tooling | Works, but ecommerce-only | Post-MVP |
| Lead forms, business agents | Spec-only, undocumented | Watch |

## DO NOT BUILD

| Feature | Why |
| --- | --- |
| Keyword bidding, match types, search-term reports, n-grams, negative-keyword harvesting | **The API has no keywords.** Targeting is `context_hints[]` free text |
| Quality Score, Ad Rank, impression share, auction insights, competitor spend | Not exposed |
| Device/geo/schedule bid adjustments; dayparting automation | Only audience bid multipliers exist. Hourly *reporting* exists; hourly *bidding* does not |
| Automated `/archive` | Documented as irreversible. Human-only, forever |
| Automated account pause/activate | Blast radius is the advertiser's entire business |
| **Full Autopilot at launch** | We have zero outcome data. Autopilot without a track record is how a tool destroys a customer's account and our company. Ship Recommendation + Assisted; earn Autopilot with logged outcomes |
| Google / Meta / Apple / Amazon / Bing adapters | Out of scope, and adding Google makes us a worse Optmyzr |
| Percentage-of-ad-spend pricing | Directly contradicts a product that exists to cut waste |

---

## BEST MVP

**Ship exactly this. Nothing else.**

> **"Find out why your ChatGPT Ads aren't performing — and fix it safely."**

1. Signup, email verification, org, roles (`OWNER` / `ADMIN` / `MEMBER` / `VIEWER`), optional 2FA
2. **Connect account** — paste API key → `GET /ad_account` validates → encrypted at rest → first sync
3. **Account health dashboard** — health score, spend, impressions, clicks, CTR, CPC, CPM, conversions, CPA, CVR, budget pacing, trend charts. **No ROAS anywhere**
4. **Serving Doctor** — every serving issue across every entity, grouped by cause, with the fix and the estimated daily cost of leaving it broken
5. **Review Doctor** — every rejected or in-review ad, decoded `review.reason`, with the specific fix (crawler blocked, robots.txt, login wall, missing favicon…)
6. **Waste finder** — spend with zero conversions, exhausted budgets, paused-parent orphans, ad groups bidding above account CPA
7. **Recommendations** — deterministic engine, ranked by rupee/dollar impact, each with reasoning, projected effect, confidence, risk band
8. **Risk engine + approval** — before/after, % change, blast radius, guardrails (max ±% change, daily action cap, cooldown, minimum-volume gate), explicit human approval
9. **Safe execution + rollback** — before-state capture, idempotent write, audit log, one-click revert
10. **AI analyst** — ask a question in English; read-only typed tools; every number grounded in stored facts, never generated
11. **Weekly email report** + PDF/CSV export
12. **Billing** — Free / Starter / Growth, Razorpay (India) + MoR (global)

Explicitly out of MVP: bulk editing, autopilot, experiments/A-B testing, custom audiences UI, product feeds, campaign *creation* wizard, ROAS, multi-platform.

**Why creation is out:** advertisers create campaigns in Ads Manager, which is free and better at it. Our value is in what happens *after* the campaign exists. Building a creation wizard is the most common way tools like this waste their first three months.

---

## BEST FIRST CUSTOMER

**Performance marketing agencies in India managing 5–25 client accounts, running ChatGPT Ads since the 2026-08-31 India opening.**

| Criterion | Why they win |
| --- | --- |
| Pain | Managing N client accounts in a console with no cross-account view is manual misery |
| Willingness to pay | Tool budgets already exist; ₹14,999/mo is normal for an agency |
| Access | Reachable — LinkedIn, Indian PPC communities, direct outreach. Small, findable population |
| Recurring usage | Daily, by job description |
| Multiplier | One agency = 5–25 connected accounts = one sale, many seats of value |
| Timing | They started days ago. Nobody has sold them a tool yet |

Second segment: D2C ecommerce brands in India spending ₹50k–5 lakh/month. Third: US SaaS companies (highest CPCs at $8–18, so waste hurts most).

**Not** enterprise advertisers — StackAdapt/Pacvue/Criteo are OpenAI's named technology partners and own that tier.

---

## BEST PRICING

| Plan | Global | India | Accounts |
| --- | --- | --- | --- |
| Free | $0 | ₹0 | 1 — diagnostics forever |
| Starter | $29/mo | ₹1,499/mo | 1 |
| Growth | $79/mo | ₹4,999/mo | 5 |
| Agency | $249/mo | ₹14,999/mo | 25 |
| Agency Pro | $599/mo | ₹34,999/mo | 100 |

Account-based, never percentage-of-spend. INR excludes 18% GST. Annual = 2 months free. Full reasoning and unit economics in `docs/business/pricing-strategy.md`.

---

## EXPECTED MVP COST

| Item | Cost |
| --- | --- |
| Infrastructure to launch (3 months) | **₹0–2,000** (free tiers) |
| Infrastructure post-launch | **~₹5,300/mo** |
| **Our own ad account for live verification** (non-negotiable, BLOCKERS RED-3) | **₹20,000–45,000 one-time** |
| Domain + email | ~₹3,000/yr |
| CA + incorporation + legal docs | **₹25,000–60,000** *(confirm with your CA)* |
| Design/brand | ₹0 (ported from handyAds) |
| **Total to first paying customer** | **≈ ₹50,000–1,10,000 + your time** |

The dominant cost is funding a live ad account to verify the integration. Do not skip it.

---

## FIRST 10 CUSTOMERS

1. **Run ChatGPT Ads ourselves** on the funded test account. It verifies the integration, generates real screenshots, and produces the content nobody else can write yet.
2. **Publish what we learn** — "Every ChatGPT Ads serving-issue code, decoded", "Why your ChatGPT ad was rejected", "ChatGPT Ads for Indian advertisers: the first 30 days". These are the queries a brand-new platform's advertisers are searching *right now* and no one has answered.
3. **Free tier as the pitch.** "Paste your API key, get your serving report in 60 seconds." No demo call.
4. **Direct outreach to ~50 Indian performance agencies** on LinkedIn with a personalized angle, not a pitch: India opened 2026-08-31, here is what breaks in week one.
5. **Indian PPC/growth communities** — Slack, WhatsApp, Reddit r/PPC — participate genuinely, do not spam.
6. **Free audits.** Offer 10 agencies a manual account audit using our own tool. Every audit is a design interview and a warm lead.
7. **Product Hunt** once the diagnostics loop is real — the "first optimizer for ChatGPT Ads" story is genuinely newsworthy.
8. **Ask every user for one referral** at the moment they approve their first recommendation.

Target: **10 paying customers in 90 days.** With one agency at ₹14,999 and nine at ₹1,499–4,999, that is roughly ₹45,000–60,000 MRR — infrastructure covered many times over and the founder's break-even in sight.

---

## 90-DAY PLAN

### Weeks 1–2 · Foundation + verified integration
- Next.js 16 + TS + Tailwind v4 + shadcn/ui, design system ported from handyAds (violet `oklch(0.49 0.24 292)`, Space Grotesk)
- Prisma schema, Neon, multi-tenancy with enforced isolation
- Auth: signup, email verification, sessions, roles, 2FA
- `OpenAiAdsClient` + services, envelope-encrypted credential store
- **Fund a real ad account. Run the full loop live. Correct every `[U]` mapping.** ← the gate for everything after
- Send the 12 UNKNOWN questions to OpenAI

### Weeks 3–4 · Sync + dashboard
- Background sync (QStash), rate-limit governor, retries, idempotency, sync status
- Metric facts table, daily rollups, delivery + conversion join at daily grain
- Account health dashboard, real empty states, no ROAS

### Weeks 5–6 · The wedge
- **Serving Doctor** and **Review Doctor** — the two features that make the free tier worth pasting a key for
- Waste finder, budget pacing, exhaustion projection

### Weeks 7–8 · Recommend + execute safely
- Deterministic recommendation engine with impact ranking and confidence
- Risk engine, guardrails, approval workflow, audit log, before-state capture, rollback
- Execution service, idempotent, single-flight

### Weeks 9–10 · AI + reporting
- AI analyst: typed read-only tools, structured outputs, number-grounding guard
- Weekly report, PDF/CSV export, email delivery, alerts

### Weeks 11–12 · Commercial launch
- Landing page, pricing, onboarding, docs, security page
- Billing: Razorpay + MoR; plans and usage metering
- ToS / Privacy / DPA / refund policy live
- **Launch:** Product Hunt, content, 50 agency outreaches, 10 free audits

### Month 2 checkpoints
First 3 paying customers · outcome tracking on every executed action (did CPA actually move?) · first case study

### Month 3 checkpoints
10 paying customers · re-price on real data · decide Assisted-mode expansion based on logged outcomes · evaluate whether a second assistant ad platform is worth an adapter

---

## Two conditions on this GO

1. **Do not ship a single number we cannot source from the API.** No ROAS, no estimated revenue, no fabricated confidence. In a tool that spends other people's money, one invented metric ends the company.
2. **Verify against a live account before the first customer.** Everything in this repo is derived from documentation. Documentation is not a running system.
