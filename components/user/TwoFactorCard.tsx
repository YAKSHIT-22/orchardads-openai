"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Loader2, Copy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "idle" | "enrolling" | "backup" | "disabling";

export function TwoFactorCard() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["2fa-status"],
    queryFn: async () => (await api.get("/2fa/status")).data as { enabled: boolean; backupCodesRemaining: number },
    staleTime: 30_000,
  });
  const enabled = !!statusQuery.data?.enabled;

  const reset = () => { setPhase("idle"); setSetup(null); setCode(""); };
  const refresh = () => qc.invalidateQueries({ queryKey: ["2fa-status"] });

  const setupMutation = useMutation({
    mutationFn: async () => (await api.post("/2fa/setup", {})).data as { qr: string; secret: string; otpauthUrl: string },
    onSuccess: (d) => { setSetup({ qr: d.qr, secret: d.secret }); setPhase("enrolling"); },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Couldn't start 2FA setup"),
  });

  const enableMutation = useMutation({
    mutationFn: async () => (await api.post("/2fa/enable", { code: code.trim() })).data as { backupCodes: string[] },
    onSuccess: (d) => { setBackupCodes(d.backupCodes || []); setPhase("backup"); setCode(""); refresh(); toast.success("Two-factor authentication enabled"); },
    onError: (e: any) => toast.error(e?.response?.data?.error || "That code isn't right"),
  });

  const disableMutation = useMutation({
    mutationFn: async () => api.post("/2fa/disable", { code: code.trim() }),
    onSuccess: () => { reset(); refresh(); toast.success("Two-factor authentication disabled"); },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Enter a valid code to disable"),
  });

  const onToggle = (on: boolean) => {
    if (on && !enabled) setupMutation.mutate();
    else if (!on && enabled) setPhase("disabling");
  };

  const copyBackup = () => {
    navigator.clipboard.writeText(backupCodes.join("\n")).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success("Backup codes copied");
    });
  };

  return (
    <Card className="border rounded-xl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Two-Factor Authentication</CardTitle>
        {statusQuery.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex items-center gap-2">
            <Badge className={cn("gap-1 border-0", enabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500")}>
              {enabled ? "On" : "Off"}
            </Badge>
            <Switch
              checked={enabled || phase === "enrolling"}
              disabled={setupMutation.isPending || phase === "enrolling" || phase === "disabling"}
              onCheckedChange={onToggle}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {phase === "idle" && (
          <p className="text-sm text-muted-foreground">
            {enabled
              ? `Your account is protected with an authenticator app. ${statusQuery.data?.backupCodesRemaining ?? 0} backup code(s) remaining.`
              : "Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password…). Toggle on to set it up."}
          </p>
        )}

        {phase === "enrolling" && setup && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">1. Scan this QR code with your authenticator app, or enter the key manually.</p>
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="2FA QR code" className="w-40 h-40 rounded-lg border bg-white p-1" />
              <div className="flex flex-col gap-2 w-full">
                <Label className="text-xs">Manual entry key</Label>
                <code className="text-xs font-mono break-all bg-muted rounded-md p-2">{setup.secret}</code>
                <Label className="text-xs mt-2">2. Enter the 6-digit code it shows</Label>
                <Input inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className="tracking-[0.25em] text-center font-mono h-9" />
                <div className="flex gap-2 mt-1">
                  <Button size="sm" onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending || code.trim().length < 6} className="gap-1.5">
                    {enableMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Verify &amp; enable
                  </Button>
                  <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {phase === "backup" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">Save these backup codes somewhere safe. Each can be used once if you lose your authenticator. They won&apos;t be shown again.</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
              {backupCodes.map((c) => <span key={c} className="bg-muted rounded px-2 py-1 text-center">{c}</span>)}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyBackup} className="gap-1.5">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}Copy codes</Button>
              <Button size="sm" onClick={reset}>Done</Button>
            </div>
          </div>
        )}

        {phase === "disabling" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Enter a current authenticator code (or a backup code) to turn 2FA off.</p>
            <div className="flex gap-2">
              <Input inputMode="numeric" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="h-9 w-40 font-mono" />
              <Button size="sm" variant="destructive" onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending || !code.trim()} className="gap-1.5">
                {disableMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Disable
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
