"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { adsErrorToast } from "@/lib/openai/errorToast";
import Link from "next/link";
import { adAccountStore } from "@/stores/adAccountStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, CheckCircle2, AlertTriangle, Loader2, Key, ShieldCheck, Building2, RefreshCw, User, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TwoFactorCard } from "@/components/user/TwoFactorCard";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { adAccountId, connections, selectedIndex } = adAccountStore();
  const org = connections[selectedIndex] ?? null;

  const statusQuery = useQuery({
    queryKey: ["settings-status"],
    queryFn: async () => (await api.get("/settings/status")).data,
    staleTime: 60 * 1000,
  });
  const s = statusQuery.data;

  /**
   * Re-check the stored API keys against OpenAI.
   *
   * There is no token to refresh — an Ads API key is static and never expires.
   * What this answers is whether the key still WORKS: the advertiser can delete
   * it in Ads Manager at any time and OpenAI never tells us, so a failed call
   * here is the only signal we get.
   */
  const testConnection = useMutation({
    mutationFn: async () => (await api.post("/connections/revalidate")).data,
    onSuccess: (data: { message?: string }) => {
      toast.success(data?.message || "Ad accounts re-checked");
      statusQuery.refetch();
    },
    onError: (err: unknown) =>
      adsErrorToast(err, "Couldn't reach OpenAI Ads — the key may have been revoked"),
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => api.post("/connections/delete", { connectionId }),
    onSuccess: () => { toast.success("Account disconnected"); statusQuery.refetch(); },
    onError: (err: any) => adsErrorToast(err, "Couldn't disconnect this account"),
  });

  // Org names per connection (from the aggregated ACL, tagged with connectionId).
  const orgsByConnection = (connectionId: string): string[] =>
    (connections)
      .filter((o: any) => o.connectionId === connectionId)
      .map((o: any) => o.adAccountName || o.adAccountName || `Org ${o.adAccountId}`);

  const connected = s?.hasCredentials && s?.hasKeys;

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Settings size={20} />Settings</h1>
          <p className="text-sm text-muted-foreground">Your OpenAI Ads connection, account, and security at a glance.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 auto-rows-min">
        {/* Connection health */}
        <Card className="border rounded-xl lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Key className="w-4 h-4" />OpenAI Ads Connection</CardTitle>
            {statusQuery.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <Badge className={cn("gap-1 border-0", connected ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                {connected ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {connected ? "Connected" : "Needs setup"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {((s?.connections as any[]) || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No ad account connected yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(s.connections as any[]).map((c, i) => {
                  const adAccountNames = orgsByConnection(c.id);
                  return (
                    <div key={c.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.label || `Ad account ${i + 1}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.hasCredentials ? `${c.orgCount} organization${c.orgCount === 1 ? "" : "s"}` : "Setup incomplete"}
                          {c.accessTokenExpiresAt ? ` · token ${new Date(c.accessTokenExpiresAt) > new Date() ? "active" : "expired"}` : ""}
                        </p>
                        {adAccountNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {adAccountNames.slice(0, 6).map((n) => <Badge key={n} variant="outline" className="text-[11px] font-normal">{n}</Badge>)}
                            {adAccountNames.length > 6 && <Badge variant="outline" className="text-[11px]">+{adAccountNames.length - 6}</Badge>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={cn("gap-1 border-0", c.hasCredentials ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                          {c.hasCredentials ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {c.hasCredentials ? "Connected" : "Incomplete"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-rose-500 hover:text-rose-600"
                          disabled={disconnect.isPending}
                          onClick={() => {
                            if (confirm(`Disconnect "${c.label || `account ${i + 1}`}"? Its organizations will be removed from the switcher.`)) disconnect.mutate(c.id);
                          }}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => testConnection.mutate()} disabled={testConnection.isPending} className="gap-1.5">
                {testConnection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh tokens
              </Button>
              <Link href="/onboarding/connect"><Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add / manage account</Button></Link>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="border rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Building2 className="w-4 h-4" />Account</CardTitle></CardHeader>
          <CardContent>
            {org ? (
              <div>
                <Row label="Ad account" value={org.adAccountName || "\u2014"} />
                <Row label="Account ID" value={String(org.adAccountId ?? adAccountId ?? "\u2014")} />
                <Row label="Currency" value={org.currencyCode || "\u2014"} />
                <Row label="Time zone" value={org.timezone || "\u2014"} />
                {/* Brand review outranks every other account detail: an account
                    that isn't approved cannot serve a single ad. */}
                <Row
                  label="Brand review"
                  value={
                    org.reviewStatus
                      ? org.reviewStatus === "approved"
                        ? "Approved"
                        : `${org.reviewStatus}${org.reviewReason ? ` (${org.reviewReason})` : ""}`
                      : "\u2014"
                  }
                />
                <Row label="API key" value={`\u2022\u2022\u2022\u2022${org.apiKeyLast4}`} />
                <Row
                  label="Connection"
                  value={org.status === "ACTIVE" ? "Active" : org.lastError || org.status}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No ad account connected yet. Add one to start syncing.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Security</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <Row label="API key storage" value={<Badge className="gap-1 border-0 bg-green-100 text-green-700"><ShieldCheck className="w-3 h-3" />Encrypted at rest</Badge>} />
              <Row label="Sign-in protection" value="Rate-limited · secure sessions" />
              <Row label="Credential exposure" value="Keys never sent to the browser" />
            </div>
            <Link href="/tools/user-profile"><Button size="sm" variant="outline" className="gap-1.5 w-fit"><User className="h-3.5 w-3.5" />Profile & email</Button></Link>
          </CardContent>
        </Card>

        {/* Two-factor authentication */}
        <div className="lg:col-span-2">
          <TwoFactorCard />
        </div>
        </div>
      </div>
    </section>
  );
}
