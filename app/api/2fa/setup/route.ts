import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/openai/client";
import { encryptSecret } from "@/lib/crypto";
import { generateTotpSecret, otpauthURL } from "@/lib/totp";

/**
 * Begin 2FA enrollment: generate a fresh secret, stash it as PENDING (encrypted,
 * not yet active), and return the QR + manual key so the user can add it to
 * their authenticator app. Enrollment is confirmed by /api/2fa/enable.
 */
export async function POST() {
  try {
    const userId = await getUserId();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (user.twoFactorEnabled) {
      return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 400 });
    }

    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: userId }, data: { twoFactorPending: encryptSecret(secret) } });

    const uri = otpauthURL(secret, user.email);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

    return NextResponse.json({ secret, otpauthUrl: uri, qr }, { status: 200 });
  } catch (err) {
    console.error("2fa/setup", err);
    return NextResponse.json({ error: "Couldn't start 2FA setup." }, { status: 500 });
  }
}
