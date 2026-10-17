import { executeSavedExperiment, type SavedExecution } from "@/lib/experiments/execute";
import {
  claimDueExperiments,
  finishScheduledFailure,
  finishScheduledSuccess,
  markExperimentFailed,
} from "@/lib/experiments/store";

export async function runDueExperiments() {
  const claimed = await claimDueExperiments();
  const outcomes: Array<SavedExecution & { experimentId: string }> = [];

  for (const claim of claimed) {
    const attempt = claim.failureCount + 1;
    try {
      const outcome = await executeSavedExperiment({
        experimentId: claim.id,
        trigger: "schedule",
        idempotencyKey: `${claim.id}:schedule:${claim.nextRunAt}:${claim.failureCount}`,
        attempt,
      });
      outcomes.push({ ...outcome, experimentId: claim.id });
      if (outcome.code === "in_progress") continue;
      if (outcome.code === "completed" || outcome.code === "duplicate") {
        await finishScheduledSuccess(claim.id, claim.leaseToken);
        continue;
      }
      const terminal =
        outcome.code === "stale" ||
        outcome.code === "schema_drift" ||
        outcome.code === "not_configured" ||
        attempt >= 3;
      if (outcome.code === "schema_drift" || outcome.code === "stale") {
        await markExperimentFailed(claim.id, outcome.message);
      }
      await finishScheduledFailure({
        id: claim.id,
        leaseToken: claim.leaseToken,
        failureCount: attempt,
        terminal,
        reason: outcome.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled execution failed.";
      outcomes.push({
        experimentId: claim.id,
        code: "execution_failed",
        message,
        run: null,
      });
      await finishScheduledFailure({
        id: claim.id,
        leaseToken: claim.leaseToken,
        failureCount: attempt,
        terminal: attempt >= 3,
        reason: message,
      });
    }
  }

  return { claimed: claimed.length, outcomes };
}
