import { loadEnvFile } from "node:process";
import { hashSchema, schemaForTables } from "../lib/data/catalog";
import { db } from "../lib/db/client";
import { runDueExperiments } from "../lib/experiments/scheduler";
import {
  getExperiment,
  pauseExperiment,
  resumeExperiment,
  updateExperiment,
} from "../lib/experiments/store";

loadEnvFile();

const id = "exp_scheduler_check";
const managedId = "exp_manage_check";
const versionId = "ver_scheduler_check";

async function cleanup(experimentId: string) {
  await db().run("DELETE FROM experiment_insights WHERE experiment_id = ?", [
    experimentId,
  ]);
  await db().run("DELETE FROM experiment_runs WHERE experiment_id = ?", [
    experimentId,
  ]);
  await db().run("DELETE FROM experiment_versions WHERE experiment_id = ?", [
    experimentId,
  ]);
  await db().run("DELETE FROM experiments WHERE id = ?", [experimentId]);
}

async function main() {
  await cleanup(id);
  await cleanup(managedId);

  const past = new Date(Date.now() - 60_000).toISOString();
  const now = new Date().toISOString();
  const schema = schemaForTables(["summary"]);
  const schemaHash = hashSchema(schema);
  await db().run(
    `INSERT INTO experiments (
      id, name, objective, status, data_sources, input_schema, input_schema_hash, dependencies,
      success_metrics, constraints_json, assumptions, cadence, interval_hours, hour_utc, weekday,
      trigger_conditions, output_schema, current_version_id, code_stale, notification_prefs,
      created_at, updated_at, next_run_at, failure_count, run_count
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, '[]', '[]', '[]', '[]', 'hourly', 1, NULL, NULL, '[]', '{}', ?, 0, '{}', ?, ?, ?, 0, 0)`,
    [
      id,
      "Scheduler check",
      "Confirm the worker does not invent a sandbox result.",
      JSON.stringify(["summary"]),
      JSON.stringify(schema),
      schemaHash,
      versionId,
      now,
      now,
      past,
    ],
  );
  await db().run(
    `INSERT INTO experiment_versions (
      id, experiment_id, version, python_source, source_hash, dependencies, input_schema_hash, objective, validated_execution_id, created_at
    ) VALUES (?, ?, 1, 'print(1)', 'src', '[]', ?, 'Confirm the worker does not invent a sandbox result.', 'not-a-real-execution', ?)`,
    [versionId, id, schemaHash, now],
  );

  const result = await runDueExperiments();
  const after = await getExperiment(id);
  const runs = await db().all<{
    status: string;
    error: string | null;
    sandbox_id: string | null;
  }>(
    "SELECT status, error, sandbox_id FROM experiment_runs WHERE experiment_id = ?",
    [id],
  );
  console.log(
    JSON.stringify(
      {
        outcome: result.outcomes[0]?.code,
        status: after?.status,
        insight: after?.latestInsight,
        runs,
      },
      null,
      2,
    ),
  );

  const future = new Date(Date.now() + 3_600_000).toISOString();
  await db().run(
    `INSERT INTO experiments (
      id, name, objective, status, data_sources, input_schema, input_schema_hash, dependencies,
      success_metrics, constraints_json, assumptions, cadence, interval_hours, hour_utc, weekday,
      trigger_conditions, output_schema, current_version_id, code_stale, notification_prefs,
      created_at, updated_at, next_run_at, failure_count, run_count
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, '[]', '[]', '[]', '[]', 'daily', NULL, 0, NULL, '[]', '{}', ?, 0, '{}', ?, ?, ?, 0, 0)`,
    [
      managedId,
      "Manage check",
      "Pause and resume.",
      JSON.stringify(["summary"]),
      JSON.stringify(schema),
      schemaHash,
      versionId,
      now,
      now,
      future,
    ],
  );
  const paused = await pauseExperiment(managedId);
  const resumed = await resumeExperiment(managedId);
  const updated = await updateExperiment(managedId, {
    cadence: "interval",
    intervalHours: 6,
  });
  console.log(
    JSON.stringify({
      paused: paused.status,
      resumed: resumed.status,
      cadence: updated.cadence,
      interval: updated.intervalHours,
      status: updated.status,
      next: updated.nextRunAt,
    }),
  );

  await cleanup(id);
  await cleanup(managedId);
}

void main();
