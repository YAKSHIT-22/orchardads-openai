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
import { CreativePreview } from "@/components/user/forms/CreativePreview";
import { adsErrorToast } from "@/lib/openai/errorToast";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { toast } from "sonner";
import {
  Check, ChevronLeft, Loader2, Megaphone, Layers, Tags, Plus, Pencil, X,
} from "lucide-react";
import Link from "next/link";

type Step = 1 | 2 | 3 | 4;

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
  const { adAccountId, connections, selectedIndex } = adAccountStore();
  const accountName = connections?.[selectedIndex ?? 0]?.adAccountName ?? null;

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
      // The route returns the raw ListEnvelope under `adGroups`, i.e.
      // { object, data: [...] } — not an array. Unwrap it, or the list renders
      // empty while the API happily returned rows.
      const env = res.data?.adGroups;
      return (Array.isArray(env) ? env : (env?.data ?? [])) as any[];
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

  // Opening an existing campaign should land on its ad groups, not on the
  // campaign form — you came to change something inside it. Only once, so it
  // doesn't fight the user's own navigation afterwards.
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (!jumped && editingId && groups.length > 0) {
      setStep(2);
      setJumped(true);
    }
  }, [jumped, editingId, groups.length]);

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
      const env = res.data?.ads;
      return (Array.isArray(env) ? env : (env?.data ?? [])) as any[];
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

        <div className="grid lg:grid-cols-[15rem_1fr] gap-6 items-start">
          {/* Structure rail.
              Editing used to open on step 1 with no sign that the campaign
              already had an ad group and an ad — they existed, but nothing on
              screen said so until you clicked forward twice. Ads Manager keeps
              the whole tree visible; so does this, and it doubles as the step
              navigator. */}
          <aside className="rounded-xl border border-border bg-card p-3 lg:sticky lg:top-4">
            <button
              onClick={() => setStep(1)}
              className={[
                "w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 text-sm",
                step === 1 ? "bg-accent text-foreground font-medium" : "hover:bg-accent/60",
              ].join(" ")}
            >
              <Megaphone className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.name?.trim() || "Untitled campaign"}</span>
            </button>

            <div className="mt-1 pl-2 border-l border-border ml-3.5 flex flex-col">
              {groupsQuery.isLoading && campaignId && (
                <span className="px-2.5 py-2 text-xs text-muted-foreground">Loading ad groups…</span>
              )}
              {groups.map((ag) => {
                const on = String(ag.id) === selectedGroupId;
                return (
                  <div key={ag.id} className="flex flex-col">
                    <button
                      onClick={() => { setSelectedGroupId(String(ag.id)); setStep(2); }}
                      className={[
                        "text-left rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-sm",
                        on && step === 2 ? "bg-accent text-foreground font-medium" : "hover:bg-accent/60",
                      ].join(" ")}
                    >
                      <Layers className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{ag.name}</span>
                    </button>
                    {on && (
                      <div className="pl-4 flex flex-col">
                        {ads.map((ad) => (
                          <button
                            key={ad.id}
                            onClick={() => { setStep(3); }}
                            className="text-left rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-xs hover:bg-accent/60"
                          >
                            <Tags className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{ad.name ?? ad.creative?.title ?? "Untitled ad"}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => { resetAd(); setStep(3); }}
                          className="text-left rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-xs text-muted-foreground hover:bg-accent/60"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" /> New ad
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {campaignId && (
                <button
                  onClick={() => { resetGroup(); setStep(2); }}
                  className="text-left rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-sm text-muted-foreground hover:bg-accent/60"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" /> New ad group
                </button>
              )}
            </div>

            <button
              onClick={() => canStep3 && setStep(4)}
              disabled={!canStep3}
              className={[
                "mt-2 w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 text-sm disabled:opacity-40",
                step === 4 ? "bg-accent text-foreground font-medium" : "hover:bg-accent/60",
              ].join(" ")}
            >
              <Check className="w-4 h-4 shrink-0 text-muted-foreground" />
              Review
            </button>
          </aside>

          <div className="min-w-0 flex flex-col gap-4">
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
              <div className="grid lg:grid-cols-[1fr_18rem] gap-6 items-start">
                <div className="flex flex-col gap-4 min-w-0">
                  <h3 className="text-sm font-semibold">Creative</h3>
                  <CreativeFields value={creative} onChange={setCreative} />
                </div>
                <div className="lg:sticky lg:top-4">
                  <CreativePreview creative={creative} advertiser={accountName} />
                </div>
              </div>

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
              <Button onClick={() => setStep(4)}>Next: Review</Button>
            </div>
          </div>
        )}

        {/* ── Review ──────────────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold">Campaign summary</h2>

              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-muted-foreground text-xs">Campaign</dt><dd>{c.name || "—"}</dd></div>
                <div><dt className="text-muted-foreground text-xs">Status</dt><dd className="capitalize">{c.status}</dd></div>
                <div><dt className="text-muted-foreground text-xs">Bidding</dt><dd className="capitalize">{c.bidding_type}</dd></div>
                <div>
                  <dt className="text-muted-foreground text-xs">Lifetime budget</dt>
                  <dd>{c.lifetime || "—"}{c.daily ? ` · ${c.daily}/day` : ""}</dd>
                </div>
              </dl>

              <div className="h-px bg-border" />

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  {groups.length} ad group{groups.length === 1 ? "" : "s"}
                </h3>
                {groups.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    A campaign with no ad group cannot serve — Serving Doctor will report it as
                    <span className="font-mono"> campaign_has_no_ad_groups</span>.
                  </p>
                )}
                {groups.map((ag) => (
                  <div key={ag.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{ag.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 capitalize">{ag.status}</span>
                  </div>
                ))}
              </div>

              {selectedGroupId && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">
                      {ads.length} ad{ads.length === 1 ? "" : "s"} in the selected ad group
                    </h3>
                    {ads.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        An ad group with no ad cannot serve either.
                      </p>
                    )}
                    {ads.map((ad) => (
                      <div key={ad.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{ad.name ?? ad.creative?.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {ad.review?.status ? `review: ${ad.review.status}` : ad.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                Everything here is already saved — each step commits on its own, because the API
                has no transaction spanning campaign, ad group and ad. This is a check, not a
                submit.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={() => router.push("/tools/campaign")}>Done</Button>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </section>
  );
}
