import { duplicateExperiment } from "@/lib/experiments/store";
import { ExperimentError } from "@/lib/experiments/types";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return Response.json({ experiment: await duplicateExperiment(id) });
  } catch (error) {
    if (error instanceof ExperimentError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
