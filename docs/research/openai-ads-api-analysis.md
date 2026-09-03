# OpenAI Ads API — Capability Analysis

**Researched:** 2026-09-02
**Primary sources (official only):**

- https://developers.openai.com/ads/api-overview
- https://developers.openai.com/ads/llms-full.txt (full docs export — snapshot in `docs/reference/openai-ads-docs-snapshot.md`)
- https://developers.openai.com/ads/openapi.json (OpenAPI 3.1.0, `info.version` 2.3.0 — snapshot in `docs/reference/openai-ads-openapi.json`)
- https://developers.openai.com/ads/api-partner-setup
- https://developers.openai.com/ads/bulk-api

**Base URL:** `https://api.ads.openai.com/v1`

Legend used throughout:

- `[V]` **Verified** — stated in official docs or present in the official OpenAPI spec.
- `[P]` **Partial / gated** — exists, but requires per-account enablement by OpenAI.
- `[U]` **Unknown** — not documented; needs confirmation from OpenAI before we depend on it.

---

## 0.1 API capability map

### Authentication (two schemes, both in the official spec)

| Scheme | Definition | Status |
| --- | --- | --- |
| `ApiKeyAuth` | `type: http`, `scheme: bearer`. Header `Authorization: Bearer $OPENAI_ADS_API_KEY`. **Each key is scoped to exactly one ad account.** | `[V]` documented in prose + spec |
| `AdsOAuth` | `oauth2` / `authorizationCode`. Authorize `https://auth.openai.com/api/accounts/authorize`, token `https://auth.openai.com/api/accounts/oauth/token`. Scopes: `ads.admin.all.read`, `ads.admin.all.write`, `offline_access`, `openid`, `profile` | `[U]` **present in the OpenAPI spec, absent from every prose doc page.** No documented client registration. |

Global security is `[{ApiKeyAuth: []}, {AdsOAuth: ["ads.admin.all.read"]}]`; every write path overrides to require `ads.admin.all.write`.

Nearly every endpoint also accepts an **`OpenAI-Ad-Account` header parameter**. The Bulk API doc says explicitly: *"Each key works with one ad account, so don't add an `OpenAI-Ad-Account` header when using an API key."* This is the multi-account selector that pairs with an OAuth token. See §0.2.

**Request format:** `application/json` everywhere except `/upload`, which also accepts `multipart/form-data` with a binary `file`.

**Mutation convention:** updates are `POST` on the resource path — **not** `PATCH`/`PUT`. Partial objects are allowed, but nested objects (`budget`, `bidding_config`, `product_set`) must be sent **whole**.

### Rate limits `[V]`

| Scope | Limit |
| --- | --- |
| Per endpoint | 600 req/min |
| Overall | 1,200 req/min |
| Bulk job creation | 10 req / 10 s per ad account |

Limits are enforced **by ad account AND by IP address** — both must be satisfied. This is an architectural constraint: a single shared egress IP across all tenants is a shared-fate bottleneck at scale. See `docs/deployment/india-architecture.md`.

### Account limits `[V]` (from Bulk API doc)

| Limit | Value |
| --- | --- |
| Non-archived campaigns per ad account | 5,000 |
| Non-archived ad groups per ad account | 5,000 |
| Active or paused ads per ad account | 5,000 |

### Pagination `[V]`

Cursor-based and uniform: `limit`, `after`, `before`, `order`. List responses carry `object`, `data[]`, `first_id`, `last_id`, `has_more`. Insights caps `limit` at 2,000 (default 20).

### Endpoint inventory

Extracted from the official OpenAPI spec. 89 operations. `Auth` column: `K` = API key accepted, `O` = OAuth accepted, `O-only` = OAuth required.

#### Ad account

| Method | Path | Purpose | Auth | Notes |
| --- | --- | --- | --- | --- |
| GET | `/ad_account` | Current account metadata | K,O | Returns `id, name, url, preview_url, status, timezone, currency_code, negative_keywords[], review, account_integrity_review` `[V]` |
| GET | `/ad_accounts` | **List all accounts the caller can reach** | K,O | `[V]` in spec; the multi-account discovery call |
| POST | `/ad_account/brand` | Set `favicon_file_id` / brand metadata | K,O | `[P]` — returns 403 unless OpenAI enables brand updates for the account |
| POST | `/ad_account/negative_keywords` | Account-level negative keywords | K,O | `[V]` brand-safety lever |
| POST | `/ad_account/activate` \| `/pause` | Account-level on/off | K,O | `[V]` highest-blast-radius write in the API |
| GET | `/ad_account/spend_limit_windows` | List spend caps | K,O | Returns `window_id, start_date, end_date, amount_micros, spent_micros, status, can_edit, can_delete, io_id` `[V]` |
| POST | `/ad_account/spend_limit_windows` | Create a spend cap for a date window | K,O | `[V]` **the pacing lever** |
| POST | `/ad_account/spend_limit_windows/{id}` | Update a cap | K,O | `[V]` |
| POST | `/ad_account/spend_limit_windows/{id}/delete` | Delete a cap | K,O | `[V]` |
| GET | `/me` | Identity of the OAuth-connected user (`id`, `display_name`) | **O-only** | `[U]` undocumented in prose |
| POST | `/ad_account_creation_sessions` | Returns a hosted `url` + `expires_in` for account creation, given `return_uri` + `state` | **O-only** | `[U]` a hosted linking/creation handoff — undocumented |
| POST | `/api_keys` | **Mint an Ads API key** (`key_name`) → returns `api_organization_id`, `service_account_id`, `api_key` | K | `[U]` undocumented in prose; if usable it enables programmatic per-account key issuance |

#### Campaigns

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/campaigns` | List. Params: `include[]` (only value: `serving_issues`), `name`, `limit`, `after`, `before`, `order` | K,O |
| POST | `/campaigns` | Create | K,O(write) |
| GET | `/campaigns/{id}` | Retrieve | K,O |
| POST | `/campaigns/{id}` | Update | K,O(write) |
| POST | `/campaigns/{id}/activate` \| `/pause` \| `/archive` | State transitions (**archive is irreversible**) | K,O(write) |

Campaign object `[V]`: `id, created_at, updated_at, name, description, status, mode, product_feed_id, business_agent_id, start_time, end_time, budget{lifetime_spend_limit_micros, daily_spend_limit_micros}, bidding_type, objective, billing_event_type, conversion_event_setting_ids[], targeting{locations, excluded_locations, custom_audiences, excluded_custom_audiences, platforms}, landing_page_configuration, serving_issues[]`.

Enums `[V]`: `bidding_type` ∈ `impressions|clicks|conversions`; `objective` ∈ `reach|clicks|conversions`; `mode` ∈ `product_feed|business_agent`.

Create rules `[V]`: `name` 3–1000 chars; `status` required (`active|paused`); `budget.lifetime_spend_limit_micros` required, min `1000000` (1.0 currency unit); `start_time`/`end_time` are Unix seconds. **`bidding_type` cannot be changed after creation**, and for conversion campaigns neither can `conversion_event_setting_ids`.

`bidding_type: "conversions"` (oCPC) is `[P]` — requires per-account enablement; otherwise create returns `403 Conversion bidding is not enabled`.

#### Ad groups

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/ad_groups` | List (`campaign_id`, `include[]=serving_issues`, `name`, cursor params) | K,O |
| POST | `/ad_groups` | Create | K,O(write) |
| GET/POST | `/ad_groups/{id}` | Retrieve / update | K,O |
| POST | `/ad_groups/{id}/activate` \| `/pause` \| `/archive` | State transitions | K,O(write) |
| GET | `/ad_groups/{id}/insights` | Scoped insights | K,O |

Ad group object `[V]`: `id, created_at, updated_at, name, description, context_hints[], product_set, status, bidding_config{billing_event_type, strategy, max_bid_micros, custom_audience_bid_multipliers[]}, landing_page_configuration, serving_issues[]`.

**`max_bid_micros` is the primary bid lever.** `billing_event_type` is `impression` for impression campaigns, `click` for click **and** conversion campaigns; for oCPC, `max_bid_micros` is the **CPA bid** despite click billing. Bid multipliers are `100000`–`10000000` micros = 0.1×–10×.

**There are no keywords.** ChatGPT ad targeting is contextual: `context_hints[]` (free text, up to 2,000 per ad group) and `exclusion_hints[]` (bulk API only). This is the single biggest structural difference from every Google/Apple-style PPC tool.

#### Ads

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/ads` | List (`ad_group_id`, `include[]=serving_issues`, cursor params) | K,O |
| POST | `/ads` | Create | K,O(write) |
| GET/POST | `/ads/{id}` | Retrieve / update | K,O |
| POST | `/ads/{id}/preview` | Render a preview | K,O(write) |
| POST | `/ads/{id}/activate` \| `/pause` \| `/archive` | State transitions | K,O(write) |
| GET | `/ads/{id}/insights` | Scoped insights | K,O |

Ad object `[V]`: `id, name, created_at, updated_at, creative{type, title, body, price, file_id, image_url, image_crop, target_url}, status, review_status ∈ in_review|rejected|approved, landing_page_configuration, appeal, review{status, reason, screenshot_url}, serving_issues[]`.

Creative types `[V]`: `chat_card`, `product_ad_template`. Copy limits `[V]`: title 3–50 chars, body ≤100, URL ≤2,048.

**Ad review is a first-class product surface.** `review.reason` is an enum of crawl failures — `crawl_failed, crawler_bot_blocked, crawler_captcha, crawler_login_required, crawler_401/403/404/429/500/502/503/504, robots_txt, unsupported_content_type, landing_page_image_processing_failed, landing_page_unusable, missing_favicon`. Most rejections are landing-page/crawler problems the advertiser can actually fix — a diagnosis-and-fix workflow we can own.

#### Insights (delivery)

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/ad_account/insights` | Account and below |
| GET | `/campaigns/{id}/insights` | Campaign and below |
| GET | `/ad_groups/{id}/insights` | Ad group and below |
| GET | `/ads/{id}/insights` | Ad |

Params `[V]`: `time_granularity` ∈ `hourly|daily|monthly|none` (default `daily`); `aggregation_level` ∈ `ad_account|campaign|ad_group|ad`; `time_ranges[]` (JSON-encoded `unix_range` / `hour_range` / `date_range`, optional IANA `timezone`, **bounded to the past 5 years, no future**); `fields[]`; `filters[]` (`IN`, `GREATER_THAN`, `LESS_THAN`, AND-combined); `sort[]`; `segments[]` (at most one of `product|country|device`); `override_segment_group_order[]`; `includes[]` (`zero_impression_items` / `zero_impression_products`); `limit` 1–2000 (default 20); `after`/`before`.

> ### The single most important product constraint
>
> **Delivery metrics are exactly six: `impressions`, `clicks`, `spend`, `ctr`, `cpc`, `cpm`.** `[V]`
>
> There is **no conversion metric and no revenue/value metric on the delivery endpoints.**

#### Conversions (separate endpoint, separate shape)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/conversions/insights` | Attributed conversion counts | K,O |
| POST | `/conversions/pixels` | Create a pixel | `[P]` K,O — 404 until enabled |
| GET | `/conversions/pixels` | List pixels | K,O |
| POST | `/conversions/api_keys` | Create a server-side Conversions API key | `[P]` K only — 404 until enabled |
| POST | `/conversions/event_settings` | Create an event setting | K,O |
| GET | `/conversions/event_settings` | List event settings | K,O |
| GET | `/conversions/events` | Recent raw events for a pixel (`pid` required) | K |

`POST /conversions/insights` body `[V]`: `aggregation_level` (required), `time_ranges[]` (required), `time_granularity` ∈ `none|daily` **only**, `breakdown` ∈ `device|country` **only**, `entity_ids[]`, `group_by_entity`, `include_zero_rows`.

Response row `[V]` — the complete field set:

```
{ entity_id, date?, device?, country?, conversions, click_through_conversions, view_through_conversions }
```

> **`conversions` is always equal to `click_through_conversions`.** View-through is reporting-only and uses a fixed 1-day window; it is never added to the total, and never feeds CPA, CVR, bidding, billing, or optimization.
>
> **There is no `conversion_value` / `revenue` field anywhere in the read API.** Conversion events carry `amount` + `currency` on the way *in* (Pixel / Conversions API, integer minor units), but no read endpoint returns a summed value.

**Consequence: ROAS is not computable from the OpenAI Ads API.** What *is* computable:

| Metric | Computable? | How |
| --- | --- | --- |
| Spend, impressions, clicks, CTR, CPC, CPM | Yes `[V]` | Delivery insights, direct |
| Conversions | Yes `[V]` | `POST /conversions/insights` (click-through only) |
| CPA | Yes | `spend ÷ conversions`, joined across two endpoints on `entity_id` + date |
| CVR | Yes | `conversions ÷ clicks`, same join |
| Revenue, ROAS, AOV, LTV | **No** | Requires the advertiser's own revenue source (Shopify / GA4 / warehouse / CRM). Out of scope for MVP. |

Time granularity mismatch is a real engineering constraint: delivery supports `hourly`, conversions only `daily`. Any joined table is **daily-grained**.

#### Custom audiences

`GET|POST /custom_audiences`, `GET /custom_audiences/{id}`, `POST .../archive`, `POST .../add|remove|replace`, `POST /custom_audiences/merge`, `GET .../operations/{operation_id}` (async membership operations). Query param `intended_use` ∈ inclusion / exclusion / bid_multiplier gates eligibility; the server re-validates eligibility on ad-group and campaign save. Concurrent edits can return `409 custom_audience_mutation_conflict`. `[V]`

Audience files are uploaded via `/upload` with an audience purpose; hashed-identifier matching is automatic. Small/empty audiences may be **excluded** but not **included**.

#### Files / uploads

`POST /upload` (JSON `image_url` or multipart binary; `purpose` includes `account_favicon`; favicon ≥ 128×128) and `POST /uploads` (blob). Returns a `file_id` reused in ad creatives. `[V]`

#### Product feeds

`POST|GET /feeds`, `POST /feeds/{id}/archive`, `GET /feeds/uploads`, `POST /feeds/{id}/products/query`, `PATCH /feeds/{id}/products` (**Delta Feeds** — price/availability without a full catalog re-upload), and SFTP access management (`GET|POST /feeds/{id}/sftp_access`, `/activate`, `/pause`). `[V]` Relevant only to ecommerce/catalog advertisers; **not MVP**.

#### Lead forms / lead sync

`GET|POST /lead_forms`, `GET|POST /lead_forms/{id}`, `/publish`, `/archive`, `/test_submissions`; `POST|GET /lead_sync_subscriptions`, `GET|DELETE /lead_sync_subscriptions/{id}`. `[V]` in spec, `[U]` undocumented in prose.

#### Business agents

`GET /business_agent_tools`, `GET|POST /business_agents`, `GET|POST /business_agents/{id}`, `/preview`, `/publish`. Campaign `mode: business_agent`. `[U]` in spec only — an in-ChatGPT conversational-agent ad format. Worth watching; do not build on it yet.

#### Geo

`GET /geo_lookup/search?q=` → country / region / DMA location IDs for `targeting.locations.include`. Campaigns support up to 2,500 location IDs. `[V]`

#### Partner data

`POST /partner_data/uploads`, `GET /partner_data/uploads/{id}` — API-key auth only. `[U]` undocumented.

#### Bulk API — `[P]` and **not in the OpenAPI spec**

`POST /bulk_mutation_jobs`, `GET /bulk_mutation_jobs/{id}`, `GET /bulk_mutation_jobs/{id}/operations`.

Official doc states verbatim: *"The Bulk API is in limited preview and is enabled per ad account. It isn't included in the downloadable OpenAPI spec. If a bulk endpoint returns 404, contact your OpenAI account team."*

Up to 1,000 operations/job, 16 MiB body, 512 KiB per operation, `validate_only`, `partial_failure`, request-level `Idempotency-Key` header plus per-operation `idempotency_key`, forward references between operations in the same job. Operation types: `campaign.create|update`, `ad_group.create|update`, `ad.create|update`. Job statuses `pending|in_progress|completed|partially_failed|failed`; operation statuses `created|updated|validated|failed|skipped` with `retryable` + `retry_after_seconds`.

Note the bulk input vocabulary **differs from the REST vocabulary** (`max_budget_micros` + `budget_type` vs `budget.lifetime_spend_limit_micros`; `max_cpm_bid_micros` vs `bidding_config`). Two separate mappers are required.

#### Serving issues — an underrated free diagnostics feed `[V]`

`include[]=serving_issues` on campaign/ad-group/ad list calls returns typed codes. Full enums:

- **Account-level:** `ad_account_suspended`, `ad_account_brand_review_missing_favicon`, `..._escalated_review`, `..._rejected`, `..._in_progress`, `ad_account_payment_method_missing_or_unauthorized`, `ad_account_threshold_payment_failed`, `ad_account_persona_verification_not_approved`, `..._step_up_required`, `ad_account_budget_exhausted`
- **Campaign-level:** `campaign_not_active`, `campaign_not_started`, `campaign_ended`, `campaign_has_no_ad_groups`, `campaign_has_no_serving_ready_ad_groups`, `campaign_budget_exhausted`
- **Ad-group-level:** `ad_group_not_active`, `ad_group_has_no_ads`, `ad_group_has_no_serving_ready_ads`
- **Ad-level:** `ad_not_active`, `review_not_approved`, `landing_page_crawl_issue`, `ad_in_review`, `ad_over_18_only`, `policy_country_targeting_blocked`, `policy_country_targeting_limited`, `title_missing`, `advertiser_name_missing`, `image_or_favicon_missing`, `target_url_invalid`, `reserved_query_params_present`, `product_feed_id_missing`
- **Partial serving:** `partial_serving_review_not_approved`, `partial_serving_landing_page_crawl_issue`, `partial_serving_ad_in_review`

This is a fully specified, deterministic, zero-AI diagnostics engine handed to us by the platform. It should be the first thing our product shows.

### Errors

The spec does not enumerate error bodies per operation. Documented behaviours `[V]`: `403` on brand update when not enabled; `404 Not found` on `/conversions/pixels` and `/conversions/api_keys` when not enabled; `403 Conversion bidding is not enabled`; `409 custom_audience_mutation_conflict`; `404` on bulk endpoints when not enabled. Everything else is `[U]` and must be learned from live traffic — our client must therefore treat unknown error shapes defensively and never assume a field exists.

---

## 0.2 Advertiser connection model

### What the docs say (the safe, shippable path)

> *"Issue an API key in the Settings tab of Ads Manager. Each key is scoped to one ad account. Pass the key as a bearer token."*

So the connection model officially available today is **customer-generated, per-ad-account API keys**:

1. The advertiser signs into `ads.openai.com`.
2. Settings → API key issuance.
3. They paste the key into our app.
4. We encrypt it at rest and use it server-side only.

Properties:

| Question | Answer |
| --- | --- |
| Is there a documented OAuth "Connect with OpenAI" button? | **No.** `[V]` The spec defines `AdsOAuth`, but no prose doc, client-registration flow, or redirect-URI process is published. |
| Can one SaaS manage many customer accounts? | **Yes** — by storing one key per ad account. There is no documented cap on how many accounts a third party may hold keys for. |
| Is the key scoped to one account? | **Yes**, explicitly. `[V]` |
| Must the customer separately authorize our app? | **Not in the API-key model.** Handing us a key *is* the authorization. There is no OpenAI-side app-authorization record, no consent screen, and **no revocation signal to us** — the customer revokes by deleting the key in Ads Manager, and we discover it as a `401`. |
| Rotation? | Customer-driven, out of band. We must support re-entering a key without losing history, and detect `401` → mark the connection degraded. `[U]` whether `POST /api_keys` lets us mint programmatically. |
| Does OpenAI have to approve us? | **Not for the read/optimize loop.** Approval is per-*account*, per-*capability* (brand, conversions setup, oCPC, bulk), not per-vendor for the base API. |

**Security consequence — this is the design driver.** A raw bearer key with full write access to a live ad account, with no scoping, no expiry, and no revocation callback, is the most dangerous credential class we will hold. It mandates: envelope encryption at rest, server-side-only use, never returned to any client, redacted from every log, per-tenant isolation, and an audit log on every write.

### What the OpenAPI spec implies (the better path, unconfirmed)

The spec contains a complete multi-account OAuth apparatus that the prose docs never mention:

```
AdsOAuth (authorization_code)
  authorize: https://auth.openai.com/api/accounts/authorize
  token:     https://auth.openai.com/api/accounts/oauth/token
  scopes:    ads.admin.all.read | ads.admin.all.write | offline_access | openid | profile

GET  /me                            -> connected user identity        (OAuth only)
GET  /ad_accounts                   -> every account the user reaches
POST /ad_account_creation_sessions  -> hosted URL + return_uri/state  (OAuth only)
POST /api_keys                      -> mint a per-account API key
      + `OpenAI-Ad-Account` header on nearly every endpoint
```

Read together that is exactly a Google-Ads-style linking flow: user consents once → we enumerate their accounts → we scope each call with a header, or mint per-account keys. `offline_access` implies refresh tokens.

**We must not build on this yet.** No published client registration means no `client_id`, and inventing an OAuth flow against undocumented endpoints is precisely what the brief forbids. **Action:** ask OpenAI directly (see `partner-access-checklist.md`), and **design the credential layer behind an interface** so an OAuth provider can be dropped in without touching call sites. That interface is the single most important architectural decision in this project.

### Recommended design

```
CredentialProvider (interface)
  ├─ ApiKeyProvider      -> ships now; per-ad-account bearer key, encrypted at rest
  └─ OAuthProvider       -> stub; token + refresh + `OpenAI-Ad-Account` header, enabled when OpenAI confirms
```

Every service calls `client.request(...)`; only the provider knows how a call is authenticated. Adding OAuth later becomes one new class plus one connect route.

---

## 0.3 Partner requirements

From the official Partner Setup page `[V]`, a partner needs only:

- an Ads API key for the client ad account,
- access to the client's website and brand assets,
- **a server-side secret manager** for the Ads API key and any Conversions API keys.

There is **no published application form, no eligibility bar, no minimum spend, no geographic restriction on the partner, and no vendor-certification programme.** "To request partner access, contact us" links to `https://openai.com/advertisers/` — a sales contact path, not a developer portal.

What partner status actually buys is **per-client-account capability enablement**:

| Capability | Failure mode when not enabled | Needs OpenAI |
| --- | --- | --- |
| Programmatic brand updates (`/ad_account/brand`) | `403` | Yes `[P]` |
| Pixel management (`/conversions/pixels`) | `404 Not found` | Yes `[P]` |
| Conversions API key creation (`/conversions/api_keys`) | `404 Not found` | Yes `[P]` |
| Conversion-optimized bidding (`bidding_type: conversions`) | `403 Conversion bidding is not enabled` | Yes `[P]` |
| Bulk API | `404` | Yes `[P]` |
| Insights segments / zero-impression products | absent | Yes `[P]` |
| **Read, campaign/ad-group/ad CRUD, state changes, insights, audiences, geo, uploads** | — | **No** `[V]` |

**Assessment for an India-based startup:** nothing published excludes us. Eligibility questions attach to the *advertiser's* account, not to the tool vendor. India-registered businesses gained self-serve ChatGPT Ads access on **2026-08-31** (see `docs/business/market-analysis.md`), so Indian customers can be served from day one. The residual unknowns are the OAuth flow and any terms clause governing third-party management of advertiser accounts — both listed as UNKNOWN-ASK-OPENAI, neither of which blocks a BYO-API-key MVP.

---

## What this means for the product (summary)

**Build the product on these levers — all `[V]`, all available without approval:**

| Lever | Endpoint | Blast radius |
| --- | --- | --- |
| Campaign budget (lifetime, daily) | `POST /campaigns/{id}` | High |
| Ad-group max bid | `POST /ad_groups/{id}` | High |
| Pause / activate at any level | dedicated action endpoints | High |
| Account spend-limit windows | `/ad_account/spend_limit_windows` | Very high |
| Context hints (the "keyword" analogue) | `POST /ad_groups/{id}` | Medium |
| Creative rotation / new ads | `POST /ads` | Medium |
| Location targeting | campaign `targeting.locations` | Medium |
| Audience include/exclude, bid multipliers | audiences + ad group | Medium |
| Negative keywords (account) | `/ad_account/negative_keywords` | Medium |
| **Archive** | `/archive` on any entity | **Irreversible — never automate** |

**Do not promise:** ROAS, revenue, AOV, LTV, keyword-level reporting, search-term reports, n-gram analysis, impression share, quality score, device bid adjustments, dayparting/hour-of-day *bidding*. None exist in this API. (Hour-of-day *reporting* does exist via `time_granularity: hourly` on delivery metrics only.)
