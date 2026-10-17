import { loadEnvFile } from "node:process";
import { db } from "../lib/db/client";

loadEnvFile();

const id = "exp_neon_wire";
const now = new Date().toISOString();

async function main() {
  await db().run("DELETE FROM experiment_insights WHERE experiment_id = ?", [
    id,
  ]);
  await db().run("DELETE FROM experiment_runs WHERE experiment_id = ?", [id]);
  await db().run("DELETE FROM experiment_versions WHERE experiment_id = ?", [
    id,
  ]);
  await db().run("DELETE FROM experiments WHERE id = ?", [id]);
  console.log("removed");
  return;
  await db().run(
    `INSERT INTO experiments (
      id, name, objective, status, data_sources, input_schema, input_schema_hash, dependencies,
      success_metrics, constraints_json, assumptions, cadence, interval_hours, hour_utc, weekday,
      trigger_conditions, output_schema, current_version_id, code_stale, notification_prefs,
      created_at, updated_at, failure_count, run_count
    ) VALUES (?, ?, ?, 'draft', '["summary"]', '{}', 'hash', '[]', '[]', '[]', '[]', 'manual', NULL, NULL, NULL, '[]', '{}', NULL, 0, '{}', ?, ?, 0, 0)`,
    [id, "Neon wiring check", "Confirm the app reads Neon.", now, now],
  );
  const row = await db().get<{ name: string }>(
    "SELECT name FROM experiments WHERE id = ?",
    [id],
  );
  console.log(row?.name ?? "missing");
}

void main();
