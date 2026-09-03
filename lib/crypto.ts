import crypto from "crypto";

/**
 * Envelope encryption for secrets at rest (AES-256-GCM).
 *
 * Encrypted values are prefixed with `enc:v1:` so we can transparently support
 * legacy plaintext rows: `decryptSecret` returns unprefixed input untouched, and
 * `encryptSecret` re-encrypts on the next write. If `ENCRYPTION_KEY` is not set,
 * encryption is a no-op passthrough (keeps local dev working) — set it in prod.
 *
 * ENCRYPTION_KEY must be 32 bytes, provided as 64 hex chars or base64.
 */

const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) {
    // In production, refuse to silently store secrets as plaintext — a missing
    // or malformed ENCRYPTION_KEY is a misconfiguration, not a soft fallback.
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production (32 bytes as 64 hex chars or base64).");
    }
    return plain; // dev-only passthrough
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) throw new Error("ENCRYPTION_KEY is required to read encrypted secrets");
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** True when the stored value is in encrypted form. */
export function isEncrypted(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}
