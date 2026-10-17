import { connection } from "next/server";
import { listExperiments } from "@/lib/experiments/store";

export async function GET() {
  await connection();
  return Response.json({ experiments: await listExperiments() });
}
