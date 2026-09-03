# Deployment Architecture — building from India

**Date:** 2026-09-02. Costs are list prices, FX ₹88 = $1.

---

## 1. The constraint that drives every decision

We are an India-based company whose **users** are mostly not in India, and whose **upstream API** (`api.ads.openai.com`) is almost certainly served from US infrastructure.

That splits latency into two problems with opposite answers:

| Path | Latency matters because | Right answer |
| --- | --- | --- |
| Browser → our app | Perceived page speed | Edge/CDN close to the *user*, wherever they are |
| Our worker → OpenAI Ads API | Sync throughput, and we make thousands of sequential rate-limited calls | Compute close to **us-east**, not close to Mumbai |

**Therefore: do not host the sync workers in AWS Mumbai.** A Mumbai worker adds roughly 200–250 ms round-trip per API call. At ~1,450 calls per account per month across hundreds of accounts, that is pure wasted wall-clock and pointlessly longer serverless invocations. **Put compute in `us-east`, put the CDN everywhere, and put the founder in India.** Company residency and server residency are unrelated.

The exception is data residency: if an Indian enterprise customer contractually requires India-resident storage, that is a per-customer deployment decision, not a default. **No published OpenAI rule requires it** (checklist question #10).

Second constraint from the API itself: **rate limits are enforced per ad account AND per IP.** Serverless gives us a shared, rotating egress IP pool. A central Redis token-bucket governor keyed on both `adAccountId` and observed egress IP is not optional — it is the thing that stops one noisy tenant from 429-ing everyone.

---

## 2. Workload classification

| Workload | Shape | Where |
| --- | --- | --- |
| Marketing site, app shell, dashboards | Bursty, latency-sensitive, short | **Serverless (Vercel)** |
| API routes / server actions | Short, request-scoped | **Serverless** |
| **Account sync** (paginate campaigns → ad groups → ads → insights → conversions) | Long, sequential, rate-limited, retry-heavy | **Queue-driven worker.** Must survive >60 s. Chunk per entity type and per page so each unit fits a serverless invocation, or run a small persistent worker |
| Recommendation engine | CPU-bound, pure, minutes after sync | Queued job |
| AI explanation / agent | Latency-tolerant, token-metered | Queued job (batch) + streaming (interactive) |
| Scheduled reports, alert evaluation | Cron | Scheduled trigger → queue |
| Action execution (apply an approved change) | Short, high-consequence, must be idempotent and audited | Serverless, single-flight per entity |

**Verdict on "force serverless?"** No. Serverless is right for everything except sync. Sync is chunked into serverless-sized units at MVP scale, and promoted to a persistent worker (Fly.io / Railway / Render, ~$5–15/mo) when either per-account sync exceeds the invocation limit or we want a stable egress IP.

---

## 3. Component choices

| Layer | Choice | Why | Rejected |
| --- | --- | --- | --- |
| Web + API | **Vercel** (`iad1`/us-east) | Next.js-native, zero ops, global CDN, preview deployments | Self-managed EC2 — ops cost buys nothing here |
| Database | **Neon Postgres** (us-east) | Serverless Postgres, branching for preview envs, scale-to-zero, generous free tier | RDS Mumbai (wrong region + fixed cost); Supabase (fine, but we need Postgres, not a BaaS) |
| Cache / rate limiting / locks | **Upstash Redis** | HTTP-based, works from serverless without connection pooling pain, per-request pricing | Self-hosted Redis (ops); ElastiCache (VPC-bound) |
| Queue / scheduling | **Upstash QStash** | HTTP queue with retries, delays, cron, signature verification. No always-on worker needed | BullMQ (needs a persistent process); SQS (more AWS surface) |
| Object storage | **Cloudflare R2** | Zero egress fees — matters for report PDFs and creative assets | S3 (egress charges) |
| Email | **Resend** | Simple API, good deliverability, free tier | SES (setup burden) |
| Errors / logs | **Sentry** free → team | Standard | — |
| Analytics | **PostHog** free tier | Product analytics + funnels, self-serve | — |
| CI/CD | **GitHub Actions** | Free for our volume | — |
| DNS / WAF | **Cloudflare** | Free WAF, DDoS, bot rules | — |

**Environments:** `development` (local Postgres + local Redis) · `staging` (Neon branch + Vercel preview) · `production`. Never share a database between environments; never point staging at a real customer's ad account.

---

## 4. Architecture by scale

### MVP · 0 customers — ₹150/mo (~$2)

```
Cloudflare DNS → Vercel Hobby (us-east)
                   ├── Next.js app + API routes
                   └── /api/cron/* (1 daily cron, Hobby limit)
                        └── QStash (free tier) → /api/jobs/*
Neon free (0.5 GB)  ·  Upstash free  ·  Resend free  ·  Sentry free
```

Everything on free tiers. Sync runs on a manual "Sync now" button plus one daily cron. **Only real cost: the domain.**

### 10 customers · ~$60/mo (₹5,300)

Vercel Pro $20 (removes the Hobby cron and duration limits) · Neon Launch $19 · Upstash ~$5 · Resend $20. Sync moves to QStash-scheduled per-account jobs, hourly for paid tiers. **Single Growth customer covers this.**

### 100 customers · ~$190/mo (₹16,700)

Same shape. Neon scales up (~$40), Upstash ~$20, R2 ~$5, PostHog paid ~$50. Add: read replica for dashboards, partitioned metrics table, per-account single-flight sync locks in Redis.

**This is the last architecture change-free rung.** Nothing structural is required to reach 100 customers.

### 500 customers · ~$780/mo (₹68,600)

First structural change: **move sync to a persistent worker** (Fly.io ~$15/mo) for a stable egress IP and long-running jobs. Neon Scale ~$120 (dedicated compute, autoscaling, PITR). Upstash ~$60. Add a status page and on-call alerting. Consider a dedicated egress IP per Agency-tier tenant.

### 1,000 customers · ~$1,650/mo (₹145,000)

Two or three worker instances sharded by `adAccountId % N`, each with its own egress IP to spread the per-IP rate limit. Neon with read replicas. Daily metrics rolled into aggregate tables; raw facts aged out per retention policy. Cloudflare in front of everything. Still no Kubernetes, still no AWS account required.

### 10,000 customers · ~$8,000–12,000/mo (₹7–10 lakh)

At this point the sync fleet is the product's real infrastructure: worker pool with dedicated egress IPs, per-tenant rate-limit budgets, a columnar store (ClickHouse / Timescale) for the insight facts, Postgres reserved for transactional state, warm standby, and a genuine SRE function. Consider AWS us-east-1 with a Mumbai edge for Indian users. **This rung is a hiring plan, not a config change** — do not design for it now.

---

## 5. Region comparison, decided

| Option | Cost | Latency to users | Latency to OpenAI Ads API | Ops | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Vercel + Neon + Upstash, us-east** | Lowest | Excellent via CDN | **Best** | Near zero | **CHOSEN** |
| AWS Mumbai (ap-south-1) | Moderate, fixed | Best for Indian users only | **Worst** (+200–250 ms/call) | High | Only if a customer contractually demands India residency |
| AWS Hyderabad (ap-south-2) | Similar | Similar to Mumbai | Worst | High, fewer services | No |
| Cloudflare Workers + D1 | Very low | Best globally | Good | Low | Tempting, but Prisma/Postgres ergonomics and long-running sync fight the model. Use Cloudflare for DNS/WAF/R2 only |
| Supabase | Low | Good | Good | Low | Viable Neon alternative; Neon's branching wins for preview environments |

---

## 6. Security posture baked into the deployment

- **Customer OpenAI Ads API keys** are AES-256-GCM envelope-encrypted at rest; `ENCRYPTION_KEY` lives only in the platform's secret store and **must be absent from the client bundle**. Production refuses to start without it — no silent plaintext fallback.
- **Keys never cross the network boundary to a browser.** The only path is Browser → our API → credential service → OpenAI Ads API.
- Session cookies: `httpOnly`, `secure`, `sameSite=lax`, short-lived JWT.
- Tenant isolation enforced at the database layer (row-level security or a mandatory tenant predicate in every repository call), not merely in application code.
- Every write to a customer's ad account produces an `AuditLog` row with before/after state.
- Egress allowlist for the Ads API host; no user-supplied URL is ever fetched server-side without validation (SSRF).
- Secrets rotate without redeploy; `ENCRYPTION_KEY` rotation supported by the `enc:v1:` prefix scheme (re-encrypt on next write).
- Backups: Neon PITR on paid tiers from the 100-customer rung onward. Test a restore before the first paying customer.

---

## 7. Cost calculator

`docs/deployment/cost-calculator.md` holds the line-item model and the formulas; the summary table is in `docs/business/pricing-strategy.md` §5. Fixed costs are ~$60/month from launch; variable cost is ~$0.30–1.80 per connected ad account per month, dominated by AI tokens — which is why the optimization engine is deterministic and the LLM only narrates.
