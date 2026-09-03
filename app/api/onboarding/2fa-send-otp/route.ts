import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendOtpEmail } from "@/lib/mailer";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/**
 * Send a login second-factor code by email. Used when a 2FA-enabled user chooses
 * "email me a code" instead of their authenticator app during sign-in.
 *
 * The password is re-verified before anything is sent, so an attacker can't spam
 * codes to a victim's inbox or probe which emails are registered. Rate-limited.
 * The code is stored in Redis (login-otp:<userId>, 15 min) and accepted by the
 * signin route as a valid second factor.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const rl = await rateLimit(`2fa-otp:${String(email).toLowerCase()}:${clientIp(request)}`, 5, 15 * 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many code requests. Try again later." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Email OTP is the baseline second factor for every account, so only the
    // password needs to be correct. Generic errors so we never reveal whether
    // the email exists or the password was right.
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) {
      return NextResponse.json({ error: "Couldn't send a code. Check your email and password." }, { status: 401 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.set(`login-otp:${user.id}`, otp, "EX", 60 * 15);
    // Dev fallback: surface the code in the server log so local sign-in works
    // even when SMTP isn't configured. Never logs in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] login OTP for ${email}: ${otp}`);
    }
    await sendOtpEmail(email, otp);

    return NextResponse.json({ message: "A code is on its way to your email." }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
