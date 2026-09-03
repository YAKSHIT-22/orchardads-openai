import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";

/** Delete a saved audit. Owner only. */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const audit = await prisma.savedAudit.findFirst({ where: { id, userId } });
    if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.savedAudit.delete({ where: { id: audit.id } });
    return NextResponse.json({ message: "Audit deleted" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Couldn't delete the audit." }, { status: 500 });
  }
}
