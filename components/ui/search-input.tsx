"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SearchInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Classes for the outer wrapper (positioning / flex behavior). */
  containerClassName?: string
  /** Called when the clear button is pressed. Falls back to emitting an empty onChange. */
  onClear?: () => void
}

/**
 * Shadcn-styled input with a leading search icon in its own gutter, so the
 * icon and the placeholder/text never overlap. Shows a clear button when a
 * controlled value is non-empty. Size/width classes go on `className` just
 * like a regular Input.
 */
function SearchInput({
  className,
  containerClassName,
  value,
  onChange,
  onClear,
  ...props
}: SearchInputProps) {
  const showClear = typeof value === "string" && value.length > 0

  const handleClear = () => {
    if (onClear) {
      onClear()
      return
    }
    onChange?.({
      target: { value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className={cn("relative", containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        data-slot="search-input"
        value={value}
        onChange={onChange}
        className={cn("!pl-8", showClear && "!pr-8", className)}
        {...props}
      />
      {showClear && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export { SearchInput }
