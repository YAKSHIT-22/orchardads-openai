import { prisma } from "@/lib/prisma";

/**
 * Seeded "always-on" anomaly monitors created for every org the first time its
 * Orchard Watch is opened. They watch account-wide spend and installs for
 * statistical spikes/drops. Users can disable or delete them like any alert.
 */
const DEFAULTS = [
  {
    name: "Spend anomaly (auto)",
    metric: "SPEND" as const,
    severity: "CRITICAL" as const,
    description: "account spend spikes or drops sharply",
  },
  {
    name: "Conversions anomaly (auto)",
    metric: "CONVERSIONS" as const,
    severity: "WARNING" as const,
    description: "account conversions spike or drop sharply",
  },
];

/** Create the default anomaly monitors for a user+org if none exist yet. */
export async function ensureDefaultAlerts(userId: string, adAccountId: string, adAccountName?: string | null) {
  const existing = await prisma.alert.count({ where: { userId, adAccountId, isDefault: true } });
  if (existing > 0) return;

  await prisma.alert.createMany({
    data: DEFAULTS.map((d) => ({
      userId, adAccountId, adAccountName: adAccountName || null,
      name: d.name,
      kind: "ANOMALY" as const,
      scope: "ACCOUNT" as const,
      metric: d.metric,
      sensitivity: 2.5,
      lookbackDays: 28,
      severity: d.severity,
      action: "NOTIFY" as const,
      notifyEmail: false,
      isDefault: true,
    })),
    skipDuplicates: true,
  });
}
