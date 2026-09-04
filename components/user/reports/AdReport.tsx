import { money, percent } from "@/lib/format";
import { reviewSummary } from "@/lib/openai/reviewReasons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { Ad, FilterState } from "@/types/reportsDetails";

interface AdReportProps {
  data: Ad[];
  filters: FilterState;
  uniqueCampaigns: Array<{ id: string; name: string }>;
  uniqueAdGroups: Array<{ id: string; name: string }>;
}

export function AdReport({
  data,
  filters,
  uniqueCampaigns,
  uniqueAdGroups,
}: AdReportProps) {
  return (
    <>
      {data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border rounded-md bg-card">
            <CardHeader>
              <CardTitle>Ads by Creative Type</CardTitle>
              <CardDescription>
                Performance comparison between creative types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  CUSTOM_PRODUCT_PAGE: {
                    label: "Custom Product Page",
                    color: "#3498db",
                  },
                  STANDARD_PRODUCT_PAGE: {
                    label: "Standard Product Page",
                    color: "#e67e22",
                  },
                }}
                className="h-[300px]"
              >
                <BarChart
                  data={data.slice(0, 8).map((ad) => ({
                    adName:
                      ad.adName.length > 15
                        ? ad.adName.substring(0, 15) + "..."
                        : ad.adName,
                    fullAdName: ad.adName,
                    impressions: ad.performance.impressions,
                    clicks: ad.performance.clicks,
                    conversions: ad.performance.conversions,
                    creativeType: ad.creativeType,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="adName"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="impressions"
                    fill="var(--color-CUSTOM_PRODUCT_PAGE)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="clicks"
                    fill="var(--color-STANDARD_PRODUCT_PAGE)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border rounded-md bg-card">
            <CardHeader>
              <CardTitle>Ad Performance by Campaign</CardTitle>
              <CardDescription>
                Ad performance across different campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  installRate: {
                    label: "Conversion Rate (%)",
                    color: "#9b59b6",
                  },
                  ctr: {
                    label: "Click-Through Rate (%)",
                    color: "#e74c3c",
                  },
                }}
                className="h-[300px]"
              >
                <BarChart
                  data={data
                    .filter((ad) => ad.performance.clicks > 0)
                    .sort((a, b) => (b.performance.cvr ?? 0) - (a.performance.cvr ?? 0))
                    .slice(0, 8)
                    .map((ad) => ({
                      adName:
                        ad.adName.length > 15
                          ? ad.adName.substring(0, 15) + "..."
                          : ad.adName,
                      fullAdName: ad.adName,
                      installRate: (ad.performance.cvr ?? 0) * 100,
                      ctr: (ad.performance.ctr ?? 0) * 100,
                    }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="adName"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="installRate"
                    fill="var(--color-installRate)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="ctr"
                    fill="var(--color-ctr)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border rounded-md bg-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Ad Creative Performance Details
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-zinc-100 text-zinc-900">
                {data.length} Records
              </Badge>
              {filters.selectedCampaignId && (
                <Badge variant="outline">
                  Campaign:{" "}
                  {
                    uniqueCampaigns.find(
                      (c) => c.id === filters.selectedCampaignId
                    )?.name
                  }
                </Badge>
              )}
              {filters.selectedAdGroupId && (
                <Badge variant="outline">
                  Ad Group:{" "}
                  {
                    uniqueAdGroups.find(
                      (ag) => ag.id === filters.selectedAdGroupId
                    )?.name
                  }
                </Badge>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            Detailed performance metrics for ad creatives
            {filters.selectedCampaignId
              ? " within selected campaign"
              : " across all campaigns"}
            {filters.selectedAdGroupId ? " and ad group" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad Group</TableHead>
                  <TableHead>Ad Name</TableHead>
                  <TableHead>Creative Type</TableHead>
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
                {data.slice(0, 50).map((ad, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {ad.campaignName}
                    </TableCell>
                    <TableCell>{ad.adGroupName}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate" title={ad.adName}>
                        {ad.adName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ad.creativeType === "CUSTOM_PRODUCT_PAGE"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {ad.creativeType === "CUSTOM_PRODUCT_PAGE"
                          ? "Custom"
                          : "Standard"}
                      </Badge>
                    </TableCell>
                    {/* Status AND review outcome. On this platform an ad is far
                        more often blocked by review than by its own status, and
                        the reason is an enumerated, fixable one. */}
                    <TableCell>
                      <Badge variant={ad.status === "active" ? "default" : "secondary"}>
                        {ad.status}
                      </Badge>
                      {ad.reviewStatus && ad.reviewStatus !== "approved" && (
                        <div className="text-xs text-orange-600 mt-1">
                          {reviewSummary(ad.reviewStatus, ad.reviewReason)}
                        </div>
                      )}
                      {!!ad.servingIssues?.length && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {ad.servingIssues.join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {ad.performance.impressions?.toLocaleString() || "0"}
                    </TableCell>
                    <TableCell className="text-right">
                      {ad.performance.clicks?.toLocaleString() || "0"}
                    </TableCell>
                    <TableCell className="text-right">{percent(ad.performance.ctr)}</TableCell>
                    <TableCell className="text-right">
                      {ad.performance.conversions?.toLocaleString() || "0"}
                    </TableCell>
                    <TableCell className="text-right">{percent(ad.performance.cvr, 1)}</TableCell>
                    <TableCell className="text-right">
                      {money(ad.performance.currency, ad.performance.spendMicros)}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(ad.performance.currency, ad.performance.cpaMicros)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data.length > 50 && (
            <div className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
              Showing first 50 of {data.length} records. Use filters to narrow
              down results.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
