import { generateText } from "ai";
import { parseSandboxResult } from "@/lib/experiments/charts";
import { getLanguageModel } from "@/lib/agent/model";
import { addInsight, previousCompletedRun } from "@/lib/experiments/store";
import type { ExperimentRun } from "@/lib/experiments/types";

export async function recordRunInsights(experimentId: string, run: ExperimentRun) {
  const current = metricsOf(run.results);
  const parsed = parseSandboxResult(run.results);
  if (parsed?.summary) {
    const kind = parsed.kind === "observation" ? "computed_comparison" : "simulation";
    const prefix =
      parsed.kind === "observation"
        ? "Description of the supplied sample. This is not a measured change in a live business."
        : "Simulation output from the sandbox. This does not prove a live business improvement.";
    await addInsight({
      experimentId,
      runId: run.id,
      kind: parsed.kind === "simulation" ? "simulation" : kind,
      content: `${prefix} ${parsed.summary}`,
    });
  }

  const previous = await previousCompletedRun(experimentId, run.id);
  if (previous) {
    const before = metricsOf(previous.results);
    const lines = Object.keys({ ...before, ...current }).sort().map((key) => {
      const left = before[key];
      const right = current[key];
      if (left === undefined) return `${key}: ${formatMetric(right)} in the latest sandbox output`;
      if (right === undefined) return `${key}: was ${formatMetric(left)} and is absent from the latest output`;
      const delta = right - left;
      return `${key}: ${formatMetric(left)} → ${formatMetric(right)} (${delta >= 0 ? "+" : ""}${formatMetric(delta)})`;
    });
    if (lines.length > 0) {
      await addInsight({
        experimentId,
        runId: run.id,
        kind: "computed_comparison",
        content: `Computed comparison of sandbox outputs. These figures are not measured changes in a live business. ${lines.join("; ")}.`,
      });
    }
  }

  if (!process.env.OPENROUTER_API_KEY || !parsed) return;
  try {
    const model = getLanguageModel();
    const result = await generateText({
      model,
      abortSignal: AbortSignal.timeout(20_000),
      system:
        "You compare experiment sandbox outputs. Call simulations simulations. Never say a simulation proved a real-world improvement, and never recommend changing live prices, refunds, or customer messages. Two short sentences.",
      prompt: JSON.stringify({
        current: parsed,
        previous: previous ? parseSandboxResult(previous.results) : null,
      }),
    });
    const text = result.text.trim();
    if (text) {
      await addInsight({
        experimentId,
        runId: run.id,
        kind: "model_observation",
        content: `Model note about sandbox outputs, not a measured live outcome. ${text}`,
      });
    }
  } catch {
    // A model note is optional. The computed comparison remains.
  }
}

function metricsOf(results: unknown): Record<string, number> {
  const parsed = parseSandboxResult(results);
  return parsed?.metrics ?? {};
}

function formatMetric(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}
