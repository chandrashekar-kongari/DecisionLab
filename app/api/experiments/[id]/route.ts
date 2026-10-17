import { connection } from "next/server";
import {
  activateExperiment,
  archiveExperiment,
  getExperiment,
  listInsights,
  listRuns,
  listVersions,
  pauseExperiment,
  resumeExperiment,
  updateExperiment,
} from "@/lib/experiments/store";
import { ExperimentError } from "@/lib/experiments/types";
import { CADENCES, type Cadence } from "@/lib/experiments/schedule";

type ActionBody = {
  action?: "activate" | "pause" | "resume" | "archive";
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
  notificationPrefs?: { onFailure: boolean; onInsight: boolean };
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  const experiment = await getExperiment(id);
  if (!experiment) return Response.json({ message: "Experiment not found." }, { status: 404 });
  return Response.json({
    experiment,
    versions: await listVersions(id),
    runs: await listRuns(id),
    insights: await listInsights(id),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as ActionBody | null;
  if (!body) return Response.json({ message: "Expected a JSON body." }, { status: 400 });
  try {
    if (body.action === "activate") return Response.json({ experiment: await activateExperiment(id) });
    if (body.action === "pause") return Response.json({ experiment: await pauseExperiment(id) });
    if (body.action === "resume") return Response.json({ experiment: await resumeExperiment(id) });
    if (body.action === "archive") return Response.json({ experiment: await archiveExperiment(id) });
    if (body.cadence && !CADENCES.includes(body.cadence)) {
      return Response.json({ message: "Unsupported schedule." }, { status: 400 });
    }
    const experiment = await updateExperiment(id, {
      name: body.name,
      objective: body.objective,
      constraints: body.constraints,
      assumptions: body.assumptions,
      successMetrics: body.successMetrics,
      dataSources: body.dataSources,
      cadence: body.cadence,
      intervalHours: body.intervalHours,
      hourUtc: body.hourUtc,
      weekday: body.weekday,
      notificationPrefs: body.notificationPrefs,
    });
    return Response.json({ experiment });
  } catch (error) {
    if (error instanceof ExperimentError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
