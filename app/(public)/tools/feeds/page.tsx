"use client";

/**
 * Product feeds — the catalogue a product ad renders from.
 *
 * Only relevant to `product_ad_template` creatives and campaigns in
 * `product_feed` mode. Everything else in this product works without one, so
 * the empty state says that rather than implying something is missing.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToolHeader } from "@/components/optimize/ui";
import { EmptyState } from "@/components/shell/ToolPage";
import { PackageSearch, Plus, Loader2, X } from "lucide-react";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { toast } from "sonner";

export default function FeedsPage() {
  const { adAccountId } = adAccountStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [countries, setCountries] = useState("");

  const feedsQuery = useQuery({
    queryKey: ["feeds", adAccountId],
    enabled: Boolean(adAccountId),
    queryFn: async () => {
      const res = await api.get(`/feeds?adAccountId=${adAccountId}`);
      return (res.data?.feeds ?? []) as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const list = countries
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);
      const res = await api.post("/feeds", {
        adAccountId,
        name,
        ...(list.length ? { countries: list } : {}),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Feed created");
      queryClient.invalidateQueries({ queryKey: ["feeds", adAccountId] });
      setOpen(false);
      setName("");
      setCountries("");
    },
    onError: adsErrorToast,
  });

  const rows = feedsQuery.data ?? [];

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={PackageSearch}
          title="Feeds"
          description="Product catalogues behind product ads. Only needed for product-ad creatives — chat card ads work without one."
        >
          <Button size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)} disabled={!adAccountId}>
            {open ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {open ? "Cancel" : "Create feed"}
          </Button>
        </ToolHeader>

        {open && (
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 max-w-xl">
            <div className="flex flex-col gap-2">
              <Label htmlFor="f-name">Name</Label>
              <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main catalogue" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="f-countries">
                Countries <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input id="f-countries" value={countries} onChange={(e) => setCountries(e.target.value)}
                placeholder="IN, US, GB" />
              <p className="text-xs text-muted-foreground">
                Two-letter codes, comma separated. Leave empty for all.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create feed
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {rows.length === 0 && !feedsQuery.isLoading ? (
            <EmptyState
              icon={PackageSearch}
              title="No product feeds"
              body="You only need one if you plan to run product ads. Chat card ads don't use a feed."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Countries</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.countries?.length ? f.countries.join(", ") : "All"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{f.status ?? "—"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </section>
  );
}
