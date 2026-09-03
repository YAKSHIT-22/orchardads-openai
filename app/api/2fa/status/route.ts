import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";

/** Whether 2FA is enabled + remaining backup-code count (for the Settings toggle). */
export async function GET() {
  try {
    const userId = await getUserId();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return NextResponse.json(
      { enabled: Boolean(user?.twoFactorEnabled), backupCodesRemaining: user?.twoFactorBackupCodes.length ?? 0 },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ enabled: false, backupCodesRemaining: 0 }, { status: 200 });
  }
}
