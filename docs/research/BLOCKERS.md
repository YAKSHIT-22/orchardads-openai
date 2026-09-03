# BLOCKERS — OpenAI Ads SaaS

**Date:** 2026-09-02. RED = prevents launch. YELLOW = needs confirmation, has a safe workaround. GREEN = safe to proceed.

Rule applied throughout: **where something cannot be done today, we ship a clean interface and an honest empty state — never a fake implementation.**

---

## RED — prevents launch

### RED-1 · ROAS and revenue are not obtainable from the OpenAI Ads API

**Evidence:** `ConversionSummaryRowBody` in the official OpenAPI spec contains exactly `entity_id, date, device, country, conversions, click_through_conversions, view_through_conversions`. Delivery insights expose exactly `impressions, clicks, spend, ctr, cpc, cpm`. Conversion *events* accept `amount` + `currency` on ingest, but no read endpoint returns a summed value.

**Why RED:** the brief's product spec, dashboard mock, and landing page all lead with Revenue and ROAS. Shipping those from this API is impossible; faking or estimating them in an ad-spend product is the kind of number a customer makes a budget decision on.

**Resolution (blocks launch of the *claim*, not the product):**
- Remove Revenue / ROAS / AOV / LTV from the MVP dashboard, landing page, and reports.
- Lead with **Spend, Conversions, CPA, CVR, CTR, CPC, CPM, budget pacing** — all real.
- Model `revenue` in the schema as nullable and sourced from a future `RevenueSource` connector (Shopify / GA4 / warehouse / CSV). Show "Connect a revenue source" rather than a number.
- Ask OpenAI question #6 in `partner-access-checklist.md`.

### RED-2 · No published OAuth client registration → no one-click account linking

**Evidence:** `AdsOAuth` is fully defined in the OpenAPI spec (authorize/token URLs, four scopes) but appears in **zero** prose doc pages. No `client_id` issuance process is published.

**Why RED:** copy-paste of a full-write, non-expiring, unscoped bearer key is a serious trust and conversion obstacle for an unknown vendor asking for control of an ad budget. It will cost us signups.

**Resolution:** ship BYO API key with a genuinely excellent, well-explained onboarding (exactly what the key can do, that it never leaves our servers, how to revoke). Build `CredentialProvider` as an interface with `OAuthProvider` stubbed. Ask OpenAI questions #1–#4. **Do not invent an OAuth flow against undocumented endpoints.**

### RED-3 · Nothing is verified against live traffic

**Evidence:** every response shape in this repo is derived from documentation and the OpenAPI spec. Zero calls have been made against `api.ads.openai.com`. The spec omits error bodies entirely.

**Why RED:** it is a launch blocker to bill a customer for a system whose parsing has never seen a real payload — especially on an API with five changelog entries in three months.

**Resolution:** register our own OpenAI ad account, fund it minimally, run the full loop (connect → sync → recommend → apply → verify) against it, and correct every `[U]` mapping before the first external customer. Ask OpenAI question #11 (sandbox). **This is the top pre-launch engineering task.**

---

## YELLOW — needs confirmation, has a workaround

### YELLOW-1 · Bulk API is limited preview and per-account enabled
Doc states it is enabled per ad account, `404` otherwise, and deliberately excluded from the OpenAPI spec. Its input vocabulary also differs from REST (`max_budget_micros`/`budget_type` vs `budget.lifetime_spend_limit_micros`). **Workaround:** `BulkExecutor` interface with a sequential, rate-limit-aware, idempotent REST implementation; bulk-job implementation swapped in per account when enabled. Two mappers, one interface.

### YELLOW-2 · Conversion setup writes are gated
`POST /conversions/pixels` and `POST /conversions/api_keys` return `404 Not found` until OpenAI enables them for the client account. **Workaround:** read-only conversion diagnostics — list pixels and event settings, detect "campaign optimizing to conversions with no active source", instruct the customer. No fake writes.

### YELLOW-3 · Conversion-optimized bidding is gated
`403 Conversion bidding is not enabled`. `bidding_type` is immutable after creation, so a mis-created campaign cannot be migrated — it must be rebuilt. **Workaround:** detect the 403, surface an explicit enablement card, and never silently downgrade a customer's intended bidding type.

### YELLOW-4 · Per-IP rate limiting on shared infrastructure
Limits apply per ad account **and** per IP. Serverless platforms give us a shared, rotating egress IP pool shared with every other tenant of that platform. **Workaround:** central token-bucket governor in Redis keyed by `{adAccountId}` and `{egressIp}`; single-flight sync per account; exponential backoff honouring `Retry-After`. Ask OpenAI question #12.

### YELLOW-5 · Undocumented spec-only surfaces
`/me`, `/ad_accounts`, `/ad_account_creation_sessions`, `POST /api_keys`, `/lead_forms`, `/lead_sync_subscriptions`, `/business_agents`, `/partner_data/uploads` are in the spec but not in prose docs. **Workaround:** do not depend on them; keep them out of the MVP; ask questions #1–#4, #9.

### YELLOW-6 · Terms position on third-party credential storage is unconfirmed
Partner Setup *requires* a "server-side secret manager for the Ads API key", which strongly implies third parties are expected to store keys — but we have not read an explicit terms clause. **Workaround:** get it in writing (question #5) before public launch. Not a build blocker.

### YELLOW-7 · API velocity
Five changelog entries between 2026-06-03 and 2026-08-25 (location targeting, conversion setup, segmented insights, conversion bidding, audience operations). **Workaround:** snapshot `openapi.json` on a schedule, diff it, alert on change; defensive parsing everywhere; contract tests generated from the snapshot.

### YELLOW-8 · Conversions join is daily-grained and single-breakdown
Delivery supports `hourly`; conversions support only `none|daily` and one breakdown of `device|country`. CPA/CVR therefore exist only at daily grain, and hourly views can show spend but never CPA. **Workaround:** make the grain explicit in the UI; never interpolate.

### YELLOW-9 · Statistical power is thin at small budgets
With CPCs around $3–5 and CPMs around $25–60, a small advertiser generates few conversions per day. **Workaround:** every recommendation carries a minimum-volume gate and states its confidence honestly; the engine says "not enough data yet" rather than inventing significance.

---

## GREEN — safe to proceed now

| Area | Evidence |
| --- | --- |
| Read campaigns / ad groups / ads, with cursor pagination and `include[]=serving_issues` | Official docs + spec |
| Read delivery insights at 4 scopes, 4 granularities, with filters/sorts/segments | Insights doc |
| Read conversion counts via `POST /conversions/insights` | Insights doc + spec |
| Compute CPA, CVR, CTR, CPC, CPM, spend, budget pacing | Derivable from the above |
| Update campaign budget (`lifetime_spend_limit_micros`, `daily_spend_limit_micros`) | Campaigns doc |
| Update ad-group `max_bid_micros` and bid multipliers | Ad groups doc |
| Pause / activate campaigns, ad groups, ads | Dedicated action endpoints |
| Account spend-limit windows (create/update/delete) | Spec, with `spent_micros` for pacing |
| Serving-issue diagnostics (~30 typed codes) | Spec enums |
| Ad-review diagnostics (`review_status`, `review.reason` enum) | Ads doc + spec |
| Creative create/update/preview | Ads doc |
| Custom audiences incl. async membership ops | Custom Audiences doc |
| Geo lookup for location targeting | Spec + Campaign Targeting doc |
| Account-level negative keywords | Spec |
| Multi-tenant SaaS with one API key per ad account | Authentication doc |
| Rate-limit-aware background sync | Documented limits |
| India-registered company serving global advertisers | Nothing published restricts vendor geography |

---

## Explicitly NOT buildable — do not fake, do not promise

| Feature | Why |
| --- | --- |
| ROAS / revenue / AOV / LTV | No value field in any read endpoint |
| Keyword bidding, match types, search-term reports, n-gram analysis, negative-keyword harvesting at campaign level | **This API has no keywords.** Targeting is `context_hints[]` free text. Every keyword tool in a Google/Apple-style product has no analogue here. |
| Quality Score, Ad Rank, impression share, auction insights, competitor data | Not exposed |
| Device / geo / schedule **bid adjustments** | Only audience bid multipliers exist |
| Dayparting automation | Hourly *reporting* exists; hourly *bidding* does not |
| Automated `/archive` | Irreversible by documentation |
| Automated account pause/activate | Blast radius is the entire advertiser |
| Cross-platform (Google/Meta/Apple/Amazon/Bing) | Out of declared product scope; different APIs entirely |
