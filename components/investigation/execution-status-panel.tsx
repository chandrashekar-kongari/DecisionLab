import { Loader2, X } from "lucide-react";
import type { AgentRun } from "@/lib/agent/types";
import { SectionHeader } from "@/components/section-header";

type ExecutionStatusPanelProps = {
  run: AgentRun;
};

export function ExecutionStatusPanel({ run }: ExecutionStatusPanelProps) {
  const provision = run.steps.find((step) => step.id === "provision_sandbox");
  const failed = provision?.status === "failed" || run.status === "failed";
  const shape = run.sandboxRequest?.shape ?? "s-1vcpu-1gb";

  return (
    <section>
      <SectionHeader title="Execution" description="CreateOS Sandbox" />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <ul>
          <li className="flex items-center justify-between gap-4 border-b border-border px-3 py-2">
            <span className="text-ui text-muted-foreground">Status</span>
            <span className="inline-flex items-center gap-2 text-ui text-foreground">
              {failed ? (
                <X className="size-3.5 text-destructive" aria-hidden />
              ) : (
                <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
              )}
              {failed ? "Failed" : "Waiting"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4 border-b border-border px-3 py-2">
            <span className="text-ui text-muted-foreground">Shape</span>
            <span className="text-ui text-foreground">{shape}</span>
          </li>
          <li className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="text-ui text-muted-foreground">Simulation</span>
            <span className="text-ui text-foreground">Not started</span>
          </li>
        </ul>
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {failed
            ? (provision?.error ?? "Could not provision CreateOS Sandbox.")
            : "No simulation has been executed. Provisioning waits until CreateOS Sandbox is connected."}
        </p>
      </div>
    </section>
  );
}
