import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

/**
 * Mint the app session token.
 *
 * This is OUR session, not an OpenAI credential — it never carries the
 * advertiser's API key or anything derived from it. It holds only what
 * middleware needs to route: userId, role, email-verification state, and
 * whether the user has connected an ad account yet.
 */
export type SessionPayload = {
  userId: string;
  role: "USER" | "ADMIN";
  emailVerified: "UNVERIFIED" | "VERIFIED" | "BLOCKED" | "SUSPENDED";
  /** True once at least one OpenAI Ads account is connected. */
  hasAccessData: boolean;
};

export async function generateJWT(payload: SessionPayload | Record<string, unknown>) {
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(JWT_SECRET);
}
