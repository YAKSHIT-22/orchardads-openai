# handyAds → OrchardAds (OpenAI Ads) — port map

**Source:** `~/Desktop/handyads` — a working Next.js 16 Apple Search Ads management SaaS (already named `OrchardAds` in `package.json`).
**Target:** `~/Desktop/orchardads` — same product, same design, same security architecture, **OpenAI Ads only**.

Rule: **keep everything that is platform-agnostic verbatim. Replace only the platform layer. Delete only what has no OpenAI Ads analogue — and delete it honestly rather than leaving a dead page.**

---

## 1. Ported verbatim (no change beyond naming)

| Area | Files | Notes |
| --- | --- | --- |
| Design system | `app/globals.css` | Violet primary `oklch(0.49 0.24 292)`, Space Grotesk headings, `--radius: 0.75rem`, full shadcn token set, light + dark. **Copy exactly** |
| UI primitives | `components/ui/*` (21 files) | button, card, table, chart, dialog, select, sheet, tooltip, badge, skeleton, table-pagination, info-hint, search-input… |
| Auth + session | `middleware.ts`, `app/api/onboarding/*` | JWT in an httpOnly cookie via `jose`; route-prefix protection so **new pages are protected by default**; role + verification + has-credentials gates |
| **Credential encryption** | `lib/crypto.ts` | AES-256-GCM envelope encryption, `enc:v1:` prefix, production refuses to start without `ENCRYPTION_KEY`. **Port unchanged — this is the single most important security file** |
| 2FA | `lib/totp.ts`, `app/api/2fa/*`, `components/user/TwoFactorCard.tsx` | TOTP, encrypted secret, hashed backup codes |
| Rate limiting | `lib/rateLimit.ts` | |
| Redis / Prisma clients | `lib/redis.ts`, `lib/prisma.ts` | |
| Mail | `lib/mailer.ts`, `lib/emailTemplates.ts` | |
| Marketing shell | `components/marketing/*`, `app/{about,pricing,privacy,terms,contact}` | Rewrite copy only |
| State | `stores/*` (zustand), `providers/UserProvider.tsx`, `components/global/QueryProvider.tsx` | |
| Report engine | `lib/reports/{html,render,validate,runScheduledReport,widgets}.ts`, `components/reports/*` | Metric list changes; engine does not |
| Alert engine | `lib/alerts/{defaults,evaluate,metrics,run}.ts`, `components/alerts/*` | Metric enum changes; engine does not |
| Autopilot skeleton | `lib/autopilot/{evaluate,apply,scopes,templates,types,validate,run}.ts` | **Port the structure, keep it in Recommend/Assisted mode only.** See DECISION: no launch autopilot |
| Audit engine | `components/audit/{engine,csv}.ts`, `lib/audit/widgets.ts` | Widget definitions change |
| Shared dashboards | `SharedDashboard` model, `app/(public)/shared/[token]`, `app/api/public/dashboard/[token]` | Client-reporting feature; agency-tier value. Port as-is |
| Formatting / helpers | `lib/{format,dateRanges,utils}.ts`, `utils/{currencyMap,countryMap,flagEmoji,typeGaurds}.ts` | |

## 2. Rewritten — the platform layer

| handyAds | OrchardAds | Change |
| --- | --- | --- |
| `lib/apple/client.ts` | `lib/openai/client.ts` | `APPLE_BASE` → `https://api.ads.openai.com/v1`. Drop the `X-AP-Context: orgId=` header; add optional `OpenAI-Ad-Account` (OAuth path only). **Keep** the retry ladder verbatim: one forced refresh on 401, exponential backoff on 429/5xx honouring `Retry-After`, `MAX_RETRIES = 3`. **Keep** `withRoute()` and the rule that an upstream 401 surfaces as 403 so the client interceptor does not nuke the user's session |
| `lib/apple/token.ts` | `lib/openai/credentials.ts` | Apple's ES256 client-secret JWT minting disappears entirely — OpenAI uses a static bearer key. Replace with `CredentialProvider` (`ApiKeyProvider` now, `OAuthProvider` stubbed). **Keep** `resolveConnection()` — the "route this request to the connection that owns this account" logic maps directly from `orgIds[]` to `adAccountIds[]` |
| `lib/apple/errors.ts` | `lib/openai/errors.ts` | Same `AppError` / `ApiError` / `normalizeError` shape. OpenAI publishes no error bodies, so parse defensively and map the four documented cases: `403` brand-not-enabled, `404` conversions-not-enabled, `403 Conversion bidding is not enabled`, `409 custom_audience_mutation_conflict` |
| `lib/apple/report.ts` | `lib/openai/insights.ts` | Apple's POST report bodies → OpenAI's GET insights with JSON-encoded `time_ranges[]`, `filters[]`, `sort[]` repeated query params. Plus the **second call** to `POST /conversions/insights` and the daily-grain join |
| `lib/appleReportTransformer.ts` | `lib/openai/transform.ts` | New metric set: `impressions, clicks, spend, ctr, cpc, cpm` + `conversions` from the conversions endpoint. Micros → currency minor units |
| `lib/appleTime.ts` | `lib/openai/time.ts` | Unix-seconds ranges, `hour_range`/`date_range` with IANA timezone, 5-year lower bound, no future |
| `lib/appleErrorToast.ts` | `lib/openai/errorToast.ts` | Message strings |
| `lib/generateJwt.ts` | **deleted** | Apple-specific |
| `lib/apple/impressionShare.ts` | **deleted** | No impression share in this API |
| `model AppleConnection` | `model OpenAiAdsConnection` | Fields become: `label`, `apiKey` (encrypted), `adAccountId`, `adAccountName`, `currencyCode`, `timezone`, `status`, `lastValidatedAt`, `lastSyncAt`, `lastError`. Drop `privateKey/publicKey/teamId/keyId/clientSecret*`. Keep the multi-connection design |

## 3. Navigation port (`utils/constant.tsx`)

| handyAds item | OrchardAds | Rationale |
| --- | --- | --- |
| Dashboard | **Dashboard** | Keep |
| Live Share | **Live Share** | Keep — agency value |
| Apps → Search Apps / Localized App Details | **deleted** | App Store concepts; no analogue |
| Campaigns | **Campaigns** | Keep. Read + edit budget/status. **No creation wizard in MVP** |
| — | **Ad Groups** *(new)* | The bid lever lives here (`max_bid_micros`) |
| — | **Ads** *(new)* | Creative + review status |
| Reports | **Reports** | Keep |
| Inspector (audits) | **Inspector** | Keep; new widget set |
| Optimize → N-Gram Analyzer | **deleted** | **No keywords, no search terms in this API** |
| Optimize → Waste Blocker (negative finder) | **Waste Finder** — *reshaped* | From "find negative keywords" to "find spend with zero conversions, exhausted budgets, orphaned entities" |
| Optimize → Keyword Harvest | **Context Hints** — *reshaped* | `context_hints[]` is the only targeting text that exists. AI-assisted hint suggestions, human-approved |
| Optimize → Bid Optimizer | **Bid Optimizer** | Keep — retarget to `bidding_config.max_bid_micros` |
| Optimize → Budget Pacing | **Budget Pacing** | Keep — stronger here: exact via `lifetime_spend_limit_micros` + `spend_limit_windows.spent_micros` |
| Optimize → Weekday Performance | **Time Performance** | Keep — delivery insights support `hourly`; **reporting only, no dayparting bids** |
| Orchard Watch (alerts) | **Orchard Watch** | Keep |
| Autopilot | **Autopilot** | Keep the page; **Recommend + Assisted modes only at launch** |
| Serving Health | **Serving Doctor** — *promoted to hero* | Now backed by ~30 typed serving-issue codes from the platform. Was a minor page; becomes the headline feature |
| — | **Review Doctor** *(new)* | `review_status` + `review.reason` enum. Ad rejection triage. No handyAds equivalent |
| Budget Orders | **Spend Limits** — *renamed* | Apple's budget orders → `/ad_account/spend_limit_windows` |
| Geolocation | **Locations** | Keep — `GET /geo_lookup/search` |
| — | **Ask** *(new)* | AI analyst over read-only typed tools |
| — | **Activity** *(new)* | Audit log + rollback |

## 4. Deleted with no replacement

Keywords, negative keywords, search terms, n-grams, match types, app search / localized app details, creative sets, impression share, Apple ACL/org switching, budget orders as Apple models them.

Each deletion traces to a documented API fact in `docs/research/openai-ads-api-analysis.md`. **No stub pages, no "coming soon" for things that can never come.**

## 5. New, no handyAds source

| Module | Why |
| --- | --- |
| `lib/openai/servingIssues.ts` | Decode ~30 codes → cause, fix, estimated daily cost |
| `lib/openai/reviewReasons.ts` | Decode the `ReviewReasonCode` enum → plain-language fix |
| `lib/risk/*` | Risk engine — proposed action, % change, blast radius, guardrails, approval requirement |
| `lib/actions/execute.ts` | Idempotent execution with before-state capture and rollback |
| `lib/ai/tools.ts` | Typed read-only tool registry + number-grounding guard. **No free-form LLM HTTP** |
| `lib/sync/*` | Queue-driven incremental sync, cursor pagination, rate-limit governor keyed on account **and** IP |
| `lib/revenue/*` | `RevenueSource` interface — empty until a customer connects Shopify/GA4/CSV. **The only honest path to ROAS** |

## 6. Non-negotiable security invariants carried across

1. Customer API keys are AES-256-GCM encrypted at rest and **never** reach a browser, a log line, or an error response.
2. Every ad-account write emits an `AuditLog` row with actor, tenant, before-state, after-state, and outcome.
3. Every write passes the risk engine and, unless explicitly pre-approved within guardrails, a human.
4. `/archive` and `/ad_account/pause|activate` are never reachable from a rule, a schedule, or the AI agent.
5. Tenant isolation is enforced at the data layer, not only in application code.
6. The LLM calls typed tools only; it never constructs an HTTP request and never invents a number.
