"use client";

import { ConnectedData } from "@/components/connected-data";
import { ExampleGoals } from "@/components/example-goals";
import { GoalInput } from "@/components/goal-input";
import { InvestigationWorkspace } from "@/components/investigation/investigation-workspace";
import { useInvestigation } from "@/components/investigation/use-investigation";

export function ExperimentWorkspace() {
  const investigation = useInvestigation();

  return (
    <div className="flex flex-col gap-8">
      <GoalInput
        goal={investigation.goal}
        phase={investigation.phase}
        error={investigation.error}
        onGoalChange={investigation.setGoal}
        onRun={() => {
          void investigation.start();
        }}
        onEdit={investigation.reset}
      />
      <ExampleGoals
        disabled={investigation.phase === "investigating"}
        onSelect={investigation.selectExample}
      />
      {investigation.visibleRun ? (
        <InvestigationWorkspace run={investigation.visibleRun} />
      ) : (
        <ConnectedData />
      )}
    </div>
  );
}
