import React, { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countryMap } from "@/utils/countryMap";
import { flagEmoji } from "@/utils/flagEmoji";
import { Check, ChevronDown, Search, X } from "lucide-react";

const allCodes = Object.keys(countryMap).sort((a, b) =>
  countryMap[a].localeCompare(countryMap[b])
);

const QUICK_PICKS = ["US", "GB", "CA", "AU", "IN", "DE", "FR", "JP"].filter(
  (code) => code in countryMap
);

interface MultiCountrySelectProps {
  value: string[];
  onChange: (newVal: string[]) => void;
  error?: string;
}

export default function MultiCountrySelect({ value, onChange, error }: MultiCountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    } else {
      setFilter("");
    }
  }, [isOpen]);

  const filteredCodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allCodes;
    return allCodes.filter(
      (code) =>
        countryMap[code].toLowerCase().includes(q) ||
        code.toLowerCase().includes(q)
    );
  }, [filter]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggleCountry = (code: string) => {
    if (selectedSet.has(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const allShownSelected =
    filteredCodes.length > 0 && filteredCodes.every((code) => selectedSet.has(code));

  const selectAllShown = () => {
    const merged = new Set(value);
    filteredCodes.forEach((code) => merged.add(code));
    onChange(Array.from(merged));
  };

  const clearAll = () => onChange([]);

  const summary = useMemo(() => {
    if (value.length === 0) return null;
    if (value.length === allCodes.length) return "All countries";
    const names = value
      .filter((code) => code in countryMap)
      .map((code) => `${flagEmoji(code)} ${countryMap[code]}`);
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  }, [value]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center gap-2 min-h-9 px-3 py-2 rounded-md border bg-transparent text-sm shadow-xs transition-colors cursor-pointer text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          error
            ? "border-red-500 focus-visible:ring-red-500/40"
            : "border-input hover:border-ring/60"
        )}
        onClick={() => setIsOpen((open) => !open)}
      >
        {summary ? (
          <span className="flex-1 truncate">{summary}</span>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">Select countries…</span>
        )}
        {value.length > 0 && (
          <span className="shrink-0 rounded-full bg-secondary text-secondary-foreground text-xs font-medium px-2 py-0.5 tabular-nums">
            {value.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 w-full min-w-[16rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search by name or code…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full !pl-8 h-8"
              />
            </div>
            {!filter && (
              <div className="flex flex-wrap gap-1 mt-2">
                {QUICK_PICKS.map((code) => {
                  const active = selectedSet.has(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleCountry(code)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <span aria-hidden>{flagEmoji(code)}</span>
                      {code}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-xs">
            <span className="text-muted-foreground tabular-nums">
              {value.length} selected
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAllShown}
                disabled={allShownSelected || filteredCodes.length === 0}
                className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-default"
              >
                Select all shown
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={value.length === 0}
                className="inline-flex items-center gap-0.5 font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer disabled:cursor-default"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {filteredCodes.length > 0 ? (
              filteredCodes.map((code) => {
                const selected = selectedSet.has(code);
                return (
                  <div
                    key={code}
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                      selected && "bg-accent/50"
                    )}
                    onClick={() => toggleCountry(code)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="shrink-0 text-base leading-none" aria-hidden>
                      {flagEmoji(code)}
                    </span>
                    <span className="flex-1 truncate">{countryMap[code]}</span>
                    <span className="shrink-0 text-xs text-muted-foreground font-mono">
                      {code}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No countries match “{filter}”
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
