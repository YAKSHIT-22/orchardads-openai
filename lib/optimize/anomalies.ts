import type { DailyData } from "@/types/reportsDetails";

/**
 * Anomaly detection on daily performance time-series.
 *
 * For each metric, compares a recent day against the mean +/- k*stddev of the
 * preceding trailing window (a rolling z-score). Pure logic — feed it the
 * `dailyData` a report already produces.
 *
 * A note on what this can and cannot see on this platform: at $3-5 CPCs a small
 * advertiser generates a handful of conversions a day, so a conversion-based
 * z-score on a small account is mostly measuring randomness. `minSamples` and
 * the flat-baseline guard exist to keep the detector quiet rather than
 * confidently wrong; spend and impressions are the metrics that behave.
 */

export type DailyPoint = {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Micros, matching the API. */
  spendMicros: number;
};

export type AnomalyMetric = "spend" | "conversions" | "clicks" | "impressions" | "cpa" | "ctr";

export type Anomaly = {
  date: string;
  metric: AnomalyMetric;
  value: number;
  expected: number; // trailing mean
  z: number;
  direction: "spike" | "drop";
  /** Fractional change vs expected (0.25 == +25%). */
  changePct: number;
};

export type AnomalyConfig = {
  /** Trailing days used as the baseline for each point. */
  window: number;
  /** z-score magnitude required to flag. */
  threshold: number;
  /** How many of the most recent days to check. */
  recentDays: number;
  /** Baseline days that must carry a non-zero value before a metric is judged. */
  minSamples?: number;
};

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  window: 14,
  threshold: 2,
  recentDays: 5,
  minSamples: 7,
};

const METRICS: AnomalyMetric[] = ["spend", "conversions", "clicks", "impressions", "cpa", "ctr"];

function metricValue(p: DailyPoint, metric: AnomalyMetric): number | null {
  switch (metric) {
    case "spend":
      return p.spendMicros;
    case "conversions":
      return p.conversions;
    case "clicks":
      return p.clicks;
    case "impressions":
      return p.impressions;
    case "cpa":
      // Null, not 0: a day with no conversions has no CPA. Treating it as zero
      // would make every zero-conversion day look like a spectacular result.
      return p.conversions > 0 ? p.spendMicros / p.conversions : null;
    case "ctr":
      return p.impressions > 0 ? p.clicks / p.impressions : null;
  }
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[], m: number) {
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Detect anomalies in the most recent days of a daily series. */
export function detectAnomalies(
  daily: DailyPoint[],
  config: AnomalyConfig = DEFAULT_ANOMALY_CONFIG
): Anomaly[] {
  const series = [...(daily || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (series.length < config.window + 1) return [];

  const minSamples = config.minSamples ?? Math.ceil(config.window / 2);
  const anomalies: Anomaly[] = [];
  const startIdx = Math.max(config.window, series.length - config.recentDays);

  for (let i = startIdx; i < series.length; i++) {
    for (const metric of METRICS) {
      const value = metricValue(series[i], metric);
      if (value === null) continue;

      const baseline = series
        .slice(i - config.window, i)
        .map((p) => metricValue(p, metric))
        .filter((v): v is number => v !== null);

      if (baseline.length < minSamples) continue;

      const m = mean(baseline);
      const s = std(baseline, m);
      if (s <= 0) continue; // flat baseline -> skip (avoids divide-by-zero noise)

      const z = (value - m) / s;
      if (Math.abs(z) < config.threshold) continue;

      anomalies.push({
        date: series[i].date,
        metric,
        value,
        expected: m,
        z,
        direction: z > 0 ? "spike" : "drop",
        changePct: m > 0 ? (value - m) / m : 0,
      });
    }
  }

  anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return anomalies;
}

/** Convert a report's daily series into anomaly input. */
export function dailyFromReport(daily: DailyData[]): DailyPoint[] {
  return (daily || [])
    .map((d) => ({
      date: d.date,
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      spendMicros: d.spendMicros,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Aggregate several entities' daily series into one account-level series. */
export function mergeDaily(series: DailyPoint[][]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const s of series) {
    for (const p of s) {
      const prev =
        map.get(p.date) ?? { date: p.date, impressions: 0, clicks: 0, conversions: 0, spendMicros: 0 };
      map.set(p.date, {
        date: p.date,
        impressions: prev.impressions + p.impressions,
        clicks: prev.clicks + p.clicks,
        conversions: prev.conversions + p.conversions,
        spendMicros: prev.spendMicros + p.spendMicros,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
