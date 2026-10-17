"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartFromResult,
  numericKeys,
  specMatchingSeries,
  type ChartPoint,
  type ChartSpec,
  type ChartType,
} from "@/lib/experiments/charts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function ResultChart({
  results,
  title,
}: {
  results: unknown;
  title?: string;
}) {
  const view = useMemo(() => chartFromResult(results), [results]);
  const [type, setType] = useState<ChartType | null>(null);
  const [metric, setMetric] = useState<string | null>(null);

  if (!view) {
    return (
      <p className="text-sm text-muted-foreground">
        This run did not include a chartable series or numeric metrics.
      </p>
    );
  }

  const available = numericKeys(view.series);
  const selectedType = type ?? view.spec.type;
  const selectedMetric = metric && available.includes(metric) ? metric : view.spec.yKeys[0];
  const spec: ChartSpec = {
    ...view.spec,
    type: selectedType,
    yKeys: selectedMetric ? [selectedMetric] : view.spec.yKeys,
    title: title ?? view.spec.title,
  };
  const matched = specMatchingSeries(spec, view.series) ?? spec;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Chart
          <select
            className="h-7 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={matched.type}
            onChange={(event) => setType(event.target.value as ChartType)}
          >
            <option value="line">Line</option>
            <option value="bar">Bar</option>
            <option value="scatter">Scatter</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Metric
          <select
            className="h-7 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={matched.yKeys[0]}
            onChange={(event) => setMetric(event.target.value)}
          >
            {available.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>
      {matched.title ? <p className="text-sm text-foreground">{matched.title}</p> : null}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ChartBody spec={matched} series={view.series} />
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartBody({ spec, series }: { spec: ChartSpec; series: ChartPoint[] }) {
  const color = COLORS[0];
  if (spec.type === "line") {
    return (
      <LineChart data={series}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <Tooltip />
        {spec.yKeys.map((key, index) => (
          <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index] ?? color} dot={false} strokeWidth={1.5} />
        ))}
      </LineChart>
    );
  }
  if (spec.type === "scatter") {
    return (
      <ScatterChart>
        <CartesianGrid stroke="var(--border)" />
        <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <YAxis dataKey={spec.yKeys[0]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <Tooltip />
        <Scatter data={series} fill={color} />
      </ScatterChart>
    );
  }
  return (
    <BarChart data={series}>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
      <Tooltip />
      {spec.yKeys.map((key, index) => (
        <Bar key={key} dataKey={key} fill={COLORS[index] ?? color} radius={2} />
      ))}
    </BarChart>
  );
}
