"use client";

import { Clock3, EyeOff, ShieldCheck, KeyRound, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Contextual side panel for the first-time "Connect your OpenAI Ads account"
 * onboarding. Mirrors the wizard's phases and highlights the one in progress.
 *
 * This panel does real work: the advertiser is about to hand a stranger a
 * credential that can spend their money, and the honest, specific answer to
 * "what can you do with this and where does it live" is what earns the paste.
 */

const PHASES = [
  {
    title: "Open Ads Manager settings",
    body: "Sign in at ads.openai.com with the account that owns your advertising, and open Settings. You need admin access to the ad account.",
  },
  {
    title: "Create an API key",
    body: "Create a key and copy it immediately — OpenAI shows the full value once. Each key is tied to exactly one ad account.",
  },
  {
    title: "Paste it here",
    body: "We call OpenAI once to confirm the key works, read back which ad account it belongs to, then encrypt and store it.",
  },
];

const NOTES = [
  {
    icon: ShieldCheck,
    text: "Your key is encrypted with AES-256-GCM before it touches our database. It is only ever decrypted in memory, for the moment a request is made.",
  },
  {
    icon: EyeOff,
    text: "It is never sent to a browser, never written to a log, and never shown again — after this screen you'll only ever see the last four characters.",
  },
  {
    icon: KeyRound,
    text: "You stay in control. Delete the key in Ads Manager at any time and our access ends immediately, with nothing to uninstall.",
  },
  {
    icon: Clock3,
    text: "Takes about a minute if you're already signed in to Ads Manager.",
  },
];

export default function InfoSteps({ current = 0 }: { current?: number }) {
  return (
    <aside className="md:w-2/5 w-full flex flex-col gap-4">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground tracking-tight">How this works</h3>
        <ol className="mt-4 flex flex-col gap-4">
          {PHASES.map((phase, i) => {
            const isPast = i < current;
            const isCurrent = i === current;
            return (
              <li key={phase.title} className="flex gap-3">
                <span
                  className={cn(
                    "w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5 transition-colors",
                    isCurrent && "bg-primary text-primary-foreground border-primary",
                    isPast && "bg-primary/10 text-primary border-primary/30",
                    !isCurrent && !isPast && "bg-background text-muted-foreground/60 border-border"
                  )}
                >
                  {isPast ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium leading-tight",
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {phase.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{phase.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground tracking-tight">
          What we do with your key
        </h3>
        <ul className="mt-4 flex flex-col gap-3.5">
          {NOTES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3">
              <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
