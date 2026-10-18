import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomerActivityRecord,
  CustomerRecord,
  HistoricalExperimentRecord,
  SupportTicketRecord,
  UsageDailyRecord,
} from "@/lib/agent/types";

export type SupabaseCustomer = {
  stripeCustomerId: string;
  name: string;
  segment: CustomerRecord["segment"];
  cohort: string;
};

export type SupabaseDemoSlice = {
  customers: SupabaseCustomer[];
  activity: CustomerActivityRecord[];
  tickets: SupportTicketRecord[];
  usage: UsageDailyRecord[];
  experiments: HistoricalExperimentRecord[];
};

type CustomerRow = {
  stripe_customer_id: string;
  name: string;
  segment: string;
  cohort: string;
};

type ActivityRow = {
  stripe_customer_id: string;
  last_seen_at: string;
  login_count_30d: number;
  feature_adoption: number | string;
};

type TicketRow = {
  id: string;
  stripe_customer_id: string;
  status: string;
  topic: string;
  sentiment: string;
  opened_at: string;
  summary: string;
};

type UsageRow = {
  stripe_customer_id: string;
  period: string;
  events: number;
  seats: number;
};

type ExperimentRow = {
  id: string;
  name: string;
  strategy: string;
  started_at: string;
  ended_at: string;
  outcome: string;
  metric_delta: number | string;
};

export function supabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadSupabaseDemo(): Promise<SupabaseDemoSlice> {
  const supabase = supabaseClient();
  const [customers, activity, tickets, usage, experiments] = await Promise.all([
    select<CustomerRow>(supabase, "demo_customers"),
    select<ActivityRow>(supabase, "customer_activity"),
    select<TicketRow>(supabase, "support_tickets"),
    select<UsageRow>(supabase, "usage_daily"),
    select<ExperimentRow>(supabase, "historical_experiments"),
  ]);

  return mapSupabaseRows({ customers, activity, tickets, usage, experiments });
}

export function mapSupabaseRows(input: {
  customers: unknown[];
  activity: unknown[];
  tickets: unknown[];
  usage: unknown[];
  experiments: unknown[];
}): SupabaseDemoSlice {
  return {
    customers: input.customers.flatMap((row) => {
      const record = asRow(row);
      const stripeCustomerId = text(record.stripe_customer_id);
      if (!stripeCustomerId) return [];
      return [{
        stripeCustomerId,
        name: text(record.name),
        segment: segmentOf(text(record.segment)),
        cohort: text(record.cohort),
      }];
    }),
    activity: input.activity.flatMap((row) => {
      const record = asRow(row);
      const customerId = text(record.stripe_customer_id);
      if (!customerId) return [];
      return [{
        customerId,
        lastSeenAt: day(record.last_seen_at),
        loginCount30d: Number(record.login_count_30d) || 0,
        featureAdoption: Number(record.feature_adoption) || 0,
      }];
    }),
    tickets: input.tickets.flatMap((row) => {
      const record = asRow(row);
      const id = text(record.id);
      const customerId = text(record.stripe_customer_id);
      if (!id || !customerId) return [];
      return [{
        id,
        customerId,
        status: text(record.status) === "closed" ? "closed" as const : "open" as const,
        topic: topicOf(text(record.topic)),
        sentiment: sentimentOf(text(record.sentiment)),
        openedAt: day(record.opened_at),
        summary: text(record.summary),
      }];
    }),
    usage: input.usage.flatMap((row) => {
      const record = asRow(row);
      const customerId = text(record.stripe_customer_id);
      if (!customerId) return [];
      return [{
        customerId,
        period: day(record.period),
        events: Number(record.events) || 0,
        seats: Number(record.seats) || 0,
      }];
    }),
    experiments: input.experiments.flatMap((row) => {
      const record = asRow(row);
      const id = text(record.id);
      if (!id) return [];
      return [{
        id,
        name: text(record.name),
        strategy: text(record.strategy),
        startedAt: day(record.started_at),
        endedAt: day(record.ended_at),
        outcome: text(record.outcome),
        metricDelta: Number(record.metric_delta) || 0,
      }];
    }),
  };
}

function asRow(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function day(value: unknown): string {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "";
}

async function select<T>(supabase: SupabaseClient, table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select("*");
  if (error) {
    throw new Error(
      error.code === "PGRST205" || error.message.includes("does not exist")
        ? `Supabase is missing ${table}. Apply scripts/demo/supabase-seed.sql, then run npm run seed:demo.`
        : `Supabase query for ${table} failed: ${error.message}`,
    );
  }
  return (data ?? []) as T[];
}

function segmentOf(value: string): CustomerRecord["segment"] {
  if (value === "mid_market" || value === "enterprise" || value === "startup") return value;
  return "startup";
}

function topicOf(value: string): SupportTicketRecord["topic"] {
  if (value === "billing" || value === "bug" || value === "onboarding") return value;
  return "billing";
}

function sentimentOf(value: string): SupportTicketRecord["sentiment"] {
  if (value === "negative" || value === "neutral" || value === "positive") return value;
  return "neutral";
}
