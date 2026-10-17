import { getBusinessDataProvider } from "@/lib/data/business-data";
import { hashSchema, isDataTable, schemaForTables, sliceDataset } from "@/lib/data/catalog";
import { recordRunInsights } from "@/lib/experiments/insights";
import {
  finishRun,
  getExperiment,
  getRunByIdempotencyKey,
  getVersion,
  insertRun,
  markExperimentFailed,
  noteRunFinished,
} from "@/lib/experiments/store";
import { ExperimentError } from "@/lib/experiments/types";
import type { ExperimentRun, RunTrigger } from "@/lib/experiments/types";
import { executePythonJob } from "@/lib/sandbox/python-runner";

export type SavedExecutionCode =
  | "completed"
  | "execution_failed"
  | "schema_drift"
  | "stale"
  | "not_configured"
  | "duplicate"
  | "in_progress";

export type SavedExecution = {
  code: SavedExecutionCode;
  message: string;
  run: ExperimentRun | null;
};

export async function executeSavedExperiment(input: {
  experimentId: string;
  trigger: Extract<RunTrigger, "manual" | "schedule">;
  idempotencyKey: string;
  attempt: number;
}): Promise<SavedExecution> {
  const experiment = await getExperiment(input.experimentId);
  if (!experiment) throw new ExperimentError("Experiment not found.", 404);
  if (experiment.status === "archived") {
    throw new ExperimentError("Archived experiments cannot run.");
  }
  if (experiment.codeStale) {
    const message = experiment.staleReason ?? "The saved program is stale and was not executed.";
    if (input.trigger === "schedule") {
      return { code: "stale", message, run: null };
    }
    throw new ExperimentError(message);
  }

  const version = experiment.currentVersionId ? await getVersion(experiment.currentVersionId) : null;
  if (!version?.validatedExecutionId) {
    throw new ExperimentError("This experiment has no validated Python version.");
  }

  const tables = experiment.dataSources.filter(isDataTable);
  const schemaHash = hashSchema(schemaForTables(tables));
  if (schemaHash !== version.inputSchemaHash || schemaHash !== experiment.inputSchemaHash) {
    const message = "The input schema changed. Generate a new code version instead of running the saved program.";
    if (input.trigger === "manual") await markExperimentFailed(experiment.id, message);
    return { code: "schema_drift", message, run: null };
  }

  const existing = await getRunByIdempotencyKey(input.idempotencyKey);
  if (existing?.status === "completed") {
    return { code: "duplicate", message: "This execution was already completed.", run: existing };
  }
  if (existing?.status === "running") {
    return { code: "in_progress", message: "This execution is already running.", run: existing };
  }

  const created = await insertRun({
    experimentId: experiment.id,
    versionId: version.id,
    trigger: input.trigger,
    idempotencyKey: input.idempotencyKey,
    attempt: input.attempt,
  });
  const run = created ?? (await getRunByIdempotencyKey(input.idempotencyKey));
  if (!run) throw new ExperimentError("Could not record the experiment run.", 500);
  if (!created && run.status === "failed") {
    return { code: "duplicate", message: "This attempt was already recorded.", run };
  }

  try {
    const dataset = await getBusinessDataProvider().load();
    const job = await executePythonJob({
      source: version.pythonSource,
      dependencies: version.dependencies,
      inputData: sliceDataset(dataset, tables),
    });
    const finishedAt = new Date().toISOString();
    const status = job.ok ? "completed" : "failed";
    await finishRun({
      id: run.id,
      status,
      finishedAt,
      durationMs: job.durationMs,
      exitCode: job.exitCode,
      stdout: job.stdout,
      stderr: job.stderr,
      sandboxId: job.sandboxId,
      results: job.result,
      error: job.cleanupError ? `${job.error ?? ""} Cleanup: ${job.cleanupError}`.trim() : job.error,
    });
    await noteRunFinished(experiment.id, finishedAt);
    const finished = await getRunByIdempotencyKey(input.idempotencyKey);
    if (finished?.status === "completed") {
      await recordRunInsights(experiment.id, finished);
    }
    if (job.code === "not_configured") {
      return { code: "not_configured", message: job.error ?? "CreateOS is not configured.", run: finished };
    }
    if (!job.ok) {
      return { code: "execution_failed", message: job.error ?? "Sandbox execution failed.", run: finished };
    }
    return { code: "completed", message: "Sandbox execution completed.", run: finished };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox execution failed.";
    await finishRun({
      id: run.id,
      status: "failed",
      finishedAt: new Date().toISOString(),
      durationMs: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      sandboxId: null,
      results: null,
      error: message,
    });
    throw error;
  }
}
