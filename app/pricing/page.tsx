import Link from "next/link";
import { CheckCircle2, ChevronRight, ArrowRight, Sparkles } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

export const metadata = {
  title: "Pricing — OrchardAds",
  description: "Plans for OpenAI Ads advertisers. 14-day trial with every tool unlocked, no card required.",
};

type Plan = {
  name: string;
  tagline: string;
  price: string;
  period?: string;
  highlight?: boolean;
  ladder?: string;
  features: string[];
  cta: { label: string; href: string };
  note?: string;
};

const plans: Plan[] = [
  {
    name: "Basic",
    tagline: "One ad account. Find the waste, fix it safely.",
    price: "$15",
    period: "/mo",
    features: [
      "1 OpenAI Ads account, 2 seats",
      "Serving Doctor — why nothing is delivering, by root cause",
      "Review Doctor — decode ad rejections and how to fix them",
      "Dashboard, campaign, ad group and ad reporting",
      "Waste Finder & Budget Pacing",
      "Recommendations with approval, rollback and full audit trail",
      "Ask — the AI analyst (100 analyses/mo)",
      "100 applied changes/mo · CSV export",
    ],
    cta: { label: "Start 14-day trial", href: "/signup" },
    note: "₹1,499 + GST in India",
  },
  {
    name: "Pro",
    tagline: "Up to 5 ad accounts, full toolkit and alerting.",
    price: "$29",
    period: "/mo",
    highlight: true,
    ladder: "Everything in Basic, plus:",
    features: [
      "5 ad accounts, 5 seats",
      "Bid Optimizer — ad-group max bids ranked against your median CPA",
      "Context Hints — edit the only targeting text this platform has",
      "Time Performance — weekday patterns",
      "Orchard Watch — alerts, anomaly detection, optional auto-pause",
      "Orchard Inspector — full account audits",
      "Scheduled email reports · country & device breakdowns",
      "500 AI analyses/mo · 400 applied changes/mo",
    ],
    cta: { label: "Start 14-day trial", href: "/signup" },
    note: "₹2,999 + GST in India",
  },
  {
    name: "Enterprise",
    tagline: "Agencies and multi-brand teams.",
    price: "$49",
    period: "/mo",
    ladder: "Everything in Pro, plus:",
    features: [
      "25 ad accounts, 20 seats",
      "Autopilot — rule engine with guardrails and cooldowns",
      "Live Share — read-only client dashboards on a public link",
      "Report Designer & white-label reports",
      "API access · priority support",
      "2,500 AI analyses/mo · 2,000 applied changes/mo",
    ],
    cta: { label: "Talk to us", href: "/contact" },
    note: "₹5,999 + GST in India",
  },
];

const faqs = [
  {
    q: "What happens during the 14-day trial?",
    a: "Every tool is unlocked at Enterprise limits, with no card required. Not a reduced version — Serving Doctor and Review Doctor produce a real answer the minute you paste your API key, before any performance history exists, so there is nothing to gain by holding features back while you evaluate.",
  },
  {
    q: "What happens when the trial ends and I haven't subscribed?",
    a: "Your account becomes read-only rather than locked. Dashboards, Serving Doctor, Review Doctor, reports and your activity log keep working. What stops is applying changes to your ad account and running AI analyses. We won't lock you out of your own performance data to pressure a renewal.",
  },
  {
    q: "What counts as an ad account?",
    a: "One OpenAI Ads API key. Each key is scoped by OpenAI to exactly one ad account, so if you manage several you'll connect one key each. Pricing is per connected account and never a percentage of your ad spend — a tool that exists to cut waste shouldn't earn more when you spend more.",
  },
  {
    q: "How do I connect my OpenAI Ads account?",
    a: "Sign in at ads.openai.com, open Settings, and issue an API key. Paste it into onboarding and we verify it, read back which ad account it belongs to, and encrypt it with AES-256-GCM before storing it. The key never reaches a browser and never appears in a log. Delete it in Ads Manager any time to cut off access — there's nothing to uninstall.",
  },
  {
    q: "Can you show ROAS?",
    a: "Not from OpenAI Ads, because the API doesn't report revenue — conversions come back as counts only. If you tell us what a conversion is worth to you, we'll model revenue and ROAS from that and label them as modelled. We won't estimate them and present them as reported figures.",
  },
  {
    q: "Will it change my campaigns on its own?",
    a: "Only if you set up Autopilot and explicitly enable auto-apply, and even then it runs inside guardrails you configure: maximum change percentage, daily action caps, cooldowns and minimum conversion volume. Archiving and pausing the ad account are never automated at all — archiving is irreversible and pausing the account would stop your entire business. Every change is logged with its before and after state and can be rolled back.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. You keep access until the end of your billing period, then the account falls back to read-only. You can request full deletion of your data at any time.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col antialiased">
      <MarketingHeader active="Pricing" />

      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 -translate-x-1/2 -top-40 h-[26rem] w-[50rem] rounded-full bg-primary/12 blur-[130px]" />
        </div>
        <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 pt-20 pb-12 flex flex-col items-center text-center gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Free during beta · 7 days only
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] leading-[1.03] max-w-3xl">
            Simple plans that{" "}
            <span className="italic font-serif bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">scale</span> with you.
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
            Every plan is free while we&apos;re in beta — the prices below are what they&apos;ll cost
            once billing goes live. Connect your account and start optimizing today.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="w-full max-w-6xl mx-auto px-6 sm:px-10 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl border bg-card overflow-hidden flex flex-col ${
                plan.highlight
                  ? "border-2 border-primary/50 shadow-xl shadow-primary/10 lg:-mt-4"
                  : "border-border shadow-sm"
              }`}
            >
              {plan.highlight && (
                <div className="bg-primary text-primary-foreground text-xs font-semibold text-center py-2 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Most popular
                </div>
              )}
              <div className={`px-7 pt-7 pb-6 border-b border-border ${plan.highlight ? "bg-primary/5" : ""}`}>
                <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{plan.tagline}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className={`font-semibold tracking-tight ${plan.period ? "text-4xl" : "text-2xl mb-0.5"}`}>{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground mb-1">{plan.period}</span>}
                </div>
                {plan.note ? (
                  <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">{plan.note}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Custom pricing for teams & agencies</p>
                )}
              </div>

              <div className="px-7 py-6 flex flex-col gap-3 flex-1">
                {plan.ladder && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{plan.ladder}</p>}
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-7 pb-7 mt-auto">
                <Link
                  href={plan.cta.href}
                  className={`group inline-flex w-full h-11 items-center justify-center rounded-full px-6 text-sm font-medium transition-colors gap-2 ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                      : "border border-border bg-card hover:bg-accent text-foreground"
                  }`}
                >
                  {plan.cta.label} <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                {plan.note && <p className="text-center text-xs text-muted-foreground mt-2.5">No credit card required during beta.</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full max-w-3xl mx-auto px-6 sm:px-10 pb-24">
        <div className="text-center mb-8">
          <Eyebrow>FAQ</Eyebrow>
          <h3 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Frequently asked questions</h3>
        </div>
        <div className="flex flex-col gap-4">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="font-semibold mb-1.5">{f.q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">Ready to see where your ChatGPT Ads budget is actually going?</p>
          <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-full bg-primary text-primary-foreground px-7 text-sm font-medium hover:bg-primary/90 transition-colors gap-2 shadow-lg shadow-primary/20">
            Start free <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-muted-foreground">
            Still deciding? <Link href="/contact" className="text-primary hover:underline">Talk to us</Link> — we reply within 24–48 hours.
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
