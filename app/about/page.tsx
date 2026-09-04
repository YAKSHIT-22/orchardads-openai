import Link from "next/link";
import {
  Shield, Zap, Globe, ChevronRight, Code2, Lock, BarChart2, ArrowRight,
  ClipboardCheck, ShieldMinus, BellRing, Workflow, Stethoscope, Gauge, Mail,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

export const metadata = {
  title: "About — OrchardAds",
  description: "Why we built OrchardAds — an optimization layer for OpenAI Ads.",
};

const tools = [
  { icon: ClipboardCheck, name: "Orchard Inspector", desc: "Audits your whole account for structural issues, missed settings and quick wins." },
  { icon: ShieldMinus, name: "Waste Finder", desc: "Surfaces spend that produced no conversions \u2014 gated on enough clicks that zero actually means something." },
  { icon: BellRing, name: "Orchard Watch", desc: "Alerts and monitoring that catch anomalies before they burn budget." },
  { icon: Workflow, name: "Autopilot", desc: "A rule engine that tunes bids and pauses underperformers on a schedule." },
  { icon: Stethoscope, name: "Serving Doctor", desc: "Decodes the platform\u2019s own serving-issue codes into a root cause and a fix." },
  { icon: Gauge, name: "Budget Pacing", desc: "Keeps every campaign on plan so budgets land where you expect." },
  { icon: ClipboardCheck, name: "Review Doctor", desc: "Groups rejected ads by cause \u2014 usually a crawler or landing-page problem you can fix today." },
  { icon: Mail, name: "Reports & Live Share", desc: "Deep reports, scheduled emails, and dashboards you can share with a link." },
];

const values = [
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Security first",
    desc: "In-app key generation, encrypted private keys at rest, and rate-limited, JWT-based sessions — credentials are never stored in plain text or sent to the browser.",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Built for speed",
    desc: "Every API call is cached and retried intelligently. Real-time data means real-time decisions — no stale dashboards.",
  },
  {
    icon: <Code2 className="w-5 h-5" />,
    title: "API-native",
    desc: "Built directly on OpenAI's Advertiser API — no wrappers, no abstraction layers. Where the API can't do something, we say so instead of faking it.",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "Global reach",
    desc: "Geo-targeting down to admin areas and localities — reach your exact audience wherever they are in the world.",
  },
  {
    icon: <BarChart2 className="w-5 h-5" />,
    title: "Data driven",
    desc: "Live impressions, clicks, conversions and CPA, plus an optimization engine that acts on the numbers \u2014 not just displays them.",
  },
  {
    icon: <Lock className="w-5 h-5" />,
    title: "Your data, your control",
    desc: "We don't sell your data or share your credentials. Every piece of sensitive information stays encrypted and isolated.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col antialiased">
      <MarketingHeader active="About" />

      {/* Hero */}
      <section className="relative w-full overflow-hidden border-b border-border/60">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/3 -top-40 h-[26rem] w-[46rem] rounded-full bg-primary/12 blur-[130px]" />
          <div className="absolute right-10 top-40 h-56 w-56 rounded-full bg-zinc-400/10 blur-[110px]" />
        </div>
        <div className="max-w-4xl mx-auto px-6 sm:px-10 pt-24 pb-20 flex flex-col gap-6">
          <Eyebrow>About OrchardAds</Eyebrow>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-[-0.03em] leading-[1.03]">
            We built the dashboard we <span className="italic font-serif bg-gradient-to-br from-primary to-zinc-600 bg-clip-text text-transparent">always wanted.</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
            OrchardAds was born out of frustration. Running OpenAI Ads programmatically meant wrangling raw API calls,
            minting client secrets by hand, and stitching reports together in spreadsheets. So we built the clean,
            production-ready platform we wished existed — the full surface of OpenAI&apos;s Advertiser API, without the guesswork.
          </p>
        </div>
      </section>

      {/* Mission — editorial split */}
      <section className="w-full px-6 sm:px-10 py-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-start">
          <div>
            <Eyebrow>Our mission</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">OpenAI Ads for everyone — not just enterprises.</h2>
          </div>
          <p className="text-muted-foreground text-lg leading-relaxed lg:pt-8">
            We want indie studios, agencies and solo developers to run OpenAI Ads like a team with a dedicated
            engineer — democratizing programmatic ad management with a transparent, secure and genuinely intuitive
            platform wired straight into OpenAI&apos;s official Advertiser API.
          </p>
        </div>
      </section>

      {/* What we build */}
      <section className="w-full px-6 sm:px-10 py-20 bg-muted/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-xl mb-10">
            <Eyebrow>What we build</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">A full toolkit, from first campaign to last dollar.</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Beyond campaign management, OrchardAds ships a suite of purpose-built optimization tools —
              each one designed to replace a spreadsheet you shouldn&apos;t have to maintain.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tools.map((t) => (
              <div key={t.name} className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 transition-all">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><t.icon className="w-4 h-4" /></div>
                <h3 className="font-semibold text-sm">{t.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="w-full px-6 sm:px-10 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-xl mb-10">
            <Eyebrow>What we stand for</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">Principles we don&apos;t compromise on.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {values.map((v) => (
              <div key={v.title} className="group bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 shadow-sm hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/40 transition-all duration-200">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">{v.icon}</div>
                <h3 className="font-semibold text-foreground">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full px-6 sm:px-10 py-24 text-center border-t border-border/60">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-5">
          <Eyebrow>Say hello</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">Questions, feedback, or a partnership?</h2>
          <p className="text-muted-foreground max-w-md">We read everything — and we&apos;re building this in the open with our beta users.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/contact" className="group inline-flex h-11 items-center justify-center rounded-full bg-primary text-primary-foreground px-7 text-sm font-medium hover:bg-primary/90 transition-colors gap-2 shadow-lg shadow-primary/20">
              Contact us <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-card/50 px-7 text-sm font-medium hover:bg-accent transition-colors gap-2">
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
