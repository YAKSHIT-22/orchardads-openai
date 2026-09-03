"use client";

/**
 * Campaign multi-filter — a filter bar for the dashboard.
 *
 * Renders a "Filters" bar with a "Campaigns" popover button (searchable
 * multi-select with checkboxes + Select-all / Clear) and removable chips for
 * the active selection. An empty selection means "All campaigns" (the default
 * dashboard behaviour). Selecting campaigns scopes every dashboard widget
 * client-side by campaignId.
 *
 * Self-contained popover (click-outside + Escape) so it needs no extra Radix
 * primitive beyond what the app already ships.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Check, ChevronDown, ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CampaignOption = { id: string; name: string };

export function CampaignMultiFilter({
  campaigns,
  selectedIds,
  onChange,
}: {
  campaigns: CampaignOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => a.name.localeCompare(b.name)),
    [campaigns]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  const selectedCampaigns = useMemo(
    () => sorted.filter((c) => selectedSet.has(c.id)),
    [sorted, selectedSet]
  );

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const clearAll = () => onChange([]);
  const selectAllFiltered = () => {
    const merged = new Set(selectedIds);
    filtered.forEach((c) => merged.add(c.id));
    onChange([...merged]);
  };
  const count = selectedIds.length;

  // Compact trigger summary — never a chip-per-campaign (overflows on big accounts).
  const summary =
    count === 0
      ? "All campaigns"
      : count <= 2
        ? selectedCampaigns.map((c) => c.name).join(", ")
        : `${count} campaigns`;

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm mb-6">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
          <ListFilter className="w-4 h-4" />
          Filters
        </span>

        {/* Popover trigger + panel */}
        <div className="relative min-w-0" ref={wrapRef}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 max-w-[16rem]", count === 0 && "border-dashed")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <ListFilter className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate" title={count > 2 ? undefined : summary}>{summary}</span>
            {count > 0 && (
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums shrink-0">
                {count}
              </Badge>
            )}
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </Button>

          {open && (
            <div className="absolute z-50 mt-1.5 w-72 rounded-xl border bg-popover text-popover-foreground shadow-lg">
              <div className="p-2 border-b">
                <SearchInput
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClear={() => setQuery("")}
                  placeholder="Search campaigns…"
                  className="h-8 text-sm"
                />
              </div>

              <div className="flex items-center justify-between px-2 py-1.5 text-xs border-b">
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                  onClick={selectAllFiltered}
                  disabled={filtered.length === 0}
                >
                  Select all{query ? " (filtered)" : ""}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={clearAll}
                  disabled={count === 0}
                >
                  Clear
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No campaigns match “{query}”.
                  </p>
                ) : (
                  filtered.map((c) => {
                    const checked = selectedSet.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggle(c.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-input"
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate" title={c.name}>
                          {c.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between border-t p-2">
                <span className="text-xs text-muted-foreground">
                  {count === 0 ? "All campaigns" : `${count} selected`}
                </span>
                <Button type="button" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Compact clear control — per-campaign removal lives inside the popover. */}
        {count > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
            onClick={clearAll}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
