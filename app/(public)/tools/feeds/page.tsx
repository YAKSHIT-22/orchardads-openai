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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"password" | "ssh_key">("password");
  const [sshKey, setSshKey] = useState("");
  const [issued, setIssued] = useState<any | null>(null);

  const sftpQuery = useQuery({
    queryKey: ["feed-sftp", adAccountId, selected],
    enabled: Boolean(adAccountId && selected),
    queryFn: async () => {
      const res = await api.get(`/feeds/sftp?adAccountId=${adAccountId}&feedId=${selected}`);
      return res.data?.access ?? null;
    },
  });

  const uploadsQuery = useQuery({
    queryKey: ["feed-uploads", adAccountId],
    enabled: Boolean(adAccountId),
    queryFn: async () => {
      const res = await api.get(`/feeds/uploads?adAccountId=${adAccountId}`);
      return (res.data?.uploads ?? []) as any[];
    },
  });

  const sftpMutation = useMutation({
    mutationFn: async (action: "create" | "activate" | "pause") => {
      const res = await api.post("/feeds/sftp", {
        adAccountId,
        feedId: selected,
        action,
        ...(action === "create"
          ? { authentication_method: authMethod, ...(sshKey ? { ssh_public_key: sshKey } : {}) }
          : {}),
      });
      return { action, data: res.data };
    },
    onSuccess: ({ action, data }) => {
      toast.success(data?.message ?? "Updated");
      // The password is returned once and never again, so hold it in component
      // state for the user to copy — deliberately not persisted anywhere.
      if (action === "create" && data?.access?.password) setIssued(data.access);
      sftpQuery.refetch();
    },
    onError: adsErrorToast,
  });

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
                  <TableRow
                    key={f.id}
                    onClick={() => setSelected(String(f.id))}
                    className={selected === String(f.id) ? "bg-accent/60 cursor-pointer" : "cursor-pointer"}
                  >
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

        {selected && (
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold">Delivery (SFTP)</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                There is no file upload for feeds — the API accepts a catalogue only over SFTP.
                Create credentials here, then point your exporter at them.
              </p>
            </div>

            {sftpQuery.data ? (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Host</dt><dd className="font-mono text-xs">{sftpQuery.data.host ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Port</dt><dd className="font-mono text-xs">{sftpQuery.data.port ?? 22}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Username</dt><dd className="font-mono text-xs">{sftpQuery.data.username ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="capitalize">{sftpQuery.data.status ?? "—"}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No SFTP access set up for this feed yet.</p>
            )}

            {issued?.password && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-medium">Password — copy it now</p>
                <p className="font-mono text-xs mt-1 break-all">{issued.password}</p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Shown once. We don&apos;t store it: a feed credential is yours to keep, and
                  holding a copy would add a secret to our breach surface for no benefit.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 max-w-lg">
              <div className="flex flex-col gap-2">
                <Label>Authentication</Label>
                <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as typeof authMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="password">Password</SelectItem>
                    <SelectItem value="ssh_key">SSH public key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {authMethod === "ssh_key" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ssh">Public key</Label>
                  <Input id="ssh" value={sshKey} onChange={(e) => setSshKey(e.target.value)}
                    placeholder="ssh-ed25519 AAAA…" className="font-mono text-xs" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => sftpMutation.mutate("create")}
                  disabled={sftpMutation.isPending || (authMethod === "ssh_key" && !sshKey.trim())}>
                  {sftpMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                  {sftpQuery.data ? "Replace credentials" : "Create credentials"}
                </Button>
                {sftpQuery.data && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => sftpMutation.mutate("activate")}
                      disabled={sftpMutation.isPending}>Activate</Button>
                    <Button size="sm" variant="outline" onClick={() => sftpMutation.mutate("pause")}
                      disabled={sftpMutation.isPending}>Pause</Button>
                  </>
                )}
              </div>
              {sftpQuery.data && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Replacing invalidates the credentials your exporter is using right now — that
                  breaks a running integration until you update it, it is not a refresh.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Recent deliveries</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Whether your catalogue actually arrived, and what happened to it.
            </p>
          </div>
          {(uploadsQuery.data ?? []).length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nothing delivered yet"
              body="Files pushed over SFTP appear here with their row counts and errors." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(uploadsQuery.data ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.filename ?? u.id}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{u.status ?? "—"}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {u.products_processed ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {u.errors ? <span className="text-destructive">{u.errors}</span> : "—"}
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
