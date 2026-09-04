"use client";

/**
 * Creative editor — mirrors CreateAdCreativeParams exactly.
 *
 * The API validates strictly (a stray member 400s the whole request), so this
 * form offers the seven documented members and nothing else:
 *   type, title, body, price, target_url, file_id, image_crop
 *
 * `image_url` is deliberately absent from the form: it comes back on reads as
 * the rendered asset, but the API does not accept it on write.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_LIMITS } from "@/utils/variableConstant";
import { CircleAlert, ImageIcon } from "lucide-react";

export type CreativeDraft = {
  type: "chat_card" | "product_ad_template";
  title: string;
  body: string;
  price?: string;
  target_url?: string;
  file_id?: string;
};

/** Live counter that turns red only once the API would actually reject. */
function Counter({ value, max }: { value: string; max: number }) {
  const n = value?.length ?? 0;
  return (
    <span className={n > max ? "text-destructive" : "text-muted-foreground"}>
      {n}/{max}
    </span>
  );
}

export function CreativeFields({
  value,
  onChange,
  disabled,
}: {
  value: CreativeDraft;
  onChange: (next: CreativeDraft) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof CreativeDraft>(k: K, v: CreativeDraft[K]) =>
    onChange({ ...value, [k]: v });

  const isProductAd = value.type === "product_ad_template";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="text-sm">Creative type</Label>
        <Select
          value={value.type}
          onValueChange={(v) => set("type", v as CreativeDraft["type"])}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chat_card">Chat card</SelectItem>
            <SelectItem value="product_ad_template">Product ad template</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isProductAd
            ? "Rendered from a product in your feed. Images come from the feed, so no upload here."
            : "A card shown inside the ChatGPT conversation. Title, body and destination are yours."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="cr-title" className="text-sm">Title</Label>
          <span className="text-xs"><Counter value={value.title} max={ACCOUNT_LIMITS.adTitleMax} /></span>
        </div>
        <Input
          id="cr-title"
          value={value.title}
          disabled={disabled}
          onChange={(e) => set("title", e.target.value)}
          placeholder="What you're offering, in a few words"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="cr-body" className="text-sm">Body</Label>
          <span className="text-xs"><Counter value={value.body} max={ACCOUNT_LIMITS.adBodyMax} /></span>
        </div>
        <Textarea
          id="cr-body"
          rows={3}
          value={value.body}
          disabled={disabled}
          onChange={(e) => set("body", e.target.value)}
          placeholder="One clear sentence about why it's worth a click"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cr-url" className="text-sm">Destination URL</Label>
        <Input
          id="cr-url"
          value={value.target_url ?? ""}
          disabled={disabled}
          onChange={(e) => set("target_url", e.target.value)}
          placeholder="https://example.com/landing-page"
        />
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
          <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
          This page must be reachable by OpenAI&apos;s crawler. Blocking bots in
          robots.txt, a 403, or a login wall are the most common rejection reasons —
          and they reject the ad, not the campaign.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cr-price" className="text-sm">
          Price <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="cr-price"
          value={value.price ?? ""}
          disabled={disabled}
          onChange={(e) => set("price", e.target.value)}
          placeholder="e.g. From $29/mo"
        />
      </div>

      {!isProductAd && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="cr-file" className="text-sm">
            Image file ID <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="cr-file"
            value={value.file_id ?? ""}
            disabled={disabled}
            onChange={(e) => set("file_id", e.target.value)}
            placeholder="file_…"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <ImageIcon className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
            The id of a file already uploaded to your OpenAI Ads account. We don&apos;t
            host images — the ad references the asset by id.
          </p>
        </div>
      )}
    </div>
  );
}
