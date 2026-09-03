"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CircleAlert, Info, Loader2, Search, X } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { CampaignStepper } from "@/components/user/CampaignStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ACCOUNT_LIMITS, BIDDING_TYPES } from "@/utils/variableConstant";
import type { GeoLocationResult } from "@/types/geoDetails";

/**
 * Create a campaign.
 *
 * This form is deliberately small, and that is the API being honest rather than
 * the form being unfinished. An OpenAI Ads campaign is:
 * a name, a status, a lifetime budget, an optional schedule, a bidding type, and
 * optional location/audience targeting. There is no app, no channel, no supply
 * source, no keyword list, and no per-country budget.
 *
 * Two rules the form enforces loudly, because the API cannot undo either:
 *
 *  - `bidding_type` is IMMUTABLE after creation. Choosing wrong means deleting
 *    the campaign and starting over, so the choice is a deliberate step with the
 *    consequence stated, not a dropdown buried in an "advanced" panel.
 *  - The lifetime budget is what actually stops delivery. When it is spent, the
 *    campaign goes dark — there is no daily-budget safety net unless you set one.
 */

const STEPS = ["Basics", "Budget & schedule", "Targeting", "Review"];

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(ACCOUNT_LIMITS.nameMin, `At least ${ACCOUNT_LIMITS.nameMin} characters`)
      .max(ACCOUNT_LIMITS.nameMax)
      .refine((v) => /\S/.test(v), "Name must contain a non-space character"),
    description: z.string().trim().max(1000).optional(),
    status: z.enum(["active", "paused"]),
    biddingType: z.enum(["impressions", "clicks", "conversions"]),
    conversionEventSettingId: z.string().optional(),
    lifetimeBudget: z.coerce.number().min(1, "Lifetime budget must be at least 1.00"),
    dailyBudget: z.coerce.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (v) => v.biddingType !== "conversions" || !!v.conversionEventSettingId,
    { message: "Pick the conversion event this campaign should optimize for", path: ["conversionEventSettingId"] }
  )
  .refine((v) => !v.dailyBudget || v.dailyBudget <= v.lifetimeBudget, {
    message: "Daily budget can't exceed the lifetime budget",
    path: ["dailyBudget"],
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  });

type FormValues = z.infer<typeof schema>;

const toUnix = (date?: string) => (date ? Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) : undefined);

export default function CreateCampaignPage() {
  const router = useRouter();
  const { adAccountId, currency } = adAccountStore();

  const [step, setStep] = useState(0);
  const [locations, setLocations] = useState<GeoLocationResult[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: "paused", // safest default: nothing spends until the user says so
      biddingType: "clicks",
      lifetimeBudget: 100,
    },
  });

  const values = watch();

  // Conversion event settings are only needed for oCPC. Fetched lazily so an
  // account without conversion setup doesn't pay for the call.
  const eventSettings = useQuery({
    queryKey: ["conversion-event-settings", adAccountId],
    enabled: !!adAccountId && values.biddingType === "conversions",
    queryFn: async () => {
      const res = await api.post("/conversions/event-settings", { adAccountId });
      return (res.data?.data ?? []) as { id: string; name: string; event_type: string; archived: boolean }[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (form: FormValues) => {
      const res = await api.post("/campaign/createcampaign", {
        adAccountId,
        name: form.name,
        ...(form.description ? { description: form.description } : {}),
        status: form.status,
        bidding_type: form.biddingType,
        ...(form.biddingType === "conversions" && form.conversionEventSettingId
          ? { conversion_event_setting_ids: [form.conversionEventSettingId] }
          : {}),
        budget: {
          lifetime_spend_limit_micros: Math.round(form.lifetimeBudget * 1_000_000),
          ...(form.dailyBudget
            ? { daily_spend_limit_micros: Math.round(form.dailyBudget * 1_000_000) }
            : {}),
        },
        ...(toUnix(form.startDate) ? { start_time: toUnix(form.startDate) } : {}),
        ...(toUnix(form.endDate) ? { end_time: toUnix(form.endDate) } : {}),
        ...(locations.length
          ? { targeting: { locations: { include: locations.map((l) => ({ id: l.id })) } } }
          : {}),
      });
      return res.data.campaign as { id: string; name: string };
    },
    onSuccess: (campaign) => {
      toast.success("Campaign created", {
        description: "Add an ad group and at least one ad before it can deliver.",
      });
      router.push(`/tools/campaign/editCampaign?id=${campaign.id}`);
    },
    onError: (err) => adsErrorToast(err, "Couldn't create the campaign"),
  });

  const next = async () => {
    const fields: Record<number, (keyof FormValues)[]> = {
      0: ["name", "biddingType", "conversionEventSettingId"],
      1: ["lifetimeBudget", "dailyBudget", "startDate", "endDate"],
      2: [],
    };
    const ok = await trigger(fields[step] ?? []);
    if (ok) setStep((s) => s + 1);
  };

  if (!adAccountId) {
    return (
      <div className="p-16 text-center">
        <p className="text-sm text-muted-foreground">Connect an ad account first.</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">New campaign</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Creates the campaign only. You&apos;ll add an ad group and ads next — all three must
            exist and be active before anything can serve.
          </p>
        </header>

        <div className="bg-card border border-border rounded-xl p-6">
          <CampaignStepper steps={STEPS} current={step} onStepClick={(i) => setStep(i)} />

          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-5">
            {/* ── Step 1: Basics ── */}
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <Field label="Campaign name" error={errors.name?.message}>
                  <Input
                    {...register("name")}
                    placeholder="e.g. Spring launch — US"
                    className="rounded-lg"
                  />
                </Field>

                <Field label="Description" hint="Optional. Only you see this.">
                  <Textarea
                    {...register("description")}
                    rows={2}
                    placeholder="What this campaign is for"
                    className="rounded-lg"
                  />
                </Field>

                <Field
                  label="What are you paying for?"
                  error={errors.biddingType?.message}
                  hint="This cannot be changed later. To switch, you'd have to rebuild the campaign."
                >
                  <div className="grid gap-2">
                    {BIDDING_TYPES.map((b) => (
                      <label
                        key={b.value}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          values.biddingType === b.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          value={b.value}
                          {...register("biddingType")}
                          className="mt-1 accent-[var(--primary)]"
                        />
                        <span>
                          <span className="text-sm font-medium text-foreground block">{b.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {b.value === "impressions"
                              ? "Pay per 1,000 impressions. Best for reach and awareness."
                              : b.value === "clicks"
                                ? "Pay per click. The safe default for traffic and most first campaigns."
                                : "Pay per click, optimized toward a conversion event. Needs working conversion tracking and account enablement."}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>

                {values.biddingType === "conversions" && (
                  <Field
                    label="Conversion event to optimize for"
                    error={errors.conversionEventSettingId?.message}
                    hint="Exactly one active standard event setting. This also can't be changed later."
                  >
                    {eventSettings.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading event settings…</p>
                    ) : (eventSettings.data ?? []).filter((s) => !s.archived).length === 0 ? (
                      <Callout tone="warning">
                        This ad account has no active conversion event settings, so a
                        conversion-optimized campaign can&apos;t be created yet. Set up a pixel and
                        an event in Ads Manager first — or choose click bidding for now.
                      </Callout>
                    ) : (
                      <select
                        {...register("conversionEventSettingId")}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        <option value="">Select an event…</option>
                        {(eventSettings.data ?? [])
                          .filter((s) => !s.archived)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.event_type})
                            </option>
                          ))}
                      </select>
                    )}
                  </Field>
                )}
              </div>
            )}

            {/* ── Step 2: Budget & schedule ── */}
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <Field
                  label={`Lifetime budget (${currency})`}
                  error={errors.lifetimeBudget?.message}
                  hint="Required. When this is spent, the campaign stops delivering — there's no automatic top-up."
                >
                  <Input
                    type="number"
                    step="0.01"
                    min={1}
                    {...register("lifetimeBudget")}
                    className="rounded-lg"
                  />
                </Field>

                <Field
                  label={`Daily spend limit (${currency})`}
                  error={errors.dailyBudget?.message}
                  hint="Optional, but recommended. Without it, a campaign can spend its whole lifetime budget in a day."
                >
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="No daily limit"
                    {...register("dailyBudget")}
                    className="rounded-lg"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start date" hint="Leave empty to start immediately.">
                    <Input type="date" {...register("startDate")} className="rounded-lg" />
                  </Field>
                  <Field label="End date" error={errors.endDate?.message} hint="Optional.">
                    <Input type="date" {...register("endDate")} className="rounded-lg" />
                  </Field>
                </div>

                <Field label="Start state">
                  <div className="flex gap-2">
                    {(["paused", "active"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setValue("status", s)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                          values.status === s
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Starting paused is safer: the campaign can&apos;t spend until you&apos;ve added
                    an ad group and an approved ad anyway.
                  </p>
                </Field>
              </div>
            )}

            {/* ── Step 3: Targeting ── */}
            {step === 2 && (
              <LocationPicker
                adAccountId={adAccountId}
                selected={locations}
                onChange={setLocations}
              />
            )}

            {/* ── Step 4: Review ── */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <dl className="rounded-xl border border-border divide-y divide-border">
                  <Row label="Name" value={values.name} />
                  <Row label="Bidding" value={BIDDING_TYPES.find((b) => b.value === values.biddingType)?.label ?? ""} />
                  <Row label="Lifetime budget" value={`${currency} ${values.lifetimeBudget}`} />
                  <Row
                    label="Daily limit"
                    value={values.dailyBudget ? `${currency} ${values.dailyBudget}` : "None"}
                  />
                  <Row label="Schedule" value={scheduleLabel(values.startDate, values.endDate)} />
                  <Row
                    label="Locations"
                    value={locations.length ? locations.map((l) => l.name).join(", ") : "All available"}
                  />
                  <Row label="Starts" value={values.status === "active" ? "Active" : "Paused"} />
                </dl>

                <Callout tone="info">
                  Bidding type can&apos;t be changed after this campaign is created. Everything else
                  here is editable later.
                </Callout>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                {step === 0 ? "Cancel" : "Back"}
              </Button>

              {step < STEPS.length - 1 ? (
                <Button type="button" className="rounded-lg" onClick={next}>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : (
                <Button type="submit" className="rounded-lg" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create campaign"
                  )}
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────────── */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground text-right truncate">{value || "—"}</dd>
    </div>
  );
}

function Callout({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  const warn = tone === "warning";
  return (
    <div
      className={`rounded-lg border p-3 flex gap-2.5 ${
        warn ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/40"
      }`}
    >
      <Info className={`w-4 h-4 shrink-0 mt-0.5 ${warn ? "text-amber-600" : "text-primary"}`} />
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

/** Location targeting via `GET /geo_lookup/search`. Up to 2,500 per campaign. */
function LocationPicker({
  adAccountId,
  selected,
  onChange,
}: {
  adAccountId: string;
  selected: GeoLocationResult[];
  onChange: (next: GeoLocationResult[]) => void;
}) {
  const [term, setTerm] = useState("");

  const results = useQuery({
    queryKey: ["geo-search", adAccountId, term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const res = await api.post("/geolocations/searchlocations", { adAccountId, q: term.trim() });
      return (res.data?.locations?.data ?? []) as GeoLocationResult[];
    },
  });

  const add = (loc: GeoLocationResult) => {
    if (selected.some((l) => l.id === loc.id)) return;
    if (selected.length >= ACCOUNT_LIMITS.locationIdsPerCampaign) {
      toast.error(`A campaign supports at most ${ACCOUNT_LIMITS.locationIdsPerCampaign} locations.`);
      return;
    }
    onChange([...selected, loc]);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Locations"
        hint="Leave empty to target everywhere the campaign is eligible. Countries, regions and DMAs are all supported."
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a country, region or metro"
            className="pl-8 rounded-lg"
          />
        </div>
      </Field>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((l) => (
            <Badge key={l.id} variant="outline" className="gap-1 pr-1">
              {l.name}
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x.id !== l.id))}
                className="rounded-full hover:bg-muted p-0.5"
                aria-label={`Remove ${l.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {term.trim().length >= 2 && (
        <div className="rounded-lg border border-border max-h-56 overflow-y-auto">
          {results.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Searching…</p>
          ) : (results.data ?? []).length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No locations match that.</p>
          ) : (
            (results.data ?? []).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => add(l)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
              >
                <span className="text-sm text-foreground">{l.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{l.type}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function scheduleLabel(start?: string, end?: string): string {
  if (!start && !end) return "Starts immediately, no end date";
  if (start && !end) return `From ${start}`;
  if (!start && end) return `Until ${end}`;
  return `${start} to ${end}`;
}
