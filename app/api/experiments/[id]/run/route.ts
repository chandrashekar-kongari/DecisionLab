import { executeSavedExperiment } from "@/lib/experiments/execute";
import { ExperimentError } from "@/lib/experiments/types";

export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const outcome = await executeSavedExperiment({
      experimentId: id,
      trigger: "manual",
      idempotencyKey: `${id}:manual:${crypto.randomUUID()}`,
      attempt: 1,
    });
    return Response.json(outcome, { status: outcome.code === "completed" ? 200 : 422 });
  } catch (error) {
    if (error instanceof ExperimentError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
