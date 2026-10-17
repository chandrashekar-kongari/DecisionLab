import { getBusinessDataProvider } from "@/lib/data/business-data";
import { formatCount, formatPercent, formatUsd } from "@/lib/format";
import { createSandboxClient, isSandboxNotConfigured } from "@/lib/sandbox/createos";
import { createEvent, createPendingSteps } from "@/lib/agent/events";
import {
  buildConstraints,
  buildScenarios,
  buildVariables,
  describeGoal,
  describePlan,
  generateSimulationSource,
  GoalValidationError,
  interpretGoal,
  scenarioCountMessage,
  validateGoalStatement,
  variableIdentificationMessage,
} from "@/lib/agent/planner";
import type { AgentEvent, AgentRun, AgentStageId, ExperimentPlan } from "@/lib/agent/types";

const SANDBOX_WAIT_MESSAGE = "Waiting for CreateOS Sandbox.";

export async function* investigate(
  statement: string,
): AsyncGenerator<AgentEvent, AgentRun> {
  const validation = validateGoalStatement(statement);
  if (!validation.ok) {
    throw new GoalValidationError(validation.message);
  }

  const run: AgentRun = {
    id: crypto.randomUUID(),
    goal: {
      id: crypto.randomUUID(),
      statement: validation.statement,
      createdAt: new Date().toISOString(),
    },
    status: "running",
    steps: createPendingSteps(),
    dataset: null,
    plan: null,
    code: null,
    sandboxRequest: null,
    sandbox: null,
    results: null,
    recommendation: null,
    events: [],
    blocker: null,
  };

  const signals = interpretGoal(validation.statement);

  markRunning(run, "understand_objective");
  yield* finish(run, "understand_objective", describeGoal(signals));

  markRunning(run, "inspect_data");
  const dataset = await getBusinessDataProvider().load();
  run.dataset = dataset.summary;
  const loaded = `Loaded ${formatCount(dataset.summary.subscriptionCount)} subscription records.`;
  const baseline = `Current monthly revenue is ${formatUsd(dataset.summary.monthlyRecurringRevenue)} with churn at ${formatPercent(dataset.summary.churnRate)}.`;
  yield* finish(run, "inspect_data", loaded, [baseline]);

  markRunning(run, "identify_variables");
  const variables = buildVariables(signals, dataset.summary);
  yield* finish(run, "identify_variables", variableIdentificationMessage(variables));

  markRunning(run, "design_experiments");
  const constraints = buildConstraints(signals, dataset.summary);
  const scenarios = buildScenarios(variables);
  const plan: ExperimentPlan = {
    id: crypto.randomUUID(),
    goalId: run.goal.id,
    rationale: describePlan(signals, variables),
    variables,
    constraints,
    scenarios,
    code: null,
  };
  run.plan = plan;
  const policyNotes = constraints
    .filter((constraint) => constraint.source === "policy")
    .map((constraint) => constraint.statement);
  yield* finish(run, "design_experiments", scenarioCountMessage(scenarios.length), policyNotes);

  markRunning(run, "generate_code");
  const code = generateSimulationSource({
    statement: validation.statement,
    plan,
    summary: dataset.summary,
  });
  plan.code = code;
  run.code = code;
  yield* finish(
    run,
    "generate_code",
    `Generated Python simulation code for ${formatCount(scenarios.length)} scenarios.`,
  );

  markRunning(run, "provision_sandbox");
  run.sandboxRequest = {
    shape: "s-1vcpu-1gb",
    name: `decision-lab-${run.id.slice(0, 8)}`,
  };

  const client = createSandboxClient();
  try {
    const session = await client.provision(run.sandboxRequest);
    await client.destroy(session);
  } catch (error) {
    if (!isSandboxNotConfigured(error)) {
      failStep(run, "provision_sandbox", "Could not provision CreateOS Sandbox.");
      yield record(run, "provision_sandbox", "status", "Could not provision CreateOS Sandbox.");
      return run;
    }
  }

  run.status = "blocked";
  run.blocker = { code: "SANDBOX_NOT_CONFIGURED", message: SANDBOX_WAIT_MESSAGE };
  const provision = step(run, "provision_sandbox");
  provision.summary = SANDBOX_WAIT_MESSAGE;
  yield record(run, "provision_sandbox", "status", SANDBOX_WAIT_MESSAGE);
  return run;
}

function markRunning(run: AgentRun, id: AgentStageId) {
  const current = step(run, id);
  current.status = "running";
  current.startedAt = new Date().toISOString();
}

function* finish(
  run: AgentRun,
  id: AgentStageId,
  summary: string,
  extras: string[] = [],
): Generator<AgentEvent> {
  const current = step(run, id);
  current.status = "completed";
  current.summary = summary;
  current.completedAt = new Date().toISOString();
  yield record(run, id, "tool", summary);
  for (const message of extras) {
    yield record(run, id, "tool", message);
  }
}

function failStep(run: AgentRun, id: AgentStageId, message: string) {
  const current = step(run, id);
  current.status = "failed";
  current.summary = message;
  current.error = message;
  current.completedAt = new Date().toISOString();
  run.status = "failed";
}

function record(
  run: AgentRun,
  id: AgentStageId,
  kind: AgentEvent["kind"],
  message: string,
): AgentEvent {
  const event = createEvent(id, kind, message);
  run.events.push(event);
  return event;
}

function step(run: AgentRun, id: AgentStageId) {
  const current = run.steps.find((item) => item.id === id);
  if (!current) throw new Error(`Unknown investigation stage: ${id}`);
  return current;
}
