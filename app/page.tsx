import Link from "next/link";
import {
  BarChart2, ChevronRight, CheckCircle2,
  Key, ArrowRight, ShieldMinus, Gauge, Stethoscope, TrendingUp, Layers,
  Tag, Mail, ClipboardCheck, BellRing, Workflow,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

const optimizeTools = [
  { icon: Stethoscope, label: "Serving Doctor" },
  { icon: ClipboardCheck, label: "Review Doctor" },
  { icon: ShieldMinus, label: "Waste Finder" },
  { icon: Gauge, label: "Budget Pacing" },
  { icon: TrendingUp, label: "Bid Optimizer" },
  { icon: BellRing, label: "Orchard Watch" },
  { icon: Workflow, label: "Autopilot" },
  { icon: Mail, label: "Scheduled Reports" },
];

const steps = [
  { step: "01", title: "Create your account", desc: "Sign up with email verification in under two minutes." },
  { step: "02", title: "Connect OpenAI Ads", desc: "Issue an API key in Ads Manager and paste it in. We encrypt it before it touches our database." },
  { step: "03", title: "See what's broken", desc: "Serving Doctor and Review Doctor answer \u201cwhy isn\u2019t this running?\u201d in seconds \u2014 before any history exists." },
  { step: "04", title: "Fix it safely", desc: "Approve a recommendation, apply it, roll it back if you change your mind. Every change is logged." },
];

const included = [
  "Serving Doctor \u2014 why nothing is delivering", "Review Doctor \u2014 decode ad rejections",
  "Campaigns, ad groups & ads", "Waste Finder", "Budget pacing & exhaustion forecasts",
  "Bid Optimizer on ad-group max bids", "Context hints \u2014 the only targeting text this platform has",
  "Country & device breakdowns", "Campaign, ad group and ad reports", "CSV export everywhere",
  "Orchard Inspector account audits", "Autopilot rule engine with guardrails",
  "Orchard Watch alerts & anomaly detection", "Scheduled email reports", "Dashboards & Live Share",
  "Approval, rollback and a full audit trail", "Encrypted key storage",
];

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col antialiased">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 -translate-x-1/2 -top-40 h-[30rem] w-[60rem] rounded-full bg-primary/15 blur-[130px]" />
          <div className="absolute right-10 top-52 h-64 w-64 rounded-full bg-fuchsia-400/10 blur-[110px]" />
        </div>

        <div className="max-w-6xl mx-auto px-6 sm:px-10 pt-20 pb-10 flex flex-col items-center text-center gap-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Free during beta · 7 days only
          </div>

          <h1 className="text-[2.7rem] sm:text-6xl lg:text-7xl font-semibold tracking-[-0.03em] leading-[1.02] max-w-4xl">
            OpenAI Ads,
            <br className="hidden sm:block" />{" "}
            <span className="italic font-serif bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent pr-1">finally</span>{" "}
            on autopilot.
          </h1>

          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
            Find out why your ads aren&apos;t delivering, where spend is going nowhere, and what to
            do about it — then apply the fix safely, with a human in the loop.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Link href="/signup" className="group inline-flex h-12 items-center justify-center rounded-full bg-primary text-primary-foreground px-7 text-base font-medium hover:bg-primary/90 transition-colors gap-2 shadow-lg shadow-primary/20">
              Connect your account <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="#optimize" className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-7 text-base font-medium text-foreground hover:bg-accent transition-colors">
              See the tools
            </Link>
          </div>

          {/* stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px mt-8 w-full max-w-3xl rounded-2xl overflow-hidden border border-border bg-border">
            {[
              { v: "10+", l: "optimization tools" },
              { v: "40+", l: "API endpoints wired" },
              { v: "AES-256", l: "encrypted keys" },
              { v: "$0", l: "during beta" },
            ].map((s) => (
              <div key={s.l} className="bg-card px-4 py-5 text-center">
                <div className="text-2xl font-semibold tracking-tight">{s.v}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Product mock */}
        <div className="max-w-6xl mx-auto px-6 sm:px-10 pb-24">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xl shadow-primary/5">
            <div className="bg-muted/70 flex items-center gap-2 px-4 py-3 border-b border-border">
              <span className="w-3 h-3 rounded-full bg-destructive/50" />
              <span className="w-3 h-3 rounded-full bg-yellow-400/60" />
              <span className="w-3 h-3 rounded-full bg-green-400/60" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">orchardads.in / dashboard</span>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Impressions", value: "2.4M", trend: "+12%" },
                { label: "Clicks", value: "84K", trend: "+8%" },
                { label: "Conversions", value: "6,240", trend: "+21%" },
                { label: "Spend", value: "$18,420", trend: "-3%" },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-background rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                  <p className="text-2xl font-bold text-foreground tracking-tight">{kpi.value}</p>
                  <p className={`text-xs mt-1 font-medium ${kpi.trend.startsWith("+") ? "text-green-500" : "text-destructive"}`}>{kpi.trend} vs last period</p>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "Spring launch", status: "ACTIVE", budget: "$4,200 left", conversions: "1,420" },
                { name: "Retargeting \u2014 EU", status: "PAUSED", budget: "$0 left", conversions: "340" },
                { name: "Always-on brand", status: "ACTIVE", budget: "$9,800 left", conversions: "890" },
              ].map((c) => (
                <div key={c.name} className="bg-background rounded-xl p-4 border border-border flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === "ACTIVE" ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{c.budget}</span><span>{c.conversions} conv.</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features — bento */}
      <section id="features" className="w-full py-20 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-10">
          <div className="max-w-xl mb-10">
            <Eyebrow>The platform</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">Everything, from first campaign to last dollar.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(0,1fr)]">
            {/* Big: manage */}
            <div className="md:col-span-2 md:row-span-2 rounded-3xl border border-border bg-card p-7 flex flex-col justify-between overflow-hidden relative group">
              <div>
                <div className="flex items-center gap-2 text-primary"><Layers className="w-5 h-5" /><span className="text-sm font-medium">Manage</span></div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight max-w-sm">Campaigns, ad groups and ads — in one flow.</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm">A guided builder that resumes on error, plus standalone managers with bulk edits and inline bidding.</p>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                {[
                  { n: "Brand — Exact", t: "EXACT", b: "$1.20" },
                  { n: "Competitors — Broad", t: "BROAD", b: "$0.90" },
                  { n: "Travel planner", t: "EXACT", b: "$1.10" },
                ].map((k) => (
                  <div key={k.n} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{k.n}</span>
                    <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{k.t}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{k.b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* reports */}
            <div className="rounded-3xl border border-border bg-card p-7 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-primary"><BarChart2 className="w-5 h-5" /><span className="text-sm font-medium">Report</span></div>
              <div className="my-5 flex items-end gap-1.5 h-16">
                {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary/30 to-primary/70" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div>
                <h3 className="font-semibold">Reports & analytics</h3>
                <p className="text-sm text-muted-foreground mt-1">Campaign, ad group, ad and segment level — with CSV export.</p>
              </div>
            </div>

            {/* secure */}
            <div className="rounded-3xl border border-border bg-card p-7 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-primary"><Key className="w-5 h-5" /><span className="text-sm font-medium">Secure</span></div>
              <div className="my-5 font-mono text-xs text-muted-foreground bg-background border border-border rounded-lg p-3 leading-relaxed">
                <span className="text-primary">enc:v1</span>:••••••••••••<br />AES-256-GCM · at rest
              </div>
              <div>
                <h3 className="font-semibold">Encrypted & private</h3>
                <p className="text-sm text-muted-foreground mt-1">Keys encrypted at rest, rate-limited sign-in, never exposed to the browser.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Optimize spotlight */}
      <section id="optimize" className="w-full py-20 bg-muted/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <Eyebrow>The difference</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">An optimization engine, not just a dashboard.</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed max-w-md">
              Most tools show you numbers. OrchardAds acts on them — surfacing wasted spend, promoting
              under-performing ad groups, tuning bids toward your target CPA, and pausing what crosses
              your limits — on a schedule, inside guardrails you set.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/signup" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all">
                Start optimizing free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/autopilot" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Explore Autopilot <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {optimizeTools.map((t) => (
              <div key={t.label} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-md transition-all">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><t.icon className="w-4 h-4" /></div>
                <span className="text-sm font-medium leading-tight">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — timeline */}
      <section id="how-it-works" className="w-full py-20">
        <div className="max-w-6xl mx-auto px-6 sm:px-10">
          <div className="max-w-xl mb-12">
            <Eyebrow>Getting started</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">Live in four steps.</h2>
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="hidden lg:block absolute top-5 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            {steps.map((s) => (
              <div key={s.step} className="relative flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center text-sm font-semibold text-primary shadow-sm z-10">{s.step}</div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Included */}
      <section className="w-full py-20">
        <div className="max-w-6xl mx-auto px-6 sm:px-10">
        <div className="rounded-3xl bg-primary text-primary-foreground p-8 sm:p-12 relative overflow-hidden">
          <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative grid lg:grid-cols-[1fr_1.3fr] gap-10 items-center">
            <div>
              <Eyebrow>Included</Eyebrow>
              <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">Full API coverage.<br />Zero compromises.</h2>
              <p className="mt-3 text-primary-foreground/70 leading-relaxed max-w-sm">Every endpoint from campaigns to creatives — wired, tested, and yours free while we&apos;re in beta.</p>
              <Link href="/signup" className="mt-6 inline-flex h-11 w-fit items-center justify-center rounded-full bg-white text-primary px-7 text-sm font-semibold hover:bg-white/90 transition-colors gap-2">
                Start for free <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {included.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-primary-foreground/85">
                  <CheckCircle2 className="w-4 h-4 text-white/70 shrink-0 mt-0.5" />{item}
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-24 text-center">
        <div className="max-w-2xl mx-auto px-6 sm:px-10 flex flex-col items-center gap-5">
          <Eyebrow>Ready when you are</Eyebrow>
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">Stop guessing. Start optimizing.</h2>
          <p className="text-muted-foreground max-w-lg">Connect your OpenAI Ads account and see what isn't delivering, in about a minute. 14-day trial, every tool unlocked, no card.</p>
          <Link href="/signup" className="group inline-flex h-12 items-center justify-center rounded-full bg-primary text-primary-foreground px-8 text-base font-medium hover:bg-primary/90 transition-colors gap-2 shadow-lg shadow-primary/20">
            Connect OpenAI Ads Account <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
