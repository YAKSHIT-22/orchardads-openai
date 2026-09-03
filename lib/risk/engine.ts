import { fromMicros, percentChange } from "@/lib/openai/money";

/**
 * The risk engine.
 *
 * Nothing writes to a customer's live ad account without passing through here.
 * Its job is to answer three questions about a proposed change, deterministically
 * and before anything leaves our servers:
 *
 *   1. Is this action even permitted? (some are permanently forbidden)
 *   2. How much damage could it do if the reasoning behind it was wrong?
 *   3. Does a human have to approve it?
 *
 * DESIGN PRINCIPLE: the engine assumes the recommendation might be WRONG. Risk
 * is scored on blast radius — what happens if we apply this and the analysis was
 * mistaken — not on how confident the analysis feels. A 60% budget cut on the
 * account's biggest spender is high risk even when the evidence looks strong,
 * because being wrong is expensive and being right is merely useful.
 */

export type ActionType =
  | "UPDATE_CAMPAIGN_BUDGET"
  | "UPDATE_ADGROUP_BID"
  | "PAUSE_ENTITY"
  | "ACTIVATE_ENTITY"
  | "UPDATE_CONTEXT_HINTS"
  | "UPDATE_SPEND_LIMIT"
  // Permanently forbidden to automation. Present so the engine can reject them
  // by name rather than by omission.
  | "ARCHIVE_ENTITY"
  | "PAUSE_AD_ACCOUNT"
  | "ACTIVATE_AD_ACCOUNT";

export type RiskBand = "ADVISORY" | "LOW" | "MEDIUM" | "HIGH";

export type ProposedChange = {
  actionType: ActionType;
  entityType: "ACCOUNT" | "CAMPAIGN" | "ADGROUP" | "AD";
  entityId: string;
  entityName: string;
  /** Micros, for money changes. */
  currentValue?: number | null;
  proposedValue?: number | null;
  /** Human-readable justification, carried into the audit log. */
  reason: string;
  /** 0..1, gated on sample size upstream. Never fabricated. */
  confidence?: number | null;
};

export type AccountContext = {
  currency: string;
  /** Total account spend over the analysis window, micros. */
  windowSpendMicros: number;
  /** Conversions over the window — the sample size behind any CPA claim. */
  windowConversions: number;
  /** Actions already executed today, for the daily cap. */
  actionsToday: number;
  /** Hours since this exact entity+field was last changed by us. */
  hoursSinceLastChange?: number | null;
};

export type Guardrails = {
  maxIncreasePercent: number;
  maxDecreasePercent: number;
  maxDailyActions: number;
  /** Max share of account window spend one action may put at risk, 0..1. */
  maxAccountImpactShare: number;
  /** Conversions required before acting on a CPA/ROAS-shaped claim. */
  minConversions: number;
  /** Hours before the same entity+field may be changed again. */
  cooldownHours: number;
  /** Below this, a change is not worth an API call or a human's attention. */
  minSpendMicros: number;
};

/**
 * Defaults chosen to be boring. A tool that spends other people's money should
 * feel under-powered rather than clever on day one; every one of these is
 * configurable per automation rule.
 */
export const DEFAULT_GUARDRAILS: Guardrails = {
  maxIncreasePercent: 25,
  maxDecreasePercent: 35,
  maxDailyActions: 20,
  maxAccountImpactShare: 0.25,
  minConversions: 5,
  cooldownHours: 24,
  minSpendMicros: 5_000_000, // 5.00 in account currency
};

export type RiskAssessment = {
  allowed: boolean;
  band: RiskBand;
  approvalRequired: boolean;
  changePercent: number | null;
  /** Money this action puts at risk if the reasoning is wrong, micros. */
  exposureMicros: number;
  /** Every rule that fired, in the order evaluated. */
  reasons: string[];
  /** Hard blocks. Non-empty means `allowed` is false. */
  violations: string[];
  /** Non-blocking observations worth showing next to the Apply button. */
  warnings: string[];
};

/** Actions no rule, schedule, or agent may ever take. */
const FORBIDDEN_TO_AUTOMATION: ActionType[] = [
  // Documented as irreversible at campaign, ad group and ad level.
  "ARCHIVE_ENTITY",
  // Blast radius is the advertiser's entire business.
  "PAUSE_AD_ACCOUNT",
  "ACTIVATE_AD_ACCOUNT",
];

export function isForbiddenToAutomation(actionType: ActionType): boolean {
  return FORBIDDEN_TO_AUTOMATION.includes(actionType);
}

/**
 * Assess one proposed change.
 *
 * `automated` distinguishes a scheduled rule from a human clicking Apply. A
 * human may archive after an explicit confirmation; automation never may.
 */
export function assess(
  change: ProposedChange,
  context: AccountContext,
  guardrails: Guardrails = DEFAULT_GUARDRAILS,
  { automated = false }: { automated?: boolean } = {}
): RiskAssessment {
  const reasons: string[] = [];
  const violations: string[] = [];
  const warnings: string[] = [];

  // ── Hard blocks ───────────────────────────────────────────────────────────

  if (automated && isForbiddenToAutomation(change.actionType)) {
    violations.push(
      change.actionType === "ARCHIVE_ENTITY"
        ? "Archiving is irreversible and is never performed automatically."
        : "Account-level pause/activate stops or starts everything the advertiser is running, and is never performed automatically."
    );
  }

  if (automated && context.actionsToday >= guardrails.maxDailyActions) {
    violations.push(
      `Daily action limit reached (${guardrails.maxDailyActions}). Remaining changes are held until tomorrow.`
    );
  }

  if (
    automated &&
    guardrails.cooldownHours > 0 &&
    context.hoursSinceLastChange != null &&
    context.hoursSinceLastChange < guardrails.cooldownHours
  ) {
    violations.push(
      `Changed ${Math.round(context.hoursSinceLastChange)}h ago; cooldown is ${guardrails.cooldownHours}h. Repeated edits make the result impossible to attribute.`
    );
  }

  // ── Magnitude ─────────────────────────────────────────────────────────────

  const isMoneyChange =
    change.currentValue != null && change.proposedValue != null && change.currentValue > 0;

  const changePercent = isMoneyChange
    ? percentChange(BigInt(Math.round(change.currentValue!)), BigInt(Math.round(change.proposedValue!)))
    : null;

  if (changePercent != null) {
    const magnitude = Math.abs(changePercent);
    const isIncrease = changePercent > 0;
    const cap = isIncrease ? guardrails.maxIncreasePercent : guardrails.maxDecreasePercent;

    if (magnitude > cap) {
      const verdict = `${isIncrease ? "Increase" : "Decrease"} of ${magnitude.toFixed(1)}% exceeds the ${cap}% guardrail.`;
      if (automated) violations.push(verdict);
      else warnings.push(`${verdict} It needs your explicit approval.`);
    }
    reasons.push(`${isIncrease ? "+" : ""}${changePercent.toFixed(1)}% change.`);
  }

  // ── Exposure ──────────────────────────────────────────────────────────────
  //
  // For a budget change, exposure is the size of the swing. For a pause it is
  // the whole current value, because pausing forfeits all of it.

  const exposureMicros =
    change.actionType === "PAUSE_ENTITY"
      ? Math.round(change.currentValue ?? 0)
      : isMoneyChange
        ? Math.abs(Math.round(change.proposedValue! - change.currentValue!))
        : 0;

  const impactShare =
    context.windowSpendMicros > 0 ? exposureMicros / context.windowSpendMicros : 0;

  if (impactShare > guardrails.maxAccountImpactShare) {
    const verdict = `This affects ${(impactShare * 100).toFixed(0)}% of account spend in the analysis window, above the ${(
      guardrails.maxAccountImpactShare * 100
    ).toFixed(0)}% cap.`;
    if (automated) violations.push(verdict);
    else warnings.push(verdict);
  }

  // ── Evidence quality ──────────────────────────────────────────────────────
  //
  // At $3-5 CPCs a small advertiser produces a handful of conversions a month.
  // Acting on a CPA comparison drawn from three conversions is noise dressed as
  // insight, so the engine says so rather than hiding it behind a confidence bar.

  if (context.windowConversions < guardrails.minConversions) {
    const note = `Only ${context.windowConversions} conversion${
      context.windowConversions === 1 ? "" : "s"
    } in the window — below the ${guardrails.minConversions} needed for a reliable CPA read.`;
    if (automated) violations.push(note);
    else warnings.push(note);
  }

  if (change.confidence != null && change.confidence < 0.5) {
    warnings.push("Low confidence: the evidence is suggestive, not conclusive.");
  }

  // ── Triviality ────────────────────────────────────────────────────────────

  if (isMoneyChange && Math.abs(exposureMicros) < guardrails.minSpendMicros) {
    warnings.push(
      `The change is only ${fromMicros(exposureMicros).toFixed(2)} — probably not worth the disruption.`
    );
  }

  // ── Band ──────────────────────────────────────────────────────────────────

  const band = scoreBand(change, changePercent, impactShare);
  reasons.push(`Risk band: ${band}.`);

  // Approval policy. ADVISORY means there is nothing to execute — it is a
  // diagnosis handed to a human, so approval is meaningless.
  const approvalRequired =
    band !== "ADVISORY" && (band !== "LOW" || !automated || warnings.length > 0 || violations.length > 0);

  return {
    allowed: violations.length === 0,
    band,
    approvalRequired,
    changePercent,
    exposureMicros,
    reasons,
    violations,
    warnings,
  };
}

function scoreBand(
  change: ProposedChange,
  changePercent: number | null,
  impactShare: number
): RiskBand {
  // Nothing to execute.
  if (change.actionType === "UPDATE_CONTEXT_HINTS" && change.currentValue == null) return "ADVISORY";

  // Structural blast radius, independent of magnitude.
  if (
    change.actionType === "ARCHIVE_ENTITY" ||
    change.actionType === "PAUSE_AD_ACCOUNT" ||
    change.actionType === "ACTIVATE_AD_ACCOUNT"
  ) {
    return "HIGH";
  }

  // Pausing a campaign forfeits all of its delivery; pausing one ad does not.
  if (change.actionType === "PAUSE_ENTITY") {
    if (change.entityType === "CAMPAIGN") return "HIGH";
    if (change.entityType === "ADGROUP") return "MEDIUM";
    return "LOW";
  }

  // A spend-limit change gates the whole account's ability to spend.
  if (change.actionType === "UPDATE_SPEND_LIMIT") return "HIGH";

  const magnitude = changePercent == null ? 0 : Math.abs(changePercent);

  if (impactShare > 0.25 || magnitude > 50) return "HIGH";
  if (impactShare > 0.1 || magnitude > 20) return "MEDIUM";
  if (magnitude > 0) return "LOW";
  return "ADVISORY";
}

/**
 * A compact, human-readable summary of the assessment for the approval card.
 * The point is that a person can decide in five seconds without opening JSON.
 */
export function explain(
  change: ProposedChange,
  assessment: RiskAssessment,
  currency: string
): string {
  const parts: string[] = [];

  if (change.currentValue != null && change.proposedValue != null) {
    parts.push(
      `${label(change.actionType)} on ${change.entityName}: ${money(change.currentValue, currency)} to ${money(
        change.proposedValue,
        currency
      )}${assessment.changePercent != null ? ` (${assessment.changePercent > 0 ? "+" : ""}${assessment.changePercent.toFixed(1)}%)` : ""}.`
    );
  } else {
    parts.push(`${label(change.actionType)} on ${change.entityName}.`);
  }

  parts.push(change.reason);

  if (assessment.exposureMicros > 0) {
    parts.push(`At stake if this is wrong: ${money(assessment.exposureMicros, currency)}.`);
  }
  if (assessment.warnings.length) parts.push(assessment.warnings.join(" "));
  if (assessment.violations.length) parts.push(`Blocked: ${assessment.violations.join(" ")}`);

  return parts.join(" ");
}

function label(actionType: ActionType): string {
  const labels: Record<ActionType, string> = {
    UPDATE_CAMPAIGN_BUDGET: "Budget change",
    UPDATE_ADGROUP_BID: "Bid change",
    PAUSE_ENTITY: "Pause",
    ACTIVATE_ENTITY: "Activate",
    UPDATE_CONTEXT_HINTS: "Context hints update",
    UPDATE_SPEND_LIMIT: "Spend limit change",
    ARCHIVE_ENTITY: "Archive",
    PAUSE_AD_ACCOUNT: "Pause ad account",
    ACTIVATE_AD_ACCOUNT: "Activate ad account",
  };
  return labels[actionType];
}

function money(micros: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(fromMicros(micros));
  } catch {
    return `${currency} ${fromMicros(micros).toFixed(2)}`;
  }
}
