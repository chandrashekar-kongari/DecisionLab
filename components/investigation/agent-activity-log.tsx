import type { AgentEvent } from "@/lib/agent/types";
import { formatTime } from "@/lib/format";
import { SectionHeader } from "@/components/section-header";

type AgentActivityLogProps = {
  events: AgentEvent[];
};

export function AgentActivityLog({ events }: AgentActivityLogProps) {
  return (
    <section>
      <SectionHeader title="Activity" description="Tool events from this run." />
      <ol className="overflow-hidden rounded-lg border border-border bg-card">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex gap-3 border-b border-border px-3 py-2 last:border-b-0"
          >
            <time
              dateTime={event.at}
              className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums"
            >
              {formatTime(event.at)}
            </time>
            <span className="min-w-0 text-ui text-foreground">{event.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
