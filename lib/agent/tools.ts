import { tool, zodSchema } from "ai";
import { z } from "zod";
import { getBusinessDataProvider } from "@/lib/data/business-data";
import { publicError } from "@/lib/data/connections";
import {
  DATA_TABLES,
  TABLE_CATALOG,
  datasetNarrative,
  isDataTable,
  isDemoTable,
  sampleRows,
  sliceDataset,
  tableCount,
  tablesForDataset,
  type DataTableName,
} from "@/lib/data/catalog";
import { executeSavedExperiment } from "@/lib/experiments/execute";
import { CADENCES } from "@/lib/experiments/schedule";
import {
  activateExperiment,
  getExperiment,
  getVersion,
  listExperiments,
  pauseExperiment,
  recordSandboxExecution,
  resumeExperiment,
  saveExperiment,
  updateExperiment,
} from "@/lib/experiments/store";
import {
  ExperimentError,
  type ExperimentRecord,
} from "@/lib/experiments/types";
import { executePythonJob } from "@/lib/sandbox/python-runner";

const tableSchema = z.enum(DATA_TABLES);
const cadenceSchema = z.enum(CADENCES);

const textList = z.array(z.string().min(1).max(400)).max(12);

export function createAgentTools() {
  let executions = 0;

  return {
    list_data_sources: tool({
      description: "List datasets the workspace can upload into a sandbox.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const loaded = await readDataset();
        if (!loaded.ok) return loaded;
        const dataset = loaded.dataset;
        const narrative = datasetNarrative(dataset);
        return {
          ...narrative,
          source: dataset.source,
          company: dataset.company,
          provider: providerLabel(dataset),
          tables: tablesForDataset(dataset).map((name) => ({
            name,
            label: TABLE_CATALOG[name].label,
            description: TABLE_CATALOG[name].description,
            columns: TABLE_CATALOG[name].columns,
            rowCount: tableCount(dataset, name),
          })),
        };
      },
    }),
    inspect_schema: tool({
      description:
        "Return columns and a short sample for one data table. Does not run an experiment.",
      inputSchema: zodSchema(
        z.object({
          table: tableSchema,
          sampleSize: z.number().int().min(1).max(8).default(3),
        }),
      ),
      execute: async ({ table, sampleSize }) => {
        const loaded = await readDataset();
        if (!loaded.ok) return loaded;
        const dataset = loaded.dataset;
        const narrative = datasetNarrative(dataset);
        const blocked = blockedTable(dataset, table);
        return {
          ...narrative,
          source: dataset.source,
          table,
          columns: TABLE_CATALOG[table].columns,
          sample: blocked ? [] : sampleRows(dataset, table, sampleSize),
          ...(blocked ? { note: blocked } : {}),
        };
      },
    }),
    sample_rows: tool({
      description:
        "Return a few rows from one sample table so you can see value shapes before writing Python.",
      inputSchema: zodSchema(
        z.object({
          table: tableSchema,
          limit: z.number().int().min(1).max(8).default(5),
        }),
      ),
      execute: async ({ table, limit }) => {
        const loaded = await readDataset();
        if (!loaded.ok) return loaded;
        const dataset = loaded.dataset;
        const narrative = datasetNarrative(dataset);
        const blocked = blockedTable(dataset, table);
        return {
          ...narrative,
          table,
          rows: blocked ? [] : sampleRows(dataset, table, limit),
          ...(blocked ? { note: blocked } : {}),
        };
      },
    }),
    execute_python: tool({
      description:
        "Run agent-written Python inside a new CreateOS sandbox. The program must read /tmp/input.json and write /tmp/result.json. At most 3 calls per turn.",
      inputSchema: zodSchema(
        z.object({
          source: z.string().min(1).max(100_000),
          dependencies: z.array(z.string().min(1).max(60)).max(8).default([]),
          tables: z.array(tableSchema).min(1).max(DATA_TABLES.length),
        }),
      ),
      execute: async ({ source, dependencies, tables }) => {
        executions += 1;
        if (executions > 3) {
          return {
            ok: false,
            error:
              "This turn already ran Python 3 times. Explain the last error instead of executing again.",
          };
        }
        const selected = uniqueTables(tables);
        const loaded = await readDataset();
        if (!loaded.ok) return loaded;
        const dataset = loaded.dataset;
        const job = await executePythonJob({
          source,
          dependencies,
          inputData: sliceDataset(dataset, selected),
        });
        const recorded = await recordSandboxExecution({
          source,
          dependencies,
          tables: selected,
          ok: job.ok,
          sandboxId: job.sandboxId,
          exitCode: job.exitCode,
          stdout: job.stdout,
          stderr: job.stderr,
          durationMs: job.durationMs,
          results: job.result,
          error: job.error,
        });
        return {
          ok: job.ok,
          executionId: recorded.id,
          sandboxId: job.sandboxId,
          exitCode: job.exitCode,
          durationMs: job.durationMs,
          stdout: clipForModel(job.stdout),
          stderr: clipForModel(job.stderr),
          result: job.result,
          error: job.error,
          cleanupError: job.cleanupError,
          ...datasetNarrative(dataset),
        };
      },
    }),
    save_experiment: tool({
      description:
        "Save a validated Python program as a draft experiment. Does not activate a schedule. The source must already have succeeded in execute_python.",
      inputSchema: zodSchema(experimentDefinitionSchema),
      execute: async (input) => {
        try {
          const saved = await saveExperiment({
            ...input,
            dataSources: input.tables,
          });
          return {
            ok: true,
            experiment: summarize(saved),
            message:
              saved.status === "draft"
                ? "Saved as a draft. Ask the user to activate it before recurring runs."
                : "Saved a new validated version. Recurring runs stay off until the user activates or resumes the experiment.",
          };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
    }),
    list_experiments: tool({
      description:
        "List saved experiments and their status, schedule, and latest insight.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => ({
        experiments: (await listExperiments()).map(summarize),
      }),
    }),
    get_experiment: tool({
      description:
        "Load one experiment, including the current Python source and recent runs.",
      inputSchema: zodSchema(z.object({ experimentId: z.string().min(1) })),
      execute: async ({ experimentId }) => {
        const experiment = await getExperiment(experimentId);
        if (!experiment) return { ok: false, error: "Experiment not found." };
        const version = experiment.currentVersionId
          ? await getVersion(experiment.currentVersionId)
          : null;
        return {
          ok: true,
          experiment: summarize(experiment),
          pythonSource: version?.pythonSource ?? null,
          version: version?.version ?? null,
        };
      },
    }),
    update_experiment: tool({
      description:
        "Update a saved experiment's name, objective, constraints, assumptions, or schedule. Objective and constraint changes mark the code stale and pause an active experiment.",
      inputSchema: zodSchema(
        z.object({
          experimentId: z.string().min(1),
          name: z.string().min(1).max(120).optional(),
          objective: z.string().min(1).max(2000).optional(),
          constraints: textList.optional(),
          assumptions: textList.optional(),
          successMetrics: textList.optional(),
          tables: z.array(tableSchema).min(1).optional(),
          cadence: cadenceSchema.optional(),
          intervalHours: z.number().int().min(1).max(24).nullable().optional(),
          hourUtc: z.number().int().min(0).max(23).nullable().optional(),
          weekday: z.number().int().min(0).max(6).nullable().optional(),
        }),
      ),
      execute: async ({ experimentId, tables, ...rest }) => {
        try {
          const updated = await updateExperiment(experimentId, {
            ...rest,
            dataSources: tables,
          });
          return { ok: true, experiment: summarize(updated) };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
    }),
    pause_experiment: tool({
      description: "Pause an active experiment so scheduled runs stop.",
      inputSchema: zodSchema(z.object({ experimentId: z.string().min(1) })),
      execute: async ({ experimentId }) => {
        try {
          return {
            ok: true,
            experiment: summarize(await pauseExperiment(experimentId)),
          };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
    }),
    resume_experiment: tool({
      description: "Resume a paused experiment and recompute its next run.",
      inputSchema: zodSchema(z.object({ experimentId: z.string().min(1) })),
      execute: async ({ experimentId }) => {
        try {
          return {
            ok: true,
            experiment: summarize(await resumeExperiment(experimentId)),
          };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
    }),
    run_experiment_now: tool({
      description:
        "Run a saved experiment immediately in CreateOS, using its validated Python and the current workspace data.",
      inputSchema: zodSchema(z.object({ experimentId: z.string().min(1) })),
      execute: async ({ experimentId }) => {
        try {
          const outcome = await executeSavedExperiment({
            experimentId,
            trigger: "manual",
            idempotencyKey: `${experimentId}:manual:${crypto.randomUUID()}`,
            attempt: 1,
          });
          return {
            ok: outcome.code === "completed",
            code: outcome.code,
            message: outcome.message,
            run: outcome.run
              ? {
                  id: outcome.run.id,
                  status: outcome.run.status,
                  sandboxId: outcome.run.sandboxId,
                  exitCode: outcome.run.exitCode,
                  durationMs: outcome.run.durationMs,
                  stdout: clipForModel(outcome.run.stdout),
                  stderr: clipForModel(outcome.run.stderr),
                  results: outcome.run.results,
                  error: outcome.run.error,
                }
              : null,
          };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
    }),
    activate_experiment: tool({
      description:
        "Enable recurring execution. Call this only after the user explicitly agrees to activate the experiment.",
      inputSchema: zodSchema(z.object({ experimentId: z.string().min(1) })),
      execute: async ({ experimentId }) => {
        try {
          return {
            ok: true,
            experiment: summarize(await activateExperiment(experimentId)),
          };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
    }),
  };
}

const experimentDefinitionSchema = z.object({
  experimentId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  objective: z.string().min(1).max(2000),
  tables: z.array(tableSchema).min(1),
  dependencies: z.array(z.string().min(1).max(60)).max(8).default([]),
  successMetrics: textList,
  constraints: textList,
  assumptions: textList,
  cadence: cadenceSchema,
  intervalHours: z.number().int().min(1).max(24).nullable().optional(),
  hourUtc: z.number().int().min(0).max(23).nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  triggerConditions: textList.default([]),
  outputSchema: z.record(z.string(), z.string()).default({}),
  pythonSource: z.string().min(1).max(100_000),
});

function summarize(experiment: ExperimentRecord) {
  return {
    id: experiment.id,
    name: experiment.name,
    objective: experiment.objective,
    status: experiment.status,
    dataSources: experiment.dataSources,
    cadence: experiment.cadence,
    intervalHours: experiment.intervalHours,
    hourUtc: experiment.hourUtc,
    weekday: experiment.weekday,
    nextRunAt: experiment.nextRunAt,
    lastRunAt: experiment.lastRunAt,
    runCount: experiment.runCount,
    codeVersion: experiment.codeVersion,
    codeStale: experiment.codeStale,
    staleReason: experiment.staleReason,
    latestInsight: experiment.latestInsight,
    href: `/experiments/${experiment.id}`,
  };
}

const DEMO_TABLE_NOTE =
  "Invoices and payments come from Stripe. Activity, tickets, usage, and historical experiments stay empty until those Supabase tables exist.";

const SUPABASE_TABLES = new Set<DataTableName>([
  "customerActivity",
  "supportTickets",
  "usageDaily",
  "historicalExperiments",
]);

async function readDataset() {
  try {
    return {
      ok: true as const,
      dataset: await getBusinessDataProvider().load(),
    };
  } catch (error) {
    return { ok: false as const, error: publicError(error) };
  }
}

function providerLabel(dataset: {
  source: string;
  stripeConnected?: boolean;
  supabaseConnected?: boolean;
}) {
  if (dataset.source === "mcp" && dataset.stripeConnected && dataset.supabaseConnected) {
    return "Stripe and Supabase MCP";
  }
  if (dataset.source === "mcp" && dataset.stripeConnected) return "Stripe MCP";
  if (dataset.source === "mcp" && dataset.supabaseConnected) return "Supabase MCP";
  if (dataset.source === "supabase") return "Stripe test mode and Supabase";
  return "AcmeFlow synthetic";
}

function blockedTable(dataset: {
  source: string;
  supabaseConnected?: boolean;
  supabaseSchemaReady?: boolean;
  missingCredentials?: string[];
}, table: DataTableName): string | null {
  if (dataset.source === "synthetic" && isDemoTable(table)) return DEMO_TABLE_NOTE;
  if (dataset.supabaseSchemaReady === false && SUPABASE_TABLES.has(table)) {
    return "This table is empty until scripts/demo/supabase-seed.sql is applied. Stripe customers, subscriptions, pricing, invoices, and payments are still available.";
  }
  if (dataset.supabaseConnected === false && SUPABASE_TABLES.has(table)) {
    const missing = (dataset.missingCredentials ?? []).filter((name) =>
      name.startsWith("SUPABASE_"),
    );
    return missing.length
      ? `This table is empty until ${missing.join(", ")} are set.`
      : "This table is empty because Supabase is not connected.";
  }
  return null;
}

function uniqueTables(tables: string[]): DataTableName[] {
  return [...new Set(tables.filter(isDataTable))];
}

function clipForModel(value: string): string {
  if (value.length <= 8_000) return value;
  return `${value.slice(0, 8_000)}\n…[truncated for the model]`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ExperimentError || error instanceof Error)
    return error.message;
  return "The experiment action failed.";
}
