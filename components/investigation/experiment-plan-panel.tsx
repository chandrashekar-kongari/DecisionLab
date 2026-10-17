import type { BusinessGoal, ExperimentPlan, ExperimentVariable } from "@/lib/agent/types";
import { formatUsd } from "@/lib/format";
import { SectionHeader } from "@/components/section-header";

type ExperimentPlanPanelProps = {
  goal: BusinessGoal;
  plan: ExperimentPlan;
};

export function ExperimentPlanPanel({ goal, plan }: ExperimentPlanPanelProps) {
  return (
    <section>
      <SectionHeader title="Experiment plan" description={plan.rationale} />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <p className="border-b border-border px-3 py-2 text-ui text-foreground">{goal.statement}</p>
        <div className="border-b border-border px-3 pt-3 pb-1">
          <p className="text-2xs font-medium text-muted-foreground">Constraints</p>
        </div>
        <ul>
          {plan.constraints.map((constraint) => (
            <li
              key={constraint.id}
              className="border-b border-border px-3 py-2 text-ui text-foreground"
            >
              {constraint.statement}
            </li>
          ))}
        </ul>
        <div className="border-b border-border px-3 pt-3 pb-1">
          <p className="text-2xs font-medium text-muted-foreground">Decision variables</p>
        </div>
        <ul>
          {plan.variables.map((variable) => (
            <li key={variable.id} className="border-b border-border px-3 py-2 last:border-b-0">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="text-ui text-foreground">{variable.name}</span>
                <span className="text-ui text-muted-foreground tabular-nums">
                  {formatRange(variable)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{variable.rationale}</p>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-4 border-t border-border px-3 py-2">
          <span className="text-ui text-muted-foreground">Scenarios</span>
          <span className="text-ui text-foreground tabular-nums">
            {plan.scenarios.length.toLocaleString("en-US")}
          </span>
        </div>
        {plan.code ? (
          <details className="border-t border-border">
            <summary className="cursor-pointer px-3 py-2 text-ui text-muted-foreground">
              Simulation code
            </summary>
            <pre className="max-h-64 overflow-auto border-t border-border px-3 py-3 text-xs leading-5 text-foreground">
              {plan.code}
            </pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function formatRange(variable: ExperimentVariable): string {
  return `${formatVariableValue(variable, variable.min)} to ${formatVariableValue(variable, variable.max)}`;
}

function formatVariableValue(variable: ExperimentVariable, value: number): string {
  if (variable.unit === "USD") return formatUsd(value);
  if (variable.unit === "%") return `${value}%`;
  if (variable.unit === "percentage points") return `${value} pp`;
  return String(value);
}
