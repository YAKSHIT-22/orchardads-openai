import Anthropic from "@anthropic-ai/sdk";

/**
 * AI keyword-harvest engine. Given the converting search terms a campaign
 * already produced (performance data), the app's store metadata/localized
 * listings, and the keywords already targeted, it: (1) ranks each harvest
 * candidate by relevance + recommends a match type and bid, (2) proposes NEW
 * expansion keywords the reports can't surface (from the app's purpose/listing),
 * and (3) suggests negative keywords from wasteful terms. Falls back gracefully
 * ({ generated:false, reason }) when the key is missing or output is unusable.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export interface HarvestAiInput {
  currency: string;
  app: { appName?: string; primaryGenre?: string; secondaryGenre?: string; artistName?: string };
  locales: { language?: string; appName?: string; subTitle?: string; shortDescription?: string }[];
  /** Converting, not-yet-targeted terms found in the report. */
  candidates: { searchTerm: string; conversions: number; clicks: number; spend: number; cpa: number | null; suggestedBid: number }[];
  /** Spend-with-no-install terms → negative-keyword ideas. */
  wastefulTerms?: { searchTerm: string; clicks: number; spend: number }[];
  /** Keywords already targeted (so expansions don't duplicate). */
  existingKeywords?: string[];
}

export interface HarvestEnriched { searchTerm: string; matchType: "BROAD" | "EXACT"; bid: number; relevance: "high" | "medium" | "low"; reason: string }
export interface HarvestExpansion { text: string; matchType: "BROAD" | "EXACT"; bid: number; reason: string }
export interface HarvestNegative { text: string; matchType: "BROAD" | "EXACT"; reason: string }

export interface HarvestAiResult {
  generated: boolean;
  reason?: string;
  enriched?: HarvestEnriched[];
  expansions?: HarvestExpansion[];
  negatives?: HarvestNegative[];
  summary?: string;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildPrompt(input: HarvestAiInput): string {
  const locale = input.locales.slice(0, 4)
    .map((l) => `- ${l.language || "?"}: name="${l.appName || ""}", subtitle="${l.subTitle || ""}", desc="${(l.shortDescription || "").slice(0, 800)}"`)
    .join("\n");
  const cands = input.candidates.slice(0, 40)
    .map((c) => `- "${c.searchTerm}" — ${c.conversions} conversions, ${c.clicks} clicks, ${input.currency} ${c.spend.toFixed(2)} spend, CPA ${c.cpa != null ? c.cpa.toFixed(2) : "n/a"}`)
    .join("\n");
  const waste = (input.wastefulTerms || []).slice(0, 25)
    .map((w) => `- "${w.searchTerm}" — ${w.clicks} clicks, ${input.currency} ${w.spend.toFixed(2)} spend, 0 conversions`)
    .join("\n");
  const existing = (input.existingKeywords || []).slice(0, 200).join(", ") || "none";

  return `You are an Apple Search Ads keyword strategist. Improve this campaign's keyword coverage using ALL the signals below.

App:
- Name: ${input.app.appName || "Unknown"}
- Genre: ${input.app.primaryGenre || "?"}${input.app.secondaryGenre ? " / " + input.app.secondaryGenre : ""}
- Developer: ${input.app.artistName || "?"}

Localized store listings (real language users use):
${locale || "None available."}

Converting search terms not yet targeted as their own keyword (harvest candidates):
${cands || "None."}

Wasteful terms (spend, zero conversions) — candidates to BLOCK as negatives:
${waste || "None."}

Already-targeted keywords (do NOT propose these as new): ${existing}

Currency: ${input.currency} (all bids are numbers in this currency).

Return ONLY JSON (no prose) with this exact shape:
{
  "enriched": [ { "searchTerm": "<one of the harvest candidates above>", "matchType": "EXACT"|"BROAD", "bid": <number>, "relevance": "high"|"medium"|"low", "reason": "<short>" } ],
  "expansions": [ { "text": "<NEW keyword not in the lists>", "matchType": "EXACT"|"BROAD", "bid": <number>, "reason": "<short>" } ],
  "negatives": [ { "text": "<term/word to block>", "matchType": "EXACT"|"BROAD", "reason": "<short>" } ],
  "summary": "<2-3 sentence plain-language recommendation>"
}
Rules:
- "enriched": judge each harvest candidate by how relevant it is to THIS app; recommend EXACT for high-intent proven terms, BROAD only when useful; bid guided by its CPA/performance, > 0.
- "expansions": 8-20 genuinely new keyword ideas derived from the app's purpose + store listing that aren't already targeted and aren't in the candidate list. Real phrases a user would search, lowercase, deduplicated.
- "negatives": derive from the wasteful terms + obviously-irrelevant intents; never block the app's own brand.
- Keep all text lowercase and deduplicated. Every bid must be a positive number in ${input.currency}.`;
}

function extractJson(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

const clampBid = (b: any) => { const n = Number(b); return n > 0 ? Math.round(n * 100) / 100 : 0.1; };
const mt = (v: any): "BROAD" | "EXACT" => (v === "EXACT" ? "EXACT" : "BROAD");

function sanitize(raw: any, input: HarvestAiInput): HarvestAiResult {
  const candSet = new Set(input.candidates.map((c) => c.searchTerm.toLowerCase()));
  const existingSet = new Set((input.existingKeywords || []).map((k) => k.toLowerCase()));

  const enriched: HarvestEnriched[] = (Array.isArray(raw?.enriched) ? raw.enriched : [])
    .map((e: any) => ({
      searchTerm: String(e?.searchTerm || "").trim(),
      matchType: mt(e?.matchType), bid: clampBid(e?.bid),
      relevance: ["high", "medium", "low"].includes(e?.relevance) ? e.relevance : "medium",
      reason: String(e?.reason || "").slice(0, 160),
    }))
    .filter((e: HarvestEnriched) => e.searchTerm && candSet.has(e.searchTerm.toLowerCase()));

  const expSeen = new Set<string>();
  const expansions: HarvestExpansion[] = (Array.isArray(raw?.expansions) ? raw.expansions : [])
    .map((e: any) => ({ text: String(e?.text || "").trim().toLowerCase(), matchType: mt(e?.matchType), bid: clampBid(e?.bid), reason: String(e?.reason || "").slice(0, 160) }))
    .filter((e: HarvestExpansion) => {
      const k = `${e.text}|${e.matchType}`;
      if (!e.text || expSeen.has(k) || existingSet.has(e.text) || candSet.has(e.text)) return false;
      expSeen.add(k); return true;
    })
    .slice(0, 25);

  const negSeen = new Set<string>();
  const negatives: HarvestNegative[] = (Array.isArray(raw?.negatives) ? raw.negatives : [])
    .map((e: any) => ({ text: String(e?.text || "").trim().toLowerCase(), matchType: mt(e?.matchType), reason: String(e?.reason || "").slice(0, 160) }))
    .filter((e: HarvestNegative) => { const k = `${e.text}|${e.matchType}`; if (!e.text || negSeen.has(k)) return false; negSeen.add(k); return true; })
    .slice(0, 20);

  if (!enriched.length && !expansions.length && !negatives.length) {
    return { generated: false, reason: "The model didn't return usable suggestions." };
  }
  return { generated: true, enriched, expansions, negatives, summary: typeof raw?.summary === "string" ? raw.summary.slice(0, 500) : undefined };
}

export async function generateHarvestInsights(input: HarvestAiInput): Promise<HarvestAiResult> {
  if (!isAiConfigured()) return { generated: false, reason: "AI suggestions aren't configured." };
  if (!input.candidates.length && !(input.locales || []).length) {
    return { generated: false, reason: "Not enough data to enrich yet." };
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({ model: MODEL, max_tokens: 2500, messages: [{ role: "user", content: buildPrompt(input) }] });
    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const parsed = extractJson(text);
    if (!parsed) return { generated: false, reason: "The model didn't return usable suggestions." };
    return sanitize(parsed, input);
  } catch (err) {
    console.error("AI harvest error:", err);
    return { generated: false, reason: "Couldn't reach the suggestion service." };
  }
}
