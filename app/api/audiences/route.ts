import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdsRoute, AppError } from "@/lib/openai/client";
import { AudienceService } from "@/lib/openai/services";
import { requireFeature } from "@/lib/billing/entitlements";

/**
 * Custom audiences — targeting filters built from a customer list.
 *
 * The member file is uploaded first (multipart, purpose=custom_audience) and
 * the returned file id is attached at creation. Processing is asynchronous, so
 * a newly created audience is NOT immediately usable and its size is unknown;
 * the UI must say so rather than showing an empty audience as ready.
 *
 * Raw emails and phone numbers are personal data. They pass through this route
 * to OpenAI and are never written to our database — we store nothing about a
 * customer's audience members, only what the API tells us about the audience.
 */
export const maxDuration = 120;

export const GET = withAdsRoute(async ({ userId, req }) => {
  const adAccountId = new URL(req.url).searchParams.get("adAccountId");
  if (!adAccountId) throw new AppError("adAccountId required", 400);
  const res = await AudienceService.list({ userId, adAccountId });
  return NextResponse.json({ audiences: res?.data ?? [] }, { status: 200 });
});

const createSchema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().trim().min(3).max(1000),
  description: z.string().max(1000).optional(),
  identifier_type: z
    .enum(["email", "phone", "email_sha256", "phone_number_sha256", "gaid"])
    .optional(),
});

export const POST = withAdsRoute(async ({ userId, req }) => {
  await requireFeature(userId, "apply_actions");

  const contentType = req.headers.get("content-type") ?? "";

  // Multipart => a member file came with it; JSON => an empty audience.
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const adAccountId = String(form.get("adAccountId") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const identifierType = String(form.get("identifier_type") ?? "email");
    const file = form.get("file");

    if (!adAccountId) throw new AppError("adAccountId required", 400);
    if (name.length < 3) throw new AppError("Give the audience a name of at least 3 characters", 400);
    if (!(file instanceof File)) throw new AppError("Attach a member file", 400);
    if (file.size > 500_000_000) throw new AppError("That file is over the 500 MB limit.", 400);

    const ctx = { userId, adAccountId };
    const uploaded = await AudienceService.upload(ctx, file);
    const audience = await AudienceService.create(ctx, {
      name,
      file_id: uploaded.file_id,
      identifier_type: identifierType as never,
      identifier_resolution: "auto",
      filename: file.name,
      mimetype: file.type || "text/csv",
      file_size: file.size,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        adAccountId,
        action: "AUDIENCE_CREATED",
        entityType: "AUDIENCE",
        entityId: audience.id,
        entityName: audience.name,
        // Deliberately records the file's shape, never its contents.
        meta: { filename: file.name, bytes: file.size, identifierType },
      },
    });

    return NextResponse.json(
      {
        message: "Audience created. Matching runs in the background — size appears once it finishes.",
        data: audience,
      },
      { status: 201 }
    );
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  const { adAccountId, ...body } = parsed.data;

  const audience = await AudienceService.create({ userId, adAccountId }, body);
  return NextResponse.json({ message: "Audience created", data: audience }, { status: 201 });
});
