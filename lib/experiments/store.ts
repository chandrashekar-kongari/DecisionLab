import { db, transaction, type Queryable } from "@/lib/db/client";
import {
  hashSchema,
  hashSource,
  isDataTable,
  schemaForTables,
  type DataTableName,
} from "@/lib/data/catalog";
import {
  nextRunAt,
  normalizeSchedule,
  type Cadence,
} from "@/lib/experiments/schedule";
import type {
  ExperimentInsight,
  ExperimentRecord,
  ExperimentRun,
  ExperimentStatus,
  ExperimentVersion,
  InsightKind,
  NotificationPrefs,
  RunStatus,
  RunTrigger,
  SandboxExecutionRecord,
} from "@/lib/experiments/types";
import { ExperimentError } from "@/lib/experiments/types";

const LEASE_MS = 10 * 60 * 1000;

export type SaveExperimentInput = {
  experimentId?: string;
  name: string;
  objective: string;
  dataSources: string[];
  dependencies: string[];
  successMetrics: string[];
  constraints: string[];
  assumptions: string[];
  cadence: Cadence;
  intervalHours?: number | null;
  hourUtc?: number | null;
  weekday?: number | null;
  triggerConditions: string[];
  outputSchema: Record<string, string>;
  pythonSource: string;
  notificationPrefs?: NotificationPrefs;
};

export type ExperimentUpdate = {
  name?: string;
  objective?: string;
  constraints?: string[];
  assumptions?: string[];
  successMetrics?: string[];
  dataSources?: string[];
  cadence?: Cadence;
  intervalHours?: number | null;
  hourUtc?: number | null;
  weekday?: number | null;
  notificationPrefs?: NotificationPrefs;
};

type ExperimentRow = {
  id: string;
  name: string;
  objective: string;
  status: ExperimentStatus;
  data_sources: string;
  input_schema: string;
  input_schema_hash: string;
  dependencies: string;
  success_metrics: string;
  constraints_json: string;
  assumptions: string;
  cadence: Cadence;
  interval_hours: number | null;
  hour_utc: number | null;
  weekday: number | null;
  trigger_conditions: string;
  output_schema: string;
  current_version_id: string | null;
  code_stale: number;
  stale_reason: string | null;
  notification_prefs: string;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  failure_count: number;
  latest_insight: string | null;
  run_count: number;
  code_version: number | null;
};

const EXPERIMENT_SELECT = `
  SELECT e.*, v.version AS code_version
  FROM experiments e
  LEFT JOIN experiment_versions v ON v.id = e.current_version_id
`;

function q(client?: Queryable): Queryable {
  return client ?? db();
}

export async function listExperiments(): Promise<ExperimentRecord[]> {
  const rows = await db().all<ExperimentRow>(
    `${EXPERIMENT_SELECT} ORDER BY e.updated_at DESC`,
  );
  return rows.map(mapExperiment);
}

export async function getExperiment(
  id: string,
  client?: Queryable,
): Promise<ExperimentRecord | null> {
  const row = await q(client).get<ExperimentRow>(
    `${EXPERIMENT_SELECT} WHERE e.id = ?`,
    [id],
  );
  return row ? mapExperiment(row) : null;
}

export async function getVersion(
  id: string,
  client?: Queryable,
): Promise<ExperimentVersion | null> {
  const row = await q(client).get<VersionRow>(
    `SELECT * FROM experiment_versions WHERE id = ?`,
    [id],
  );
  return row ? mapVersion(row) : null;
}

export async function listVersions(
  experimentId: string,
): Promise<ExperimentVersion[]> {
  const rows = await db().all<VersionRow>(
    `SELECT * FROM experiment_versions WHERE experiment_id = ? ORDER BY version DESC`,
    [experimentId],
  );
  return rows.map(mapVersion);
}

export async function listRuns(experimentId: string): Promise<ExperimentRun[]> {
  const rows = await db().all<RunRow>(
    `SELECT * FROM experiment_runs WHERE experiment_id = ? ORDER BY started_at DESC LIMIT 50`,
    [experimentId],
  );
  return rows.map(mapRun);
}

export async function listInsights(
  experimentId: string,
): Promise<ExperimentInsight[]> {
  const rows = await db().all<InsightRow>(
    `SELECT * FROM experiment_insights WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 50`,
    [experimentId],
  );
  return rows.map(mapInsight);
}

export async function recordSandboxExecution(input: {
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
}): Promise<SandboxExecutionRecord> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db().run(
    `INSERT INTO sandbox_executions (
        id, source_hash, source, dependencies, tables_json, ok, sandbox_id, exit_code,
        stdout, stderr, duration_ms, results_json, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      hashSource(input.source),
      input.source,
      JSON.stringify(input.dependencies),
      JSON.stringify(input.tables),
      input.ok ? 1 : 0,
      input.sandboxId,
      input.exitCode,
      input.stdout,
      input.stderr,
      input.durationMs,
      input.results === undefined ? null : JSON.stringify(input.results),
      input.error,
      createdAt,
    ],
  );
  return {
    id,
    sourceHash: hashSource(input.source),
    source: input.source,
    dependencies: input.dependencies,
    tables: input.tables,
    ok: input.ok,
    sandboxId: input.sandboxId,
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    durationMs: input.durationMs,
    results: input.results,
    error: input.error,
    createdAt,
  };
}

export async function saveExperiment(
  input: SaveExperimentInput,
): Promise<ExperimentRecord> {
  const tables = uniqueTables(input.dataSources);
  const schema = schemaForTables(tables);
  const schemaHash = hashSchema(schema);
  const sourceHash = hashSource(input.pythonSource);
  const validation = await findSuccessfulExecution(sourceHash);
  if (!validation) {
    throw new ExperimentError(
      "Run this Python successfully in CreateOS before saving the experiment.",
    );
  }
  const schedule = normalizeSchedule(input);
  const now = new Date().toISOString();
  const prefs = input.notificationPrefs ?? { onFailure: true, onInsight: true };

  const id = await transaction(async (tx) => {
    if (!input.experimentId) {
      const experimentId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      await tx.run(
        `INSERT INTO experiments (
          id, name, objective, status, data_sources, input_schema, input_schema_hash, dependencies,
          success_metrics, constraints_json, assumptions, cadence, interval_hours, hour_utc, weekday,
          trigger_conditions, output_schema, current_version_id, code_stale, stale_reason,
          notification_prefs, created_at, updated_at, last_run_at, next_run_at, failure_count, latest_insight, run_count
        ) VALUES (
          ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, NULL, NULL, 0, NULL, 0
        )`,
        [
          experimentId,
          input.name.trim(),
          input.objective.trim(),
          JSON.stringify(tables),
          JSON.stringify(schema),
          schemaHash,
          JSON.stringify(input.dependencies),
          JSON.stringify(input.successMetrics),
          JSON.stringify(input.constraints),
          JSON.stringify(input.assumptions),
          schedule.cadence,
          schedule.intervalHours,
          schedule.hourUtc,
          schedule.weekday,
          JSON.stringify(input.triggerConditions),
          JSON.stringify(input.outputSchema),
          versionId,
          JSON.stringify(prefs),
          now,
          now,
        ],
      );
      await insertVersion(tx, {
        id: versionId,
        experimentId,
        version: 1,
        source: input.pythonSource,
        sourceHash,
        dependencies: input.dependencies,
        schemaHash,
        objective: input.objective.trim(),
        validatedExecutionId: validation.id,
        createdAt: now,
      });
      await attachValidationRun(tx, experimentId, versionId, validation, now);
      return experimentId;
    }

    const existing = await getExperiment(input.experimentId, tx);
    if (!existing) throw new ExperimentError("Experiment not found.", 404);
    if (existing.status === "archived") {
      throw new ExperimentError("Archived experiments cannot be changed.");
    }
    const current = existing.currentVersionId
      ? await getVersion(existing.currentVersionId, tx)
      : null;
    const sameSource = current?.sourceHash === sourceHash;
    const objectiveChanged =
      existing.objective.trim() !== input.objective.trim();
    if (sameSource) {
      const stale = objectiveChanged || existing.codeStale;
      const status =
        stale && existing.status === "active" ? "paused" : existing.status;
      await tx.run(
        `UPDATE experiments SET
          name = ?, objective = ?, data_sources = ?, input_schema = ?, input_schema_hash = ?,
          dependencies = ?, success_metrics = ?, constraints_json = ?, assumptions = ?,
          cadence = ?, interval_hours = ?, hour_utc = ?, weekday = ?, trigger_conditions = ?,
          output_schema = ?, notification_prefs = ?, code_stale = ?, stale_reason = ?,
          status = ?, next_run_at = ?, updated_at = ?
        WHERE id = ?`,
        [
          input.name.trim(),
          input.objective.trim(),
          JSON.stringify(tables),
          JSON.stringify(schema),
          schemaHash,
          JSON.stringify(input.dependencies),
          JSON.stringify(input.successMetrics),
          JSON.stringify(input.constraints),
          JSON.stringify(input.assumptions),
          schedule.cadence,
          schedule.intervalHours,
          schedule.hourUtc,
          schedule.weekday,
          JSON.stringify(input.triggerConditions),
          JSON.stringify(input.outputSchema),
          JSON.stringify(prefs),
          stale ? 1 : 0,
          stale
            ? "The objective changed. Generate and validate a new Python version before recurring runs."
            : null,
          status,
          status === "active"
            ? nextRunAt({ ...schedule, from: new Date() })
            : null,
          now,
          existing.id,
        ],
      );
      return existing.id;
    }

    const versionNumber = await nextVersionNumber(tx, existing.id);
    const versionId = crypto.randomUUID();
    await insertVersion(tx, {
      id: versionId,
      experimentId: existing.id,
      version: versionNumber,
      source: input.pythonSource,
      sourceHash,
      dependencies: input.dependencies,
      schemaHash,
      objective: input.objective.trim(),
      validatedExecutionId: validation.id,
      createdAt: now,
    });
    await tx.run(
      `UPDATE experiments SET
        name = ?, objective = ?, data_sources = ?, input_schema = ?, input_schema_hash = ?,
        dependencies = ?, success_metrics = ?, constraints_json = ?, assumptions = ?,
        cadence = ?, interval_hours = ?, hour_utc = ?, weekday = ?, trigger_conditions = ?,
        output_schema = ?, notification_prefs = ?, current_version_id = ?, code_stale = 0,
        stale_reason = NULL, updated_at = ?
      WHERE id = ?`,
      [
        input.name.trim(),
        input.objective.trim(),
        JSON.stringify(tables),
        JSON.stringify(schema),
        schemaHash,
        JSON.stringify(input.dependencies),
        JSON.stringify(input.successMetrics),
        JSON.stringify(input.constraints),
        JSON.stringify(input.assumptions),
        schedule.cadence,
        schedule.intervalHours,
        schedule.hourUtc,
        schedule.weekday,
        JSON.stringify(input.triggerConditions),
        JSON.stringify(input.outputSchema),
        JSON.stringify(prefs),
        versionId,
        now,
        existing.id,
      ],
    );
    await attachValidationRun(tx, existing.id, versionId, validation, now);
    return existing.id;
  });

  const saved = await getExperiment(id);
  if (!saved)
    throw new ExperimentError("Saved experiment could not be read.", 500);
  return saved;
}

export async function updateExperiment(
  id: string,
  input: ExperimentUpdate,
): Promise<ExperimentRecord> {
  const existing = await requireExperiment(id);
  if (existing.status === "archived")
    throw new ExperimentError("Archived experiments cannot be changed.");
  const tables = input.dataSources
    ? uniqueTables(input.dataSources)
    : existing.dataSources.filter(isDataTable);
  const schema = schemaForTables(tables);
  const schemaHash = hashSchema(schema);
  const schedule = normalizeSchedule({
    cadence: input.cadence ?? existing.cadence,
    intervalHours:
      input.intervalHours === undefined
        ? existing.intervalHours
        : input.intervalHours,
    hourUtc: input.hourUtc === undefined ? existing.hourUtc : input.hourUtc,
    weekday: input.weekday === undefined ? existing.weekday : input.weekday,
  });
  const objective = (input.objective ?? existing.objective).trim();
  const constraints = input.constraints ?? existing.constraints;
  const assumptions = input.assumptions ?? existing.assumptions;
  const successMetrics = input.successMetrics ?? existing.successMetrics;
  const materialChange =
    objective !== existing.objective ||
    JSON.stringify(constraints) !== JSON.stringify(existing.constraints) ||
    JSON.stringify(assumptions) !== JSON.stringify(existing.assumptions) ||
    JSON.stringify(successMetrics) !==
      JSON.stringify(existing.successMetrics) ||
    JSON.stringify(tables) !== JSON.stringify(existing.dataSources) ||
    schemaHash !== existing.inputSchemaHash;
  const stale = existing.codeStale || materialChange;
  const status =
    stale && existing.status === "active" ? "paused" : existing.status;
  const now = new Date().toISOString();
  const resolvedNext =
    status === "active" ? nextRunAt({ ...schedule, from: new Date() }) : null;

  await db().run(
    `UPDATE experiments SET
        name = ?, objective = ?, data_sources = ?, input_schema = ?, input_schema_hash = ?,
        success_metrics = ?, constraints_json = ?, assumptions = ?, cadence = ?, interval_hours = ?,
        hour_utc = ?, weekday = ?, notification_prefs = ?, code_stale = ?, stale_reason = ?,
        status = ?, next_run_at = ?, updated_at = ?
      WHERE id = ?`,
    [
      (input.name ?? existing.name).trim(),
      objective,
      JSON.stringify(tables),
      JSON.stringify(schema),
      schemaHash,
      JSON.stringify(successMetrics),
      JSON.stringify(constraints),
      JSON.stringify(assumptions),
      schedule.cadence,
      schedule.intervalHours,
      schedule.hourUtc,
      schedule.weekday,
      JSON.stringify(input.notificationPrefs ?? existing.notificationPrefs),
      stale ? 1 : 0,
      stale
        ? "The objective, constraints, or data sources changed. Generate and validate a new Python version before recurring runs."
        : null,
      status,
      resolvedNext,
      now,
      id,
    ],
  );
  return requireExperiment(id);
}

export async function activateExperiment(
  id: string,
): Promise<ExperimentRecord> {
  const existing = await requireExperiment(id);
  await assertRunnable(existing);
  const now = new Date();
  await db().run(
    `UPDATE experiments SET status = 'active', next_run_at = ?, failure_count = 0,
        lease_token = NULL, lease_until = NULL, updated_at = ?
      WHERE id = ?`,
    [
      nextRunAt({
        cadence: existing.cadence,
        intervalHours: existing.intervalHours,
        hourUtc: existing.hourUtc,
        weekday: existing.weekday,
        from: now,
      }),
      now.toISOString(),
      id,
    ],
  );
  return requireExperiment(id);
}

export async function pauseExperiment(id: string): Promise<ExperimentRecord> {
  const existing = await requireExperiment(id);
  if (existing.status !== "active")
    throw new ExperimentError("Only an active experiment can be paused.");
  await db().run(
    `UPDATE experiments SET status = 'paused', next_run_at = NULL, lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE id = ?`,
    [new Date().toISOString(), id],
  );
  return requireExperiment(id);
}

export async function resumeExperiment(id: string): Promise<ExperimentRecord> {
  const existing = await requireExperiment(id);
  if (existing.status !== "paused")
    throw new ExperimentError("Only a paused experiment can be resumed.");
  await assertRunnable(existing);
  const now = new Date();
  await db().run(
    `UPDATE experiments SET status = 'active', next_run_at = ?, lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE id = ?`,
    [
      nextRunAt({
        cadence: existing.cadence,
        intervalHours: existing.intervalHours,
        hourUtc: existing.hourUtc,
        weekday: existing.weekday,
        from: now,
      }),
      now.toISOString(),
      id,
    ],
  );
  return requireExperiment(id);
}

export async function archiveExperiment(id: string): Promise<ExperimentRecord> {
  await requireExperiment(id);
  await db().run(
    `UPDATE experiments SET status = 'archived', next_run_at = NULL, lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE id = ?`,
    [new Date().toISOString(), id],
  );
  return requireExperiment(id);
}

export async function duplicateExperiment(
  id: string,
): Promise<ExperimentRecord> {
  const existing = await requireExperiment(id);
  const version = existing.currentVersionId
    ? await getVersion(existing.currentVersionId)
    : null;
  if (!version)
    throw new ExperimentError("This experiment has no code version to copy.");
  const now = new Date().toISOString();
  const experimentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await transaction(async (tx) => {
    await tx.run(
      `INSERT INTO experiments (
        id, name, objective, status, data_sources, input_schema, input_schema_hash, dependencies,
        success_metrics, constraints_json, assumptions, cadence, interval_hours, hour_utc, weekday,
        trigger_conditions, output_schema, current_version_id, code_stale, stale_reason,
        notification_prefs, created_at, updated_at, last_run_at, next_run_at, failure_count, latest_insight, run_count
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, 0)`,
      [
        experimentId,
        `${existing.name} copy`,
        existing.objective,
        JSON.stringify(existing.dataSources),
        JSON.stringify(existing.inputSchema),
        existing.inputSchemaHash,
        JSON.stringify(existing.dependencies),
        JSON.stringify(existing.successMetrics),
        JSON.stringify(existing.constraints),
        JSON.stringify(existing.assumptions),
        existing.cadence,
        existing.intervalHours,
        existing.hourUtc,
        existing.weekday,
        JSON.stringify(existing.triggerConditions),
        JSON.stringify(existing.outputSchema),
        versionId,
        existing.codeStale ? 1 : 0,
        existing.staleReason,
        JSON.stringify(existing.notificationPrefs),
        now,
        now,
      ],
    );
    await insertVersion(tx, {
      id: versionId,
      experimentId,
      version: 1,
      source: version.pythonSource,
      sourceHash: version.sourceHash,
      dependencies: version.dependencies,
      schemaHash: version.inputSchemaHash,
      objective: version.objective,
      validatedExecutionId: version.validatedExecutionId,
      createdAt: now,
    });
  });
  return requireExperiment(experimentId);
}

export type ClaimedExperiment = {
  id: string;
  nextRunAt: string;
  leaseToken: string;
  failureCount: number;
};

export async function claimDueExperiments(
  limit = 3,
): Promise<ClaimedExperiment[]> {
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  return transaction(async (tx) => {
    const rows = await tx.all<{
      id: string;
      next_run_at: string;
      failure_count: number;
    }>(
      `SELECT id, next_run_at, failure_count FROM experiments
         WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?
           AND (lease_until IS NULL OR lease_until < ?)
         ORDER BY next_run_at ASC LIMIT ?
         FOR UPDATE SKIP LOCKED`,
      [now, now, limit],
    );
    const claimed: ClaimedExperiment[] = [];
    for (const row of rows) {
      const leaseToken = crypto.randomUUID();
      const result = await tx.run(
        `UPDATE experiments SET lease_token = ?, lease_until = ?, updated_at = ?
         WHERE id = ? AND status = 'active' AND next_run_at = ? AND (lease_until IS NULL OR lease_until < ?)`,
        [leaseToken, leaseUntil, now, row.id, row.next_run_at, now],
      );
      if (result.changes === 1) {
        claimed.push({
          id: row.id,
          nextRunAt: row.next_run_at,
          leaseToken,
          failureCount: Number(row.failure_count),
        });
      }
    }
    return claimed;
  });
}

export async function finishScheduledSuccess(id: string, leaseToken: string) {
  const existing = await requireExperiment(id);
  const now = new Date();
  await db().run(
    `UPDATE experiments SET lease_token = NULL, lease_until = NULL, failure_count = 0, next_run_at = ?, updated_at = ?
       WHERE id = ? AND lease_token = ?`,
    [
      nextRunAt({
        cadence: existing.cadence,
        intervalHours: existing.intervalHours,
        hourUtc: existing.hourUtc,
        weekday: existing.weekday,
        from: now,
      }),
      now.toISOString(),
      id,
      leaseToken,
    ],
  );
}

export async function finishScheduledFailure(input: {
  id: string;
  leaseToken: string;
  failureCount: number;
  terminal: boolean;
  reason: string;
}) {
  const now = new Date();
  if (input.terminal) {
    await db().run(
      `UPDATE experiments SET status = 'failed', next_run_at = NULL, lease_token = NULL, lease_until = NULL,
          failure_count = ?, latest_insight = ?, updated_at = ?
         WHERE id = ? AND lease_token = ?`,
      [
        input.failureCount,
        input.reason,
        now.toISOString(),
        input.id,
        input.leaseToken,
      ],
    );
    return;
  }
  const retryAt = new Date(
    now.getTime() + input.failureCount * 5 * 60 * 1000,
  ).toISOString();
  await db().run(
    `UPDATE experiments SET failure_count = ?, next_run_at = ?, lease_token = NULL, lease_until = NULL,
        latest_insight = ?, updated_at = ?
       WHERE id = ? AND lease_token = ?`,
    [
      input.failureCount,
      retryAt,
      input.reason,
      now.toISOString(),
      input.id,
      input.leaseToken,
    ],
  );
}

export async function markExperimentFailed(id: string, reason: string) {
  await db().run(
    `UPDATE experiments SET status = 'failed', code_stale = 1, stale_reason = ?, next_run_at = NULL,
        lease_token = NULL, lease_until = NULL, latest_insight = ?, updated_at = ?
       WHERE id = ?`,
    [reason, reason, new Date().toISOString(), id],
  );
}

export async function noteRunFinished(id: string, lastRunAt: string) {
  await db().run(
    `UPDATE experiments SET last_run_at = ?, run_count = run_count + 1, updated_at = ? WHERE id = ?`,
    [lastRunAt, lastRunAt, id],
  );
}

export async function insertRun(input: {
  experimentId: string;
  versionId: string | null;
  trigger: RunTrigger;
  idempotencyKey: string;
  attempt: number;
}): Promise<ExperimentRun | null> {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const result = await db().run(
    `INSERT INTO experiment_runs (
        id, experiment_id, version_id, status, trigger, idempotency_key, started_at, stdout, stderr, attempt
      ) VALUES (?, ?, ?, 'running', ?, ?, ?, '', '', ?)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    [
      id,
      input.experimentId,
      input.versionId,
      input.trigger,
      input.idempotencyKey,
      startedAt,
      input.attempt,
    ],
  );
  if (result.changes === 0) return null;
  return getRun(id);
}

export async function getRunByIdempotencyKey(
  key: string,
): Promise<ExperimentRun | null> {
  const row = await db().get<RunRow>(
    `SELECT * FROM experiment_runs WHERE idempotency_key = ?`,
    [key],
  );
  return row ? mapRun(row) : null;
}

export async function finishRun(input: {
  id: string;
  status: RunStatus;
  finishedAt: string;
  durationMs: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  sandboxId: string | null;
  results: unknown;
  error: string | null;
}) {
  await db().run(
    `UPDATE experiment_runs SET status = ?, finished_at = ?, duration_ms = ?, exit_code = ?, stdout = ?,
        stderr = ?, sandbox_id = ?, results_json = ?, error = ? WHERE id = ?`,
    [
      input.status,
      input.finishedAt,
      input.durationMs,
      input.exitCode,
      input.stdout,
      input.stderr,
      input.sandboxId,
      input.results === undefined ? null : JSON.stringify(input.results),
      input.error,
      input.id,
    ],
  );
}

export async function addInsight(input: {
  experimentId: string;
  runId: string | null;
  kind: InsightKind;
  content: string;
}) {
  const createdAt = new Date().toISOString();
  await db().run(
    `INSERT INTO experiment_insights (id, experiment_id, run_id, kind, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.experimentId,
      input.runId,
      input.kind,
      input.content,
      createdAt,
    ],
  );
  await db().run(
    `UPDATE experiments SET latest_insight = ?, updated_at = ? WHERE id = ?`,
    [input.content, createdAt, input.experimentId],
  );
}

export async function previousCompletedRun(
  experimentId: string,
  beforeRunId: string,
): Promise<ExperimentRun | null> {
  const current = await getRun(beforeRunId);
  if (!current) return null;
  const row = await db().get<RunRow>(
    `SELECT * FROM experiment_runs
       WHERE experiment_id = ? AND status = 'completed' AND id != ? AND started_at < ?
       ORDER BY started_at DESC LIMIT 1`,
    [experimentId, beforeRunId, current.startedAt],
  );
  return row ? mapRun(row) : null;
}

export async function loadConversation(id: string): Promise<unknown[]> {
  const rows = await db().all<{ message_json: string }>(
    `SELECT message_json FROM messages WHERE conversation_id = ? ORDER BY position ASC`,
    [id],
  );
  return rows.map((row) => JSON.parse(row.message_json) as unknown);
}

export async function saveConversation(id: string, messages: unknown[]) {
  const now = new Date().toISOString();
  await transaction(async (tx) => {
    await tx.run(
      `INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      [id, now, now],
    );
    await tx.run(`DELETE FROM messages WHERE conversation_id = ?`, [id]);
    for (const [position, message] of messages.entries()) {
      await tx.run(
        `INSERT INTO messages (conversation_id, position, message_json) VALUES (?, ?, ?)`,
        [id, position, JSON.stringify(message)],
      );
    }
  });
}

async function requireExperiment(id: string): Promise<ExperimentRecord> {
  const experiment = await getExperiment(id);
  if (!experiment) throw new ExperimentError("Experiment not found.", 404);
  return experiment;
}

async function assertRunnable(experiment: ExperimentRecord) {
  if (experiment.codeStale) {
    throw new ExperimentError(
      experiment.staleReason ??
        "The experiment code is stale and must be regenerated.",
    );
  }
  const version = experiment.currentVersionId
    ? await getVersion(experiment.currentVersionId)
    : null;
  if (!version?.validatedExecutionId) {
    throw new ExperimentError(
      "Validate the Python in CreateOS before enabling this experiment.",
    );
  }
  if (version.inputSchemaHash !== experiment.inputSchemaHash) {
    await markExperimentFailed(
      experiment.id,
      "The input schema changed. Generate a new code version instead of running the saved program.",
    );
    throw new ExperimentError(
      "The input schema changed. Generate a new code version before running.",
    );
  }
}

async function findSuccessfulExecution(
  sourceHash: string,
): Promise<SandboxExecutionRecord | null> {
  const row = await db().get<ExecutionRow>(
    `SELECT * FROM sandbox_executions WHERE source_hash = ? AND ok = 1 ORDER BY created_at DESC LIMIT 1`,
    [sourceHash],
  );
  return row ? mapExecution(row) : null;
}

async function attachValidationRun(
  client: Queryable,
  experimentId: string,
  versionId: string,
  validation: SandboxExecutionRecord,
  now: string,
) {
  const runId = crypto.randomUUID();
  const inserted = await client.run(
    `INSERT INTO experiment_runs (
        id, experiment_id, version_id, status, trigger, idempotency_key, started_at, finished_at,
        duration_ms, exit_code, stdout, stderr, sandbox_id, results_json, error, attempt
      ) VALUES (?, ?, ?, 'completed', 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    [
      runId,
      experimentId,
      versionId,
      `agent:${validation.id}`,
      validation.createdAt,
      now,
      validation.durationMs,
      validation.exitCode,
      validation.stdout,
      validation.stderr,
      validation.sandboxId,
      validation.results === undefined
        ? null
        : JSON.stringify(validation.results),
    ],
  );
  if (inserted.changes === 1) {
    await client.run(
      `UPDATE experiments SET last_run_at = ?, run_count = run_count + 1, latest_insight = ? WHERE id = ?`,
      [now, insightPreview(validation.results), experimentId],
    );
  }
}

function insightPreview(results: unknown): string | null {
  if (!results || typeof results !== "object" || !("summary" in results))
    return null;
  const summary = (results as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary : null;
}

async function nextVersionNumber(client: Queryable, experimentId: string) {
  const row = await client.get<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0) AS version FROM experiment_versions WHERE experiment_id = ?`,
    [experimentId],
  );
  return Number(row?.version ?? 0) + 1;
}

async function insertVersion(
  client: Queryable,
  input: {
    id: string;
    experimentId: string;
    version: number;
    source: string;
    sourceHash: string;
    dependencies: string[];
    schemaHash: string;
    objective: string;
    validatedExecutionId: string | null;
    createdAt: string;
  },
) {
  await client.run(
    `INSERT INTO experiment_versions (
      id, experiment_id, version, python_source, source_hash, dependencies, input_schema_hash,
      objective, validated_execution_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.experimentId,
      input.version,
      input.source,
      input.sourceHash,
      JSON.stringify(input.dependencies),
      input.schemaHash,
      input.objective,
      input.validatedExecutionId,
      input.createdAt,
    ],
  );
}

async function getRun(id: string): Promise<ExperimentRun | null> {
  const row = await db().get<RunRow>(
    `SELECT * FROM experiment_runs WHERE id = ?`,
    [id],
  );
  return row ? mapRun(row) : null;
}

function uniqueTables(values: string[]): DataTableName[] {
  const tables = [...new Set(values.filter(isDataTable))];
  if (tables.length === 0)
    throw new ExperimentError("Choose at least one known data source.");
  return tables;
}

function mapExperiment(row: ExperimentRow): ExperimentRecord {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status,
    dataSources: parseJson(row.data_sources, []),
    inputSchema: parseJson(row.input_schema, {}),
    inputSchemaHash: row.input_schema_hash,
    dependencies: parseJson(row.dependencies, []),
    successMetrics: parseJson(row.success_metrics, []),
    constraints: parseJson(row.constraints_json, []),
    assumptions: parseJson(row.assumptions, []),
    cadence: row.cadence,
    intervalHours: row.interval_hours,
    hourUtc: row.hour_utc,
    weekday: row.weekday,
    triggerConditions: parseJson(row.trigger_conditions, []),
    outputSchema: parseJson(row.output_schema, {}),
    currentVersionId: row.current_version_id,
    codeVersion: row.code_version == null ? null : Number(row.code_version),
    codeStale: Number(row.code_stale) === 1,
    staleReason: row.stale_reason,
    notificationPrefs: parseJson(row.notification_prefs, {
      onFailure: true,
      onInsight: true,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    failureCount: Number(row.failure_count),
    latestInsight: row.latest_insight,
    runCount: Number(row.run_count),
  };
}

type VersionRow = {
  id: string;
  experiment_id: string;
  version: number;
  python_source: string;
  source_hash: string;
  dependencies: string;
  input_schema_hash: string;
  objective: string;
  validated_execution_id: string | null;
  created_at: string;
};

function mapVersion(row: VersionRow): ExperimentVersion {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    version: row.version,
    pythonSource: row.python_source,
    sourceHash: row.source_hash,
    dependencies: parseJson(row.dependencies, []),
    inputSchemaHash: row.input_schema_hash,
    objective: row.objective,
    validatedExecutionId: row.validated_execution_id,
    createdAt: row.created_at,
  };
}

type RunRow = {
  id: string;
  experiment_id: string;
  version_id: string | null;
  status: ExperimentRun["status"];
  trigger: ExperimentRun["trigger"];
  idempotency_key: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  sandbox_id: string | null;
  results_json: string | null;
  error: string | null;
  attempt: number;
};

function mapRun(row: RunRow): ExperimentRun {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    versionId: row.version_id,
    status: row.status,
    trigger: row.trigger,
    idempotencyKey: row.idempotency_key,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    sandboxId: row.sandbox_id,
    results: row.results_json ? parseJson(row.results_json, null) : null,
    error: row.error,
    attempt: row.attempt,
  };
}

type InsightRow = {
  id: string;
  experiment_id: string;
  run_id: string | null;
  kind: InsightKind;
  content: string;
  created_at: string;
};

function mapInsight(row: InsightRow): ExperimentInsight {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    runId: row.run_id,
    kind: row.kind,
    content: row.content,
    createdAt: row.created_at,
  };
}

type ExecutionRow = {
  id: string;
  source_hash: string;
  source: string;
  dependencies: string;
  tables_json: string;
  ok: number;
  sandbox_id: string | null;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number | null;
  results_json: string | null;
  error: string | null;
  created_at: string;
};

function mapExecution(row: ExecutionRow): SandboxExecutionRecord {
  return {
    id: row.id,
    sourceHash: row.source_hash,
    source: row.source,
    dependencies: parseJson(row.dependencies, []),
    tables: parseJson(row.tables_json, []),
    ok: Number(row.ok) === 1,
    sandboxId: row.sandbox_id,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    durationMs: row.duration_ms,
    results: row.results_json ? parseJson(row.results_json, null) : null,
    error: row.error,
    createdAt: row.created_at,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
