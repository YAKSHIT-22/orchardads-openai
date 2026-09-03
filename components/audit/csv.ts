/**
 * Tiny client-side CSV builder + Blob download. All fields are quoted so
 * commas/quotes/newlines in campaign or ad names can't break rows.
 */

export type CsvValue = string | number | null | undefined;

function csvCell(v: CsvValue): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 (currencies, non-Latin terms) correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Filename-safe slug, e.g. "Weekly health check" → "weekly-health-check". */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "audit"
  );
}
