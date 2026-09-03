import { NextResponse } from "next/server";
import { verifyRecaptcha } from "@/lib/auth/recaptcha";
import { clientIp } from "@/lib/rateLimit";
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
    const rateKey = `otp:rate:${userId}`;
    const stored = await redis.get(`otp:${userId}`);
    const sentCount = await redis.get(rateKey);

    if (!stored) {
      return NextResponse.json({ error: "OTP expired" }, { status: 400 });
    }
    if (sentCount && Number(sentCount) > 5) {
      return NextResponse.json(
        { error: "Too many attempts, Try in an hour" },
        { status: 429 }
      );
    }
    if (stored !== otp) {
      await redis.incr(rateKey);
      return NextResponse.json(
        { error: "Invalid OTP! Please Try Again" },
        { status: 400 }
      );
    }

    await redis.del(`otp:${userId}`);
    await redis.del(rateKey);

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
