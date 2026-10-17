import { CONNECTED_SOURCES } from "@/lib/experiment";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";

export function ConnectedData({
  sources = CONNECTED_SOURCES,
}: {
  sources?: readonly string[];
}) {
  return (
    <section>
      <SectionHeader
        title="Connected data"
        description="Sources available to this workspace."
      />
      <ul className="overflow-hidden rounded-lg border border-border bg-card">
        {sources.map((source) => (
          <li
            key={source}
            className="flex h-10 items-center border-b border-border px-3 last:border-b-0"
          >
            <StatusBadge status="connected">{source}</StatusBadge>
            <span className="sr-only">Connected</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
