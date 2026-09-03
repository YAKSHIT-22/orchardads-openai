import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const RESET_TTL_SEC = 60 * 60; // 1 hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Absolute base URL for links in emails. Prefer the configured canonical domain
 * (APP_URL) so reset links always point at production; otherwise derive it from
 * the request so it works in local dev / preview without extra config.
 */
function baseUrl(request: Request): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return "";
}

/**
 * Request a password reset. Generates a one-time token (stored in Redis, never
 * exposed to the DB) and emails a reset link. Always responds success — we never
 * reveal whether an email is registered. Rate-limited per email + IP.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const ip = clientIp(request);
    const rl = await rateLimit(`forgot:${email.toLowerCase()}:${ip}`, 5, 15 * 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url");
      await redis.set(`pwreset:${token}`, user.id, "EX", RESET_TTL_SEC);
      const resetUrl = `${baseUrl(request)}/reset-password?token=${token}`;
      try { await sendPasswordResetEmail(email, resetUrl); } catch { /* don't leak send failures */ }
    }

    // Uniform response regardless of whether the email exists.
    return NextResponse.json({ message: "If that email is registered, a reset link is on its way." }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
