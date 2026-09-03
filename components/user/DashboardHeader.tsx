"use client"

import type { ReactNode } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { CalendarIcon } from "lucide-react"
import { DATE_RANGE_PRESETS } from "@/lib/dateRanges"

interface DashboardHeaderProps {
  dateRange: string
  onDateRangeChange: (value: string) => void
  customRange?: { start?: string; end?: string }
  onCustomRangeChange?: (r: { start?: string; end?: string }) => void
  /** Extra header action(s), e.g. the Share dialog trigger. */
  action?: ReactNode
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export function DashboardHeader({
  dateRange, onDateRangeChange, customRange, onCustomRangeChange, action,
}: DashboardHeaderProps) {
  const isCustom = dateRange === "custom"
  return (
    // No backdrop-blur: the header isn't sticky, and Safari composites
    // backdrop-filter into a translucent band that overlaps scrolled content.
    <div className="dark:bg-slate-900/80">
      <div className="container mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">OpenAI Ads Dashboard</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Campaign performance analytics and insights</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            <Select value={dateRange} onValueChange={onDateRangeChange}>
              <SelectTrigger className="w-fit min-w-40 bg-background" size="sm">
                <CalendarIcon className="h-4 w-4 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isCustom && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  max={todayStr()}
                  value={customRange?.start ?? ""}
                  onChange={(e) => onCustomRangeChange?.({ ...customRange, start: e.target.value })}
                  className="h-8 w-[9.5rem] text-sm bg-background"
                  aria-label="Start date"
                />
                <span className="text-muted-foreground text-sm">–</span>
                <Input
                  type="date"
                  max={todayStr()}
                  value={customRange?.end ?? ""}
                  onChange={(e) => onCustomRangeChange?.({ ...customRange, end: e.target.value })}
                  className="h-8 w-[9.5rem] text-sm bg-background"
                  aria-label="End date"
                />
              </div>
            )}
            {action}
          </div>
        </div>
      </div>
    </div>
  )
}
