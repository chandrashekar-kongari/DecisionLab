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

  return {
    customers: customers.map((row) => ({
      stripeCustomerId: row.stripe_customer_id,
      name: row.name,
      segment: segmentOf(row.segment),
      cohort: row.cohort,
    })),
    activity: activity.map((row) => ({
      customerId: row.stripe_customer_id,
      lastSeenAt: row.last_seen_at.slice(0, 10),
      loginCount30d: Number(row.login_count_30d),
      featureAdoption: Number(row.feature_adoption),
    })),
    tickets: tickets.map((row) => ({
      id: row.id,
      customerId: row.stripe_customer_id,
      status: row.status === "closed" ? "closed" : "open",
      topic: topicOf(row.topic),
      sentiment: sentimentOf(row.sentiment),
      openedAt: row.opened_at.slice(0, 10),
      summary: row.summary,
    })),
    usage: usage.map((row) => ({
      customerId: row.stripe_customer_id,
      period: row.period.slice(0, 10),
      events: Number(row.events),
      seats: Number(row.seats),
    })),
    experiments: experiments.map((row) => ({
      id: row.id,
      name: row.name,
      strategy: row.strategy,
      startedAt: row.started_at.slice(0, 10),
      endedAt: row.ended_at.slice(0, 10),
      outcome: row.outcome,
      metricDelta: Number(row.metric_delta),
    })),
  };
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
