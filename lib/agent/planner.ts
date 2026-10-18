import type {
  BusinessConstraint,
  DatasetSummary,
  ExperimentPlan,
  ExperimentVariable,
  SimulationScenario,
} from "@/lib/agent/types";
import { formatCount, formatPercent, formatUsd, joinList } from "@/lib/format";

const MIN_GOAL_LENGTH = 12;
const MAX_SCENARIOS = 48;

export type GoalValidation =
  | { ok: true; statement: string }
  | { ok: false; message: string };

export type GoalSignals = {
  revenueIncrease: number | null;
  churnCeiling: number | null;
  churnReduction: number | null;
  includePricing: boolean;
  includeRetention: boolean;
  includeSales: boolean;
  includeMarketing: boolean;
};

export class GoalValidationError extends Error {
  readonly code = "GOAL_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "GoalValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const LOG_LABELS: Record<string, string> = {
  price_change_percent: "pricing",
  churn_reduction_pp: "retention",
  additional_reps: "sales capacity",
  marketing_spend: "marketing spend",
};

const SHORT_LABELS: Record<string, string> = {
  price_change_percent: "Price",
  churn_reduction_pp: "Retention",
  additional_reps: "Reps",
  marketing_spend: "Marketing",
};

export function validateGoalStatement(input: string): GoalValidation {
  const statement = input.trim();
  if (!statement) {
    return { ok: false, message: "Add a goal to run an experiment." };
  }
  if (statement.length < MIN_GOAL_LENGTH) {
    return { ok: false, message: "Describe the decision in a full sentence." };
  }
  return { ok: true, statement };
}

export function interpretGoal(statement: string): GoalSignals {
  const text = statement.toLowerCase();
  const pricing = /\bpric(?:e|ing)\b/.test(text);
  const retention = /\b(?:churn|retention|retain)\b/.test(text);
  const sales = /\b(?:sales|representatives?|reps?|headcount|capacity)\b/.test(
    text,
  );
  const marketing = /\b(?:marketing|spend|ads?)\b/.test(text);
  const revenue = /\b(?:revenue|mrr)\b/.test(text);

  let includePricing = pricing || revenue;
  let includeRetention = retention || pricing || revenue;
  const includeSales = sales || revenue;
  const includeMarketing = marketing;

  if (
    !includePricing &&
    !includeRetention &&
    !includeSales &&
    !includeMarketing
  ) {
    includePricing = true;
    includeRetention = true;
  }

  return {
    revenueIncrease: parseRevenueIncrease(statement),
    churnCeiling: parseChurnCeiling(statement),
    churnReduction: parseChurnReduction(statement),
    includePricing,
    includeRetention,
    includeSales,
    includeMarketing,
  };
}

export function describeGoal(signals: GoalSignals): string {
  if (signals.revenueIncrease != null && signals.churnCeiling != null) {
    return `Parsed a monthly revenue target of ${formatUsd(signals.revenueIncrease)} and a churn ceiling of ${formatPercent(signals.churnCeiling)}.`;
  }
  if (signals.revenueIncrease != null) {
    return `Parsed a monthly revenue target of ${formatUsd(signals.revenueIncrease)}.`;
  }
  if (signals.churnReduction != null) {
    return `Parsed a churn reduction target of ${formatPercent(signals.churnReduction)}.`;
  }
  if (signals.churnCeiling != null) {
    return `Parsed a churn ceiling of ${formatPercent(signals.churnCeiling)}.`;
  }

  const focus = [
    signals.includePricing ? "pricing" : null,
    signals.includeSales ? "sales capacity" : null,
    signals.includeMarketing ? "marketing spend" : null,
    signals.includeRetention && !signals.includePricing ? "retention" : null,
  ].filter((item): item is string => item !== null);

  if (focus.length > 0) {
    return `Read the objective as a ${joinList(focus)} decision.`;
  }
  return "Read the business objective.";
}

export function describePlan(
  signals: GoalSignals,
  variables: ExperimentVariable[],
): string {
  const names = joinList(
    variables.map((variable) => decisionLogLabel(variable.id)),
  );
  if (signals.revenueIncrease != null && signals.churnCeiling != null) {
    return `Compare ${names} against a ${formatUsd(signals.revenueIncrease)} revenue increase and a churn ceiling of ${formatPercent(signals.churnCeiling)}.`;
  }
  if (signals.churnReduction != null) {
    return `Compare ${names} against a churn reduction of ${formatPercent(signals.churnReduction)}.`;
  }
  if (signals.revenueIncrease != null) {
    return `Compare ${names} against a ${formatUsd(signals.revenueIncrease)} revenue increase.`;
  }
  return `Compare ${names} against the current revenue and churn baseline.`;
}

export function decisionLogLabel(variableId: string): string {
  return LOG_LABELS[variableId] ?? variableId;
}

export function buildVariables(
  signals: GoalSignals,
  summary: DatasetSummary,
): ExperimentVariable[] {
  const variables: ExperimentVariable[] = [];
  if (signals.includePricing) variables.push(priceVariable(signals, summary));
  if (signals.includeRetention)
    variables.push(retentionVariable(signals, summary));
  if (signals.includeSales) variables.push(salesVariable(summary));
  if (signals.includeMarketing) variables.push(marketingVariable(summary));
  return tightenVariables(variables);
}

export function buildConstraints(
  signals: GoalSignals,
  summary: DatasetSummary,
): BusinessConstraint[] {
  const constraints: BusinessConstraint[] = [];

  if (signals.revenueIncrease != null) {
    constraints.push({
      id: "constraint_monthly_revenue_increase",
      metric: "monthly_revenue_increase",
      operator: "gte",
      value: signals.revenueIncrease,
      unit: "USD",
      source: "goal",
      statement: `Monthly revenue must increase by at least ${formatUsd(signals.revenueIncrease)}.`,
    });
  } else if (
    signals.churnReduction != null ||
    signals.includeMarketing ||
    signals.includePricing
  ) {
    constraints.push({
      id: "constraint_monthly_revenue",
      metric: "monthly_revenue",
      operator: "gte",
      value: summary.monthlyRecurringRevenue,
      unit: "USD",
      source: "policy",
      statement: `Monthly revenue must stay at or above the current ${formatUsd(summary.monthlyRecurringRevenue)}.`,
    });
  }

  if (signals.churnCeiling != null) {
    constraints.push({
      id: "constraint_churn_rate",
      metric: "churn_rate",
      operator: "lt",
      value: signals.churnCeiling,
      unit: "rate",
      source: "goal",
      statement: `Churn must remain below ${formatPercent(signals.churnCeiling)}.`,
    });
  } else if (signals.churnReduction != null) {
    constraints.push({
      id: "constraint_churn_reduction",
      metric: "churn_reduction",
      operator: "gte",
      value: signals.churnReduction,
      unit: "rate",
      source: "goal",
      statement: `Churn must fall by at least ${formatPercent(signals.churnReduction)} from the current rate.`,
    });
  } else {
    constraints.push({
      id: "constraint_churn_rate",
      metric: "churn_rate",
      operator: "lte",
      value: summary.churnRate,
      unit: "rate",
      source: "policy",
      statement: `Churn must stay at or below the current ${formatPercent(summary.churnRate)}.`,
    });
  }

  return constraints;
}

export function buildScenarios(
  variables: ExperimentVariable[],
): SimulationScenario[] {
  const levelSets = variables.map((variable) =>
    rangeValues(variable.min, variable.max, variable.step),
  );
  const combinations = levelSets.reduce<number[][]>(
    (current, levels) =>
      current.flatMap((combination) =>
        levels.map((level) => [...combination, level]),
      ),
    [[]],
  );

  return combinations.map((combination, index) => {
    const values: Record<string, number> = {};
    variables.forEach((variable, variableIndex) => {
      values[variable.id] = combination[variableIndex];
    });
    return {
      id: `scenario_${index + 1}`,
      label: variables
        .map(
          (variable) =>
            `${SHORT_LABELS[variable.id] ?? variable.name} ${formatVariableValue(variable, values[variable.id])}`,
        )
        .join(" · "),
      values,
    };
  });
}

export function generateSimulationSource(input: {
  statement: string;
  plan: ExperimentPlan;
  summary: DatasetSummary;
}): string {
  const quota = input.summary.salesCapacity.quotaPerRepresentativeMonthly;
  const scenarios = input.plan.scenarios
    .map((scenario) => {
      const values = Object.entries(scenario.values)
        .map(([key, value]) => `"${key}": ${pythonNumber(value)}`)
        .join(", ");
      return `    {"id": "${scenario.id}", "values": {${values}}}`;
    })
    .join(",\n");
  const constraints = input.plan.constraints
    .map(
      (constraint) =>
        `    {"metric": "${constraint.metric}", "operator": "${constraint.operator}", "value": ${pythonNumber(constraint.value)}}`,
    )
    .join(",\n");

  return `"""DecisionLab simulation generated for the connected account.

Prepared for CreateOS Sandbox. This file has not been executed.
"""

import json

GOAL = ${JSON.stringify(input.statement)}
BASELINE_MRR = ${pythonNumber(input.summary.monthlyRecurringRevenue)}
BASELINE_CHURN = ${pythonNumber(input.summary.churnRate)}
BASELINE_REPS = ${pythonNumber(input.summary.salesCapacity.representatives)}
BASELINE_MARKETING_SPEND = ${pythonNumber(input.summary.monthlyMarketingSpend)}
QUOTA_PER_REP = ${pythonNumber(quota)}
EXPECTED_SCENARIOS = ${input.plan.scenarios.length}

SCENARIOS = [
${scenarios}
]

CONSTRAINTS = [
${constraints}
]


def meets(actual, operator, expected):
    if operator == "lt":
        return actual < expected
    if operator == "lte":
        return actual <= expected
    if operator == "gt":
        return actual > expected
    if operator == "gte":
        return actual >= expected
    return actual == expected


def evaluate(values):
    price_change = values.get("price_change_percent", 0) / 100
    retention_pp = values.get("churn_reduction_pp", 0) / 100
    extra_reps = values.get("additional_reps", 0)
    marketing = values.get("marketing_spend", BASELINE_MARKETING_SPEND)

    churn = BASELINE_CHURN - retention_pp + max(price_change, 0) * 0.12
    churn = min(0.95, max(0.0, churn))
    retained_ratio = (1 - churn) / (1 - BASELINE_CHURN) if BASELINE_CHURN < 1 else 1
    revenue = BASELINE_MRR * (1 + price_change) * retained_ratio
    revenue += extra_reps * QUOTA_PER_REP * 0.35
    revenue += (marketing - BASELINE_MARKETING_SPEND) * 0.25

    churn_reduction = (BASELINE_CHURN - churn) / BASELINE_CHURN if BASELINE_CHURN else 0
    return {
        "monthly_revenue": round(revenue, 2),
        "monthly_revenue_increase": round(revenue - BASELINE_MRR, 2),
        "churn_rate": round(churn, 4),
        "churn_reduction": round(churn_reduction, 4),
    }


def feasible(metrics):
    return all(meets(metrics[item["metric"]], item["operator"], item["value"]) for item in CONSTRAINTS)


def main():
    results = []
    for scenario in SCENARIOS:
        metrics = evaluate(scenario["values"])
        results.append({
            "scenario_id": scenario["id"],
            "metrics": metrics,
            "feasible": feasible(metrics),
        })
    print(json.dumps({"scenarios": len(results), "expected": EXPECTED_SCENARIOS, "results": results}))


if __name__ == "__main__":
    main()
`;
}

export function variableIdentificationMessage(
  variables: ExperimentVariable[],
): string {
  const names = variables.map((variable) => decisionLogLabel(variable.id));
  if (names.length === 1) {
    return `Identified ${names[0]} as a decision variable.`;
  }
  return `Identified ${joinList(names)} as decision variables.`;
}

export function scenarioCountMessage(count: number): string {
  return `Prepared ${formatCount(count)} simulation scenarios.`;
}

function parseRevenueIncrease(text: string): number | null {
  if (!/\b(?:revenue|mrr)\b/i.test(text)) return null;
  const dollar = text.match(
    /\$\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*([kK]))?/,
  );
  if (dollar) {
    const amount = Number(dollar[1].replace(/,/g, ""));
    return dollar[2] ? amount * 1000 : amount;
  }
  const shorthand = text.match(/(\d+(?:\.\d+)?)\s*([kK])\b/);
  if (!shorthand) return null;
  return Number(shorthand[1]) * 1000;
}

function parseChurnCeiling(text: string): number | null {
  const match = text.match(
    /churn(?:\s+\w+){0,4}\s+(?:below|under|less than|at most|within)\s+(\d+(?:\.\d+)?)\s*%/i,
  );
  if (!match) return null;
  return Number(match[1]) / 100;
}

function parseChurnReduction(text: string): number | null {
  const match = text.match(
    /(?:reduce|lower|decrease|cut)[\s\S]{0,48}?churn[\s\S]{0,24}?(\d+(?:\.\d+)?)\s*%/i,
  );
  if (!match) return null;
  return Number(match[1]) / 100;
}

function priceVariable(
  signals: GoalSignals,
  summary: DatasetSummary,
): ExperimentVariable {
  const exploring =
    signals.includePricing &&
    signals.revenueIncrease == null &&
    signals.churnReduction == null;
  const cutting =
    signals.churnReduction != null && signals.revenueIncrease == null;
  const min = exploring || cutting ? -10 : 0;
  const max = cutting ? 0 : exploring ? 20 : 15;
  return {
    id: "price_change_percent",
    name: min < 0 ? "Subscription price change" : "Subscription price increase",
    description: `Percent change from current prices. Blended price is ${formatUsd(summary.averageRevenuePerAccount)}.`,
    unit: "%",
    baseline: 0,
    min,
    max,
    step: 5,
    rationale:
      signals.revenueIncrease != null
        ? "Price is a direct lever on monthly revenue."
        : "The goal asks for a pricing decision.",
  };
}

function retentionVariable(
  signals: GoalSignals,
  summary: DatasetSummary,
): ExperimentVariable {
  let max = 2;
  let step = 1;
  if (signals.churnReduction != null) {
    const requiredPoints = summary.churnRate * signals.churnReduction * 100;
    max = Math.max(1, Math.ceil(requiredPoints * 2) / 2);
    step = 0.5;
  }
  return {
    id: "churn_reduction_pp",
    name: "Customer retention improvement",
    description: `Churn reduction in percentage points. Current churn is ${formatPercent(summary.churnRate)}.`,
    unit: "percentage points",
    baseline: 0,
    min: 0,
    max,
    step,
    rationale:
      signals.churnCeiling != null
        ? "Retention is how the plan stays inside the churn ceiling."
        : signals.churnReduction != null
          ? "Retention is the lever for the churn target."
          : "Retention offsets the churn risk of a price change.",
  };
}

function salesVariable(summary: DatasetSummary): ExperimentVariable {
  return {
    id: "additional_reps",
    name: "Additional sales representatives",
    description: `Representatives added to the current team of ${formatCount(summary.salesCapacity.representatives)}.`,
    unit: "people",
    baseline: 0,
    min: 0,
    max: 2,
    step: 1,
    rationale:
      "Sales capacity changes how much new revenue the team can close.",
  };
}

function marketingVariable(summary: DatasetSummary): ExperimentVariable {
  const baseline = summary.monthlyMarketingSpend;
  return {
    id: "marketing_spend",
    name: "Monthly marketing spend",
    description: "Monthly budget tested around the current spend.",
    unit: "USD",
    baseline,
    min: baseline * 0.5,
    max: baseline * 1.5,
    step: baseline * 0.25,
    rationale: "Marketing spend is the lever the goal asks to tune.",
  };
}

export function rangeValues(min: number, max: number, step: number): number[] {
  if (step <= 0) return [roundValue(min)];
  const count = Math.max(0, Math.round((max - min) / step));
  const values: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    const value = roundValue(min + index * step);
    if (value > max + 1e-9) break;
    values.push(value);
  }
  return values.length > 0 ? values : [roundValue(min)];
}

function tightenVariables(
  variables: ExperimentVariable[],
): ExperimentVariable[] {
  const next = variables.map((variable) => ({ ...variable }));
  for (
    let attempt = 0;
    attempt < 8 && scenarioCount(next) > MAX_SCENARIOS;
    attempt += 1
  ) {
    const target = [...next].sort(
      (left, right) =>
        rangeValues(right.min, right.max, right.step).length -
        rangeValues(left.min, left.max, left.step).length,
    )[0];
    if (!target || rangeValues(target.min, target.max, target.step).length <= 2)
      break;
    target.step = target.step * 2;
    const levels = rangeValues(target.min, target.max, target.step);
    target.min = levels[0];
    target.max = levels[levels.length - 1];
  }
  return next;
}

function scenarioCount(variables: ExperimentVariable[]): number {
  return variables.reduce(
    (total, variable) =>
      total * rangeValues(variable.min, variable.max, variable.step).length,
    1,
  );
}

function roundValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function pythonNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(roundValue(value));
}

function formatVariableValue(
  variable: ExperimentVariable,
  value: number,
): string {
  if (variable.unit === "USD") return formatUsd(value);
  if (variable.unit === "%") return `${value}%`;
  if (variable.unit === "percentage points") return `${value} pp`;
  return String(value);
}
