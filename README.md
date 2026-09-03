# OrchardAds

An AI optimization layer for **OpenAI Ads** — the ad platform inside ChatGPT.

Connect an ad account, find out what isn't delivering and why, see where money is
going with nothing to show for it, and apply safe, reversible changes with a human
in the loop.

---

## What this is, honestly

Most tools in this category are a reporting connector with a chart on top. This
one is built around two things the OpenAI Ads API publishes that nobody is using
well yet:

- **`serving_issues`** — a typed enum of ~30 codes telling you exactly why a
  campaign, ad group or ad cannot deliver. Deterministic, no statistics, no AI,
  and useful the moment a key is pasted.
- **`review.reason`** — an enum of ad-rejection causes, dominated by *fixable*
  landing-page and crawler failures (blocked bots, `robots.txt`, 403s, login
  walls) rather than subjective policy calls.

Those became **Serving Doctor** and **Review Doctor**, and they're the reason
this product is worth opening on day one, before any performance history exists.

### What it deliberately does not do

The OpenAI Ads API is not a Google Ads clone, and this codebase refuses to
pretend otherwise:

| Not built | Why |
| --- | --- |
| Keyword tools, n-grams, search terms, match types, negatives | **This API has no keywords.** Ad-group targeting is free-text `context_hints[]` |
| ROAS / revenue as platform data | No read endpoint returns conversion *value*. Revenue and ROAS are **modelled** from a value-per-conversion you configure, and are labelled as such — never estimated |
| Quality Score, impression share, auction insights | Not exposed |
| Dayparting, device/geo bid adjustments | Hourly *reporting* exists; hourly *bidding* doesn't |
| Automated archiving | Documented as irreversible. Human-only, forever |
| Automated account pause | Blast radius is the advertiser's entire business |
| Full autopilot at launch | No outcome track record yet. Recommend + Assisted only |

Full analysis in [`docs/research/openai-ads-api-analysis.md`](docs/research/openai-ads-api-analysis.md)
and [`docs/research/BLOCKERS.md`](docs/research/BLOCKERS.md).

---

## Architecture

```
Browser
  ↓  (never sees a customer credential)
Next.js API route  ──  entitlements + rate limit + risk engine
  ↓
CredentialProvider  ──  AES-256-GCM decrypt, in memory, per request
  ↓
lib/openai/client.ts  ──  THE ONLY PLACE THAT CALLS api.ads.openai.com
  ↓
OpenAI Ads API
```

Everything the UI reads comes from Postgres, populated by a background sync.
Nothing renders from a live upstream call, because OpenAI enforces rate limits
**per ad account and per IP** — limits the customer's other tools share.

### The rules the code enforces

1. **One choke point.** Nothing calls `api.ads.openai.com` except
   `lib/openai/client.ts`. That's what makes credential handling, rate limiting,
   capability detection and audit logging enforceable rather than aspirational.
2. **The engine is deterministic; the LLM only narrates.** Every recommendation
   is arithmetic over stored facts (`lib/recommendations/engine.ts`). The model
   explains findings and answers questions through **typed, read-only tools**
   (`lib/ai/tools.ts`) — it can't construct an HTTP request, and no write path is
   reachable from it.
3. **Nothing writes without the risk engine.** `lib/risk/engine.ts` scores every
   proposed change on *blast radius if the reasoning is wrong*, not on how
   confident the analysis feels.
4. **Every write is audited** with before/after state, so a rollback is a replay
   rather than a guess.
5. **Null is not zero.** A campaign with no conversions has no CPA. Derived
   metrics stay `null` and render as `—`, because `0.00` reads as "conversions
   were free".
6. **Money is micros, end to end.** The API speaks millionths of a currency
   unit; converting early loses cents on real budgets.

---

## Stack

Next.js 16 · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
Prisma + Postgres · TanStack Query · Zustand · Recharts · Zod · Anthropic SDK

---

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npx prisma migrate dev
npm run dev
```

Generate the encryption key with `openssl rand -hex 32`. The app **refuses to
start in production without it** — a missing key would otherwise mean writing a
customer's live ad credential to the database in plaintext.

### Connecting an ad account

There is no OAuth. The advertiser issues their own API key in
[Ads Manager](https://ads.openai.com) → Settings, and pastes it during
onboarding; each key is scoped by OpenAI to exactly one ad account.

The OpenAPI spec *does* define an `AdsOAuth` flow with `/me`, `/ad_accounts` and
an `OpenAI-Ad-Account` header — a complete multi-account linking apparatus —
but it appears in no prose documentation and there is no published client
registration. So `lib/openai/credentials.ts` ships `ApiKeyProvider` and stubs
`OAuthProvider` behind the same interface: adding OAuth later is one class and
one callback route, not a rewrite of every call site.

---

## Status

**Not production-ready, for one specific reason:** every response shape in this
codebase is derived from the official OpenAPI spec and documentation. **Zero
calls have been made against `api.ads.openai.com`.** The spec documents no error
bodies and has shipped five changes in three months.

Before a first customer: fund a real ad account, run the full loop
(connect → sync → recommend → apply → verify), and correct every mapping marked
`[U]` in the research docs. See `BLOCKERS.md` RED-3.

---

## Docs

| | |
| --- | --- |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | **Run it against the real API** — the checklist to pass before billing anyone |
| [`docs/DECISION.md`](docs/DECISION.md) | Should this be built? Scored, with the case against |
| [`docs/research/openai-ads-api-analysis.md`](docs/research/openai-ads-api-analysis.md) | Full capability map, every endpoint, verified vs unknown |
| [`docs/research/BLOCKERS.md`](docs/research/BLOCKERS.md) | RED / YELLOW / GREEN, with workarounds |
| [`docs/research/partner-access-checklist.md`](docs/research/partner-access-checklist.md) | What needs OpenAI's answer, and what doesn't |
| [`docs/business/market-analysis.md`](docs/business/market-analysis.md) | Competitors, timing, honest sizing |
| [`docs/business/pricing-strategy.md`](docs/business/pricing-strategy.md) | Plans and unit economics |
| [`docs/business/india-company-setup.md`](docs/business/india-company-setup.md) | Operating from India — research notes, not advice |
| [`docs/deployment/india-architecture.md`](docs/deployment/india-architecture.md) | Deployment from MVP to 10,000 customers |
| [`docs/reference/handyads-port-map.md`](docs/reference/handyads-port-map.md) | What was ported, reshaped, and deleted |
