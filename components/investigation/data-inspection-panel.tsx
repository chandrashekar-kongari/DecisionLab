import type { DatasetSummary } from "@/lib/agent/types";
import { formatCount, formatDay, formatPercent, formatUsd } from "@/lib/format";
import { SectionHeader } from "@/components/section-header";

type DataInspectionPanelProps = {
  summary: DatasetSummary;
  description?: string;
};

export function DataInspectionPanel({
  summary,
  description = "Records available for this investigation.",
}: DataInspectionPanelProps) {
  const rows = [
    ["Company", summary.company],
    ["Source", sourceLabel(summary.source)],
    ["Customers", formatCount(summary.customerCount)],
    ["Subscriptions", formatCount(summary.subscriptionCount)],
    ["Active subscriptions", formatCount(summary.activeSubscriptionCount)],
    ["Monthly revenue", formatUsd(summary.monthlyRecurringRevenue)],
    ["Blended price", formatUsd(summary.averageRevenuePerAccount)],
    ["Churn", formatPercent(summary.churnRate)],
    ...summary.plans.map(
      (plan) =>
        [
          plan.name,
          `${formatUsd(plan.monthlyPrice)} · ${formatCount(plan.activeSubscriptions)} active`,
        ] as const,
    ),
    ...summary.pricingChanges.map(
      (change) =>
        [
          `${change.planName} price change`,
          `${formatUsd(change.previousPrice)} to ${formatUsd(change.price)} · ${formatDay(change.effectiveAt)}`,
        ] as const,
    ),
    ["Sales team", `${formatCount(summary.salesCapacity.representatives)} representatives`],
    ["Quota per representative", formatUsd(summary.salesCapacity.quotaPerRepresentativeMonthly)],
    ["Open pipeline", formatUsd(summary.salesCapacity.openPipeline)],
    ["Marketing spend", formatUsd(summary.monthlyMarketingSpend)],
  ];

  return (
    <section>
      <SectionHeader title="Data inspection" description={description} />
      <ul className="overflow-hidden rounded-lg border border-border bg-card">
        {rows.map(([label, value]) => (
          <li
            key={label}
            className="flex flex-col gap-0.5 border-b border-border px-3 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span className="text-ui text-muted-foreground">{label}</span>
            <span className="text-ui text-foreground tabular-nums sm:text-right">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function sourceLabel(source: DatasetSummary["source"]) {
  if (source === "synthetic") return "Synthetic sample";
  if (source === "supabase") return "Stripe test mode and Supabase";
  return "MCP";
}
