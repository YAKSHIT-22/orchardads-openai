"use client";

/**
 * Campaign → ad group → ads, in one flow.
 *
 * These used to be three separate tools, which meant creating a working ad took
 * three visits and left people with orphans: a campaign with no ad group cannot
 * serve, and an ad group with no ad cannot serve. Both show up in Serving Doctor
 * as `campaign_has_no_ad_groups` / `ad_group_has_no_ads` — self-inflicted by the
 * old navigation. Keeping the three steps in one page makes the complete object
 * the default outcome.
 *
 * The same page edits: `?campaignId=…` loads the campaign and its children, and
 * every step becomes edit-in-place. So the landing table's Edit action and the
 * New Campaign action are the same screen.
 *
 * Each step commits on its own — the API has no transaction across these three
 * creates, so pretending otherwise would lose an ad group if step 3 failed.
 * Progress is therefore real progress, and a half-finished flow is resumable
 * rather than lost.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { adAccountStore } from "@/stores/adAccountStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreativeFields, type CreativeDraft } from "@/components/user/forms/CreativeFields";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { toast } from "sonner";
import {
  Check, ChevronLeft, Loader2, Megaphone, Layers, Tags, Plus, Pencil, X,
} from "lucide-react";
import Link from "next/link";

type Step = 1 | 2 | 3;

const MICROS = 1_000_000;
const toMicros = (v: string) => Math.round(parseFloat(v || "0") * MICROS);
const fromMicros = (v: unknown) =>
  v == null ? "" : String(Number(v) / MICROS);

function StepDot({ n, active, done, label, icon: Icon }: {
  n: number; active: boolean; done: boolean; label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={[
          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium border",
          done
            ? "bg-primary text-primary-foreground border-primary"
            : active
              ? "border-primary text-primary"
              : "border-border text-muted-foreground",
        ].join(" ")}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={active || done ? "w-4 h-4 text-foreground" : "w-4 h-4 text-muted-foreground"} />
        <span className={["text-sm truncate", active || done ? "text-foreground" : "text-muted-foreground"].join(" ")}>
          {label}
        </span>
      </div>
    </div>
  );
}

export default function CampaignBuilderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { adAccountId } = adAccountStore();

  const editingId = params.get("campaignId");
  const [campaignId, setCampaignId] = useState<string | null>(editingId);
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: campaign ──────────────────────────────────────────────────────
  const [c, setC] = useState({
    name: "",
    description: "",
    status: "paused" as "active" | "paused",
    bidding_type: "clicks" as "impressions" | "clicks" | "conversions",
    lifetime: "",
    daily: "",
  });

  const campaignQuery = useQuery({
    queryKey: ["builder-campaign", adAccountId, campaignId],
    enabled: Boolean(adAccountId && campaignId),
    queryFn: async () => {
      const res = await api.post("/campaign/findcampaigns", { adAccountId, campaignId });
      return res.data?.campaign ?? res.data?.data ?? null;
    },
  });

  useEffect(() => {
    const d = campaignQuery.data;
    if (!d) return;
    setC({
      name: d.name ?? "",
      description: d.description ?? "",
      status: d.status === "active" ? "active" : "paused",
      bidding_type: d.bidding_type ?? "clicks",
      lifetime: fromMicros(d.budget?.lifetime_spend_limit_micros),
      daily: fromMicros(d.budget?.daily_spend_limit_micros),
    });
  }, [campaignQuery.data]);

  const saveCampaign = useMutation({
    mutationFn: async () => {
      const budget = {
        ...(c.lifetime ? { lifetime_spend_limit_micros: toMicros(c.lifetime) } : {}),
        ...(c.daily ? { daily_spend_limit_micros: toMicros(c.daily) } : {}),
      };
      const body = {
        adAccountId,
        name: c.name,
        description: c.description || undefined,
        status: c.status,
        bidding_type: c.bidding_type,
        budget,
      };
      if (campaignId) {
        const res = await api.post("/campaign/updatecampaign", { ...body, campaignId });
        return res.data?.data ?? res.data;
      }
      const res = await api.post("/campaign/createcampaign", body);
      return res.data?.data ?? res.data;
    },
    onSuccess: (data) => {
      const id = data?.id ?? campaignId;
      if (id) setCampaignId(String(id));
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(campaignId ? "Campaign saved" : "Campaign created");
      setStep(2);
    },
    onError: adsErrorToast,
  });

  // ── Step 2: ad groups ─────────────────────────────────────────────────────
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [g, setG] = useState({
    name: "",
    description: "",
    status: "paused" as "active" | "paused",
    maxBid: "",
    hints: "",
  });
  const resetGroup = () => {
    setEditingGroupId(null);
    setG({ name: "", description: "", status: "paused", maxBid: "", hints: "" });
  };

  const groupsQuery = useQuery({
    queryKey: ["builder-adgroups", adAccountId, campaignId],
    enabled: Boolean(adAccountId && campaignId),
    queryFn: async () => {
      const res = await api.post("/adgroups/getall", { adAccountId, campaignId });
      return (res.data?.data ?? res.data?.adGroups ?? []) as any[];
    },
  });

  const saveGroup = useMutation({
    mutationFn: async () => {
      const hints = g.hints.split("\n").map((h) => h.trim()).filter(Boolean);
      const common = {
        adAccountId,
        name: g.name,
        description: g.description || undefined,
        status: g.status,
        max_bid_micros: toMicros(g.maxBid),
        ...(hints.length ? { context_hints: hints } : {}),
      };
      if (editingGroupId) {
        // NOT campaign_id: an ad group cannot move between campaigns, and the
        // update route forwards the body as-is — an unknown member would be
        // rejected outright rather than ignored.
        const res = await api.post("/adgroups/update", { ...common, adGroupId: editingGroupId });
        return res.data?.data ?? res.data;
      }
      const res = await api.post("/adgroups/create", { ...common, campaign_id: campaignId });
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      groupsQuery.refetch();
      toast.success(editingGroupId ? "Ad group saved" : "Ad group created");
      resetGroup();
    },
    onError: adsErrorToast,
  });

  const groups = groupsQuery.data ?? [];
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedGroupId && groups.length) setSelectedGroupId(String(groups[0].id));
  }, [groups, selectedGroupId]);

  // ── Step 3: ads ───────────────────────────────────────────────────────────
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [adName, setAdName] = useState("");
  const [adStatus, setAdStatus] = useState<"active" | "paused">("paused");
  const [creative, setCreative] = useState<CreativeDraft>({
    type: "chat_card", title: "", body: "", target_url: "",
  });
  const resetAd = () => {
    setEditingAdId(null);
    setAdName("");
    setAdStatus("paused");
    setCreative({ type: "chat_card", title: "", body: "", target_url: "" });
  };

  const adsQuery = useQuery({
    queryKey: ["builder-ads", adAccountId, selectedGroupId],
    enabled: Boolean(adAccountId && selectedGroupId),
    queryFn: async () => {
      const res = await api.post("/ads/getall", { adAccountId, adGroupId: selectedGroupId });
      return (res.data?.data ?? res.data?.ads ?? []) as any[];
    },
  });

  const saveAd = useMutation({
    mutationFn: async () => {
      const cr = {
        type: creative.type,
        title: creative.title,
        body: creative.body,
        ...(creative.target_url ? { target_url: creative.target_url } : {}),
        ...(creative.price ? { price: creative.price } : {}),
        ...(creative.file_id ? { file_id: creative.file_id } : {}),
      };
      if (editingAdId) {
        const res = await api.post("/ads/update", {
          adAccountId, adId: editingAdId, name: adName, status: adStatus, creative: cr,
        });
        return res.data;
      }
      const res = await api.post("/ads/create", {
        adAccountId, ad_group_id: selectedGroupId, name: adName, status: adStatus, creative: cr,
      });
      return res.data;
    },
    onSuccess: (d) => {
      adsQuery.refetch();
      toast.success(d?.message ?? (editingAdId ? "Ad saved" : "Ad created"));
      resetAd();
    },
    onError: adsErrorToast,
  });

  const ads = adsQuery.data ?? [];

  const canStep2 = Boolean(campaignId);
  const canStep3 = Boolean(selectedGroupId);

  if (!adAccountId) {
    return (
      <section className="w-full p-6">
        <p className="text-sm text-muted-foreground">Connect an ad account to build a campaign.</p>
      </section>
    );
  }

  return (
    <section className="w-full p-4 md:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link href="/tools/campaign"><ChevronLeft className="w-4 h-4 mr-1" />Campaigns</Link>
            </Button>
            <h1 className="text-lg font-semibold tracking-tight truncate">
              {editingId ? "Edit campaign" : "New campaign"}
            </h1>
          </div>
          {campaignId && <Badge variant="secondary" className="font-mono text-xs shrink-0">{campaignId}</Badge>}
        </div>

        {/* Steps */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <button onClick={() => setStep(1)} className="text-left">
            <StepDot n={1} label="Campaign" icon={Megaphone} active={step === 1} done={Boolean(campaignId) && step > 1} />
          </button>
          <button onClick={() => canStep2 && setStep(2)} disabled={!canStep2} className="text-left disabled:opacity-40">
            <StepDot n={2} label="Ad groups" icon={Layers} active={step === 2} done={groups.length > 0 && step > 2} />
          </button>
          <button onClick={() => canStep3 && setStep(3)} disabled={!canStep3} className="text-left disabled:opacity-40">
            <StepDot n={3} label="Ads" icon={Tags} active={step === 3} done={false} />
          </button>
        </div>

        {/* ── Step 1 ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="c-name">Campaign name</Label>
              <Input id="c-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })}
                placeholder="e.g. Spring launch — India" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="c-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea id="c-desc" rows={2} value={c.description}
                onChange={(e) => setC({ ...c, description: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Bidding</Label>
                <Select value={c.bidding_type} onValueChange={(v) => setC({ ...c, bidding_type: v as typeof c.bidding_type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="impressions">Impressions (CPM)</SelectItem>
                    <SelectItem value="clicks">Clicks (CPC)</SelectItem>
                    <SelectItem value="conversions">Conversions (oCPC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select value={c.status} onValueChange={(v) => setC({ ...c, status: v as typeof c.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-life">Lifetime budget</Label>
                <Input id="c-life" inputMode="decimal" value={c.lifetime}
                  onChange={(e) => setC({ ...c, lifetime: e.target.value })} placeholder="500.00" />
                <p className="text-xs text-muted-foreground">
                  Required by the API. When it&apos;s spent the campaign stops for good — this is a
                  total, not a monthly allowance.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-daily">Daily cap <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="c-daily" inputMode="decimal" value={c.daily}
                  onChange={(e) => setC({ ...c, daily: e.target.value })} placeholder="25.00" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => saveCampaign.mutate()}
                disabled={saveCampaign.isPending || c.name.trim().length < ACCOUNT_LIMITS.nameMin || !c.lifetime}
              >
                {saveCampaign.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {campaignId ? "Save and continue" : "Create and continue"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2 ─────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {groups.length > 0 && (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {groups.map((ag) => (
                  <div key={ag.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ag.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ag.status} · max bid {fromMicros(ag.bidding_config?.max_bid_micros) || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingGroupId(String(ag.id));
                        setG({
                          name: ag.name ?? "",
                          description: ag.description ?? "",
                          status: ag.status === "active" ? "active" : "paused",
                          maxBid: fromMicros(ag.bidding_config?.max_bid_micros),
                          hints: (ag.context_hints ?? []).join("\n"),
                        });
                      }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedGroupId(String(ag.id)); setStep(3); }}>
                        Ads
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{editingGroupId ? "Edit ad group" : "Add an ad group"}</h2>
                {editingGroupId && (
                  <Button size="sm" variant="ghost" onClick={resetGroup}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="g-name">Name</Label>
                <Input id="g-name" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="g-bid">Max bid</Label>
                  <Input id="g-bid" inputMode="decimal" value={g.maxBid}
                    onChange={(e) => setG({ ...g, maxBid: e.target.value })} placeholder="1.50" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Status</Label>
                  <Select value={g.status} onValueChange={(v) => setG({ ...g, status: v as typeof g.status })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="g-hints">Context hints <span className="text-muted-foreground font-normal">(one per line)</span></Label>
                <Textarea id="g-hints" rows={3} value={g.hints}
                  onChange={(e) => setG({ ...g, hints: e.target.value })}
                  placeholder={"comparing project management tools for a small team\nlooking for a CRM that works offline"} />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  These are not keywords. Describe the situation someone is in when your
                  product is genuinely useful — an intent or a moment, in plain language.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={() => saveGroup.mutate()}
                  disabled={saveGroup.isPending || g.name.trim().length < ACCOUNT_LIMITS.nameMin || !g.maxBid}>
                  {saveGroup.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingGroupId ? "Save ad group" : <><Plus className="w-4 h-4 mr-1" />Add ad group</>}
                </Button>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!canStep3}>Continue to ads</Button>
            </div>
          </div>
        )}

        {/* ── Step 3 ─────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Ad group</Label>
              <Select value={selectedGroupId ?? ""} onValueChange={(v) => { setSelectedGroupId(v); resetAd(); }}>
                <SelectTrigger><SelectValue placeholder="Pick an ad group" /></SelectTrigger>
                <SelectContent>
                  {groups.map((ag) => <SelectItem key={ag.id} value={String(ag.id)}>{ag.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {ads.length > 0 && (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {ads.map((ad) => (
                  <div key={ad.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ad.name ?? ad.creative?.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {ad.status}
                        {ad.review?.status ? ` · review: ${ad.review.status}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => {
                      setEditingAdId(String(ad.id));
                      setAdName(ad.name ?? "");
                      setAdStatus(ad.status === "active" ? "active" : "paused");
                      setCreative({
                        type: ad.creative?.type === "product_ad_template" ? "product_ad_template" : "chat_card",
                        title: ad.creative?.title ?? "",
                        body: ad.creative?.body ?? "",
                        target_url: ad.creative?.target_url ?? "",
                        price: ad.creative?.price ?? "",
                        file_id: ad.creative?.file_id ?? "",
                      });
                    }}><Pencil className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{editingAdId ? "Edit ad" : "Add an ad"}</h2>
                {editingAdId && (
                  <Button size="sm" variant="ghost" onClick={resetAd}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="a-name">Ad name</Label>
                  <Input id="a-name" value={adName} onChange={(e) => setAdName(e.target.value)}
                    placeholder="Internal label — not shown to anyone" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Status</Label>
                  <Select value={adStatus} onValueChange={(v) => setAdStatus(v as typeof adStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="h-px bg-border" />
              <h3 className="text-sm font-semibold">Creative</h3>
              <CreativeFields value={creative} onChange={setCreative} />

              <div className="flex justify-end">
                <Button onClick={() => saveAd.mutate()}
                  disabled={
                    saveAd.isPending || !selectedGroupId ||
                    adName.trim().length < ACCOUNT_LIMITS.nameMin ||
                    creative.title.trim().length < 3 || !creative.body.trim()
                  }>
                  {saveAd.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingAdId ? "Save ad" : <><Plus className="w-4 h-4 mr-1" />Add ad</>}
                </Button>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button variant="outline" onClick={() => router.push("/tools/campaign")}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
