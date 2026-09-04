import { money, percent } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { AdGroup, FilterState } from "@/types/reportsDetails"

interface AdGroupReportProps {
  data: AdGroup[]
  filters: FilterState
  uniqueCampaigns: Array<{ id: string; name: string }>
  uniqueAdGroups: Array<{ id: string; name: string }>
}

export function AdGroupReport({ data, filters, uniqueCampaigns, uniqueAdGroups }: AdGroupReportProps) {
  return (
    <Card className="border rounded-md bg-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Ad Group Performance Details
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-zinc-100 text-zinc-900">
              {data.length} Records
            </Badge>
            {filters.selectedCampaignId && (
              <Badge variant="outline">
                Campaign: {uniqueCampaigns.find((c) => c.id === filters.selectedCampaignId)?.name}
              </Badge>
            )}
            {filters.selectedAdGroupId && (
              <Badge variant="outline">
                Ad Group: {uniqueAdGroups.find((ag) => ag.id === filters.selectedAdGroupId)?.name}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Detailed performance metrics for ad groups
          {filters.selectedCampaignId ? " within selected campaign" : " across all campaigns"}
          {filters.selectedAdGroupId ? " and ad group" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Ad Group Name</TableHead>
                <TableHead>Ad Group ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">CPI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 50).map((adGroup, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{adGroup.campaignName}</TableCell>
                  <TableCell>{adGroup.adGroupName}</TableCell>
                  <TableCell>{adGroup.adGroupId}</TableCell>
                  <TableCell>
                    <Badge variant={adGroup.adGroupStatus === "active" ? "default" : "secondary"}>
                      {adGroup.adGroupStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {adGroup.performance.impressions?.toLocaleString() || "0"}
                  </TableCell>
                  <TableCell className="text-right">{adGroup.performance.clicks?.toLocaleString() || "0"}</TableCell>
                  <TableCell className="text-right">{percent(adGroup.performance.ctr)}</TableCell>
                  <TableCell className="text-right">
                    {adGroup.performance.conversions?.toLocaleString() || "0"}
                  </TableCell>
                  <TableCell className="text-right">{percent(adGroup.performance.cvr, 1)}</TableCell>
                  <TableCell className="text-right">
                    {money(adGroup.performance.currency, adGroup.performance.spendMicros)}
                  </TableCell>
                  {/* Null CPA renders as an em dash, never as 0.00: an ad group
                      with no conversions has no cost per conversion. */}
                  <TableCell className="text-right">
                    {money(adGroup.performance.currency, adGroup.performance.cpaMicros)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.length > 50 && (
          <div className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
            Showing first 50 of {data.length} records. Use filters to narrow down results.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
