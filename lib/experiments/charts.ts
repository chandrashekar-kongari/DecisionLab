import { z } from "zod";

export const chartTypeSchema = z.enum(["line", "bar", "scatter"]);

export const chartSpecSchema = z.object({
  type: chartTypeSchema,
  xKey: z.string().min(1),
  yKeys: z.array(z.string().min(1)).min(1).max(4),
  title: z.string().max(120).optional(),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartType = z.infer<typeof chartTypeSchema>;

const pointSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const sandboxResultSchema = z.object({
  summary: z.string().optional(),
  kind: z.enum(["simulation", "observation"]).optional(),
  metrics: z.record(z.string(), z.number()).optional(),
  series: z.array(pointSchema).optional(),
  assumptions: z.array(z.string()).optional(),
  chart: chartSpecSchema.optional(),
});

export type SandboxResult = z.infer<typeof sandboxResultSchema>;
export type ChartPoint = z.infer<typeof pointSchema>;

export type ChartView = {
  spec: ChartSpec;
  series: ChartPoint[];
};

export function parseSandboxResult(value: unknown): SandboxResult | null {
  const parsed = sandboxResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function chartFromResult(value: unknown): ChartView | null {
  const parsed = parseSandboxResult(value);
  if (!parsed) return null;
  if (parsed.series && parsed.series.length > 0) {
    const hinted = parsed.chart ? specMatchingSeries(parsed.chart, parsed.series) : null;
    if (hinted) return { spec: hinted, series: parsed.series };
    const inferred = inferSpec(parsed.series);
    if (inferred) return { spec: inferred, series: parsed.series };
  }
  if (parsed.metrics && Object.keys(parsed.metrics).length > 0) {
    return {
      spec: { type: "bar", xKey: "label", yKeys: ["value"], title: "Metrics" },
      series: Object.entries(parsed.metrics).map(([label, metric]) => ({ label, value: metric })),
    };
  }
  return null;
}

export function numericKeys(series: ChartPoint[]): string[] {
  const keys = new Set<string>();
  for (const row of series) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number" && Number.isFinite(value)) keys.add(key);
    }
  }
  return [...keys];
}

export function specMatchingSeries(spec: ChartSpec, series: ChartPoint[]): ChartSpec | null {
  if (!series.some((row) => spec.xKey in row)) return null;
  const yKeys = spec.yKeys.filter((key) => numericKeys(series).includes(key));
  if (yKeys.length === 0) return null;
  return { ...spec, yKeys };
}

function inferSpec(series: ChartPoint[]): ChartSpec | null {
  const yKeys = numericKeys(series).slice(0, 3);
  if (yKeys.length === 0) return null;
  const xKey = series.some((row) => typeof row.label === "string")
    ? "label"
    : (Object.keys(series[0] ?? {}).find((key) => !yKeys.includes(key)) ?? yKeys[0]);
  return { type: "bar", xKey, yKeys };
}
