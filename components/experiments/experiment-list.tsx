"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDay, formatTime } from "@/lib/format";
import { formatCadence } from "@/lib/experiments/schedule";
import type { ExperimentRecord, ExperimentStatus } from "@/lib/experiments/types";

const GROUPS: { status: ExperimentStatus; title: string; description: string }[] = [
  { status: "active", title: "Active", description: "Enabled for recurring execution." },
  { status: "paused", title: "Paused", description: "Temporarily disabled." },
  { status: "draft", title: "Draft", description: "Waiting for activation." },
  { status: "failed", title: "Failed", description: "Needs investigation or a new code version." },
  { status: "archived", title: "Archived", description: "Kept for reference and no longer scheduled." },
];

export function ExperimentList() {
  const [experiments, setExperiments] = useState<ExperimentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/experiments");
    if (!response.ok) {
      setError("Could not load experiments.");
      return;
    }
    const body = (await response.json()) as { experiments: ExperimentRecord[] };
    setExperiments(body.experiments);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(id: string, action: "activate" | "pause" | "resume" | "archive" | "run" | "duplicate") {
    setPending(`${id}:${action}`);
    setError(null);
    const response =
      action === "run"
        ? await fetch(`/api/experiments/${id}/run`, { method: "POST" })
        : action === "duplicate"
          ? await fetch(`/api/experiments/${id}/duplicate`, { method: "POST" })
          : await fetch(`/api/experiments/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
    setPending(null);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "The action failed.");
    }
    await load();
  }

  if (!experiments) {
    return <p className="text-sm text-muted-foreground">Loading experiments…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {experiments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-6">
          <p className="text-sm font-medium">No experiments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask the agent to design one. Saved experiments stay here after you leave the conversation.
          </p>
        </div>
      ) : null}
      {GROUPS.map((group) => {
        const rows = experiments.filter((experiment) => experiment.status === group.status);
        if (rows.length === 0 && group.status === "archived") return null;
        return (
          <section key={group.status}>
            <SectionHeader title={group.title} description={group.description} />
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-2xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 font-medium">Experiment</th>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Schedule</th>
                      <th className="px-3 py-2 font-medium">Runs</th>
                      <th className="px-3 py-2 font-medium">Latest</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((experiment) => (
                      <tr key={experiment.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-3 align-top">
                          <Link href={`/experiments/${experiment.id}`} className="font-medium hover:underline">
                            {experiment.name}
                          </Link>
                          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{experiment.objective}</p>
                          <div className="mt-2">
                            <StatusBadge status={badgeStatus(experiment.status)}>{experiment.status}</StatusBadge>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                          {experiment.dataSources.join(", ") || "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-xs">
                          <p>{formatCadence(experiment)}</p>
                          <p className="mt-1 text-muted-foreground">Last {stamp(experiment.lastRunAt)}</p>
                          <p className="text-muted-foreground">Next {stamp(experiment.nextRunAt)}</p>
                        </td>
                        <td className="px-3 py-3 align-top">{experiment.runCount}</td>
                        <td className="max-w-xs px-3 py-3 align-top text-xs text-muted-foreground">
                          {experiment.latestInsight ?? "No insight yet"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button variant="outline" size="xs" asChild>
                              <Link href={`/experiments/${experiment.id}`}>Open</Link>
                            </Button>
                            {experiment.status === "active" ? (
                              <Button size="xs" variant="outline" disabled={pending !== null} onClick={() => void act(experiment.id, "pause")}>
                                Pause
                              </Button>
                            ) : null}
                            {experiment.status === "paused" ? (
                              <Button size="xs" variant="outline" disabled={pending !== null} onClick={() => void act(experiment.id, "resume")}>
                                Resume
                              </Button>
                            ) : null}
                            {experiment.status === "draft" || experiment.status === "failed" ? (
                              <Button size="xs" variant="outline" disabled={pending !== null} onClick={() => void act(experiment.id, "activate")}>
                                Start
                              </Button>
                            ) : null}
                            <Button size="xs" variant="outline" disabled={pending !== null} onClick={() => void act(experiment.id, "run")}>
                              Run
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
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
