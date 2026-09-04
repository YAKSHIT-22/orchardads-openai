import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { adsFetchWithConnection } from "@/lib/openai/client";

/** TEMPORARY: does POST /uploads accept an image? Removed once answered. */
export const dynamic = "force-dynamic";

function ok(req: Request) {
  const exp = process.env.DIAG_TOKEN;
  if (!exp) return false;
  const a = Buffer.from(exp);
  const b = Buffer.from(req.headers.get("x-diag-token") ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Smallest valid PNG (1x1, transparent).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const conn = await prisma.openAiAdsConnection.findFirst({ orderBy: { createdAt: "asc" } });
  if (!conn) return NextResponse.json({ error: "No connection" }, { status: 400 });

  const out: Record<string, unknown>[] = [];
  async function attempt(label: string, purpose?: string) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "probe.png");
    if (purpose) form.append("purpose", purpose);
    try {
      const r = await adsFetchWithConnection<unknown>(conn!, "/uploads", {
        method: "POST",
        body: form as unknown as Record<string, unknown>,
        skipRateLimit: true,
      });
      out.push({ label, ok: true, response: r });
    } catch (e) {
      out.push({
        label,
        ok: false,
        status: (e as { status?: number }).status,
        error: String((e as Error).message).slice(0, 400),
      });
    }
  }

  await attempt("image, no purpose");
  await attempt("image, purpose=custom_audience", "custom_audience");
  await attempt("image, purpose=ad_creative", "ad_creative");
  await attempt("image, purpose=creative", "creative");

  return NextResponse.json({ results: out }, { status: 200 });
}
