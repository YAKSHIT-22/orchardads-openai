import Anthropic from "@anthropic-ai/sdk";

/**
 * AI suggestion engine for OpenAI Ads campaign setup.
 *
 * This API has no keywords and no negative keywords. What an advertiser actually
 * needs help with here is narrower:
 *
 *   context_hints  — free-text descriptions of when the product is useful.
 *                    They are the ONLY targeting text on this platform, so
 *                    getting them right is the whole targeting exercise.
 *   ad copy        — a chat_card title (3-50 chars) and body (<=100), which are
 *                    tight limits that a model is genuinely good at hitting.
 *   starting bid   — a max bid, expressed in the account currency.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: suggest a budget. A budget depends on the
 * advertiser's economics, not on anything a model can infer from a URL, and a
 * lifetime budget on this platform stops delivery permanently when consumed.
 * Guessing that number would be the most expensive kind of confident-wrong.
 *
 * Returns { generated: false, reason } when the key is missing or the model
 * can't produce usable JSON, so the UI falls back to manual entry gracefully.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export interface SuggestionInput {
  currency: string;
  /** impressions | clicks | conversions */
  biddingType: string;
  /** Countries or regions the campaign targets, for tone and spelling. */
  countries: string[];
  business: {
    /** The ad account's website — the strongest signal we have. */
    url?: string;
    name?: string;
    /** Whatever the advertiser told us they sell. */
    description?: string;
  };
  /** Existing campaigns, so suggestions don't duplicate what's already running. */
  existingCampaigns: { name?: string; contextHints?: string[] }[];
}

export interface AdCopySuggestion {
  /** 3-50 characters, enforced downstream by the API. */
  title: string;
  /** Up to 100 characters. */
  body: string;
}

export interface SuggestionResult {
  generated: boolean;
  reason?: string;
  /** Free-text targeting hints for the ad group. */
  contextHints?: string[];
  /** Hints describing when NOT to show — bulk API only, surfaced as advice. */
  exclusionHints?: string[];
  adCopy?: AdCopySuggestion[];
  /** Max bid in the account currency (not micros — converted at the call site). */
  suggestedMaxBid?: number;
  rationale?: string;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildPrompt(input: SuggestionInput): string {
  const existing = input.existingCampaigns.length
    ? input.existingCampaigns
        .map((c) => `- "${c.name}" hints: ${(c.contextHints ?? []).slice(0, 8).join(", ") || "none"}`)
        .join("\n")
    : "None.";

  return `You are a performance marketer setting up a campaign on OpenAI Ads, where ads appear inside ChatGPT conversations.

This platform has NO KEYWORDS and NO MATCH TYPES. Targeting is expressed as "context hints": short, plain-language descriptions of the situations in which the product is genuinely useful. A good hint describes an intent or a moment ("comparing project management tools for a small team"), not a keyword ("project management software").

Business:
- Website: ${input.business.url || "unknown"}
- Name: ${input.business.name || "unknown"}
- What they sell: ${input.business.description || "unknown"}
- Targeting: ${input.countries.length ? input.countries.join(", ") : "all available locations"}
- Paying for: ${input.biddingType}

Existing campaigns:
${existing}

Return ONLY valid JSON, no prose, in this exact shape:
{
  "contextHints": ["8-15 short hints, each under 80 characters"],
  "exclusionHints": ["2-5 situations where this ad would be irrelevant or wasteful"],
  "adCopy": [{ "title": "<= 50 chars", "body": "<= 100 chars" }],
  "suggestedMaxBid": <number in ${input.currency}, or null if you cannot justify one>,
  "rationale": "2-3 sentences explaining the angle you took"
}

Rules:
- Give exactly 3 adCopy variants that test genuinely different angles, not rewordings.
- Titles must be under 50 characters and bodies under 100. Count them.
- Do NOT invent claims, prices, guarantees, or statistics about the business.
- If the business is unclear, say so in the rationale and give fewer, broader hints rather than confident wrong ones.
- suggestedMaxBid should reflect that typical CPCs on this platform run roughly 3-5 in USD for consumer categories and higher for software and finance. Return null if you have no basis for a number.`;
}

export async function generateSuggestions(input: SuggestionInput): Promise<SuggestionResult> {
  if (!isAiConfigured()) {
    return { generated: false, reason: "AI suggestions aren't configured on this deployment." };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    const json = extractJson(text);
    if (!json) return { generated: false, reason: "The model didn't return usable suggestions." };

    // Trim to the API's real limits rather than trusting the model to count.
    const adCopy = (Array.isArray(json.adCopy) ? json.adCopy : [])
      .filter((a: unknown): a is AdCopySuggestion => {
        const c = a as AdCopySuggestion;
        return !!c && typeof c.title === "string" && typeof c.body === "string";
      })
      .map((a: AdCopySuggestion) => ({ title: a.title.slice(0, 50), body: a.body.slice(0, 100) }))
      .slice(0, 3);

    return {
      generated: true,
      contextHints: toStringArray(json.contextHints).slice(0, 20),
      exclusionHints: toStringArray(json.exclusionHints).slice(0, 10),
      adCopy,
      suggestedMaxBid:
        typeof json.suggestedMaxBid === "number" && Number.isFinite(json.suggestedMaxBid)
          ? json.suggestedMaxBid
          : undefined,
      rationale: typeof json.rationale === "string" ? json.rationale : undefined,
    };
  } catch (err) {
    return {
      generated: false,
      reason: err instanceof Error ? err.message : "AI suggestions failed.",
    };
  }
}

/** Models sometimes wrap JSON in prose or a fence. Pull the object out. */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}
