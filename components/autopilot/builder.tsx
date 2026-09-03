"use client";

/**
 * Autopilot strategy builder — a four-step flow: scope & basics, rules,
 * live preview (a real run against your performance data), then automation & save.
 * Scope is immutable once a strategy is saved; everything else is editable.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { adAccountStore } from "@/stores/adAccountStore";
import { STRATEGY_TEMPLATES } from "@/lib/autopilot/templates";
import type { ActionType, StrategyScope, Suggestion } from "@/lib/autopilot/types";
import {
  type StrategyRow, type StrategyForm, type RuleForm, type CondForm,
  defaultForm, emptyRule, emptyCondition, toApiRules, fromApiRules, ruleFormSentence,
  ALERT_METRICS, metricDef, OPERATORS, ACTION_META, scopeDef,
} from "@/components/autopilot/shared";
import { SuggestionsPanel } from "@/components/autopilot/suggestions";
import { SCOPES } from "@/lib/autopilot/scopes";
import { useCampaignList } from "@/components/optimize/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, Lock, Plus, Save,
  ShieldAlert, Sparkles, Trash2, TriangleAlert, X, Zap,
} from "lucide-react";

const STEPS = ["Scope & basics", "Rules", "Preview", "Automate & save"] as const;
export const AUTOMATION_STEP = 3;

function Field({
  label,
  hint,
  info,
  children,
  className,
}: {
  label: string;
  hint?: string;
  info?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      <Label className="text-xs font-medium text-muted-foreground flex flex-wrap items-center gap-1">
        {label}
        {info && <InfoHint className="shrink-0">{info}</InfoHint>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

/** Suffix shown inside a condition-value input, per metric unit. */
function valueSuffix(metric: string, currency: string): string {
  const unit = metricDef(metric)?.unit;
  if (unit === "rate") return "%";
  if (unit === "money") return currency || "USD";
  return "#";
}

function formFromStrategy(s: StrategyRow): StrategyForm {
  return {
    name: s.name,
    description: s.description || "",
    scope: s.scope,
    lookbackDays: String(s.lookbackDays ?? 30),
    campaignIds: Array.isArray(s.campaignIds) ? s.campaignIds.map(String) : [],
    rules: fromApiRules(s.rules, s.scope),
    automated: s.automated,
    frequency: s.frequency || "WEEKLY",
    autoApply: s.autoApply,
    notifyEmail: s.notifyEmail,
  };
}

/** First invalid-rule message, or null when all rules are complete. */
function rulesError(rules: RuleForm[]): string | null {
  if (rules.length === 0) return "Add at least one rule";
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.conditions.length === 0) return `Rule ${i + 1} needs at least one condition`;
    for (const c of r.conditions) {
      if (c.value.trim() === "" || Number.isNaN(Number(c.value))) return `Rule ${i + 1}: enter a value for every condition`;
      if (c.operator === "BETWEEN" && (c.value2.trim() === "" || Number.isNaN(Number(c.value2)))) {
        return `Rule ${i + 1}: “between” needs both bounds`;
      }
    }
    if (ACTION_META[r.actionType]?.needsAmount) {
      if (r.amount.trim() === "" || Number.isNaN(Number(r.amount))) return `Rule ${i + 1}: this action needs an amount`;
      if (r.actionType.startsWith("SET_") && Number(r.amount) <= 0) return `Rule ${i + 1}: the amount must be above zero`;
    }
  }
  return null;
}

export function StrategyBuilder({
  editing,
  initialStep = 0,
  onClose,
  onSaved,
}: {
  editing: StrategyRow | null;
  initialStep?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { adAccountId, currency, connections, selectedIndex } = adAccountStore();
  const adAccountName = connections[selectedIndex]?.adAccountName || "";
  const { campaigns } = useCampaignList();

  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));
  const [form, setForm] = useState<StrategyForm>(() => (editing ? formFromStrategy(editing) : defaultForm()));
  const [preview, setPreview] = useState<Suggestion[] | null>(null);

  const set = <K extends keyof StrategyForm>(key: K, value: StrategyForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const currentScope = scopeDef(form.scope);
  const templates = useMemo(
    () => (editing ? STRATEGY_TEMPLATES.filter((t) => t.scope === editing.scope) : STRATEGY_TEMPLATES),
    [editing]
  );

  /* ── Mutations ── */

  const changeScope = (scope: StrategyScope) => {
    if (editing) return;
    const allowed = scopeDef(scope)?.actions || ["NOTIFY"];
    setForm((f) => ({
      ...f,
      scope,
      rules: f.rules.map((r) =>
        allowed.includes(r.actionType) ? r : { ...r, actionType: allowed[0], amount: "", minValue: "", maxValue: "" }
      ),
    }));
    setPreview(null);
  };

  const applyTemplate = (id: string) => {
    const t = STRATEGY_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setForm((f) => ({
      ...f,
      scope: editing ? f.scope : t.scope,
      lookbackDays: String(t.lookbackDays),
      rules: fromApiRules(t.rules, t.scope),
      name: f.name.trim() ? f.name : t.name,
      description: f.description.trim() ? f.description : t.description,
    }));
    setPreview(null);
    toast.success(`Loaded “${t.name}” — tweak anything before saving`);
  };

  const updateRule = (i: number, patch: Partial<RuleForm>) =>
    setForm((f) => ({ ...f, rules: f.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));

  const updateCondition = (ri: number, ci: number, patch: Partial<CondForm>) =>
    setForm((f) => ({
      ...f,
      rules: f.rules.map((r, idx) =>
        idx === ri ? { ...r, conditions: r.conditions.map((c, cidx) => (cidx === ci ? { ...c, ...patch } : c)) } : r
      ),
    }));

  const setActionType = (i: number, type: ActionType) => {
    const meta = ACTION_META[type];
    updateRule(i, { actionType: type, ...(meta?.needsAmount ? {} : { amount: "", minValue: "", maxValue: "" }) });
  };

  /* ── Step validation ── */

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!form.name.trim()) return "Give the strategy a name";
      const d = Number(form.lookbackDays);
      if (form.lookbackDays.trim() === "" || Number.isNaN(d) || d < 1 || d > 90) return "Lookback must be 1–90 days";
      return null;
    }
    if (s === 1) return rulesError(form.rules);
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) return void toast.error(err);
    // Entering the Preview step from Rules → drop any stale preview so the
    // auto-run picks up the latest scope/rules.
    if (step === 1) setPreview(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  /* ── Preview (real run, unsaved strategy) ── */

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/autopilot/run", {
        adAccountId,
        strategy: {
          scope: form.scope,
          lookbackDays: Number(form.lookbackDays) || 30,
          campaignIds: form.campaignIds,
          rules: toApiRules(form.rules),
        },
      });
      return (res.data?.suggestions || []) as Suggestion[];
    },
    onSuccess: (data) => {
      setPreview(data);
      if (data.length === 0) toast.info("No matches right now — the strategy is still worth saving");
    },
    onError: (err) => adsErrorToast(err, "Couldn't preview the strategy"),
  });

  const runPreview = () => {
    const err = validateStep(0) || validateStep(1);
    if (err) return void toast.error(err);
    previewMutation.mutate();
  };

  // Auto-run the preview on arriving at the Preview step so results show without
  // a manual click. Steps 0-1 are already validated by "Next", so this is safe;
  // the user can still Re-run after tweaking. `preview` is cleared when scope or
  // rules change, so returning to this step re-fetches.
  useEffect(() => {
    if (step === 2 && adAccountId && !preview && !previewMutation.isPending && !validateStep(0) && !validateStep(1)) {
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, adAccountId]);

  /* ── Save ── */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        lookbackDays: Number(form.lookbackDays) || 30,
        campaignIds: form.campaignIds,
        rules: toApiRules(form.rules),
        automated: form.automated,
        frequency: form.frequency,
        autoApply: form.automated && form.autoApply,
        notifyEmail: form.automated && form.notifyEmail,
      };
      if (editing) {
        await api.post("/autopilot/mutate", { id: editing.id, action: "edit", patch: payload });
      } else {
        await api.post("/autopilot", { adAccountId, adAccountName, scope: form.scope, ...payload });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Strategy updated" : "Strategy saved");
      onSaved();
    },
    onError: (err) => adsErrorToast(err, "Couldn't save the strategy"),
  });

  const submit = () => {
    const err = validateStep(0) || validateStep(1);
    if (err) return void toast.error(err);
    if (!adAccountId) return void toast.error("Select an organization first");
    saveMutation.mutate();
  };

  /* ── Render ── */

  return (
    <div className="flex flex-col gap-4">
      <Card className="border rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">
                {editing ? `Edit strategy — ${editing.name}` : "New strategy"}
              </CardTitle>
              {/* Stepper */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {STEPS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (i <= step) return void setStep(i);
                      const err = validateStep(0) || (i > 1 ? validateStep(1) : null);
                      if (err) return void toast.error(err);
                      setStep(i);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      i === step
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:border-primary/30"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded-full text-[9px] flex items-center justify-center",
                        i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {i + 1}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="Close builder">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {/* ── Step 1: scope & basics ── */}
          {step === 0 && (
            <>
              {templates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Start from a template:
                  </span>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t.id)}
                      title={t.description}
                      className="px-2 py-0.5 rounded-full border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Pause wasteful keywords"
                    className="h-8 text-sm"
                  />
                </Field>
                <Field label="Description (optional)">
                  <Input
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="What this strategy is for"
                    className="h-8 text-sm"
                  />
                </Field>
              </div>

              <Field
                label="Scope"
                hint={editing ? undefined : "What the rules are evaluated against — each rule action applies at this level."}
                info="The level your rules look at: every campaign, ad group, ad, keyword or country row is checked one by one, and actions apply to the rows that match. Locked after the strategy is saved."
              >
                {editing && (
                  <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1 -mt-0.5">
                    <Lock className="w-3 h-3" /> Scope is locked once a strategy is saved.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {SCOPES.map((s) => {
                    const active = form.scope === s.key;
                    const locked = !!editing && !active;
                    return (
                      <button
                        key={s.key}
                        onClick={() => changeScope(s.key)}
                        disabled={locked}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors",
                          active ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/30",
                          locked && "opacity-40 cursor-not-allowed hover:border-border"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "w-3.5 h-3.5 rounded-full border-2 shrink-0",
                              active ? "border-primary bg-primary" : "border-muted-foreground/40"
                            )}
                          />
                          <span className="text-sm font-medium">{s.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{s.description}</p>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Lookback (days)"
                  hint="Reporting window the conditions are checked over (1–90)."
                  info="How many days of performance data each run evaluates. Longer windows are steadier; shorter ones react faster."
                >
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={form.lookbackDays}
                    onChange={(e) => set("lookbackDays", e.target.value)}
                    className="h-8 text-sm"
                  />
                </Field>
                <Field
                  label="Campaign filter (optional)"
                  hint={
                    currentScope?.fanOut === "account"
                      ? "Limit which campaigns are evaluated. Empty = all campaigns."
                      : `Limit which campaigns' ${currentScope?.entity || "rows"} are evaluated. Empty = all campaigns.`
                  }
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-8 text-sm justify-between font-normal">
                        {form.campaignIds.length === 0
                          ? "All campaigns"
                          : `${form.campaignIds.length} campaign${form.campaignIds.length === 1 ? "" : "s"} selected`}
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 max-h-64 overflow-y-auto">
                      {campaigns.length === 0 ? (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">No campaigns found</div>
                      ) : (
                        campaigns.map((c) => (
                          <DropdownMenuCheckboxItem
                            key={c.id}
                            checked={form.campaignIds.includes(c.id)}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={(checked) =>
                              set(
                                "campaignIds",
                                checked ? [...form.campaignIds, c.id] : form.campaignIds.filter((id) => id !== c.id)
                              )
                            }
                          >
                            <span className="truncate">{c.name}</span>
                          </DropdownMenuCheckboxItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Field>
              </div>
            </>
          )}

          {/* ── Step 2: rules ── */}
          {step === 1 && (
            <>
              {form.rules.map((rule, ri) => {
                const allowedActions = currentScope?.actions || ["NOTIFY"];
                const meta = ACTION_META[rule.actionType];
                const adjust = rule.actionType === "ADJUST_BID" || rule.actionType === "ADJUST_BUDGET";
                const bidOrBudget = meta?.kind === "bid" || meta?.kind === "budget";
                return (
                  <div key={ri} className="rounded-xl border p-4 flex flex-col gap-3.5 bg-muted/20">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0 basis-40">
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">Rule {ri + 1}</span>
                        <Input
                          value={rule.name}
                          onChange={(e) => updateRule(ri, { name: e.target.value })}
                          placeholder="Rule name (optional)"
                          className="h-7 text-xs w-full min-w-0 max-w-[220px]"
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* ALL / ANY toggle */}
                        <InfoHint side="left">
                          Match all: a row must satisfy every condition (AND). Match any: satisfying a single condition is enough (OR).
                        </InfoHint>
                        <div className="inline-flex rounded-lg border bg-background p-0.5">
                          {(["ALL", "ANY"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => updateRule(ri, { match: m })}
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
                                rule.match === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                              )}
                              title={m === "ALL" ? "Every condition must match" : "Any one condition matching is enough"}
                            >
                              {m === "ALL" ? "Match all" : "Match any"}
                            </button>
                          ))}
                        </div>
                        {form.rules.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                            title="Remove rule"
                            onClick={() => setForm((f) => ({ ...f, rules: f.rules.filter((_, i) => i !== ri) }))}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Conditions */}
                    <div className="flex flex-col gap-2">
                      {rule.conditions.map((c, ci) => {
                        const unit = metricDef(c.metric)?.unit;
                        return (
                          <div key={ci} className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-muted-foreground w-8 shrink-0">
                              {ci === 0 ? "If" : rule.match === "ANY" ? "or" : "and"}
                            </span>
                            <Select value={c.metric} onValueChange={(v) => updateCondition(ri, ci, { metric: v as CondForm["metric"], value: "", value2: "" })}>
                              <SelectTrigger className="h-8 text-sm w-[190px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALERT_METRICS.map((m) => (
                                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={c.operator} onValueChange={(v) => updateCondition(ri, ci, { operator: v as CondForm["operator"] })}>
                              <SelectTrigger className="h-8 text-sm w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {OPERATORS.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="relative">
                              <Input
                                type="number"
                                step="any"
                                min={0}
                                value={c.value}
                                onChange={(e) => updateCondition(ri, ci, { value: e.target.value })}
                                placeholder="0"
                                className="h-8 text-sm w-28 pr-11"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                                {valueSuffix(c.metric, currency)}
                              </span>
                            </div>
                            {c.operator === "BETWEEN" && (
                              <>
                                <span className="text-[11px] text-muted-foreground">and</span>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={c.value2}
                                    onChange={(e) => updateCondition(ri, ci, { value2: e.target.value })}
                                    placeholder="0"
                                    className="h-8 text-sm w-28 pr-11"
                                  />
                                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                                    {valueSuffix(c.metric, currency)}
                                  </span>
                                </div>
                              </>
                            )}
                            {unit === "rate" && (
                              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                <Info className="w-3 h-3" /> enter a percent — 2.5 means 2.5%
                              </span>
                            )}
                            {rule.conditions.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                title="Remove condition"
                                onClick={() =>
                                  updateRule(ri, { conditions: rule.conditions.filter((_, i) => i !== ci) })
                                }
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        onClick={() => updateRule(ri, { conditions: [...rule.conditions, emptyCondition()] })}
                        className="self-start text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add condition
                      </button>
                    </div>

                    {/* Action */}
                    <div className="border-t pt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-muted-foreground min-w-8 shrink-0 inline-flex items-center gap-1">
                        Then
                        <InfoHint>
                          What happens to each matching row. Notify just records it; Pause pauses it in your live account; Set bid/budget replaces the value; Adjust bid/budget changes it by a percent (negative lowers, positive raises).
                        </InfoHint>
                      </span>
                      <Select value={rule.actionType} onValueChange={(v) => setActionType(ri, v as ActionType)}>
                        <SelectTrigger className="h-8 text-sm w-[210px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedActions.map((a) => (
                            <SelectItem key={a} value={a}>{ACTION_META[a]?.label || a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {meta?.needsAmount && (
                        <div className="relative">
                          <Input
                            type="number"
                            step="any"
                            value={rule.amount}
                            onChange={(e) => updateRule(ri, { amount: e.target.value })}
                            placeholder={adjust ? "-20" : "1.00"}
                            className="h-8 text-sm w-28 pr-11"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                            {adjust ? "%" : currency || "USD"}
                          </span>
                        </div>
                      )}
                      {adjust && (
                        <span className="text-[10px] text-muted-foreground">negative lowers, positive raises</span>
                      )}
                      {bidOrBudget && (
                        <>
                          <span className="text-[11px] text-muted-foreground ml-1 inline-flex items-center gap-1">
                            clamp
                            <InfoHint>
                              Safety bounds. The resulting bid or budget will never go below the min or above the max, no matter what the rule computes. Leave blank for no bound.
                            </InfoHint>
                          </span>
                          <div className="relative">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={rule.minValue}
                              onChange={(e) => updateRule(ri, { minValue: e.target.value })}
                              placeholder="min"
                              className="h-8 text-sm w-24 pr-11"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                              {currency || "USD"}
                            </span>
                          </div>
                          <div className="relative">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={rule.maxValue}
                              onChange={(e) => updateRule(ri, { maxValue: e.target.value })}
                              placeholder="max"
                              className="h-8 text-sm w-24 pr-11"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                              {currency || "USD"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Live sentence */}
                    <p className="text-xs text-muted-foreground bg-background border rounded-lg px-3 py-2 leading-snug">
                      {ruleFormSentence(rule, currency)}
                    </p>
                  </div>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                className="self-start gap-1.5"
                onClick={() => setForm((f) => ({ ...f, rules: [...f.rules, emptyRule(f.scope)] }))}
              >
                <Plus className="w-3.5 h-3.5" /> Add rule
              </Button>
            </>
          )}

          {/* ── Step 3: preview ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground max-w-lg">
                  These are the exact changes your rules would make, evaluated against your live performance data —
                  nothing is applied unless you choose to. It runs automatically; re-run after any edits.
                </p>
                <Button onClick={runPreview} disabled={!adAccountId || previewMutation.isPending} className="gap-1.5 shrink-0">
                  {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {preview ? "Re-run preview" : "Preview changes"}
                </Button>
              </div>
              {previewMutation.isPending && (
                <div className="rounded-xl border py-14 flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm">Reading your performance data and evaluating your rules…</p>
                </div>
              )}
              {!previewMutation.isPending && preview && (
                <SuggestionsPanel suggestions={preview} adAccountId={adAccountId} strategyName={form.name || "preview"} />
              )}
              {!previewMutation.isPending && !preview && (
                <div className="rounded-xl border border-dashed py-14 flex flex-col items-center gap-2 text-muted-foreground">
                  <Sparkles className="w-5 h-5" />
                  <p className="text-sm">No preview yet — run one, or skip straight to saving.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: automation & save ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4 max-w-2xl">
              <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Automate this strategy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Run it on a schedule instead of only on demand.
                  </p>
                </div>
                <Switch checked={form.automated} onCheckedChange={(v) => set("automated", v)} />
              </div>

              {form.automated && (
                <>
                  <Field
                    label="Frequency"
                    className="max-w-[220px]"
                    info="How often the scheduled run evaluates your rules against fresh performance data."
                  >
                    <Select value={form.frequency} onValueChange={(v) => set("frequency", v as StrategyForm["frequency"])}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">Daily</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Email me the results</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        A digest of what matched (and what was changed) after every scheduled run.
                      </p>
                    </div>
                    <Switch checked={form.notifyEmail} onCheckedChange={(v) => set("notifyEmail", v)} />
                  </div>

                  <div
                    className={cn(
                      "rounded-xl border p-4 flex items-center justify-between gap-4",
                      form.autoApply && "border-amber-500/40 bg-amber-500/5"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium inline-flex items-center gap-1.5">
                        <ShieldAlert className={cn("w-4 h-4", form.autoApply ? "text-amber-600" : "text-muted-foreground")} />
                        Auto-apply changes
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                        Autopilot will apply these changes to your live account without asking. Off = you review first.
                      </p>
                    </div>
                    <Switch checked={form.autoApply} onCheckedChange={(v) => set("autoApply", v)} />
                  </div>
                  {form.autoApply && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-start gap-1.5 -mt-2">
                      <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                      Every scheduled run will pause, re-bid or re-budget matching entities automatically. Clamps on
                      your rules still apply.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            >
              {step === 0 ? "Cancel" : (<><ChevronLeft className="w-4 h-4" /> Back</>)}
            </Button>
            <div className="flex items-center gap-2">
              {step < STEPS.length - 1 ? (
                <Button onClick={goNext} className="gap-1.5">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={submit} disabled={saveMutation.isPending} className="gap-1.5">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? "Save changes" : "Save strategy"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
