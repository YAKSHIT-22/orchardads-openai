import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp, hashBackupCode } from "@/lib/totp";

/**
 * Turn off 2FA. Requires a current authenticator code (or a backup code) so a
 * hijacked session can't silently disable it.
 */
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { code } = await req.json();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ error: "2FA isn't enabled." }, { status: 400 });
    }

    const secret = decryptSecret(user.twoFactorSecret);
    const submitted = String(code || "");
    const ok = verifyTotp(secret, submitted) || user.twoFactorBackupCodes.includes(hashBackupCode(submitted));
    if (!ok) {
      return NextResponse.json({ error: "Enter a valid code from your authenticator to disable 2FA." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorPending: null, twoFactorBackupCodes: [] },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("2fa/disable", err);
    return NextResponse.json({ error: "Couldn't disable 2FA." }, { status: 500 });
  }
}
