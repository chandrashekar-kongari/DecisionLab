import type { Cadence } from "@/lib/experiments/schedule";

export type ExperimentStatus = "draft" | "active" | "paused" | "failed" | "archived";
export type RunStatus = "running" | "completed" | "failed";
export type RunTrigger = "manual" | "schedule" | "agent";
export type InsightKind = "computed_comparison" | "simulation" | "model_observation";

export type NotificationPrefs = {
  onFailure: boolean;
  onInsight: boolean;
};

export type ExperimentVersion = {
  id: string;
  experimentId: string;
  version: number;
  pythonSource: string;
  sourceHash: string;
  dependencies: string[];
  inputSchemaHash: string;
  objective: string;
  validatedExecutionId: string | null;
  createdAt: string;
};

export type ExperimentRecord = {
  id: string;
  name: string;
  objective: string;
  status: ExperimentStatus;
  dataSources: string[];
  inputSchema: Record<string, string[]>;
  inputSchemaHash: string;
  dependencies: string[];
  successMetrics: string[];
  constraints: string[];
  assumptions: string[];
  cadence: Cadence;
  intervalHours: number | null;
  hourUtc: number | null;
  weekday: number | null;
  triggerConditions: string[];
  outputSchema: Record<string, string>;
  currentVersionId: string | null;
  codeVersion: number | null;
  codeStale: boolean;
  staleReason: string | null;
  notificationPrefs: NotificationPrefs;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  failureCount: number;
  latestInsight: string | null;
  runCount: number;
};

export type ExperimentRun = {
  id: string;
  experimentId: string;
  versionId: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  idempotencyKey: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  sandboxId: string | null;
  results: unknown;
  error: string | null;
  attempt: number;
};

export type ExperimentInsight = {
  id: string;
  experimentId: string;
  runId: string | null;
  kind: InsightKind;
  content: string;
  createdAt: string;
};

export type SandboxExecutionRecord = {
  id: string;
  sourceHash: string;
  source: string;
  dependencies: string[];
  tables: string[];
  ok: boolean;
  sandboxId: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number | null;
  results: unknown;
  error: string | null;
  createdAt: string;
};

export class ExperimentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ExperimentError";
    this.status = status;
  }
}
