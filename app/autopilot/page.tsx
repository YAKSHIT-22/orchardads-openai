import Link from "next/link";
import {
  ArrowRight, Bot, CalendarClock, CheckCircle2, ChevronRight, Eye, Layers,
  Mail, MousePointerClick, ShieldCheck, Sparkles, Zap,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Eyebrow from "@/components/marketing/Eyebrow";

export const metadata = {
  title: "Autopilot — OrchardAds",
  description:
    "Put your OpenAI Ads on Autopilot. Build rules that find wasted spend, re-bid winners and pause losers — preview every change, apply in one click, or automate it inside guardrails you set.",
};

const steps = [
  {
    step: "01",
    icon: Layers,
    title: "Build a rule",
    desc: "Pick a scope — campaigns, ad groups, ads or countries — and describe what to catch: “If CPA > $50 and conversions ≥ 5, lower the bid 20%.”",
  },
  {
    step: "02",
    icon: Eye,
    title: "Preview changes",
    desc: "Autopilot runs your rules against live performance data and shows every proposed change beside the metrics that triggered it. Nothing happens yet.",
  },
  {
    step: "03",
    icon: Zap,
    title: "Apply or automate",
    desc: "Tick the changes you want and apply them instantly — or put the strategy on a daily, weekly or monthly schedule with email digests.",
  },
];

const features = [
  {
    icon: Layers,
    title: "Five scopes, one builder",
    desc: "Campaigns, ad groups, ads and countries — every level the API exposes, with actions matched to what it actually allows at each one.",
  },
  {
    icon: MousePointerClick,
    title: "Instant apply",
    desc: "Select the suggestions you agree with and apply them in one click — bids, budgets, pause/resume and country exclusions. Archiving is never offered, because it can't be undone.",
  },
  {
    icon: CalendarClock,
    title: "Scheduled automation",
    desc: "Strategies re-run themselves daily, weekly or monthly, so your rules keep working while you don't.",
  },
  {
    icon: Mail,
    title: "Email digests",
    desc: "Every scheduled run can email you what matched and what changed — a clean audit trail in your inbox.",
  },
  {
    icon: ShieldCheck,
    title: "Safe by default",
    desc: "Auto-apply is strictly opt-in. Until you flip it on, Autopilot only proposes — you review and approve every change. Bid clamps keep automation inside your limits.",
  },
  {
    icon: Sparkles,
    title: "Templates to start from",
    desc: "Pause ad groups with no conversions, cut expensive bids, top up campaigns that are converting — load a proven starting point and tweak it to your account.",
  },
];

/* Static, illustrative mock data — not tied to any account. */
const mockSuggestions = [
  { checked: true, name: "Productivity — broad", ctx: "Ad group · in Spring launch", action: "Max bid $1.20 → $0.96 (−20%)", tone: "sky", spend: "$142.10", conversions: "9" },
  { checked: true, name: "Cold prospecting", ctx: "Ad group · in Spring launch", action: "Pause", tone: "amber", spend: "$88.40", conversions: "0" },
  { checked: false, name: "Retargeting — EU", ctx: "Ad group · in Retargeting", action: "Report only", tone: "zinc", spend: "$12.75", conversions: "1" },
  { checked: true, name: "High-intent buyers", ctx: "Ad group · in Always-on brand", action: "Max bid $0.80 → $0.92 (+15%)", tone: "sky", spend: "$204.90", conversions: "61" },
];

const toneClass: Record<string, string> = {
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  zinc: "border-border bg-muted text-muted-foreground",
};

export default function AutopilotLandingPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col antialiased">
      <MarketingHeader active="Autopilot" />

      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 -translate-x-1/2 -top-40 h-[30rem] w-[60rem] rounded-full bg-primary/15 blur-[130px]" />
          <div className="absolute right-10 top-52 h-64 w-64 rounded-full bg-zinc-400/10 blur-[110px]" />
        </div>

        <div className="max-w-6xl mx-auto px-6 sm:px-10 pt-20 pb-12 flex flex-col items-center text-center gap-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm">
            <Bot className="w-3.5 h-3.5 text-primary" />
            New in OrchardAds · rule-driven bulk optimization
          </div>

          <h1 className="text-[2.7rem] sm:text-6xl lg:text-7xl font-semibold tracking-[-0.03em] leading-[1.02] max-w-4xl">
            Put your OpenAI Ads
            <br className="hidden sm:block" />{" "}
            on{" "}
            <span className="italic font-serif bg-gradient-to-br from-primary to-zinc-600 bg-clip-text text-transparent pr-1">
              Autopilot
            </span>
            .
          </h1>

          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
            Rules that optimize while you sleep. Describe what a wasteful ad group or a winning campaign looks
            like — Autopilot finds them, shows you exactly what it wants to change, and applies it on your say-so.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Link href="/signup" className="group inline-flex h-12 items-center justify-center rounded-full bg-primary text-primary-foreground px-7 text-base font-medium hover:bg-primary/90 transition-colors gap-2 shadow-lg shadow-primary/20">
              Start with a free account <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/tools/autopilot" className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-7 text-base font-medium text-foreground hover:bg-accent transition-colors">
              Open the tool
            </Link>
          </div>
        </div>

        {/* Product mock — rule builder + suggestions (static illustration) */}
        <div className="max-w-6xl mx-auto px-6 sm:px-10 pb-24">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xl shadow-primary/5">
            <div className="bg-muted/70 flex items-center gap-2 px-4 py-3 border-b border-border">
              <span className="w-3 h-3 rounded-full bg-destructive/50" />
              <span className="w-3 h-3 rounded-full bg-yellow-400/60" />
              <span className="w-3 h-3 rounded-full bg-green-400/60" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">orchardads.app / tools / autopilot</span>
            </div>

            <div className="p-6 grid lg:grid-cols-[1fr_1.35fr] gap-5">
              {/* Rule builder mock */}
              <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-3 text-left">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Pause ad groups with no conversions</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Ad group scope</span>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="text-muted-foreground w-6">If</span>
                    <span className="font-medium">Spend</span>
                    <span className="text-muted-foreground">is at least</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">$10.00</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="text-muted-foreground w-6">and</span>
                    <span className="font-medium">Conversions</span>
                    <span className="text-muted-foreground">equals</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">0</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-muted-foreground w-6">Then</span>
                    <span className="font-medium text-primary">Pause the ad group</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground border border-dashed border-border rounded-lg px-3 py-2 leading-snug">
                  If Spend ≥ $25 AND Clicks ≥ 40 AND Conversions = 0 → pause · last 30 days
                </p>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="w-3.5 h-3.5" /> Automated · weekly · emails results
                  </span>
                  <span className="inline-flex h-7 items-center rounded-full bg-primary text-primary-foreground px-3 text-[11px] font-medium">
                    Preview changes
                  </span>
                </div>
              </div>

              {/* Suggestions table mock */}
              <div className="rounded-xl border border-border bg-background overflow-hidden text-left">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold">4 matches</p>
                  <span className="text-[10px] text-muted-foreground">last 30 days</span>
                </div>
                <div className="divide-y divide-border">
                  {mockSuggestions.map((s) => (
                    <div key={s.name} className="px-4 py-2.5 flex items-center gap-3">
                      <span
                        className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                          s.checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {s.checked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{s.ctx}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${toneClass[s.tone]}`}>
                        {s.action}
                      </span>
                      <div className="hidden sm:block text-right shrink-0 w-20">
                        <p className="text-[11px] tabular-nums">{s.spend}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">{s.conversions} conv.</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 border-t border-border flex justify-center">
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 text-[11px] font-medium">
                    <Zap className="w-3 h-3" /> Apply 3 selected
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-3">Illustrative preview — not live account data.</p>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full py-20 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-10">
          <div className="max-w-xl mb-12">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">Rule → preview → apply. That's it.</h2>
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="hidden sm:block absolute top-5 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            {steps.map((s) => (
              <div key={s.step} className="relative flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center text-primary shadow-sm z-10">
                  <s.icon className="w-4 h-4" />
                </div>
                <h3 className="font-semibold">
                  <span className="text-primary/60 mr-2 text-sm font-semibold">{s.step}</span>
                  {s.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="w-full py-20 bg-muted/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-10">
          <div className="max-w-xl mb-10">
            <Eyebrow>What you get</Eyebrow>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
              An optimizer that asks first — until you tell it not to.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <f.icon className="w-4.5 h-4.5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full py-24 text-center">
        <div className="max-w-2xl mx-auto px-6 sm:px-10 flex flex-col items-center gap-5">
          <Eyebrow>Ready when you are</Eyebrow>
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">Your rules. Your guardrails. Zero busywork.</h2>
          <p className="text-muted-foreground max-w-lg">
            Connect your OpenAI Ads account, load a template, and see what Autopilot would change in your
            account today — free during the beta.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/signup" className="group inline-flex h-12 items-center justify-center rounded-full bg-primary text-primary-foreground px-8 text-base font-medium hover:bg-primary/90 transition-colors gap-2 shadow-lg shadow-primary/20">
              Connect OpenAI Ads Account <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/tools/autopilot" className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card/50 px-7 text-base font-medium text-foreground hover:bg-accent transition-colors gap-2">
              Open Autopilot <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
