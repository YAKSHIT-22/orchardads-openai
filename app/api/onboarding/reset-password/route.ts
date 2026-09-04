import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

/**
 * Complete a password reset. Validates the one-time token from Redis, sets the
 * new (hashed) password, and consumes the token so it can't be reused.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(`reset-pw:${clientIp(request)}`, 10, 3600);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many reset attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { token, password } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "This reset link is invalid." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 100) {
      return NextResponse.json({ error: "Password must be 8–100 characters." }, { status: 400 });
    }

    const key = `pwreset:${token}`;
    const userId = await redis.get(key);
    if (!userId) {
      return NextResponse.json({ error: "This reset link has expired or already been used." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      await redis.del(key);
      return NextResponse.json({ error: "This reset link is no longer valid." }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    await redis.del(key); // one-time use

    return NextResponse.json({ message: "Password updated. You can sign in now." }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
