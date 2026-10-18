// Seeds the connected Stripe test account and Supabase project with the
// cohorts DecisionLab experiments compare: failed payments, price cancellations,
// adoption drop-off, and healthy accounts. Customers stay on the normal Stripe
// list so Stripe MCP can read them. Run `npm run seed:demo`. Pass `--reset`
// to delete the previous demo customers first.
import { mkdir, writeFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

loadEnvConfig(process.cwd());

const DEMO = "decision-lab";
const reset = process.argv.includes("--reset");

type PlanId = "plan_starter" | "plan_growth" | "plan_scale";
type Cohort = "failed_payment" | "cancellation" | "churn_risk" | "healthy";
type Segment = "startup" | "mid_market" | "enterprise";

type Account = {
  key: string;
  name: string;
  cohort: Cohort;
  plan: PlanId;
  segment: Segment;
  startedAt: string;
  canceledAt?: string;
  failure?: "card_declined" | "insufficient_funds";
};

const ACCOUNTS: Account[] = [
  {
    key: "northwind",
    name: "Northwind Labs",
    cohort: "failed_payment",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2026-09-01",
    failure: "card_declined",
  },
  {
    key: "brightline",
    name: "Brightline Studio",
    cohort: "failed_payment",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2026-09-01",
    failure: "card_declined",
  },
  {
    key: "harbor",
    name: "Harbor & Co",
    cohort: "failed_payment",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2026-09-01",
    failure: "card_declined",
  },
  {
    key: "lumen",
    name: "Lumen Fieldnotes",
    cohort: "failed_payment",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2026-09-01",
    failure: "insufficient_funds",
  },
  {
    key: "paperkite",
    name: "Paperkite Analytics",
    cohort: "failed_payment",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2026-09-01",
    failure: "insufficient_funds",
  },
  {
    key: "copperline",
    name: "Copperline Health",
    cohort: "failed_payment",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2026-09-01",
    failure: "insufficient_funds",
  },
  {
    key: "oakroom",
    name: "Oakroom Systems",
    cohort: "cancellation",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-05-20",
    canceledAt: "2025-06-18",
  },
  {
    key: "meridian",
    name: "Meridian Goods",
    cohort: "cancellation",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-05-20",
    canceledAt: "2025-06-18",
  },
  {
    key: "fieldnote",
    name: "Fieldnote HQ",
    cohort: "cancellation",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-05-20",
    canceledAt: "2025-06-18",
  },
  {
    key: "sable",
    name: "Sable Transit",
    cohort: "cancellation",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-05-20",
    canceledAt: "2025-06-18",
  },
  {
    key: "kindred",
    name: "Kindred Metrics",
    cohort: "cancellation",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-05-20",
    canceledAt: "2025-06-18",
  },
  {
    key: "atlas",
    name: "Atlas Foundry",
    cohort: "churn_risk",
    plan: "plan_scale",
    segment: "enterprise",
    startedAt: "2025-03-01",
  },
  {
    key: "westbridge",
    name: "Westbridge Legal",
    cohort: "churn_risk",
    plan: "plan_scale",
    segment: "enterprise",
    startedAt: "2025-03-01",
  },
  {
    key: "halcyon",
    name: "Halcyon Clinics",
    cohort: "churn_risk",
    plan: "plan_scale",
    segment: "enterprise",
    startedAt: "2025-03-01",
  },
  {
    key: "redwood",
    name: "Redwood Freight",
    cohort: "churn_risk",
    plan: "plan_scale",
    segment: "enterprise",
    startedAt: "2025-03-01",
  },
  {
    key: "picnic",
    name: "Picnic Software",
    cohort: "healthy",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2025-01-15",
  },
  {
    key: "juniper",
    name: "Juniper Desk",
    cohort: "healthy",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2025-01-15",
  },
  {
    key: "lowtide",
    name: "Lowtide Design",
    cohort: "healthy",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2025-01-15",
  },
  {
    key: "maple",
    name: "Maple Circuit",
    cohort: "healthy",
    plan: "plan_starter",
    segment: "startup",
    startedAt: "2025-01-15",
  },
  {
    key: "cedar",
    name: "Cedar Payroll",
    cohort: "healthy",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-01-15",
  },
  {
    key: "nimbus",
    name: "Nimbus Retail",
    cohort: "healthy",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-01-15",
  },
  {
    key: "goldfinch",
    name: "Goldfinch Media",
    cohort: "healthy",
    plan: "plan_growth",
    segment: "mid_market",
    startedAt: "2025-01-15",
  },
  {
    key: "ironwood",
    name: "Ironwood Energy",
    cohort: "healthy",
    plan: "plan_scale",
    segment: "enterprise",
    startedAt: "2025-01-15",
  },
  {
    key: "solstice",
    name: "Solstice Bank",
    cohort: "healthy",
    plan: "plan_scale",
    segment: "enterprise",
    startedAt: "2025-01-15",
  },
];

type SeededCustomer = {
  key: string;
  account: Account;
  customerId: string;
  subscriptionId: string;
};

async function main() {
  const stripeKey = required("STRIPE_SECRET_KEY");
  if (!stripeKey.startsWith("sk_test_") && !stripeKey.startsWith("rk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a test-mode key (sk_test_ or rk_test_).",
    );
  }
  const supabaseUrl = required("SUPABASE_URL");
  const supabaseKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const stripe = new Stripe(stripeKey);
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const prices = await ensurePrices(stripe);
  if (reset) await deleteDemoCustomers(stripe);

  const existing = reset ? [] : await listDemoCustomers(stripe);
  const reused = await reuseCustomers(stripe, existing);
  const present = new Set(reused.map((row) => row.key));
  const missing = ACCOUNTS.filter((account) => !present.has(account.key));
  const created =
    missing.length > 0 ? await createCustomers(stripe, prices, missing) : [];
  const seeded = [...reused, ...created];

  await writeManifest(seeded);
  await upsertSupabase(supabase, seeded);
  const pastDue = seeded.filter(
    (row) => row.account.cohort === "failed_payment",
  ).length;
  const canceled = seeded.filter(
    (row) => row.account.cohort === "cancellation",
  ).length;
  console.log(
    `Demo seed ready: ${seeded.length} customers, ${pastDue} failed-payment accounts, ${canceled} cancellations.`,
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Store it with stripe projects variables set, then run stripe projects env --pull.`,
    );
  }
  return value;
}

async function ensurePrices(stripe: Stripe): Promise<Record<PlanId, string>> {
  const products = await stripe.products
    .list({ limit: 100 })
    .autoPagingToArray({ limit: 100 });
  const demoProducts = products.filter(
    (product) => product.metadata?.demo === DEMO,
  );
  const byPlan = new Map(
    demoProducts.map((product) => [product.metadata.plan_id, product]),
  );

  const starter = await ensureProduct(
    stripe,
    byPlan.get("plan_starter"),
    "Starter",
    "plan_starter",
  );
  const growth = await ensureProduct(
    stripe,
    byPlan.get("plan_growth"),
    "Growth",
    "plan_growth",
  );
  const scale = await ensureProduct(
    stripe,
    byPlan.get("plan_scale"),
    "Scale",
    "plan_scale",
  );

  await ensurePrice(stripe, growth.id, "plan_growth", 12900, {
    superseded: "true",
  });
  const starterPrice = await ensurePrice(
    stripe,
    starter.id,
    "plan_starter",
    4900,
    { current: "true" },
  );
  const growthPrice = await ensurePrice(
    stripe,
    growth.id,
    "plan_growth",
    14900,
    {
      current: "true",
      previous_amount: "12900",
      effective_at: "2025-06-01",
    },
  );
  const scalePrice = await ensurePrice(stripe, scale.id, "plan_scale", 39900, {
    current: "true",
  });

  return {
    plan_starter: starterPrice.id,
    plan_growth: growthPrice.id,
    plan_scale: scalePrice.id,
  };
}

async function ensureProduct(
  stripe: Stripe,
  existing: Stripe.Product | undefined,
  name: string,
  planId: PlanId,
): Promise<Stripe.Product> {
  if (existing) return existing;
  return stripe.products.create({
    name,
    metadata: { demo: DEMO, plan_id: planId },
  });
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  planId: PlanId,
  unitAmount: number,
  metadata: Record<string, string>,
): Promise<Stripe.Price> {
  const prices = await stripe.prices.list({ product: productId, limit: 100 });
  const match = prices.data.find(
    (price) =>
      price.unit_amount === unitAmount &&
      price.metadata?.demo === DEMO &&
      price.metadata.plan_id === planId,
  );
  if (match) return match;
  return stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { demo: DEMO, plan_id: planId, ...metadata },
  });
}

async function listDemoCustomers(stripe: Stripe): Promise<Stripe.Customer[]> {
  const customers = await stripe.customers
    .list({ limit: 100 })
    .autoPagingToArray({ limit: 200 });
  return customers.filter(
    (customer) => customer.metadata?.demo === DEMO && !customer.deleted,
  );
}

async function deleteDemoCustomers(stripe: Stripe) {
  const customers = await listDemoCustomers(stripe);
  for (const customer of customers) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });
    for (const subscription of subscriptions.data) {
      if (subscription.status !== "canceled")
        await stripe.subscriptions.cancel(subscription.id);
    }
    await stripe.customers.del(customer.id);
  }
  if (customers.length > 0)
    console.log(`Removed ${customers.length} existing demo customers.`);
}

async function reuseCustomers(
  stripe: Stripe,
  customers: Stripe.Customer[],
): Promise<SeededCustomer[]> {
  console.log(
    `Reusing ${customers.length} existing demo customers. Pass --reset to recreate them.`,
  );
  const subscriptions = await stripe.subscriptions
    .list({ status: "all", limit: 100 })
    .autoPagingToArray({ limit: 200 });
  const rows: SeededCustomer[] = [];
  for (const customer of customers) {
    const account = ACCOUNTS.find(
      (item) => item.key === customer.metadata?.account_key,
    );
    if (!account) continue;
    const subscription = subscriptions.find(
      (item) => item.customer === customer.id,
    );
    if (!subscription) continue;
    rows.push({
      key: account.key,
      account,
      customerId: customer.id,
      subscriptionId: subscription.id,
    });
  }
  return rows;
}

async function createCustomers(
  stripe: Stripe,
  prices: Record<PlanId, string>,
  accounts: Account[],
): Promise<SeededCustomer[]> {
  const rows: SeededCustomer[] = [];
  for (const account of accounts) {
    const customer = await createCustomer(stripe, account);
    const card = await attachCard(
      stripe,
      customer.id,
      account.cohort === "failed_payment" ? "tok_chargeCustomerFail" : "tok_visa",
    );
    let subscription: Stripe.Subscription;
    if (account.cohort === "failed_payment") {
      subscription = await createFailedSubscription(stripe, account, customer.id, card.id, prices);
    } else {
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: prices[account.plan] }],
        default_payment_method: card.id,
        metadata: subscriptionMetadata(account),
      });
      if (account.cohort === "cancellation") {
        await stripe.subscriptions.cancel(subscription.id, {
          cancellation_details: {
            comment: "The Growth price increase was too expensive.",
            feedback: "too_expensive",
          },
        });
      }
    }
    rows.push({
      key: account.key,
      account,
      customerId: customer.id,
      subscriptionId: subscription.id,
    });
    console.log(`Seeded ${account.name} (${account.cohort}).`);
  }
  return rows;
}

async function createFailedSubscription(
  stripe: Stripe,
  account: Account,
  customerId: string,
  paymentMethodId: string,
  prices: Record<PlanId, string>,
): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: prices[account.plan] }],
      default_payment_method: paymentMethodId,
      payment_behavior: "allow_incomplete",
      metadata: subscriptionMetadata(account),
    });
  } catch (error) {
    if (!isCardDecline(error)) throw error;
    const visa = await attachCard(stripe, customerId, "tok_visa");
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: prices[account.plan] }],
      default_payment_method: visa.id,
      metadata: subscriptionMetadata(account),
    });
    const invoice = await stripe.invoices.create({
      customer: customerId,
      subscription: subscription.id,
      auto_advance: false,
      collection_method: "charge_automatically",
    });
    try {
      await stripe.invoices.pay(invoice.id, { payment_method: paymentMethodId });
    } catch (payError) {
      if (!isCardDecline(payError)) throw payError;
    }
    return subscription;
  }
}

function isCardDecline(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: string }).type === "StripeCardError"
  );
}

async function createCustomer(
  stripe: Stripe,
  account: Account,
  testClock?: string,
) {
  return stripe.customers.create({
    name: account.name,
    email: `billing+${account.key}@example.com`,
    metadata: {
      demo: DEMO,
      account_key: account.key,
      cohort: account.cohort,
      segment: account.segment,
      demo_started_at: account.startedAt,
      ...(account.canceledAt ? { demo_canceled_at: account.canceledAt } : {}),
    },
    ...(testClock ? { test_clock: testClock } : {}),
  });
}

async function attachCard(stripe: Stripe, customerId: string, token: string) {
  const paymentMethod = await stripe.paymentMethods.create({
    type: "card",
    card: { token },
  });
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: customerId,
  });
  return paymentMethod;
}

function subscriptionMetadata(account: Account): Stripe.MetadataParam {
  return {
    demo: DEMO,
    account_key: account.key,
    cohort: account.cohort,
    demo_started_at: account.startedAt,
    ...(account.canceledAt
      ? { demo_canceled_at: account.canceledAt, churn_reason: "price" }
      : {}),
  };
}

async function writeManifest(rows: SeededCustomer[]) {
  await mkdir("scripts/demo", { recursive: true });
  await writeFile(
    "scripts/demo/manifest.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        customers: rows.map((row) => ({
          key: row.key,
          cohort: row.account.cohort,
          customerId: row.customerId,
          subscriptionId: row.subscriptionId,
        })),
      },
      null,
      2,
    ),
  );
}

type DemoResult = PromiseLike<{ error: { message: string } | null }>;

type DemoTable = {
  select(columns: string): { limit(count: number): DemoResult };
  upsert(values: unknown): DemoResult;
  insert(values: unknown[]): DemoResult;
  delete(): { in(column: string, values: string[]): DemoResult };
};

async function upsertSupabase(
  supabase: { from(table: string): DemoTable },
  rows: SeededCustomer[],
) {
  const ids = rows.map((row) => row.customerId);
  const { error: schemaError } = await supabase
    .from("demo_customers")
    .select("stripe_customer_id")
    .limit(1);
  if (schemaError) {
    throw new Error(
      `Supabase tables are not ready (${schemaError.message}). Apply scripts/demo/supabase-seed.sql, then run npm run seed:demo again.`,
    );
  }

  const { error: customerError } = await supabase.from("demo_customers").upsert(
    rows.map((row) => ({
      stripe_customer_id: row.customerId,
      name: row.account.name,
      segment: row.account.segment,
      cohort: row.account.cohort,
    })),
  );
  if (customerError) throw new Error(customerError.message);

  const { error: activityError } = await supabase
    .from("customer_activity")
    .upsert(
      rows.map((row) => ({
        stripe_customer_id: row.customerId,
        ...activityFor(row.account),
      })),
    );
  if (activityError) throw new Error(activityError.message);

  if (ids.length > 0) {
    const { error: deleteTickets } = await supabase
      .from("support_tickets")
      .delete()
      .in("stripe_customer_id", ids);
    if (deleteTickets) throw new Error(deleteTickets.message);
    const { error: deleteUsage } = await supabase
      .from("usage_daily")
      .delete()
      .in("stripe_customer_id", ids);
    if (deleteUsage) throw new Error(deleteUsage.message);
  }

  const tickets = rows.flatMap((row) => ticketsFor(row));
  if (tickets.length > 0) {
    const { error } = await supabase.from("support_tickets").insert(tickets);
    if (error) throw new Error(error.message);
  }

  const usage = rows.flatMap((row) => usageFor(row));
  if (usage.length > 0) {
    const { error } = await supabase.from("usage_daily").insert(usage);
    if (error) throw new Error(error.message);
  }

  const { error: experimentError } = await supabase
    .from("historical_experiments")
    .upsert({
      id: "exp_onboarding_email_v2",
      name: "Onboarding email v2",
      strategy: "Send a second onboarding email on day 3",
      started_at: "2025-09-01",
      ended_at: "2025-12-01",
      outcome:
        "The treated cohort retained 6 percentage points more customers than the holdout.",
      metric_delta: 0.06,
    });
  if (experimentError) throw new Error(experimentError.message);
}

function activityFor(account: Account) {
  if (account.cohort === "failed_payment") {
    return {
      last_seen_at: "2026-10-15T00:00:00.000Z",
      login_count_30d: 14,
      feature_adoption: 0.62,
    };
  }
  if (account.cohort === "cancellation") {
    return {
      last_seen_at: "2025-06-16T00:00:00.000Z",
      login_count_30d: 9,
      feature_adoption: 0.71,
    };
  }
  if (account.cohort === "churn_risk") {
    return {
      last_seen_at: "2026-10-02T00:00:00.000Z",
      login_count_30d: 3,
      feature_adoption: 0.28,
    };
  }
  return {
    last_seen_at: "2026-10-16T00:00:00.000Z",
    login_count_30d: 18,
    feature_adoption: 0.8,
  };
}

function ticketsFor(row: SeededCustomer) {
  if (row.account.cohort === "cancellation") {
    return [
      {
        id: `tix_${row.key}_billing`,
        stripe_customer_id: row.customerId,
        status: "open",
        topic: "billing",
        sentiment: "negative",
        opened_at: "2025-06-10",
        summary:
          "Growth plan rose from $129 to $149 and the team did not expect the invoice.",
      },
    ];
  }
  if (row.account.cohort === "churn_risk") {
    return [
      {
        id: `tix_${row.key}_bug`,
        stripe_customer_id: row.customerId,
        status: "open",
        topic: "bug",
        sentiment: "negative",
        opened_at: "2026-09-20",
        summary:
          "Exports fail after the last release, and the team has stopped the weekly workflow.",
      },
    ];
  }
  if (
    row.account.cohort === "failed_payment" &&
    row.account.failure === "card_declined"
  ) {
    return [
      {
        id: `tix_${row.key}_card`,
        stripe_customer_id: row.customerId,
        status: "closed",
        topic: "billing",
        sentiment: "neutral",
        opened_at: "2026-10-08",
        summary:
          "Asked how to replace a declined card. The account is still signing in.",
      },
    ];
  }
  return [];
}

function usageFor(row: SeededCustomer) {
  const customerId = row.customerId;
  if (row.account.cohort === "churn_risk") {
    return [
      {
        stripe_customer_id: customerId,
        period: "2026-09-01",
        events: 420,
        seats: 40,
      },
      {
        stripe_customer_id: customerId,
        period: "2026-10-01",
        events: 70,
        seats: 40,
      },
    ];
  }
  if (row.account.cohort === "cancellation") {
    return [
      {
        stripe_customer_id: customerId,
        period: "2025-05-01",
        events: 510,
        seats: 12,
      },
      {
        stripe_customer_id: customerId,
        period: "2025-06-01",
        events: 490,
        seats: 12,
      },
    ];
  }
  if (row.account.cohort === "failed_payment") {
    return [
      {
        stripe_customer_id: customerId,
        period: "2026-09-01",
        events: 180,
        seats: 3,
      },
      {
        stripe_customer_id: customerId,
        period: "2026-10-01",
        events: 170,
        seats: 3,
      },
    ];
  }
  return [
    {
      stripe_customer_id: customerId,
      period: "2026-09-01",
      events: 260,
      seats: 8,
    },
    {
      stripe_customer_id: customerId,
      period: "2026-10-01",
      events: 255,
      seats: 8,
    },
  ];
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Demo seed failed.";
  console.error(
    message.replace(/[sr]k_(?:live|test)_[A-Za-z0-9]+/g, "[redacted key]"),
  );
  process.exit(1);
});
