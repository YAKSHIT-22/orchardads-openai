"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Standard card-footer pagination used under data tables:
 * "Page X of Y" with Previous / Next. Renders nothing when there is a
 * single page. `page` is zero-based.
 */
function TablePagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}) {
  if (totalPages <= 1) return null

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-t px-4 py-3 text-sm",
        className
      )}
    >
      <span className="text-muted-foreground">
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export { TablePagination }
