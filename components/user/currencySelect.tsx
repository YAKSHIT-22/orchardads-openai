"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import { currencyMap } from "@/utils/currencyMap";
import { adAccountStore } from "@/stores/adAccountStore";

interface CurrencySelectProps {
  value: string;
  onChange: (newVal: string) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Currency is dictated by the connected ad account — the API rejects any
 * other currency when creating campaigns, ad groups, keywords or budget orders.
 * So this control is display-only: it shows the org currency and keeps the
 * bound form value synced to it. No manual selection.
 */
export default function CurrencySelect({ value, onChange, error }: CurrencySelectProps) {
  const orgCurrency = adAccountStore((s) => s.currency);

  // Keep the underlying form/state value locked to the org currency.
  useEffect(() => {
    if (orgCurrency && value !== orgCurrency) onChange(orgCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgCurrency, value]);

  const display = orgCurrency || value || "";
  const name = display && currencyMap[display] ? currencyMap[display] : "";

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex gap-1.5 items-center w-full px-3 py-2 border rounded bg-muted/40 cursor-not-allowed select-none",
          error ? "border-red-500" : "border-gray-300"
        )}
        title={name ? `${name} — set by your ad account` : "Set by your ad account"}
      >
        <span className="text-sm font-semibold text-zinc-700">{display || "—"}</span>
        <Lock className="w-3 h-3 text-zinc-400 ml-auto shrink-0" />
      </div>
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
