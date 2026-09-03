"use client";

import { Sparkles, TrendingUp, ShieldMinus, Gauge, Star } from "lucide-react";

/**
 * Premium branded showcase panel for the sign-in / sign-up split layout.
 * Pure CSS + SVG (theme-consistent, crisp at any size, no external image).
 */
export function AuthShowcase() {
  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-[#160c2e] text-white flex flex-col justify-between p-8 lg:p-10">
      {/* glow orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-violet-500/40 blur-[110px]" />
        <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-fuchsia-500/30 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 h-40 w-40 rounded-full bg-indigo-400/20 blur-[90px]" />
        {/* subtle grid */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="g" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0V28" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)" />
        </svg>
      </div>

      {/* brand */}
      <div className="relative z-10 flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/30">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-semibold tracking-tight">OrchardAds</span>
      </div>

      {/* floating mock composition */}
      <div className="relative z-10 flex-1 flex items-center justify-center my-6">
        <div className="relative w-full max-w-sm">
          {/* App Store search-ad card */}
          <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-4 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/60">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              travel planner
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold truncate">Trip Trek</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-violet-400/30 text-violet-100 rounded px-1.5 py-0.5">Ad</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-white/60">
                  <Star className="h-3 w-3 fill-amber-300 text-amber-300" /> 4.9 · Travel
                </div>
              </div>
              <div className="h-7 rounded-full bg-white/90 text-[#160c2e] text-xs font-semibold px-4 flex items-center">GET</div>
            </div>
          </div>

          {/* floating KPI card */}
          <div className="absolute -right-4 -top-6 rotate-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3 shadow-xl shadow-black/40">
            <div className="text-[10px] text-white/60">Installs · 30d</div>
            <div className="text-xl font-bold flex items-center gap-1">12,480 <TrendingUp className="h-4 w-4 text-emerald-300" /></div>
          </div>

          {/* floating chart card */}
          <div className="absolute -left-6 -bottom-8 -rotate-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 p-3 shadow-xl shadow-black/40 w-44">
            <div className="text-[10px] text-white/60 mb-1.5">Spend trend</div>
            <svg viewBox="0 0 120 40" className="w-full h-10">
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e879f9" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#e879f9" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 30 L20 26 L40 28 L60 16 L80 20 L100 8 L120 12 L120 40 L0 40 Z" fill="url(#sparkFill)" />
              <path d="M0 30 L20 26 L40 28 L60 16 L80 20 L100 8 L120 12" fill="none" stroke="#e879f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* headline + feature chips */}
      <div className="relative z-10">
        <h2 className="text-2xl font-bold leading-tight tracking-tight">
          Run Apple Search Ads<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-fuchsia-300">like a pro.</span>
        </h2>
        <p className="mt-2 text-sm text-white/70 max-w-xs">
          Create, optimize and automate campaigns — Waste Blocker, Autopilot rules and live reports in one place.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { icon: ShieldMinus, label: "Waste Blocker" },
            { icon: Gauge, label: "Autopilot rules" },
            { icon: TrendingUp, label: "Live reports" },
          ].map((f) => (
            <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs text-white/80">
              <f.icon className="h-3.5 w-3.5" />{f.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
