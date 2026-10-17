import { runDueExperiments } from "@/lib/experiments/scheduler";

export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ message: "CRON_SECRET is not set." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }
  const result = await runDueExperiments();
  return Response.json(result);
}
