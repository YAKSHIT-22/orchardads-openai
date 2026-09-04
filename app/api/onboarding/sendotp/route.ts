import { NextResponse } from "next/server";
import crypto from "crypto";
import { redis } from "@/lib/redis";
import { rateLimit, clientIp } from "@/lib/rateLimit";
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
    // Sends and failed guesses are counted SEPARATELY.
    //
    // They used to share one `otp:rate` key that this route reset to 0 on every
    // send, which defeated both limits at once: a caller could burn five wrong
    // guesses, request a fresh code to zero the counter, and repeat — so a
    // six-digit OTP had no effective attempt limit — while the resend cap could
    // never fire because it was checked and then immediately cleared.
    const sendKey = `otp:sends:${userId}`;
    const sends = Number((await redis.get(sendKey)) ?? 0);
    if (sends >= 5) {
      return NextResponse.json(
        { error: "Too many codes requested. Try again in an hour." },
        { status: 429 }
      );
    }

    // Also cap per IP, so one host can't cycle accounts to send mail.
    const ipLimit = await rateLimit(`otp-send:${clientIp(req)}`, 20, 3600);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${Math.ceil(ipLimit.retryAfter / 60)} minute(s).` },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } }
      );
    }

    // crypto.randomInt, not Math.random: this is an authentication factor, and
    // Math.random is neither uniform nor unpredictable.
    const otp = String(crypto.randomInt(100000, 1000000));
    await redis.set(`otp:${userId}`, otp, "EX", 60 * 15);

    // Count the send, expiring the window an hour out. INCR alone leaves a key
    // with no TTL, so set the expiry on first use.
    const n = await redis.incr(sendKey);
    if (n === 1) await redis.expire(sendKey, 60 * 60);

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
