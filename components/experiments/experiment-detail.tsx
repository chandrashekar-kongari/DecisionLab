"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ResultChart } from "@/components/experiments/result-chart";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDay, formatTime } from "@/lib/format";
import { parseSandboxResult } from "@/lib/experiments/charts";
import { formatCadence, type Cadence } from "@/lib/experiments/schedule";
import type {
  ExperimentInsight,
  ExperimentRecord,
  ExperimentRun,
  ExperimentStatus,
  ExperimentVersion,
} from "@/lib/experiments/types";

type Detail = {
  experiment: ExperimentRecord;
  versions: ExperimentVersion[];
  runs: ExperimentRun[];
  insights: ExperimentInsight[];
};

const TABS = ["Overview", "Results", "Run history", "Generated code", "Configuration"] as const;
type Tab = (typeof TABS)[number];

export function ExperimentDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [pending, setPending] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/experiments/${params.id}`);
    if (!response.ok) {
      setError("Experiment not found.");
      setDetail(null);
      return;
    }
    const body = (await response.json()) as Detail;
    setDetail(body);
    setError(null);
    setRunId((current) => current ?? body.runs[0]?.id ?? null);
    setVersionId((current) => current ?? body.versions[0]?.id ?? null);
  }, [params.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(path: string, init: RequestInit) {
    setPending(true);
    setError(null);
    const response = await fetch(path, init);
    const body = (await response.json().catch(() => null)) as { message?: string; experiment?: ExperimentRecord } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.message ?? "The action failed.");
      return;
    }
    if (body?.experiment && path.endsWith("/duplicate")) {
      router.push(`/experiments/${body.experiment.id}`);
      return;
    }
    await load();
  }

  if (!detail && !error) return <p className="text-sm text-muted-foreground">Loading experiment…</p>;
  if (!detail) return <p className="text-sm text-destructive">{error}</p>;

  const { experiment } = detail;
  const selectedRun = detail.runs.find((run) => run.id === runId) ?? detail.runs[0] ?? null;
  const compareRun = detail.runs.find((run) => run.id === compareId) ?? null;
  const selectedVersion = detail.versions.find((version) => version.id === versionId) ?? detail.versions[0] ?? null;

  return (
    <>
      <PageHeader breadcrumb="Experiments" title={experiment.name} description={experiment.objective} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={badgeStatus(experiment.status)}>{experiment.status}</StatusBadge>
        <span className="text-xs text-muted-foreground">{formatCadence(experiment)}</span>
        {experiment.codeStale ? (
          <span className="text-xs text-warning">{experiment.staleReason}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1">
          {experiment.status === "active" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(`/api/experiments/${experiment.id}`, json({ action: "pause" }))}>
              Pause
            </Button>
          ) : null}
          {experiment.status === "paused" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(`/api/experiments/${experiment.id}`, json({ action: "resume" }))}>
              Resume
            </Button>
          ) : null}
          {experiment.status === "draft" || experiment.status === "failed" ? (
            <Button size="sm" disabled={pending} onClick={() => void mutate(`/api/experiments/${experiment.id}`, json({ action: "activate" }))}>
              Start
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(`/api/experiments/${experiment.id}/run`, { method: "POST" })}>
            Run now
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(`/api/experiments/${experiment.id}/duplicate`, { method: "POST" })}>
            Duplicate
          </Button>
          {experiment.status !== "archived" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void mutate(`/api/experiments/${experiment.id}`, json({ action: "archive" }))}>
              Archive
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`-mb-px border-b px-3 py-2 text-sm ${tab === item ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "Overview" ? (
        <Overview experiment={experiment} insights={detail.insights} />
      ) : null}
      {tab === "Results" ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <RunSelect label="Run" runs={detail.runs} value={selectedRun?.id ?? ""} onChange={setRunId} />
            <RunSelect label="Compare" runs={detail.runs} value={compareId ?? ""} onChange={setCompareId} allowEmpty />
          </div>
          {selectedRun ? <ResultChart results={selectedRun.results} /> : <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {selectedRun && compareRun ? <Comparison left={compareRun} right={selectedRun} /> : null}
          <InsightList insights={detail.insights.filter((insight) => !selectedRun || insight.runId === selectedRun.id || insight.runId === null)} />
        </section>
      ) : null}
      {tab === "Run history" ? (
        <History
          runs={detail.runs}
          onOpen={(id) => {
            const index = detail.runs.findIndex((run) => run.id === id);
            setRunId(id);
            setCompareId(detail.runs[index + 1]?.id ?? null);
            setTab("Results");
          }}
        />
      ) : null}
      {tab === "Generated code" ? (
        <section className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Version
            <select
              className="h-7 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={selectedVersion?.id ?? ""}
              onChange={(event) => setVersionId(event.target.value)}
            >
              {detail.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} · {formatDay(version.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-xs leading-5 text-foreground">
            {selectedVersion?.pythonSource ?? "No Python has been saved."}
          </pre>
          {selectedRun ? (
            <ExecutionLog run={selectedRun} />
          ) : null}
        </section>
      ) : null}
      {tab === "Configuration" ? (
        <Configuration
          experiment={experiment}
          pending={pending}
          onSave={(body) => void mutate(`/api/experiments/${experiment.id}`, json(body))}
        />
      ) : null}
      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/experiments" className="underline-offset-4 hover:underline">Back to experiments</Link>
      </p>
    </>
  );
}

function Overview({ experiment, insights }: { experiment: ExperimentRecord; insights: ExperimentInsight[] }) {
  const latest = insights[0];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Info label="Status" value={experiment.status} />
      <Info label="Next execution" value={stamp(experiment.nextRunAt)} />
      <Info label="Last execution" value={stamp(experiment.lastRunAt)} />
      <Info label="Data sources" value={experiment.dataSources.join(", ") || "—"} />
      <Info label="Success metrics" value={experiment.successMetrics.join(", ") || "—"} />
      <Info label="Constraints" value={experiment.constraints.join(", ") || "—"} />
      <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <p className="text-2xs font-medium text-muted-foreground">Latest note</p>
        <p className="mt-1 text-sm">{latest?.content ?? experiment.latestInsight ?? "No insight yet."}</p>
      </div>
    </div>
  );
}

function History({ runs, onOpen }: { runs: ExperimentRun[]; onOpen: (id: string) => void }) {
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No executions yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="text-2xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Trigger</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Exit</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const previous = runs[index + 1];
            return (
              <tr key={run.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{stamp(run.startedAt)}</td>
                <td className="px-3 py-2">{run.trigger}</td>
                <td className="px-3 py-2">{run.status}</td>
                <td className="px-3 py-2">{run.exitCode ?? "—"}</td>
                <td className="px-3 py-2">{run.durationMs === null ? "—" : `${run.durationMs} ms`}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" className="text-xs underline-offset-4 hover:underline" onClick={() => onOpen(run.id)}>
                    {previous ? "Compare with older run" : "View"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Comparison({ left, right }: { left: ExperimentRun; right: ExperimentRun }) {
  const before = parseSandboxResult(left.results)?.metrics ?? {};
  const after = parseSandboxResult(right.results)?.metrics ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (keys.length === 0) return null;
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Sandbox output comparison</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Differences between two executions. These are computed outputs, not measured live-business changes.
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {keys.map((key) => (
          <li key={key}>
            {key}: {before[key] ?? "—"} → {after[key] ?? "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightList({ insights }: { insights: ExperimentInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {insights.map((insight) => (
        <li key={insight.id} className="rounded-lg border border-border px-3 py-2">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">{insight.kind.replaceAll("_", " ")}</p>
          <p className="mt-1 text-sm">{insight.content}</p>
        </li>
      ))}
    </ul>
  );
}

function ExecutionLog({ run }: { run: ExperimentRun }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-xs">
      <p>Sandbox {run.sandboxId ?? "—"} · exit {run.exitCode ?? "—"} · {run.durationMs ?? "—"} ms</p>
      {run.error ? <p className="mt-2 text-destructive">{run.error}</p> : null}
      {run.stdout ? <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">stdout{"\n"}{run.stdout}</pre> : null}
      {run.stderr ? <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-muted-foreground">stderr{"\n"}{run.stderr}</pre> : null}
    </div>
  );
}

function Configuration({
  experiment,
  pending,
  onSave,
}: {
  experiment: ExperimentRecord;
  pending: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [objective, setObjective] = useState(experiment.objective);
  const [constraints, setConstraints] = useState(experiment.constraints.join("\n"));
  const [cadence, setCadence] = useState<Cadence>(experiment.cadence);
  const [intervalHours, setIntervalHours] = useState(experiment.intervalHours ?? 6);
  const [hourUtc, setHourUtc] = useState(experiment.hourUtc ?? 0);
  const [weekday, setWeekday] = useState(experiment.weekday ?? 1);
  const [onFailure, setOnFailure] = useState(experiment.notificationPrefs.onFailure);
  const [onInsight, setOnInsight] = useState(experiment.notificationPrefs.onInsight);

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          objective,
          constraints: constraints.split("\n").map((line) => line.trim()).filter(Boolean),
          cadence,
          intervalHours: cadence === "interval" ? intervalHours : null,
          hourUtc: cadence === "daily" || cadence === "weekly" ? hourUtc : null,
          weekday: cadence === "weekly" ? weekday : null,
          notificationPrefs: { onFailure, onInsight },
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Objective
        <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Constraints
        <Textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Schedule
        <select className="h-8 rounded-md border border-border bg-background px-2" value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)}>
          <option value="manual">Manual</option>
          <option value="hourly">Hourly</option>
          <option value="interval">Every N hours</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {cadence === "interval" ? (
        <label className="flex flex-col gap-1 text-sm">
          Hours
          <input className="h-8 rounded-md border border-border bg-background px-2" type="number" min={1} max={24} value={intervalHours} onChange={(event) => setIntervalHours(Number(event.target.value))} />
        </label>
      ) : null}
      {cadence === "daily" || cadence === "weekly" ? (
        <label className="flex flex-col gap-1 text-sm">
          Hour UTC
          <input className="h-8 rounded-md border border-border bg-background px-2" type="number" min={0} max={23} value={hourUtc} onChange={(event) => setHourUtc(Number(event.target.value))} />
        </label>
      ) : null}
      {cadence === "weekly" ? (
        <label className="flex flex-col gap-1 text-sm">
          Weekday
          <select className="h-8 rounded-md border border-border bg-background px-2" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
              <option key={day} value={index}>{day}</option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Data sources: {experiment.dataSources.join(", ") || "—"}. Data-change triggers are unavailable because this workspace has no change feed.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onFailure} onChange={(event) => setOnFailure(event.target.checked)} />
        Remember failure notices
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onInsight} onChange={(event) => setOnInsight(event.target.checked)} />
        Remember insight notices
      </label>
      <p className="text-xs text-muted-foreground">Notice preferences are stored. Delivery to email or chat is not configured.</p>
      <Button type="submit" disabled={pending} className="self-start">Save configuration</Button>
    </form>
  );
}

function RunSelect({
  label,
  runs,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  runs: ExperimentRun[];
  value: string;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select className="h-7 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">None</option> : null}
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {stamp(run.startedAt)} · {run.status}
          </option>
        ))}
      </select>
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-2xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function badgeStatus(status: ExperimentStatus): "connected" | "warning" | "error" | "neutral" {
  if (status === "active") return "connected";
  if (status === "failed") return "error";
  if (status === "archived") return "neutral";
  return "warning";
}

function stamp(value: string | null) {
  if (!value) return "—";
  return `${formatDay(value)} ${formatTime(value)}`;
}

function json(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
