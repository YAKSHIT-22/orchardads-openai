import { createHmac, randomBytes, timingSafeEqual, createHash } from "crypto";

/**
 * Minimal RFC 6238 TOTP + RFC 4648 base32, using only node:crypto (no deps).
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode bytes as base32 (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode a base32 string (padding/spaces tolerated) to bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[=\s]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new base32 TOTP secret (default 20 bytes = 160 bits). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** Compute the TOTP code for a given secret at a given time. */
export function totpCode(secret: string, atMs = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(atMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Verify a submitted token against the secret, allowing ±`window` steps of
 * clock drift. Constant-time compare per candidate.
 */
export function verifyTotp(secret: string, token: string, window = 1, step = 30): boolean {
  const t = (token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const candidate = totpCode(secret, now + w * step * 1000, step);
    const a = Buffer.from(candidate);
    const b = Buffer.from(t);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Build the otpauth:// URI an authenticator app scans. */
export function otpauthURL(secret: string, account: string, issuer = "OrchardAds"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Generate N human-friendly backup codes (returned once) + their hashes to store. */
export function generateBackupCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    codes.push(code);
    hashes.push(hashBackupCode(code));
  }
  return { codes, hashes };
}

/** Hash a backup code for storage / comparison (normalized: lowercase, no dashes). */
export function hashBackupCode(code: string): string {
  const norm = (code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return createHash("sha256").update(norm).digest("hex");
}
