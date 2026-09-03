import React, { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";
import { countryMap } from "@/utils/countryMap";
import { flagEmoji } from "@/utils/flagEmoji";

const allCodes = Object.keys(countryMap).sort((a, b) =>
  countryMap[a].localeCompare(countryMap[b])
);

interface SingleCountrySelectProps {
  value: string;
  onChange: (newVal: string) => void;
  className: string,
  error?: string;
  disabled?: boolean;
}

export default function SingleCountrySelect({ value, onChange, className, error, disabled = false }: SingleCountrySelectProps) {
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

  const selectCountry = (code: string) => {
    onChange(code);
    setIsOpen(false);
  };

  const hasValue = Boolean(value) && value in countryMap;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center gap-2 min-h-9 px-3 py-2 rounded-md border bg-transparent text-sm shadow-xs transition-colors text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          error
            ? "border-red-500 focus-visible:ring-red-500/40"
            : "border-input",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-ring/60"
        )}
        onClick={() => setIsOpen((open) => !open)}
      >
        {hasValue ? (
          <span
            className={cn(
              "flex-1 flex items-center gap-2 truncate font-medium",
              disabled && "text-muted-foreground"
            )}
          >
            <span className="shrink-0 text-base leading-none" aria-hidden>
              {flagEmoji(value)}
            </span>
            <span className="truncate">{countryMap[value]}</span>
            <span className="shrink-0 text-xs text-muted-foreground font-mono font-normal">
              {value}
            </span>
          </span>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">Select country…</span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && !disabled && (
        <div
          role="listbox"
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
          </div>
          <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {filteredCodes.length > 0 ? (
              filteredCodes.map((code) => {
                const selected = value === code;
                return (
                  <div
                    key={code}
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                      selected && "bg-accent/50 font-medium"
                    )}
                    onClick={() => selectCountry(code)}
                  >
                    <span className="shrink-0 text-base leading-none" aria-hidden>
                      {flagEmoji(code)}
                    </span>
                    <span className="flex-1 truncate">{countryMap[code]}</span>
                    <span className="shrink-0 text-xs text-muted-foreground font-mono">
                      {code}
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
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
