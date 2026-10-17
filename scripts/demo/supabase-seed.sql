-- AcmeFlow demo tables for DecisionLab.
-- Apply this in the Supabase SQL editor before `npm run seed:demo`.
-- The Stripe seed fills the rows after it creates test-mode customers.
-- Neon remains the app database. These tables are the demo warehouse.

create table if not exists demo_customers (
  stripe_customer_id text primary key,
  name text not null,
  segment text not null check (segment in ('startup', 'mid_market', 'enterprise')),
  cohort text not null check (cohort in ('failed_payment', 'cancellation', 'churn_risk', 'healthy'))
);

create table if not exists customer_activity (
  stripe_customer_id text primary key references demo_customers (stripe_customer_id) on delete cascade,
  last_seen_at timestamptz not null,
  login_count_30d integer not null,
  feature_adoption numeric not null
);

create table if not exists support_tickets (
  id text primary key,
  stripe_customer_id text not null references demo_customers (stripe_customer_id) on delete cascade,
  status text not null check (status in ('open', 'closed')),
  topic text not null check (topic in ('billing', 'bug', 'onboarding')),
  sentiment text not null check (sentiment in ('negative', 'neutral', 'positive')),
  opened_at date not null,
  summary text not null
);

create table if not exists usage_daily (
  stripe_customer_id text not null references demo_customers (stripe_customer_id) on delete cascade,
  period date not null,
  events integer not null,
  seats integer not null,
  primary key (stripe_customer_id, period)
);

create table if not exists historical_experiments (
  id text primary key,
  name text not null,
  strategy text not null,
  started_at date not null,
  ended_at date not null,
  outcome text not null,
  metric_delta numeric not null
);

alter table demo_customers enable row level security;
alter table customer_activity enable row level security;
alter table support_tickets enable row level security;
alter table usage_daily enable row level security;
alter table historical_experiments enable row level security;
