"use client";

/**
 * Custom audiences.
 *
 * A campaign can include or exclude these lists, and an ad group can bid
 * differently against them. Everything here is honest about two things the API
 * makes unavoidable: matching is asynchronous, so a fresh audience has no size
 * yet; and archiving is irreversible, so it asks first.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToolHeader } from "@/components/optimize/ui";
import { EmptyState } from "@/components/shell/ToolPage";
import { Users, Plus, Loader2, Upload, X } from "lucide-react";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { toast } from "sonner";

const IDENTIFIERS = [
  { value: "email", label: "Email addresses" },
  { value: "email_sha256", label: "Emails, SHA-256 hashed" },
  { value: "phone", label: "Phone numbers" },
  { value: "phone_number_sha256", label: "Phones, SHA-256 hashed" },
  { value: "gaid", label: "Google Advertising IDs" },
];

export default function AudiencesPage() {
  const { adAccountId } = adAccountStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("email");
  const [file, setFile] = useState<File | null>(null);

  const audiencesQuery = useQuery({
    queryKey: ["audiences", adAccountId],
    enabled: Boolean(adAccountId),
    queryFn: async () => {
      const res = await api.get(`/audiences?adAccountId=${adAccountId}`);
      return (res.data?.audiences ?? []) as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("adAccountId", adAccountId);
      form.append("name", name);
      form.append("identifier_type", identifier);
      if (file) form.append("file", file);
      const res = await api.post("/audiences", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(d?.message ?? "Audience created");
      queryClient.invalidateQueries({ queryKey: ["audiences", adAccountId] });
      setOpen(false);
      setName("");
      setFile(null);
    },
    onError: adsErrorToast,
  });

  const rows = audiencesQuery.data ?? [];

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-5">
        <ToolHeader
          icon={Users}
          title="Audiences"
          description="Customer lists you can target or exclude. Upload emails or phone numbers, raw or hashed — they pass straight to OpenAI and are never stored here."
        >
          <Button size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)} disabled={!adAccountId}>
            {open ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {open ? "Cancel" : "Create audience"}
          </Button>
        </ToolHeader>

        {open && (
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 max-w-xl">
            <div className="flex flex-col gap-2">
              <Label htmlFor="a-name">Name</Label>
              <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Existing customers — 2026" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>What the file contains</Label>
              <Select value={identifier} onValueChange={setIdentifier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IDENTIFIERS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hash before uploading if you would rather not send raw addresses — matching works
                either way, and the hashed options expect lowercase-trimmed SHA-256.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="a-file">Member file</Label>
              <Input id="a-file" type="file" accept=".csv,.txt,text/csv,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">
                One identifier per line. Up to 500 MB.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending || name.trim().length < 3 || !file}
              >
                {create.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
                  : <><Upload className="w-4 h-4 mr-2" />Create audience</>}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {rows.length === 0 && !audiencesQuery.isLoading ? (
            <EmptyState
              icon={Users}
              title="No audiences yet"
              body="Upload a customer list to target or exclude those people in a campaign."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contains</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {IDENTIFIERS.find((i) => i.value === a.identifier_type)?.label ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {/* Null, not zero: matching is async and "0" would read as
                          "nobody matched" when the truth is "not counted yet". */}
                      {a.size == null ? <span className="text-muted-foreground">—</span> : a.size.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{a.status ?? "processing"}</Badge>
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
