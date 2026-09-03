# Partner Access Checklist — OpenAI Ads

**Date:** 2026-09-02. Categories per brief: BLOCKER / REQUIRED / RECOMMENDED / UNKNOWN — ASK OPENAI.

Evidence is cited to the official docs or the official OpenAPI spec. Anything not cited is marked UNKNOWN, not guessed.

---

## BLOCKER

**None for the MVP.**

That is the headline finding. Every capability the MVP needs — read campaigns/ad groups/ads, read delivery insights, read conversion counts, read serving issues, update budgets and bids, pause/activate — works with a customer-issued API key and no OpenAI approval of us as a vendor.

The following are blockers **only for features we are deliberately deferring**:

| Would-be blocker | Blocks | Our response |
| --- | --- | --- |
| Bulk API is limited preview, per-account enablement, `404` otherwise | Bulk edit tooling | Ship single-call writes with a client-side batcher behind a `BulkExecutor` interface. Swap in `/bulk_mutation_jobs` per account when enabled. |
| Conversion pixel / Conversions API key creation gated (`404`) | Us *creating* tracking for a client | Read-only conversion setup: list existing pixels and event settings, diagnose gaps, tell the customer what to create in Ads Manager. |
| oCPC gated (`403 Conversion bidding is not enabled`) | Us *creating* conversion campaigns | Detect and surface the 403 as an explicit "ask your OpenAI rep to enable conversion bidding" card. |
| Programmatic brand updates gated (`403`) | Auto-fixing `missing_favicon` | Diagnose it, hand the customer the exact fix. |
| No published OAuth client registration | One-click "Connect with OpenAI" | BYO API key now; `CredentialProvider` interface ready for OAuth. |

---

## REQUIRED

Things we must do, without which we cannot lawfully or safely operate.

1. **Server-side secret management for customer Ads API keys.** Stated verbatim as a partner requirement in the official Partner Setup doc. Envelope encryption (AES-256-GCM) at rest, key material from the environment/KMS, never in the database in plaintext, never in a client bundle, never in a log line, never in an error message returned to a browser.
2. **A customer-issued API key per ad account.** Each key is scoped to exactly one ad account, so multi-account customers hand us N keys until OAuth is confirmed.
3. **Respect published rate limits:** 600 req/min per endpoint, 1,200 req/min overall, enforced per ad account **and per IP**. Bulk job creation 10 per 10 s per account. A shared egress IP is a shared-fate risk — budget for a rate-limit governor keyed on both dimensions.
4. **Honour the 5-year / no-future bound on insights time ranges**, and the 5,000-entity-per-account ceilings.
5. **Never automate `/archive`.** Documented as irreversible at campaign, ad-group, and ad level. Approval-gated, human-only, forever.
6. **Treat `/ad_account/pause` and `/ad_account/activate` as break-glass.** Pausing the account stops everything the advertiser is running. It must never be reachable by a rule, a schedule, or an AI agent.
7. **An audit log row for every write**, containing actor, tenant, entity, before-state, after-state, request id, and outcome.
8. **Publish Terms of Service, Privacy Policy, and a DPA** before the first paying customer. We are a processor of a customer's advertising data and we hold a credential that can spend their money.
9. **Read and comply with OpenAI's advertising policies and API terms** before any public launch, specifically on third-party management of advertiser accounts and on storing advertiser credentials.

---

## RECOMMENDED

1. **Build the credential layer as an interface from commit one** (`ApiKeyProvider` today, `OAuthProvider` stubbed). The OpenAPI spec already contains `/me`, `/ad_accounts`, `/ad_account_creation_sessions`, `POST /api_keys`, and the `OpenAI-Ad-Account` header — the multi-account model is clearly coming. Retrofitting it later touches every call site.
2. **Make serving issues the hero feature.** `include[]=serving_issues` returns a fully enumerated, deterministic set of ~30 typed codes explaining exactly why an entity is not delivering. It requires no AI, no statistics, and no data history — it produces value on connection day one, which is the hardest moment in any analytics SaaS.
3. **Own ad-review recovery.** `review.reason` is an enum dominated by fixable landing-page and crawler failures (`crawler_bot_blocked`, `robots_txt`, `crawler_403`, `crawler_login_required`, `landing_page_unusable`, `missing_favicon`). A "why was my ad rejected and how do I fix it" workflow is a genuine wedge — and, notably, is exactly where a new platform's advertisers get stuck.
4. **Register as an advertiser ourselves and run real spend.** Cheapest way to see live response shapes, learn undocumented error bodies, and qualify for capability enablement conversations. Also our own acquisition channel.
5. **Open a conversation with OpenAI's advertiser/partner contact** (`https://openai.com/advertisers/`) early, even before we need enablement. Every gated capability is a per-account switch someone has to flip.
6. **Cache aggressively and sync in the background.** Rate limits are per-account, so a naive dashboard-time fetch pattern will collide with the customer's other tools.
7. **Version the response parsing.** The changelog shows five shipping changes between 2026-06-03 and 2026-08-25. This API is moving weekly. Parse defensively, never assume an optional field exists, and snapshot the OpenAPI spec on every sync so we can diff it.

---

## UNKNOWN — ASK OPENAI

Send these as one message to the advertiser/partner contact. Each has a concrete product decision hanging on it.

| # | Question | What it decides |
| --- | --- | --- |
| 1 | The OpenAPI spec defines an `AdsOAuth` authorization-code flow at `auth.openai.com` with `ads.admin.all.read/write` and `offline_access`. **Is there a client-registration process for third-party platforms, and is that flow supported for production use?** | Whether we can ship one-click account linking instead of copy-paste API keys. Biggest single UX and trust lever we have. |
| 2 | Nearly every endpoint accepts an `OpenAI-Ad-Account` header. **Is one OAuth token intended to manage multiple ad accounts via that header?** | Whether multi-account agencies are a viable segment before OAuth GA. |
| 3 | `POST /api_keys` returns `api_organization_id`, `service_account_id`, `api_key`. **Can a partner mint keys programmatically for a client account, and what auth does that call require?** | Whether onboarding can be automated or stays manual copy-paste. |
| 4 | `POST /ad_account_creation_sessions` returns a hosted URL with `return_uri` + `state`. **Is this a supported hosted linking/creation handoff for partners?** | Whether we can offer a hosted "create/link your ad account" step. |
| 5 | **Does anything in the Ads API terms or advertising policies restrict a third-party SaaS from storing an advertiser's Ads API key and making writes on their behalf?** | Legality of the whole business. Ask explicitly and in writing. |
| 6 | **Is there any planned way to read conversion *value*/revenue?** Events accept `amount` + `currency`, but `POST /conversions/insights` returns only counts. | Whether ROAS can ever be a native feature, or is permanently a bring-your-own-revenue integration. |
| 7 | **What are the criteria and timeline for enabling: Bulk API, pixel/Conversions-API-key creation, conversion bidding, brand updates, insights segments?** Are they per-account or per-partner? | Our roadmap sequencing and what we can promise on a pricing page. |
| 8 | **Are there documented error codes / response bodies?** The spec omits them. | How defensively our client must be written; how good our error messages can be. |
| 9 | **Are `business_agents` and `lead_forms` (in the spec, absent from prose docs) generally available, in beta, or internal?** | Two potentially large future surfaces. |
| 10 | **Any restriction on an India-registered vendor serving US/EU advertisers, or on where advertiser data may be stored?** | Deployment region and data-residency design. |
| 11 | **Are there sandbox or test ad accounts** for third-party development? | Whether we can build and demo without live spend. This one materially changes our burn. |
| 12 | **Is the per-IP rate limit shared across ad accounts calling from the same egress IP?** | Whether we need dedicated egress IPs per tenant tier. |

---

## Verification log

| Claim | Source | Verified |
| --- | --- | --- |
| Base URL `https://api.ads.openai.com/v1` | openapi.json `servers[0]`; Authentication doc | 2026-09-02 |
| Bearer API key, one key per ad account | api-overview; authentication doc | 2026-09-02 |
| `AdsOAuth` scopes and URLs | openapi.json `components.securitySchemes` | 2026-09-02 |
| Rate limits 600 / 1,200 / bulk 10-per-10s | api-overview "Rate limits" | 2026-09-02 |
| Delivery metrics = impressions, clicks, spend, ctr, cpc, cpm | insights doc "Terminology" | 2026-09-02 |
| Conversion rows have no value field | openapi.json `ConversionSummaryRowBody` | 2026-09-02 |
| Bulk API limited preview, not in spec | bulk-api doc callout | 2026-09-02 |
| Gated capabilities and their status codes | api-partner-setup "Before you begin" | 2026-09-02 |
| Archive is irreversible | campaigns / ad-groups / ads docs | 2026-09-02 |
| Serving issue enums | openapi.json `*ServingIssueCode` | 2026-09-02 |
