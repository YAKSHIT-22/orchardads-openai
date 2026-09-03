import Link from "next/link";
import { CheckCircle2, ChevronRight, ArrowRight, Sparkles } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

export const metadata = {
  title: "Pricing — OrchardAds",
  description: "Simple plans for every Apple Search Ads advertiser — free during beta.",
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
    tagline: "Run your Apple Search Ads",
    price: "$5",
    period: "/mo",
    features: [
      "1 Apple Search Ads account",
      "Dashboard & KPIs",
      "Full campaign management — campaigns, ad groups, keywords & ads (create, edit, bulk)",
      "App search & localized app details",
      "Waste Blocker — manual negative keywords",
      "Campaign, keyword, search-term & ad reports",
      "CSV export everywhere",
      "Budget orders & geo-targeting",
      "Email support",
    ],
    cta: { label: "Start free", href: "/signup" },
    note: "Free during beta",
  },
  {
    name: "Pro",
    tagline: "Optimize & automate",
    price: "$10",
    period: "/mo",
    highlight: true,
    ladder: "Everything in Basic, plus:",
    features: [
      "Multiple Apple accounts",
      "Orchard Inspector — account audits",
      "Waste Blocker — AI-scored negative suggestions",
      "Keyword Harvest with AI — expansion & enrichment",
      "Budget Pacing — month-end projection",
      "N-Gram Analyzer & Weekday Performance",
      "Orchard Watch — alerts, anomalies & email digests",
      "Autopilot — rule engine, instant apply + scheduled automation",
      "Scheduled email reports",
      "Live Share — public read-only dashboards",
      "All AI features",
    ],
    cta: { label: "Start free", href: "/signup" },
    note: "Free during beta",
  },
  {
    name: "Enterprise",
    tagline: "Scale with confidence",
    price: "Contact sales",
    ladder: "Everything in Pro, plus:",
    features: [
      "Unlimited Apple accounts",
      "Team seats / multi-user",
      "Priority support & SLA",
      "Onboarding & strategy assistance",
      "Custom automation limits",
    ],
    cta: { label: "Contact sales", href: "/contact" },
  },
];

const faqs = [
  {
    q: "Do I pay anything during the beta?",
    a: "No. Every plan — including all Pro features — is free for all users during our 7-day beta. The prices shown are what plans will cost once billing goes live, and you'll get plenty of notice before that happens.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade or downgrade at any time. When billing goes live, changes take effect immediately and are prorated for the remainder of the cycle.",
  },
  {
    q: "What counts as an \"Apple account\"?",
    a: "One connected Apple Search Ads API credential set (Client ID, Team ID, Key ID). All organizations under that account are included — they appear in the in-app org switcher at no extra cost.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel whenever you like — you keep access until the end of your billing period, and you can request full deletion of your data at any time.",
  },
  {
    q: "How do I connect my Apple Search Ads account?",
    a: "Sign up, generate a key pair in-app, and add the public key to your Apple Search Ads account. Apple doesn't use user-level OAuth — you stay in control of your own API credentials, which we store encrypted.",
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
                  <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">{plan.note} — $0 for the 7-day beta</p>
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
          <p className="text-muted-foreground">Ready to get more from your Apple Search Ads budget?</p>
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
