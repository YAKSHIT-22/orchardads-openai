import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";

/** Record that an audit was run (updates lastRunAt). Owner only. */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const audit = await prisma.savedAudit.findFirst({ where: { id, userId } });
    if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.savedAudit.update({ where: { id: audit.id }, data: { lastRunAt: new Date() } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Couldn't update the audit." }, { status: 500 });
  }
}
