"use client"

import { Button } from "@/components/ui/button"
import { Target, Layers, Search, BarChart3, MousePointer } from "lucide-react"

const reportTypes = [
  { id: "campaigns", label: "Campaign-Level Reports", icon: Target },
  { id: "adgroups", label: "Ad Group-Level Reports", icon: Layers },
  { id: "keywords", label: "Keyword-Level Reports", icon: Search },
  { id: "searchterms", label: "Search Term-Level Reports", icon: BarChart3 },
  { id: "ads", label: "Ad-Level Reports", icon: MousePointer },
]

interface ReportTypeSelectorProps {
  selectedReport: string
  onReportChange: (reportType: string) => void
}

export function ReportTypeSelector({ selectedReport, onReportChange }: ReportTypeSelectorProps) {
  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {reportTypes.map((type) => {
          const Icon = type.icon
          return (
            <Button
              key={type.id}
              variant={selectedReport === type.id ? "default" : "outline"}
              size="sm"
              onClick={() => onReportChange(type.id)}
              className="flex flex-col h-auto p-3 text-xs"
            >
              <Icon className="h-4 w-4 mb-1" />
              <span className="text-center leading-tight">{type.label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
