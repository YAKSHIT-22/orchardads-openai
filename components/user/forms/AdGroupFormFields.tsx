"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Control, Controller, FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Asterisk } from "lucide-react";
import CurrencySelect from "@/components/user/currencySelect";
import { currencyMap } from "@/utils/currencyMap";

const currencyOptions = Object.keys(currencyMap) as Array<keyof typeof currencyMap>;

export const adGroupSchema = z.object({
  name: z.string().min(1, "Required").max(200, "Max 200 chars"),
  status: z.enum(["ENABLED", "PAUSED"]),
  startTime: z.string().refine((s) => Boolean(Date.parse(s)), "Invalid date"),
  endTime: z.string().optional(),
  defaultBidAmount: z.object({
    amount: z.coerce.number().min(0.01, "Min 0.01"),
    currency: z.custom<keyof typeof currencyMap>((v) => currencyOptions.includes(v as string)),
  }),
  hasCpaGoal: z.boolean(),
  cpaGoal: z.object({
    amount: z.coerce.number().min(0.01, "Min 0.01"),
    currency: z.custom<keyof typeof currencyMap>((v) => currencyOptions.includes(v as string)),
  }).optional(),
  automatedKeywordsOptIn: z.boolean(),
  pricingModel: z.enum(["CPC", "CPM"]),
});

export type AdGroupFormValues = z.infer<typeof adGroupSchema>;

export const adGroupDefaults: AdGroupFormValues = {
  name: "",
  status: "ENABLED",
  startTime: new Date().toISOString().slice(0, 16),
  endTime: "",
  defaultBidAmount: { amount: 0.5, currency: "USD" },
  hasCpaGoal: false,
  automatedKeywordsOptIn: false,
  pricingModel: "CPC",
};

interface Props {
  control: Control<AdGroupFormValues>;
  register: UseFormRegister<AdGroupFormValues>;
  watch: UseFormWatch<AdGroupFormValues>;
  setValue: UseFormSetValue<AdGroupFormValues>;
  errors: FieldErrors<AdGroupFormValues>;
  /** Search Match (automatedKeywordsOptIn) is only valid on Search results placements. */
  allowSearchMatch?: boolean;
  /** cpaGoal is not allowed on Search tab placements. */
  allowCpaGoal?: boolean;
}

export function AdGroupFormFields({ control, register, watch, setValue, errors, allowSearchMatch = true, allowCpaGoal = true }: Props) {
  const hasCpaGoal = watch("hasCpaGoal");

  // Keep values consistent with what the selected placement allows.
  useEffect(() => {
    if (!allowSearchMatch && watch("automatedKeywordsOptIn")) setValue("automatedKeywordsOptIn", false);
    if (!allowCpaGoal && watch("hasCpaGoal")) {
      setValue("hasCpaGoal", false);
      setValue("cpaGoal", undefined);
    }
    // Billing event must match the parent campaign: impression for CPM campaigns,
    // click for both click and conversion campaigns.
    if (watch("pricingModel") !== "CPC") setValue("pricingModel", "CPC");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowSearchMatch, allowCpaGoal]);

  return (
    <>
      <Card className="border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Basic Information</span>
            <div className="flex items-center gap-2">
              <Label htmlFor="ag-status" className="text-sm font-normal">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Switch
                    id="ag-status"
                    checked={field.value === "ENABLED"}
                    onCheckedChange={(on) => field.onChange(on ? "ENABLED" : "PAUSED")}
                  />
                )}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <Label>
              Ad Group Name <sup><Asterisk className="w-2 h-2 text-red-500 inline" /></sup>
            </Label>
            <Input placeholder="e.g. Brand Keywords" {...register("name")} />
            {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1">
              Pricing Model
              <InfoHint>
                Billing follows the campaign's bidding type. A CPA goal is only available
                on placements that support it.
              </InfoHint>
            </Label>
            <div className="flex h-9 w-full items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
              Cost Per Click (CPC)
            </div>
          </div>

          {allowSearchMatch && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">Auto Keywords</p>
                <p className="text-xs text-muted-foreground mt-1">Free-text hints describing when your product is useful</p>
              </div>
              <Controller
                control={control}
                name="automatedKeywordsOptIn"
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>
              Start Date <sup><Asterisk className="w-2 h-2 text-red-500 inline" /></sup>
            </Label>
            <div className="relative w-full">
              <Input className="w-full flex items-start justify-start" type="datetime-local" {...register("startTime")} />
            </div>
            {errors.startTime && <p className="text-red-500 text-xs">{errors.startTime.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>End Date <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <div className="relative w-full">
              <Input className="w-full flex items-start justify-start" type="datetime-local" {...register("endTime")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Bidding</span>
            {!allowCpaGoal && (
              <span className="text-xs font-normal text-muted-foreground">
                CPA goal isn&apos;t available for this placement
              </span>
            )}
            {allowCpaGoal && (
              <div className="flex items-center gap-2">
                <Label className="text-sm font-normal flex items-center gap-1">
                  Set CPA Goal?
                  <InfoHint>
                    Billing follows the campaign's bidding type. A CPA goal is only
                    available on placements that support it.
                  </InfoHint>
                </Label>
                <Controller
                  control={control}
                  name="hasCpaGoal"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={(on) => {
                        field.onChange(on);
                        if (on) setValue("cpaGoal", { amount: 0, currency: "USD" });
                        else setValue("cpaGoal", undefined);
                      }}
                    />
                  )}
                />
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>
              Default Bid Amount <sup><Asterisk className="w-2 h-2 text-red-500 inline" /></sup>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" step="any" {...register("defaultBidAmount.amount")} />
              <Controller
                control={control}
                name="defaultBidAmount.currency"
                render={({ field }) => (
                  <CurrencySelect value={field.value} onChange={field.onChange} error={errors.defaultBidAmount?.currency?.message ?? ""} />
                )}
              />
            </div>
            {errors.defaultBidAmount?.amount && (
              <p className="text-red-500 text-xs">{errors.defaultBidAmount.amount.message}</p>
            )}
          </div>

          {hasCpaGoal && (
            <div className="flex flex-col gap-1.5">
              <Label>CPA Goal</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" step="any" {...register("cpaGoal.amount")} />
                <Controller
                  control={control}
                  name="cpaGoal.currency"
                  render={({ field }) => (
                    <CurrencySelect value={field.value || "USD"} onChange={field.onChange} error={errors.cpaGoal?.currency?.message ?? ""} />
                  )}
                />
              </div>
              {errors.cpaGoal?.amount && <p className="text-red-500 text-xs">{errors.cpaGoal.amount.message}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
