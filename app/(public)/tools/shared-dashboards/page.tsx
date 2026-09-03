"use client";

/**
 * Live Share manager — lists every public dashboard link the user has
 * created (across orgs), with copy / open / revoke actions. New links are
 * created through the same ShareDashboardDialog the dashboard header uses.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

import { ToolHeader } from "@/components/optimize/ui";
import { rangeLabel } from "@/lib/dateRanges";
import { ShareDashboardDialog } from "@/components/dashboard/ShareDashboardDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Eye,
  CalendarDays,
  Clock,
  Building2,
  Loader2,
  RefreshCw,
  TriangleAlert,
  LayoutGrid,
} from "lucide-react";

type SharedDashboard = {
  id: string;
  token: string;
  adAccountId?: string;
  adAccountName: string | null;
  title: string;
  description: string | null;
  dateRange: string;
  widgets: string[];
  enabled: boolean;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
};

const WIDGET_LABELS: Record<string, string> = {
  trend: "Performance",
  comparison: "Comparison",
  topCampaigns: "Top campaigns",
  topPlacements: "Placements",
  budgetPacing: "Budget pacing",
  projectedSpend: "Projected spend",
  performanceChange: "Performance change",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type ShareStatus = { label: string; className: string };

function statusOf(share: SharedDashboard): ShareStatus {
  if (!share.enabled) {
    return { label: "Disabled", className: "bg-muted text-muted-foreground border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" };
  }
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    return { label: "Expired", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" };
  }
  return { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" };
}

function MetaItem({ icon: Icon, children, title }: { icon: typeof Eye; children: React.ReactNode; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={title}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {children}
    </span>
  );
}

function ShareCard({
  share,
  onRevoke,
}: {
  share: SharedDashboard;
  onRevoke: (share: SharedDashboard) => void;
}) {
  const [copied, setCopied] = useState(false);
  const status = statusOf(share);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${share.token}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — open the link and copy it from the address bar.");
    }
  };

  return (
    <Card className="border rounded-xl">
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold truncate" title={share.title}>
                {share.title}
              </h3>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", status.className)}>
                {status.label}
              </Badge>
            </div>
            {share.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{share.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={copyLink}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              onClick={() => onRevoke(share)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Revoke
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3">
          {share.adAccountName && <MetaItem icon={Building2}>{share.adAccountName}</MetaItem>}
          <MetaItem icon={CalendarDays}>{rangeLabel(share.dateRange)}</MetaItem>
          <MetaItem
            icon={Eye}
            title={share.lastViewedAt ? `Last viewed ${fmtDate(share.lastViewedAt)}` : "Never viewed"}
          >
            {share.viewCount.toLocaleString()} view{share.viewCount === 1 ? "" : "s"}
          </MetaItem>
          <MetaItem icon={Clock}>Created {fmtDate(share.createdAt)}</MetaItem>
          <MetaItem icon={TriangleAlert}>
            {share.expiresAt ? `Expires ${fmtDate(share.expiresAt)}` : "Never expires"}
          </MetaItem>
          {share.widgets?.length > 0 && (
            <MetaItem icon={LayoutGrid}>
              {share.widgets.map((w) => WIDGET_LABELS[w] || w).join(" · ")}
            </MetaItem>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

export default function SharedDashboardsPage() {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<SharedDashboard | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["shared-dashboards"],
    queryFn: async () => {
      const res = await api.get("/shared-dashboards");
      return (res.data.shares || []) as SharedDashboard[];
    },
    staleTime: 60 * 1000,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await api.post("/shared-dashboards/delete", { id });
    },
    onSuccess: () => {
      toast.success("Share link revoked");
      setRevoking(null);
      queryClient.invalidateQueries({ queryKey: ["shared-dashboards"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Couldn't revoke the share link.");
    },
  });

  const shares = data || [];
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["shared-dashboards"] });

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={Share2}
          title="Live Share"
          description="Public, read-only dashboard links that always show live performance. Anyone with a link can view that org's dashboard — no sign-in required."
        >
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
          >
            {isRefetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
          <ShareDashboardDialog
            triggerLabel="New Live Share link"
            triggerVariant="default"
            showManageLink={false}
            onCreated={refreshList}
          />
        </ToolHeader>

        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <Card className="border rounded-xl">
            <CardContent className="py-14 flex flex-col items-center gap-3 text-center">
              <TriangleAlert className="w-9 h-9 text-rose-400" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Couldn&apos;t load your Live Share links</p>
                <p className="text-xs text-muted-foreground/80 mt-1">Check your connection and try again.</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : shares.length === 0 ? (
          <Card className="border rounded-xl">
            <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Share2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold">No Live Share links yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Create a public link to share live campaign performance with clients or teammates —
                  they won&apos;t need an account.
                </p>
              </div>
              <ShareDashboardDialog
                triggerLabel="New Live Share link"
                triggerVariant="default"
                showManageLink={false}
                onCreated={refreshList}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground -mt-2">
              {shares.length} Live Share link{shares.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-col gap-3">
              {shares.map((share) => (
                <ShareCard key={share.id} share={share} onRevoke={setRevoking} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Revoke confirmation */}
      <Dialog open={!!revoking} onOpenChange={(o) => !o && !revoke.isPending && setRevoking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-500" />
              Revoke this share link?
            </DialogTitle>
            <DialogDescription>
              &ldquo;{revoking?.title}&rdquo; will stop working immediately for anyone who has the
              link. This can&apos;t be undone — you can always create a new link later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setRevoking(null)} disabled={revoke.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => revoking && revoke.mutate(revoking.id)}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Revoke link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
