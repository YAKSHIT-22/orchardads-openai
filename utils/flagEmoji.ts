/**
 * Converts an ISO-2 country code (e.g. "US", "IN") into its flag emoji
 * using Unicode regional-indicator characters. Pure function — no assets,
 * no network. Falls back to a globe for anything that isn't two letters.
 */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🌐";
  const upper = code.toUpperCase();
  const OFFSET = 0x1f1e6 - 65; // regional indicator "A" minus char code of "A"
  return String.fromCodePoint(
    OFFSET + upper.charCodeAt(0),
    OFFSET + upper.charCodeAt(1)
  );
}
