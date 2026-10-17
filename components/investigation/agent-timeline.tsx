import { Check, Circle, Loader2, X } from "lucide-react";
import type { AgentStep } from "@/lib/agent/types";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/section-header";

type AgentTimelineProps = {
  steps: AgentStep[];
};

export function AgentTimeline({ steps }: AgentTimelineProps) {
  const active = steps.find((step) => step.status === "running" || step.status === "failed");

  return (
    <section>
      <SectionHeader title="Investigation" />
      <p className="sr-only" aria-live="polite">
        {active ? `${active.label}. ${active.summary ?? "In progress."}` : ""}
      </p>
      <ol
        aria-label="Investigation progress"
        aria-busy={steps.some((step) => step.status === "running")}
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-2.5 border-b border-border px-3 py-2 last:border-b-0"
          >
            <StepIcon status={step.status} />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-ui",
                  step.status === "pending" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.summary ? (
                <p className="mt-0.5 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                  {step.summary}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "completed") {
    return <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />;
  }
  if (status === "running") {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden />;
  }
  if (status === "failed") {
    return <X className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />;
}
