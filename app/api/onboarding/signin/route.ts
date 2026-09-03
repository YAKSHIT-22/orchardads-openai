import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { JWT_SECRET } from "@/utils/variableConstant";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp, hashBackupCode } from "@/lib/totp";
import { redis } from "@/lib/redis";

async function generateJWT(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(JWT_SECRET);
}

export async function POST(request: Request) {
  try {
    const { email, password, code } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Throttle credential-stuffing / brute force. Headroom (15/10min) because the
    // 2FA flow re-POSTs sign-in for each code attempt, so a normal 2FA login can
    // legitimately make several requests.
    const limit = await rateLimit(`signin:${String(email).toLowerCase()}:${clientIp(request)}`, 15, 600);
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const user = await prisma.user.findUnique({ where: { email }});

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Second factor — required for EVERY user. Email OTP is the baseline factor
    // (on by default for all accounts); enabling the authenticator (TOTP) in
    // settings adds it as an alternative the user can choose at sign-in.
    //   - No TOTP  → verify with the emailed code only.
    //   - TOTP on  → verify with the authenticator, a backup code, OR the email
    //               code — whichever the user picks.
    {
      const hasTotp = Boolean(user.twoFactorEnabled && user.twoFactorSecret);
      const methods = hasTotp ? ["totp", "email"] : ["email"];
      const submitted = String(code || "").trim();

      if (!submitted) {
        // Tell the client a second factor is needed + which methods are offered.
        return NextResponse.json({ twoFactorRequired: true, methods }, { status: 200 });
      }

      const emailOtp = await redis.get(`login-otp:${user.id}`);
      const emailOk = Boolean(emailOtp) && emailOtp === submitted;

      let totpOk = false;
      let backupOk = false;
      let backupHash = "";
      if (hasTotp) {
        const secret = decryptSecret(user.twoFactorSecret!);
        totpOk = verifyTotp(secret, submitted);
        backupHash = hashBackupCode(submitted);
        backupOk = user.twoFactorBackupCodes.includes(backupHash);
      }

      if (!emailOk && !totpOk && !backupOk) {
        return NextResponse.json({ error: "Invalid authentication code.", twoFactorRequired: true, methods }, { status: 401 });
      }
      // Consume single-use factors so a code can't be replayed.
      if (emailOk) await redis.del(`login-otp:${user.id}`).catch(() => {});
      if (backupOk) {
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: user.twoFactorBackupCodes.filter((h) => h !== backupHash) },
        });
      }
    }

    // A user may sign in before connecting an ad account — don't hard-fail;
    // mark them as not-yet-connected so middleware routes them to onboarding.
    // An INVALID connection (OpenAI rejected the key) still counts as connected:
    // they should land in the app and be told to re-enter the key, not be sent
    // back through onboarding as if they had never set anything up.
    const connectionCount = await prisma.openAiAdsConnection.count({ where: { userId: user.id } });
    const hasAccessData = connectionCount > 0;

    const token = await generateJWT({ name: user.name, userId: user.id, email: user.email, role: user.role,
      emailVerified: user.verified, hasAccessData });

    const nextCookie = await cookies()
    nextCookie.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return NextResponse.json({ message: "Login successful" , name:user.name, userId: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
