"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ComposerPhase } from "@/components/investigation/use-investigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type GoalInputProps = {
  goal: string;
  phase: ComposerPhase;
  error?: string | null;
  onGoalChange: (goal: string) => void;
  onRun: () => void;
  onEdit: () => void;
};

export function GoalInput({
  goal,
  phase,
  error,
  onGoalChange,
  onRun,
  onEdit,
}: GoalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousPhase = useRef(phase);
  const canRun = goal.trim().length > 0;

  useEffect(() => {
    if (previousPhase.current !== "idle" && phase === "idle") {
      textareaRef.current?.focus();
    }
    previousPhase.current = phase;
  }, [phase]);

  return (
    <form
      className="rounded-lg border border-border bg-card transition-colors duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25"
      onSubmit={(event) => {
        event.preventDefault();
        if (phase === "idle") onRun();
      }}
    >
      <div className="px-4 pt-4 pb-3">
        <label htmlFor="decision-goal" className="text-sm font-medium text-foreground">
          What decision are you trying to make?
        </label>
        {phase === "idle" ? (
          <Textarea
            ref={textareaRef}
            id="decision-goal"
            value={goal}
            onChange={(event) => onGoalChange(event.target.value)}
            placeholder="Increase monthly revenue by $20,000 while keeping churn below 8%."
            rows={3}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "decision-goal-error" : undefined}
            className="mt-3 min-h-28 resize-none border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base"
          />
        ) : (
          <p className="mt-3 text-base leading-6 whitespace-pre-wrap text-foreground">{goal}</p>
        )}
        {error ? (
          <p id="decision-goal-error" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-3 py-2.5">
        {phase === "idle" ? (
          <RunButton disabled={!canRun} />
        ) : phase === "investigating" ? (
          <Button type="button" disabled>
            <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
            Running
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onEdit}>
            Edit goal
          </Button>
        )}
      </div>
    </form>
  );
}

function RunButton({ disabled }: { disabled: boolean }) {
  const button = (
    <Button type="submit" disabled={disabled}>
      Run experiment
      <ArrowRight className="size-3.5" data-icon="inline-end" />
    </Button>
  );

  if (!disabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>Add a goal to run an experiment</TooltipContent>
    </Tooltip>
  );
}
