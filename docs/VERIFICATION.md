# Running against the real API — the verification loop

Everything in this codebase is derived from the OpenAPI spec and the prose docs.
**Zero calls have been made to `api.ads.openai.com`.** The spec documents no
error bodies and has shipped five changes in three months, so a set of mappings
that typechecks is not the same as a set of mappings that works.

This is the loop to run before billing anyone. Budget: **₹20,000–45,000** and
about a day of attention spread over a week.

---

## 0. Prerequisites

| | |
| --- | --- |
| An OpenAI ad account | `ads.openai.com`. India-registered businesses have had self-serve access since 2026-08-31 |
| A funded payment method | Ads must actually *serve*, which means actually spending |
| A crawlable landing page | Your own site is fine. It must be publicly reachable — see step 3 |
| A local Postgres + Redis | `DATABASE_URL`, `REDIS_URL` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |

```bash
cp .env.example .env.local     # fill in the four values above
npx prisma migrate dev
npm run dev
```

---

## 1. Connect — does the credential path work?

1. In Ads Manager → **Settings** → issue an API key.
2. In the app: sign up → verify email → `/onboarding/connect` → paste the key.

**What to verify**

- [ ] `GET /ad_account` returns and the app shows the right account name,
      currency and timezone. If currency is wrong, every money figure downstream
      is wrong.
- [ ] The key is stored encrypted: `select "apiKey" from "OpenAiAdsConnection"` —
      it must start with `enc:v1:`. **If it doesn't, stop.** `ENCRYPTION_KEY`
      isn't set and you are writing a live ad credential in plaintext.
- [ ] The key appears in **no** server log line. Grep your dev output for the
      last four characters.
- [ ] `review.status` is surfaced. If the account hasn't passed brand review,
      nothing will ever serve, and the app should say so before anything else.

**Then deliberately break it:** delete the key in Ads Manager and hit
*Re-check* in Settings. The connection must flip to `INVALID` with a message
telling you to re-enter it — that 401 is the *only* revocation signal OpenAI
gives us.

---

## 2. Sync — are the response shapes right?

Trigger a sync (Settings → Re-check, or `syncConnection` directly).

**What to verify — these are the mappings most likely to be wrong**

- [ ] `spendMicros` matches Ads Manager. The delivery endpoint returns `spend`
      in currency units and we multiply by 1e6. If your spend is off by exactly
      1,000,000× or 1/1,000,000×, that assumption is wrong.
- [ ] Ad groups and ads got attached to the right parents. `extractParentId()`
      guesses at `campaign_id` / `ad_group_id` field names because the item
      bodies don't document them. **If `CachedAdGroup` is empty while campaigns
      synced, this is why** — read one raw response and fix the field name.
- [ ] `serving_issues` came back populated on at least one entity. If every
      array is empty on an account that clearly isn't delivering, the
      `include[]=serving_issues` parameter isn't being accepted.
- [ ] Conversions joined. Check a `MetricFact` row with both `spendMicros` and
      `conversions` non-zero. If conversions are always 0, either the account has
      no conversion setup (fine) or `POST /conversions/insights` is rejecting our
      body (not fine).
- [ ] **No duplicate rows.** Run the sync twice, then:
      ```sql
      select "entityId", date, count(*) from "MetricFact"
      group by 1,2 having count(*) > 1;
      ```
      Must return nothing. If it doesn't, the unique index isn't doing its job.

---

## 3. Serving Doctor and Review Doctor — the hero features

These are the two things that make this product useful on day one, and the two
most likely to be quietly wrong, because their whole value is that the *codes*
are real.

- [ ] Create a campaign with **no ad group**. Serving Doctor should report
      `campaign_has_no_ad_groups` with a fix, grouped by cause.
- [ ] Point an ad at a URL blocked by `robots.txt` (or turn on Cloudflare's
      "Block AI Scrapers"). The ad should be rejected, and Review Doctor should
      decode the reason as a crawler/robots failure with the right fix steps.
- [ ] Fix the block. Review should re-run **automatically** — confirm the ad
      recovers without recreating it, which is what the UI promises.
- [ ] Let a campaign exhaust its lifetime budget. `campaign_budget_exhausted`
      must appear, and Budget Pacing must show it as *stopped*, not merely
      "100% used".

Any code that comes back and isn't in `lib/openai/servingIssues.ts` falls
through to a generic entry. Check your dev logs and add it.

---

## 4. Recommend — is the engine reasoning about real numbers?

- [ ] CPA on the dashboard matches `spend ÷ conversions` in Ads Manager.
- [ ] A campaign with no conversions shows **—** for CPA, never `0.00`.
- [ ] Revenue and ROAS are **absent** until you set a value per conversion, then
      appear labelled *modelled*.
- [ ] Recommendations only appear once the volume gates are cleared. On a small
      test account you should see mostly serving/review findings and *no* CPA
      comparisons — that's correct behaviour, not a bug.

---

## 5. Apply — the only step that spends money

Pick **one** low-stakes campaign. Apply **one** budget change.

- [ ] The risk engine shows band, % change, and money at stake before you apply.
- [ ] The change lands in Ads Manager with the exact value shown.
- [ ] `AuditLog` has a row with correct `before` and `after`.
- [ ] Activity renders it as a readable diff.
- [ ] Roll it back. The original value returns exactly.

Then verify what must **not** happen:

- [ ] No UI path archives anything without `confirm: "ARCHIVE"`.
- [ ] No automation can pause the ad account. Try to build an Autopilot rule that
      does — the action shouldn't exist.

---

## 6. Verify — did it do what it said?

A week later, on the campaign you changed:

- [ ] Did spend actually move in the predicted direction?
- [ ] Was the "estimated impact" within an order of magnitude of reality?

If the estimate was wildly wrong, the engine's arithmetic is fine but its
*premise* isn't. Loosen the claim in the UI before a customer relies on it.

---

## The gate

**Do not take payment until steps 1, 2, 3 and 5 pass.** Steps 4 and 6 can be
imperfect on a small test account — the volume simply isn't there — but a
credential path that leaks, a sync that duplicates, a diagnostic that decodes
nothing, or an apply that doesn't roll back are all reasons to stop.

Record every mapping you corrected here, and update the `[U]` markers in
`docs/research/openai-ads-api-analysis.md` as you go.
