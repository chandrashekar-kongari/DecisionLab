"use client";

import { EXAMPLE_GOALS } from "@/lib/experiment";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";

type ExampleGoalsProps = {
  disabled?: boolean;
  onSelect: (goal: string) => void;
};

export function ExampleGoals({ disabled = false, onSelect }: ExampleGoalsProps) {
  return (
    <section>
      <SectionHeader title="Example goals" />
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_GOALS.map((goal) => (
          <Button
            key={goal}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onSelect(goal)}
            className="h-auto rounded-md px-2.5 py-1.5 text-left text-ui font-normal whitespace-normal"
          >
            {goal}
          </Button>
        ))}
      </div>
    </section>
  );
}
