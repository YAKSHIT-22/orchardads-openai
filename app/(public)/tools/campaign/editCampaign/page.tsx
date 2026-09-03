"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, CircleAlert, Info, Loader2, Lock, Pause, Play, TriangleAlert } from "lucide-react";

import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { describeServingIssues } from "@/lib/openai/servingIssues";
import { getSeverityColor, getStatusColor } from "@/utils/constant";
import { money } from "@/lib/format";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { AllCampaignsData } from "@/types/campaignDetails";

/**
 * Edit a campaign.
 *
 * The important behaviour here is what the form REFUSES to do:
 *
 *  - `bidding_type` and (for conversion campaigns) the selected conversion event
 *    are immutable after creation. They are rendered read-only with the reason,
 *    rather than being editable and failing on save.
 *  - The budget object is submitted WHOLE. The API replaces nested objects, so
 *    sending only a daily limit would silently clear the lifetime limit that
 *    controls whether the campaign can spend at all. The server merges too, but
 *    the form sends a complete object so the two never disagree.
 *  - Archiving is not offered. It is irreversible per the official docs, and a
 *    destructive one-way action does not belong next to a save button.
 */

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(ACCOUNT_LIMITS.nameMin)
      .max(ACCOUNT_LIMITS.nameMax)
      .refine((v) => /\S/.test(v), "Name must contain a non-space character"),
    description: z.string().trim().max(1000).optional(),
    lifetimeBudget: z.coerce.number().min(1, "Lifetime budget must be at least 1.00"),
    dailyBudget: z.coerce.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine((v) => !v.dailyBudget || v.dailyBudget <= v.lifetimeBudget, {
    message: "Daily budget can't exceed the lifetime budget",
    path: ["dailyBudget"],
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  });

type FormValues = z.infer<typeof schema>;

const toDate = (unix?: number | null) =>
  unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "";
const toUnix = (date?: string) =>
  date ? Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) : undefined;

export default function EditCampaignPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-sm text-muted-foreground">Loading…</div>}>
      <EditCampaignInner />
    </Suspense>
  );
}

function EditCampaignInner() {
  const router = useRouter();
  const params = useSearchParams();
  const campaignId = params.get("id") ?? "";
  const { adAccountId, currency } = adAccountStore();
  const queryClient = useQueryClient();

  const campaignQuery = useQuery({
    queryKey: ["campaign", adAccountId, campaignId],
    enabled: !!adAccountId && !!campaignId,
    queryFn: async () => {
      const res = await api.post("/campaign/findcampaigns", { adAccountId, campaignId });
      return res.data.campaign as AllCampaignsData;
    },
  });

  const campaign = campaignQuery.data;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!campaign) return;
    reset({
      name: campaign.name,
      description: campaign.description ?? "",
      lifetimeBudget: (campaign.budget?.lifetime_spend_limit_micros ?? 0) / 1_000_000,
      dailyBudget: campaign.budget?.daily_spend_limit_micros
        ? campaign.budget.daily_spend_limit_micros / 1_000_000
        : undefined,
      startDate: toDate(campaign.start_time),
      endDate: toDate(campaign.end_time),
    });
  }, [campaign, reset]);

  const saveMutation = useMutation({
    mutationFn: async (form: FormValues) => {
      await api.post("/campaign/updatecampaign", {
        adAccountId,
        campaignId,
        name: form.name,
        description: form.description || null,
        // Whole object: a partial budget would clear the other limit.
        budget: {
          lifetime_spend_limit_micros: Math.round(form.lifetimeBudget * 1_000_000),
          ...(form.dailyBudget
            ? { daily_spend_limit_micros: Math.round(form.dailyBudget * 1_000_000) }
            : {}),
        },
        start_time: toUnix(form.startDate) ?? null,
        end_time: toUnix(form.endDate) ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Campaign updated");
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-report"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't update the campaign"),
  });

  const stateMutation = useMutation({
    mutationFn: async (action: "pause" | "activate") => {
      await api.post("/campaign/deletecampaign", { adAccountId, campaignId, action });
    },
    onSuccess: () => {
      toast.success("Campaign state changed");
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
    },
    onError: (err) => adsErrorToast(err, "Couldn't change the campaign state"),
  });

  if (!campaignId) {
    return <div className="p-16 text-center text-sm text-muted-foreground">No campaign selected.</div>;
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="p-5 max-w-3xl mx-auto flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (campaignQuery.isError || !campaign) {
    return (
      <div className="p-16 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">We couldn&apos;t load that campaign.</p>
        <Button variant="outline" className="rounded-lg" onClick={() => router.push("/tools/campaign")}>
          Back to campaigns
        </Button>
      </div>
    );
  }

  const issues = describeServingIssues((campaign.serving_issues ?? []).map((i) => i.code));
  const isActive = campaign.status === "active";
  const isArchived = campaign.status === "archived";

  return (
    <div className="p-5">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/tools/campaign"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Campaigns
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-foreground mt-1">
              {campaign.name}
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className={`capitalize ${getStatusColor(campaign.status)}`}>
                {campaign.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Lifetime budget {money(currency, campaign.budget?.lifetime_spend_limit_micros ?? 0)}
              </span>
            </div>
          </div>

          {!isArchived && (
            <Button
              variant="outline"
              className="rounded-lg"
              disabled={stateMutation.isPending}
              onClick={() => stateMutation.mutate(isActive ? "pause" : "activate")}
            >
              {stateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : isActive ? (
                <Pause className="w-4 h-4 mr-1.5" />
              ) : (
                <Play className="w-4 h-4 mr-1.5" />
              )}
              {isActive ? "Pause" : "Activate"}
            </Button>
          )}
        </header>

        {issues.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-foreground">
                This campaign isn&apos;t delivering
              </h2>
            </div>
            <ul className="flex flex-col gap-2.5">
              {issues.map((i) => (
                <li key={i.code} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-normal ${getSeverityColor(i.severity)}`}
                    >
                      {i.title}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground capitalize">
                      fixed by {i.fixableBy}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{i.fix}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          onSubmit={handleSubmit((d) => saveMutation.mutate(d))}
          className="bg-card border border-border rounded-xl p-6 flex flex-col gap-5"
        >
          <Field label="Campaign name" error={errors.name?.message}>
            <Input {...register("name")} className="rounded-lg" disabled={isArchived} />
          </Field>

          <Field label="Description" hint="Optional. Only you see this.">
            <Textarea {...register("description")} rows={2} className="rounded-lg" disabled={isArchived} />
          </Field>

          <ReadOnlyField
            label="Bidding type"
            value={campaign.bidding_type}
            reason="Bidding type is fixed when a campaign is created and can't be changed afterwards. To use a different one, create a new campaign."
          />

          {campaign.bidding_type === "conversions" && (
            <ReadOnlyField
              label="Conversion event"
              value={(campaign.conversion_event_setting_ids ?? []).join(", ") || "—"}
              reason="The optimization event is fixed for the life of a conversion-optimized campaign."
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field
              label={`Lifetime budget (${currency})`}
              error={errors.lifetimeBudget?.message}
              hint="When this is spent, the campaign stops delivering."
            >
              <Input
                type="number"
                step="0.01"
                min={1}
                {...register("lifetimeBudget")}
                className="rounded-lg"
                disabled={isArchived}
              />
            </Field>

            <Field
              label={`Daily limit (${currency})`}
              error={errors.dailyBudget?.message}
              hint="Optional. Caps how fast the lifetime budget is consumed."
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="No daily limit"
                {...register("dailyBudget")}
                className="rounded-lg"
                disabled={isArchived}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date">
              <Input type="date" {...register("startDate")} className="rounded-lg" disabled={isArchived} />
            </Field>
            <Field label="End date" error={errors.endDate?.message}>
              <Input type="date" {...register("endDate")} className="rounded-lg" disabled={isArchived} />
            </Field>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Changes apply immediately to the live campaign.
            </p>
            <Button
              type="submit"
              className="rounded-lg"
              disabled={saveMutation.isPending || !isDirty || isArchived}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </form>

        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Archiving isn&apos;t offered here. It can&apos;t be undone, so it lives in Ads Manager
            where the consequence is spelled out. Pausing achieves the same thing reversibly.
          </p>
        </div>
      </div>
    </div>
  );
}

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

function ReadOnlyField({ label, value, reason }: { label: string; value: string; reason: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm flex items-center gap-1.5">
        {label}
        <Lock className="w-3 h-3 text-muted-foreground" />
      </Label>
      <div className="h-10 rounded-lg border border-border bg-muted/40 px-3 flex items-center text-sm text-muted-foreground capitalize">
        {value}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
    </div>
  );
}
