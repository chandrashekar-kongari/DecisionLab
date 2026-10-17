import type { AgentEvent, AgentEventKind, AgentStageId, AgentStep } from "@/lib/agent/types";

export const AGENT_STAGES: { id: AgentStageId; label: string }[] = [
  { id: "understand_objective", label: "Understanding the business objective" },
  { id: "inspect_data", label: "Inspecting available data" },
  { id: "identify_variables", label: "Identifying decision variables" },
  { id: "design_experiments", label: "Designing experiments" },
  { id: "generate_code", label: "Generating Python simulation code" },
  { id: "provision_sandbox", label: "Provisioning CreateOS Sandbox" },
  { id: "execute_simulation", label: "Executing simulation code" },
  { id: "analyze_outputs", label: "Analyzing outputs" },
  { id: "prepare_recommendations", label: "Preparing recommendations" },
];

export function createPendingSteps(): AgentStep[] {
  return AGENT_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    status: "pending",
    summary: null,
    startedAt: null,
    completedAt: null,
    error: null,
  }));
}

export function createEvent(
  stage: AgentStageId,
  kind: AgentEventKind,
  message: string,
): AgentEvent {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    stage,
    kind,
    message,
  };
}
