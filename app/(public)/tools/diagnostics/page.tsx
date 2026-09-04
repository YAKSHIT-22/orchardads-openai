"use client";

/**
 * Diagnostics — Serving Doctor and Review Doctor in one tool.
 *
 * They were separate nav items, which split a single question ("why isn't this
 * running?") across two screens. The split is not how the platform actually
 * behaves: an ad that cannot serve and an ad that was rejected are the same
 * problem to the advertiser, and a rejected ad is itself a serving issue. Both
 * read the same synced entities, both decode a typed enum into a fix, and both
 * are the reason this product is worth opening before any performance history
 * exists — so they belong side by side.
 *
 * The tab is in the URL (?tab=review) so a link from elsewhere in the app can
 * point at the right half, and a reload keeps you where you were.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, ClipboardCheck, Loader2 } from "lucide-react";
import { ServingDoctor } from "@/components/diagnostics/ServingDoctor";
import { ReviewDoctor } from "@/components/diagnostics/ReviewDoctor";
import { cn } from "@/lib/utils";

type Tab = "serving" | "review";

function DiagnosticsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "review" ? "review" : "serving";

  const select = (next: Tab) => {
    const q = new URLSearchParams(Array.from(params.entries()));
    q.set("tab", next);
    // replace, not push: flipping a tab shouldn't fill the back button.
    router.replace(`/tools/diagnostics?${q.toString()}`, { scroll: false });
  };

  const tabs: { id: Tab; label: string; hint: string; icon: typeof Stethoscope }[] = [
    { id: "serving", label: "Serving", hint: "Why nothing is delivering", icon: Stethoscope },
    { id: "review", label: "Review", hint: "Why ads were rejected", icon: ClipboardCheck },
  ];

  return (
    <div className="w-full">
      <div className="border-b border-border px-4 md:px-6 pt-4">
        <div className="flex items-end gap-1">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => select(t.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-lg border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  — {t.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Both stay mounted so switching back doesn't refetch and lose the
          expanded rows someone was reading. */}
      <div className={tab === "serving" ? "block" : "hidden"}>
        <ServingDoctor />
      </div>
      <div className={tab === "review" ? "block" : "hidden"}>
        <ReviewDoctor />
      </div>
    </div>
  );
}

export default function DiagnosticsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full p-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading diagnostics…</span>
        </div>
      }
    >
      <DiagnosticsInner />
    </Suspense>
  );
}
