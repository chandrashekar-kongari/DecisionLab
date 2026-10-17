import type { AgentRun } from "@/lib/agent/types";
import { AgentActivityLog } from "@/components/investigation/agent-activity-log";
import { AgentTimeline } from "@/components/investigation/agent-timeline";
import { DataInspectionPanel } from "@/components/investigation/data-inspection-panel";
import { ExecutionStatusPanel } from "@/components/investigation/execution-status-panel";
import { ExperimentPlanPanel } from "@/components/investigation/experiment-plan-panel";

type InvestigationWorkspaceProps = {
  run: AgentRun;
};

export function InvestigationWorkspace({ run }: InvestigationWorkspaceProps) {
  const inspectDone = run.steps.find((step) => step.id === "inspect_data")?.status === "completed";
  const designDone =
    run.steps.find((step) => step.id === "design_experiments")?.status === "completed";
  const provision = run.steps.find((step) => step.id === "provision_sandbox");
  const provisionVisible = provision != null && provision.status !== "pending";

  return (
    <div className="flex flex-col gap-8">
      <AgentTimeline steps={run.steps} />
      {inspectDone && run.dataset ? (
        <DataInspectionPanel
          summary={run.dataset}
          description="Records the agent loaded for this investigation."
        />
      ) : null}
      {designDone && run.plan ? <ExperimentPlanPanel goal={run.goal} plan={run.plan} /> : null}
      {provisionVisible ? <ExecutionStatusPanel run={run} /> : null}
      {run.events.length > 0 ? <AgentActivityLog events={run.events} /> : null}
    </div>
  );
}
