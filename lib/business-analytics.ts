import { z } from "zod";

export const analyticsRanges = ["7d", "30d", "3m", "1y"] as const;
export type AnalyticsRange = (typeof analyticsRanges)[number];
export const analyticsRangeLabels: Record<AnalyticsRange, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "3m": "3 meses",
  "1y": "1 ano",
};
const count = z.number().int().nonnegative();
const daySchema = z.object({
  date: z.iso.date(),
  appointments: count,
  completed: count,
  cancelled: count,
});
const reportSchema = z.object({
  range: z.enum(analyticsRanges),
  timezone: z.string().min(1).max(80),
  starts_on: z.iso.date(),
  ends_on: z.iso.date(),
  totals: z.object({
    appointments: count,
    completed: count,
    cancelled: count,
    future: count,
  }),
  days: z.array(daySchema).min(1).max(366),
});
export type BusinessAnalyticsReport = z.infer<typeof reportSchema>;
export function analyticsRange(
  value: string | string[] | undefined,
): AnalyticsRange {
  return analyticsRanges.find((range) => range === value) ?? "7d";
}
export function parseBusinessAnalytics(value: unknown, range: AnalyticsRange) {
  const result = reportSchema.safeParse(value);
  if (!result.success || result.data.range !== range) return null;
  const report = result.data;
  if (
    report.days[0].date !== report.starts_on ||
    report.days.at(-1)?.date !== report.ends_on ||
    report.days.some(
      (day, index) =>
        day.completed + day.cancelled > day.appointments ||
        (index > 0 && day.date <= report.days[index - 1].date),
    )
  )
    return null;
  for (const key of ["appointments", "completed", "cancelled"] as const) {
    if (
      report.days.reduce((total, day) => total + day[key], 0) !==
      report.totals[key]
    )
      return null;
  }
  return report;
}
