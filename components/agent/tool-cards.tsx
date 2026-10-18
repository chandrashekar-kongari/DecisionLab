"use client";

import Link from "next/link";
import { useState } from "react";
import { ResultChart } from "@/components/experiments/result-chart";
import { Button } from "@/components/ui/button";
import { formatCadence, type Cadence } from "@/lib/experiments/schedule";

type ToolProps = {
  args: Record<string, unknown>;
  result?: unknown;
  status: { type: string };
};

export function DataToolCard({ args, result, status }: ToolProps) {
  const data = asRecord(result);
  const running = status.type === "running" && !data;
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-sm">
        {stringOf(args.table) || "Available sources"}
        <span className="text-muted-foreground">
          {" "}
          ·{" "}
          {running ? "Reading data…" : dataSourceLabel(data)}
        </span>
      </p>
      {data ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Sample
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto text-xs leading-5 text-muted-foreground">
            {JSON.stringify(
              data.sample ?? data.rows ?? data.tables ?? data,
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

export function ExecutePythonCard({ args, result, status }: ToolProps) {
  const data = asRecord(result);
  const running = !data && status.type !== "incomplete";
  const label = running ? "Running" : data?.ok ? "Completed" : "Failed";
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-sm">
        CreateOS execution
        <span className="text-muted-foreground"> · {label}</span>
      </p>
      {data ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Sandbox {stringOf(data.sandboxId) || "—"} · exit{" "}
          {stringOf(data.exitCode) || "—"} · {stringOf(data.durationMs) || "—"}{" "}
          ms
        </p>
      ) : null}
      {data?.error ? (
        <p className="mt-2 text-sm text-destructive">{stringOf(data.error)}</p>
      ) : null}
      {data?.result ? (
        <div className="mt-3">
          <ResultChart results={data.result} />
        </div>
      ) : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Generated code
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto text-xs leading-5">
          {stringOf(args.source)}
        </pre>
      </details>
      {data?.stdout || data?.stderr ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Logs
          </summary>
          {data.stdout ? (
            <pre className="mt-2 max-h-40 overflow-auto text-xs">
              stdout{"\n"}
              {stringOf(data.stdout)}
            </pre>
          ) : null}
          {data.stderr ? (
            <pre className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground">
              stderr{"\n"}
              {stringOf(data.stderr)}
            </pre>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

export function ExperimentToolCard({ result, status }: ToolProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const data = asRecord(result);
  const experiments = Array.isArray(data?.experiments)
    ? data.experiments
    : null;
  if (experiments) {
    return (
      <article className="rounded-lg border border-border bg-card px-3 py-3">
        <p className="text-sm font-medium">Experiments</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {experiments.length === 0 ? (
            <li className="text-muted-foreground">None saved yet.</li>
          ) : null}
          {experiments.map((item) => {
            const experiment = asRecord(item);
            if (!experiment) return null;
            return (
              <li key={stringOf(experiment.id)}>
                <Link
                  href={`/experiments/${stringOf(experiment.id)}`}
                  className="hover:underline"
                >
                  {stringOf(experiment.name)}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {stringOf(experiment.status)}
                </span>
              </li>
            );
          })}
        </ul>
      </article>
    );
  }
  const experiment = asRecord(data?.experiment);
  if (status.type === "running" && !data) {
    return (
      <article className="rounded-lg border border-border px-3 py-3 text-sm">
        Updating experiment…
      </article>
    );
  }
  if (!experiment) {
    return (
      <article className="rounded-lg border border-border px-3 py-3 text-sm text-destructive">
        {stringOf(data?.error) || "Experiment action did not return a record."}
      </article>
    );
  }
  const id = stringOf(experiment.id);
  const cadence = isCadence(experiment.cadence) ? experiment.cadence : "manual";

  async function activate() {
    setBusy(true);
    const response = await fetch(`/api/experiments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    setBusy(false);
    setMessage(
      response.ok
        ? "Activated. Scheduled runs use the saved Python."
        : (body?.message ?? "Activation failed."),
    );
  }

  return (
    <article className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{stringOf(experiment.name)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stringOf(experiment.objective)}
          </p>
        </div>
        <p className="text-2xs text-muted-foreground">
          {stringOf(experiment.status)}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatCadence({
          cadence,
          intervalHours: numberOrNull(experiment.intervalHours),
          hourUtc: numberOrNull(experiment.hourUtc),
          weekday: numberOrNull(experiment.weekday),
        })}
        {experiment.latestInsight
          ? ` · ${stringOf(experiment.latestInsight)}`
          : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/experiments/${id}`}>View experiment</Link>
        </Button>
        {experiment.status === "draft" ? (
          <Button size="sm" disabled={busy} onClick={() => void activate()}>
            Activate
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className="mt-2 text-xs text-muted-foreground">{message}</p>
      ) : null}
    </article>
  );
}

export function RunToolCard({ result }: ToolProps) {
  const data = asRecord(result);
  const run = asRecord(data?.run);
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-sm font-medium">
        {data?.ok ? "Run completed" : "Run failed"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {stringOf(data?.message) || stringOf(data?.error)}
      </p>
      {run?.results ? (
        <div className="mt-3">
          <ResultChart results={run.results} />
        </div>
      ) : null}
      {run?.stderr ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Logs
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto text-xs text-muted-foreground">
            {stringOf(run.stderr)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

function dataSourceLabel(data: Record<string, unknown> | null): string {
  if (!data) return "Sample data";
  if (data.ok === false && typeof data.error === "string") return data.error;
  if (data.stripeConnected === true && data.supabaseConnected === true) {
    return "Stripe and Supabase";
  }
  if (data.stripeConnected === true) return "Stripe";
  if (data.supabaseConnected === true) return "Supabase";
  if (data.source === "mcp") return "Account data";
  if (data.demoData === true) return "Demo data";
  return "Sample data";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function isCadence(value: unknown): value is Cadence {
  return (
    value === "manual" ||
    value === "hourly" ||
    value === "daily" ||
    value === "weekly" ||
    value === "interval"
  );
}
