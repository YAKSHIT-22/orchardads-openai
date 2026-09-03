import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";

/** Revoke (delete) a shared dashboard. Only the owner can. */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const share = await prisma.sharedDashboard.findFirst({ where: { id, userId } });
    if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.sharedDashboard.delete({ where: { id: share.id } });
    return NextResponse.json({ message: "Share revoked" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Couldn't revoke the share." }, { status: 500 });
  }
}
