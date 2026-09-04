import { NextResponse } from "next/server";
import crypto from "crypto";
import { verifyRecaptcha } from "@/lib/auth/recaptcha";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { redis } from "@/lib/redis";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { generateJWT } from "@/lib/generateJwt";
import { jwtVerify } from "jose";
import { JWT_SECRET } from "@/utils/variableConstant";

const bodySchema = z.object({
  otp: z.string().length(6),
  recaptchaToken: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const { otp, recaptchaToken } = bodySchema.parse(await req.json());
    const captcha = await verifyRecaptcha(recaptchaToken, clientIp(req));
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: captcha.status });
    }
    const nextCookie = await cookies();
    const checktoken = nextCookie.get("token")?.value;
    if (!checktoken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(
        checktoken,
        JWT_SECRET
      );
      userId = (payload as any).userId;
    } catch (err) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    // Failed guesses live in their own key. Requesting a new code no longer
    // clears it, so the attempt budget spans the whole verification episode.
    const failKey = `otp:fails:${userId}`;
    const stored = await redis.get(`otp:${userId}`);
    const fails = Number((await redis.get(failKey)) ?? 0);

    const ipLimit = await rateLimit(`otp-verify:${clientIp(req)}`, 30, 3600);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${Math.ceil(ipLimit.retryAfter / 60)} minute(s).` },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } }
      );
    }

    if (!stored) {
      return NextResponse.json({ error: "OTP expired" }, { status: 400 });
    }
    if (fails >= 5) {
      return NextResponse.json(
        { error: "Too many incorrect codes. Try again in an hour." },
        { status: 429 }
      );
    }
    // Constant-time compare: a 6-digit secret is short enough that an early-exit
    // string comparison is worth not leaking.
    const a = Buffer.from(String(stored));
    const b = Buffer.from(String(otp));
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      const n = await redis.incr(failKey);
      if (n === 1) await redis.expire(failKey, 60 * 60);
      return NextResponse.json(
        { error: "Invalid OTP! Please Try Again" },
        { status: 400 }
      );
    }

    await redis.del(`otp:${userId}`);
    await redis.del(failKey);
    await redis.del(`otp:sends:${userId}`);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { verified: "VERIFIED" },
    });

    const token = await generateJWT({
      name: updatedUser.name,
      userId: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      emailVerified: updatedUser.verified,
      hasAccessData: false,
    });
    nextCookie.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
