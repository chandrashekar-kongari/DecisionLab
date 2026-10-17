import { loadEnvFile } from "node:process";
import { runDueExperiments } from "../lib/experiments/scheduler";

loadEnvFile();

const INTERVAL_MS = 30_000;

async function tick() {
  try {
    const result = await runDueExperiments();
    if (result.claimed > 0) {
      console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

console.log("DecisionLab worker polling every 30s.");
void tick();
setInterval(() => {
  void tick();
}, INTERVAL_MS);
