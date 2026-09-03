import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { sendOtpEmail } from "@/lib/mailer";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { JWT_SECRET } from "@/utils/variableConstant";

export async function GET(req: Request) {
  try {
    const nextCookie = await cookies();
    const token = nextCookie.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    let email: string;
    try {
      const { payload } = await jwtVerify(
        token,
        JWT_SECRET
      );
      userId = (payload as any).userId;
      email = (payload as any).email;
    } catch (err) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const rateKey = `otp:rate:${userId}`;
    const sentCount = await redis.get(rateKey);
    if (sentCount && Number(sentCount) > 5) {
      return NextResponse.json(
        { error: "Too many attempts, Try in an hour" },
        { status: 429 }
      );
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.set(`otp:${userId}`, otp, "EX", 60 * 15);
    await redis.set(rateKey, 0, "EX", 60 * 60);
    await redis.expire(rateKey, 45 * 60);
    await sendOtpEmail(email, otp);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to send OTP" },
      { status: 500 }
    );
  }
}
