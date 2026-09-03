import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { TOOL_DEFINITIONS, runTool } from "@/lib/ai/tools";
import { isAiConfigured } from "@/lib/ai/suggest";
import { requireFeature, consume } from "@/lib/billing/entitlements";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { redact } from "@/lib/openai/credentials";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_TURNS = 6;

/**
 * The AI analyst.
 *
 * ARCHITECTURE, stated plainly because it is the security boundary:
 *
 *   question -> model -> TYPED READ-ONLY TOOL -> our data -> model -> answer
 *
 * The model never sees the customer's API key, never constructs a URL, and has
 * no write tool available to it in any code path. Changing a live ad account
 * goes through the recommendation + risk engine + human approval flow instead.
 *
 * The system prompt does the other half of the job: it forbids arithmetic the
 * tools didn't do. Every number in an answer must have come back from a tool
 * call, which is what makes the answer checkable instead of merely fluent.
 */

const SYSTEM = `You are the analyst inside OrchardAds, a tool for optimizing OpenAI Ads (ads shown inside ChatGPT).

You answer questions about the user's ad account using the tools provided. You have read-only access.

PLATFORM FACTS you must respect — getting these wrong makes you actively harmful:

1. There are NO KEYWORDS on this platform. No match types, no search terms, no negative keywords at campaign level, no quality score, no impression share. Ad-group targeting is free-text "context hints". If asked about keywords, explain this rather than improvising.
2. The delivery metrics that exist are exactly: impressions, clicks, spend, CTR, CPC, CPM. Conversions come from a separate endpoint and are click-through only.
3. OpenAI Ads DOES NOT REPORT REVENUE. ROAS is unavailable unless the advertiser configured a value per conversion, in which case it is MODELLED and you must say so. Never estimate revenue. Never infer it from spend.
4. Campaign budgets are LIFETIME. When one is consumed the campaign stops permanently — it does not reset tomorrow.
5. Archiving anything is irreversible. Never recommend it casually.

RULES FOR YOUR ANSWERS:

- Call tools before answering anything factual. Do not answer from memory or assumption.
- Every number you state must have come from a tool result. Do not compute new figures, percentages, or projections the tools did not return.
- If the data is insufficient to answer, say so and say what is missing. "Not enough conversions to judge CPA yet" is a good answer. A confident guess is not.
- When you spot a problem, say who can fix it and how. Many serving issues are OpenAI-side or billing-side and no tool can resolve them.
- Be concise. Lead with the answer, then the evidence. No preamble.
- You cannot make changes. If the user asks you to change something, tell them which recommendation or tool page does it, and that it needs their approval.`;

export const POST = withAdsRoute(async ({ userId, req }) => {
  if (!isAiConfigured()) {
    throw new AppError("AI isn't configured on this deployment.", 501);
  }

  await requireFeature(userId, "ai_analyst");

  const limit = await rateLimit(`ai-ask:${userId}:${clientIp(req)}`, 30, 3600);
  if (!limit.ok) {
    throw new AppError(
      `Too many questions — try again in about ${Math.ceil(limit.retryAfter / 60)} minutes.`,
      429
    );
  }

  const body = await req.json().catch(() => ({}));
  const { adAccountId, question, history } = body as {
    adAccountId?: string;
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  if (!adAccountId) throw new AppError("adAccountId required", 400);
  if (!question?.trim()) throw new AppError("Ask a question to continue.", 400);
  if (question.length > 2000) throw new AppError("That question is too long.", 400);

  await consume(userId, "ai_analyses");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Prior turns are trimmed: a long transcript costs tokens on every request and
  // this is the only variable cost in the product.
  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: question },
  ];

  const toolsUsed: { name: string; input: unknown }[] = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
        messages,
      });

      const toolCalls = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (!toolCalls.length) {
        const answer = response.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim();

        return NextResponse.json(
          {
            answer: answer || "I couldn't produce an answer for that.",
            toolsUsed,
            // Surfaced so the UI can show what was actually read. An analyst
            // that cites its sources is one a user can check.
            sources: toolsUsed.map((t) => t.name),
          },
          { status: 200 }
        );
      }

      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of toolCalls) {
        toolsUsed.push({ name: call.name, input: call.input });
        try {
          const result = await runTool(
            { userId, adAccountId },
            call.name,
            (call.input ?? {}) as Record<string, unknown>
          );
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          // A failing tool is reported back to the model so it can adapt, but
          // the message is redacted — upstream errors must never carry
          // credential material into a model context.
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: JSON.stringify({
              error: err instanceof Error ? err.message : "That data couldn't be loaded.",
            }),
          });
        }
      }

      messages.push({ role: "user", content: results });
    }

    return NextResponse.json(
      {
        answer:
          "That question needed more lookups than I'm allowed in one go. Try narrowing it — a single campaign, or a shorter window.",
        toolsUsed,
        sources: toolsUsed.map((t) => t.name),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("AI ask failed:", redact(err));
    throw new AppError("The analyst couldn't answer that right now. Please try again.", 502);
  }
});
