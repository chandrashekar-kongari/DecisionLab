import { createHash } from "node:crypto";
import type { BusinessDataset } from "@/lib/agent/types";

export const DATA_TABLES = [
  "customers",
  "subscriptions",
  "pricing",
  "pricingHistory",
  "churnEvents",
  "salesCapacity",
  "summary",
  "invoices",
  "payments",
  "customerActivity",
  "supportTickets",
  "usageDaily",
  "historicalExperiments",
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];

const DEMO_TABLES = new Set<DataTableName>([
  "invoices",
  "payments",
  "customerActivity",
  "supportTickets",
  "usageDaily",
  "historicalExperiments",
]);

export const TABLE_CATALOG: Record<
  DataTableName,
  { label: string; description: string; columns: string[] }
> = {
  customers: {
    label: "Customers",
    description: "Customer accounts, including segment and status.",
    columns: ["id", "name", "segment", "createdAt", "status"],
  },
  subscriptions: {
    label: "Subscriptions",
    description: "Subscription rows with plan, price, status, and cancellation dates.",
    columns: ["id", "customerId", "planId", "monthlyPrice", "status", "startedAt", "canceledAt"],
  },
  pricing: {
    label: "Pricing",
    description: "Current plan catalog.",
    columns: ["id", "name", "monthlyPrice", "interval"],
  },
  pricingHistory: {
    label: "Pricing history",
    description: "Historical price changes.",
    columns: ["id", "planId", "previousPrice", "price", "effectiveAt"],
  },
  churnEvents: {
    label: "Churn events",
    description: "Cancellation events and the recorded reason.",
    columns: ["id", "customerId", "subscriptionId", "occurredAt", "reason"],
  },
  salesCapacity: {
    label: "Sales capacity",
    description: "Workspace assumption for sales capacity and monthly marketing spend. Not loaded from Stripe.",
    columns: [
      "representatives",
      "quotaPerRepresentativeMonthly",
      "openPipeline",
      "averageSalesCycleDays",
      "monthlyMarketingSpend",
    ],
  },
  summary: {
    label: "Summary",
    description: "Aggregate figures computed from the customer and subscription tables.",
    columns: [
      "company",
      "source",
      "customerCount",
      "subscriptionCount",
      "activeSubscriptionCount",
      "monthlyRecurringRevenue",
      "averageRevenuePerAccount",
      "churnRate",
      "monthlyMarketingSpend",
      "pricingChangeCount",
      "churnEventCount",
    ],
  },
  invoices: {
    label: "Invoices",
    description: "Stripe test-mode invoices, including open invoices after a failed charge.",
    columns: [
      "id",
      "customerId",
      "subscriptionId",
      "status",
      "amountDue",
      "amountPaid",
      "attempted",
      "createdAt",
    ],
  },
  payments: {
    label: "Payments",
    description: "Stripe test-mode payment attempts, including decline codes.",
    columns: [
      "id",
      "customerId",
      "invoiceId",
      "status",
      "failureCode",
      "failureMessage",
      "amount",
      "createdAt",
    ],
  },
  customerActivity: {
    label: "Customer activity",
    description: "Supabase login and feature-adoption records for the demo customers.",
    columns: ["customerId", "lastSeenAt", "loginCount30d", "featureAdoption"],
  },
  supportTickets: {
    label: "Support tickets",
    description: "Supabase support tickets, including billing complaints and product bugs.",
    columns: ["id", "customerId", "status", "topic", "sentiment", "openedAt", "summary"],
  },
  usageDaily: {
    label: "Usage",
    description: "Supabase usage by period, used to separate adoption problems from billing problems.",
    columns: ["customerId", "period", "events", "seats"],
  },
  historicalExperiments: {
    label: "Historical experiments",
    description: "Supabase record of a past strategy test and its measured outcome.",
    columns: ["id", "name", "strategy", "startedAt", "endedAt", "outcome", "metricDelta"],
  },
};

export function isDataTable(value: string): value is DataTableName {
  return (DATA_TABLES as readonly string[]).includes(value);
}

export function isDemoTable(table: DataTableName): boolean {
  return DEMO_TABLES.has(table);
}

export function tablesForDataset(dataset: BusinessDataset): DataTableName[] {
  if (dataset.source === "synthetic") {
    return DATA_TABLES.filter((table) => !DEMO_TABLES.has(table));
  }
  return [...DATA_TABLES];
}

export function datasetNarrative(dataset: BusinessDataset) {
  if (dataset.source === "synthetic") {
    return {
      sampleData: true,
      demoData: false,
      label: "sample data",
      note: "These records are deterministic sample data for AcmeFlow, not a live customer account.",
    };
  }
  return {
    sampleData: false,
    demoData: true,
    label: "demo account data",
    note: "These records are AcmeFlow demo data from Stripe test mode and Supabase, not a production customer account.",
  };
}

export function schemaForTables(tables: DataTableName[]): Record<string, string[]> {
  const schema: Record<string, string[]> = {};
  for (const table of tables) {
    schema[table] = [...TABLE_CATALOG[table].columns];
  }
  return schema;
}

export function hashSchema(schema: Record<string, string[]>): string {
  const ordered = Object.keys(schema)
    .sort()
    .map((key) => [key, [...schema[key]].sort()]);
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

export function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function sliceDataset(dataset: BusinessDataset, tables: DataTableName[]) {
  const narrative = datasetNarrative(dataset);
  const payload: Record<string, unknown> = {
    label: narrative.label,
    sampleData: narrative.sampleData,
    demoData: narrative.demoData,
    source: dataset.source,
    company: dataset.company,
    generatedAt: dataset.generatedAt,
    note: narrative.note,
  };
  for (const table of tables) {
    if (table === "customers") payload.customers = dataset.customers;
    if (table === "subscriptions") payload.subscriptions = dataset.subscriptions;
    if (table === "pricing") payload.pricing = dataset.pricing;
    if (table === "pricingHistory") payload.pricingHistory = dataset.pricingHistory;
    if (table === "churnEvents") payload.churnEvents = dataset.churnEvents;
    if (table === "summary") payload.summary = dataset.summary;
    if (table === "invoices") payload.invoices = dataset.invoices;
    if (table === "payments") payload.payments = dataset.payments;
    if (table === "customerActivity") payload.customerActivity = dataset.customerActivity;
    if (table === "supportTickets") payload.supportTickets = dataset.supportTickets;
    if (table === "usageDaily") payload.usageDaily = dataset.usageDaily;
    if (table === "historicalExperiments") payload.historicalExperiments = dataset.historicalExperiments;
    if (table === "salesCapacity") {
      payload.salesCapacity = {
        ...dataset.salesCapacity,
        monthlyMarketingSpend: dataset.monthlyMarketingSpend,
      };
    }
  }
  return payload;
}

export function sampleRows(dataset: BusinessDataset, table: DataTableName, limit: number) {
  const bounded = Math.min(Math.max(limit, 1), 20);
  if (table === "customers") return dataset.customers.slice(0, bounded);
  if (table === "subscriptions") return dataset.subscriptions.slice(0, bounded);
  if (table === "pricing") return dataset.pricing.slice(0, bounded);
  if (table === "pricingHistory") return dataset.pricingHistory.slice(0, bounded);
  if (table === "churnEvents") return dataset.churnEvents.slice(0, bounded);
  if (table === "invoices") return dataset.invoices.slice(0, bounded);
  if (table === "payments") return dataset.payments.slice(0, bounded);
  if (table === "customerActivity") return dataset.customerActivity.slice(0, bounded);
  if (table === "supportTickets") return dataset.supportTickets.slice(0, bounded);
  if (table === "usageDaily") return dataset.usageDaily.slice(0, bounded);
  if (table === "historicalExperiments") return dataset.historicalExperiments.slice(0, bounded);
  if (table === "summary") return dataset.summary;
  return {
    ...dataset.salesCapacity,
    monthlyMarketingSpend: dataset.monthlyMarketingSpend,
  };
}

export function tableCount(dataset: BusinessDataset, table: DataTableName): number | null {
  if (table === "customers") return dataset.customers.length;
  if (table === "subscriptions") return dataset.subscriptions.length;
  if (table === "pricing") return dataset.pricing.length;
  if (table === "pricingHistory") return dataset.pricingHistory.length;
  if (table === "churnEvents") return dataset.churnEvents.length;
  if (table === "invoices") return dataset.invoices.length;
  if (table === "payments") return dataset.payments.length;
  if (table === "customerActivity") return dataset.customerActivity.length;
  if (table === "supportTickets") return dataset.supportTickets.length;
  if (table === "usageDaily") return dataset.usageDaily.length;
  if (table === "historicalExperiments") return dataset.historicalExperiments.length;
  return null;
}
