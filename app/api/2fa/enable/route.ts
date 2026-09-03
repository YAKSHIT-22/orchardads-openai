import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { verifyTotp, generateBackupCodes } from "@/lib/totp";

/**
 * Confirm 2FA enrollment: verify a code from the authenticator against the
 * PENDING secret, then activate it and issue one-time backup codes (shown once).
 */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { code } = await req.json();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorPending) {
      return NextResponse.json({ error: "Start setup first." }, { status: 400 });
    }

    const secret = decryptSecret(user.twoFactorPending);
    if (!verifyTotp(secret, String(code || ""))) {
      return NextResponse.json({ error: "That code isn't right. Check your authenticator and try again." }, { status: 400 });
    }

    const { codes, hashes } = generateBackupCodes(10);
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: encryptSecret(secret),
        twoFactorPending: null,
        twoFactorBackupCodes: hashes,
      },
    });

    return NextResponse.json({ success: true, backupCodes: codes }, { status: 200 });
  } catch (err) {
    console.error("2fa/enable", err);
    return NextResponse.json({ error: "Couldn't enable 2FA." }, { status: 500 });
  }
}
