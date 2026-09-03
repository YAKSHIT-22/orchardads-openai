"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, Bot, Loader2, MessageSquare, ShieldCheck, User, Wrench } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/**
 * Ask — the AI analyst.
 *
 * UX decisions worth stating, because they're the difference between a chat box
 * and something an advertiser trusts with budget decisions:
 *
 *  - EVERY ANSWER SHOWS ITS SOURCES. The tools the model actually called are
 *    listed under the reply. An analyst that can't show its working is one you
 *    have to take on faith, and this one is talking about money.
 *  - THE READ-ONLY BOUNDARY IS VISIBLE, not buried in a tooltip. Users should
 *    never wonder whether asking a question might change their campaigns.
 *  - Starter prompts are the ones this product can answer WELL — they steer
 *    away from questions about keywords and ROAS that the platform can't
 *    support, rather than letting the user discover the limits by disappointment.
 */

type Turn = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

const STARTERS = [
  "What isn't delivering right now, and why?",
  "Where is my money going with nothing to show for it?",
  "Which campaigns are converting cheapest?",
  "Has anything changed materially in the last week?",
  "Which ads were rejected, and how do I fix them?",
];

const TOOL_LABELS: Record<string, string> = {
  get_account_summary: "Account totals",
  list_campaigns: "Campaigns",
  list_ad_groups: "Ad groups",
  list_ads: "Ads",
  get_serving_issues: "Serving issues",
  get_recommendations: "Recommendations",
  get_trend: "Daily trend",
  get_segment_breakdown: "Segment breakdown",
};

export default function AskPage() {
  const { adAccountId } = adAccountStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const res = await api.post("/ai/ask", {
        adAccountId,
        question,
        history: turns.map((t) => ({ role: t.role, content: t.content })),
      });
      return res.data as { answer: string; sources?: string[] };
    },
    onSuccess: (data) => {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources ?? [] },
      ]);
    },
    onError: (err) => {
      adsErrorToast(err, "The analyst couldn't answer that");
      // Drop the unanswered question rather than leaving it hanging in the
      // transcript, where it would be re-sent as context on the next turn.
      setTurns((prev) => prev.slice(0, -1));
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, ask.isPending]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setDraft("");
    ask.mutate(q);
  };

  if (!adAccountId) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Connect an ad account to ask questions about it.</p>
        <Button asChild className="rounded-lg">
          <Link href="/onboarding/connect">Connect an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      <header className="px-5 py-4 border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Ask</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Questions about this ad account, answered from your real data.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 shrink-0 font-normal">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Read-only
          </Badge>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          {turns.length === 0 && (
            <div className="flex flex-col items-center text-center gap-4 py-10">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Ask anything about this account
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  I read your campaigns, performance and serving diagnostics, and cite what I used.
                  I can&apos;t change anything — that always goes through you.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full max-w-lg mt-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-sm rounded-lg border border-border px-3.5 py-2.5 hover:bg-muted/60 hover:border-primary/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={cn("flex gap-3", t.role === "user" && "justify-end")}>
              {t.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={cn(
                  "rounded-xl px-4 py-3 max-w-[85%]",
                  t.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border"
                )}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.content}</p>

                {t.role === "assistant" && !!t.sources?.length && (
                  <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      Read:
                    </span>
                    {[...new Set(t.sources)].map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] font-normal">
                        {TOOL_LABELS[s] ?? s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {t.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {ask.isPending && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Reading your account…
                </p>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder="Ask about performance, spend, or what isn't delivering…"
              rows={2}
              className="rounded-xl resize-none pr-12"
              disabled={ask.isPending}
            />
            <Button
              size="sm"
              className="absolute right-2 bottom-2 h-8 w-8 p-0 rounded-lg"
              disabled={!draft.trim() || ask.isPending}
              onClick={() => send(draft)}
              aria-label="Send"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Answers come from your account data, not from the model&apos;s memory. Revenue and ROAS
            aren&apos;t reported by OpenAI Ads — I&apos;ll say so rather than estimate them.
          </p>
        </div>
      </div>
    </div>
  );
}
