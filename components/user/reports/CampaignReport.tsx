import { money, percent } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { Campaign, FilterState } from "@/types/reportsDetails"

interface CampaignReportProps {
  data: Campaign[]
  filters: FilterState
  uniqueCampaigns: Array<{ id: string; name: string }>
  uniqueAdGroups: Array<{ id: string; name: string }>
}

export function CampaignReport({ data, filters, uniqueCampaigns }: CampaignReportProps) {
  return (
    <Card className="border rounded-xl">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          Campaign Performance Details
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              {data.length} Records
            </Badge>
            {filters.selectedCampaignId && (
              <Badge variant="outline">
                Campaign: {uniqueCampaigns.find((c) => c.id === filters.selectedCampaignId)?.name}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Detailed performance metrics for campaigns
          {filters.selectedCampaignId ? " (filtered)" : " across all campaigns"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Campaign ID</TableHead>
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
              {data.slice(0, 50).map((campaign, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{campaign.campaignName}</TableCell>
                  <TableCell>{campaign.campaignId}</TableCell>
                  <TableCell>
                    <Badge variant={campaign.campaignStatus === "RUNNING" ? "default" : "secondary"}>
                      {campaign.campaignStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.performance.impressions?.toLocaleString() || "0"}
                  </TableCell>
                  <TableCell className="text-right">{campaign.performance.clicks?.toLocaleString() || "0"}</TableCell>
                  <TableCell className="text-right">{percent(campaign.performance.ctr)}</TableCell>
                  <TableCell className="text-right">
                    {campaign.performance.conversions?.toLocaleString() || "0"}
                  </TableCell>
                  <TableCell className="text-right">{percent(campaign.performance.cvr, 1)}</TableCell>
                  <TableCell className="text-right">
                    {money(campaign.performance.currency, campaign.performance.spendMicros)}
                  </TableCell>
                  <TableCell className="text-right">
                    {money(campaign.performance.currency, campaign.performance.cpaMicros)}
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
