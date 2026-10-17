import type {
  BusinessDataset,
  ChurnEvent,
  CustomerRecord,
  DatasetSummary,
  PricingChange,
  PricingPlan,
  SalesCapacity,
  SubscriptionRecord,
} from "@/lib/agent/types";
import { liveDemoProvider } from "@/lib/data/live-provider";

/**
 * Business data access for the investigation agent.
 * Stripe test mode and Supabase are used when both credential sets are present.
 * Otherwise the agent reads the AcmeFlow sample.
 */

const ACME_SEED = 20241017;
const SUBSCRIPTION_COUNT = 1000;
const CHURNED_COUNT = 62;
const GENERATED_AT = "2026-01-15T00:00:00.000Z";
const ANCHOR_MS = Date.parse(GENERATED_AT);
const STARTED_ORIGIN_MS = Date.parse("2024-02-01T00:00:00.000Z");
const STARTED_SPAN_MS = Date.parse("2025-12-01T00:00:00.000Z") - STARTED_ORIGIN_MS;

const PLANS: PricingPlan[] = [
  { id: "plan_starter", name: "Starter", monthlyPrice: 49, interval: "month" },
  { id: "plan_growth", name: "Growth", monthlyPrice: 149, interval: "month" },
  { id: "plan_scale", name: "Scale", monthlyPrice: 399, interval: "month" },
];

const PRICING_HISTORY: PricingChange[] = [
  {
    id: "price_starter_2025_06",
    planId: "plan_starter",
    previousPrice: 39,
    price: 49,
    effectiveAt: "2025-06-01",
  },
  {
    id: "price_growth_2025_06",
    planId: "plan_growth",
    previousPrice: 129,
    price: 149,
    effectiveAt: "2025-06-01",
  },
  {
    id: "price_scale_2025_11",
    planId: "plan_scale",
    previousPrice: 349,
    price: 399,
    effectiveAt: "2025-11-01",
  },
];

export const SALES_CAPACITY: SalesCapacity = {
  representatives: 8,
  quotaPerRepresentativeMonthly: 15000,
  openPipeline: 186000,
  averageSalesCycleDays: 34,
};

export const MONTHLY_MARKETING_SPEND = 28000;

const CHURN_REASONS: ChurnEvent["reason"][] = ["price", "adoption", "competitor", "support"];

export interface BusinessDataProvider {
  id: string;
  label: string;
  load(): Promise<BusinessDataset>;
}

type DatasetRecords = Omit<BusinessDataset, "summary">;

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function pickPlan(random: () => number): PricingPlan {
  const roll = random();
  if (roll < 0.5) return PLANS[0];
  if (roll < 0.85) return PLANS[1];
  return PLANS[2];
}

function segmentFor(planId: string): CustomerRecord["segment"] {
  if (planId === "plan_scale") return "enterprise";
  if (planId === "plan_growth") return "mid_market";
  return "startup";
}

function shuffle(indexes: number[], random: () => number) {
  const next = [...indexes];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = next[index];
    next[index] = next[swap];
    next[swap] = current;
  }
  return next;
}

export function summarizeDataset(dataset: DatasetRecords): DatasetSummary {
  const active = dataset.subscriptions.filter((subscription) => subscription.status === "active");
  const monthlyRecurringRevenue = active.reduce(
    (sum, subscription) => sum + subscription.monthlyPrice,
    0,
  );
  const plans = dataset.pricing.map((plan) => ({
    id: plan.id,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    activeSubscriptions: active.filter((subscription) => subscription.planId === plan.id).length,
  }));

  return {
    company: dataset.company,
    source: dataset.source,
    customerCount: dataset.customers.length,
    subscriptionCount: dataset.subscriptions.length,
    activeSubscriptionCount: active.length,
    monthlyRecurringRevenue,
    averageRevenuePerAccount: active.length
      ? Math.round(monthlyRecurringRevenue / active.length)
      : 0,
    churnRate: dataset.subscriptions.length
      ? dataset.churnEvents.length / dataset.subscriptions.length
      : 0,
    plans,
    pricingChanges: dataset.pricingHistory.map((change) => ({
      planName: dataset.pricing.find((plan) => plan.id === change.planId)?.name ?? change.planId,
      previousPrice: change.previousPrice,
      price: change.price,
      effectiveAt: change.effectiveAt,
    })),
    salesCapacity: dataset.salesCapacity,
    monthlyMarketingSpend: dataset.monthlyMarketingSpend,
    pricingChangeCount: dataset.pricingHistory.length,
    churnEventCount: dataset.churnEvents.length,
  };
}

function generateAcmeFlowDataset(): BusinessDataset {
  const random = createRng(ACME_SEED);
  const customers: CustomerRecord[] = [];
  const subscriptions: SubscriptionRecord[] = [];

  for (let index = 0; index < SUBSCRIPTION_COUNT; index += 1) {
    const plan = pickPlan(random);
    const number = String(index + 1).padStart(4, "0");
    const startedAt = formatDay(STARTED_ORIGIN_MS + Math.floor(random() * STARTED_SPAN_MS));
    const customerId = `cus_${number}`;
    const subscriptionId = `sub_${number}`;

    customers.push({
      id: customerId,
      name: `Account ${number}`,
      segment: segmentFor(plan.id),
      createdAt: startedAt,
      status: "active",
    });
    subscriptions.push({
      id: subscriptionId,
      customerId,
      planId: plan.id,
      monthlyPrice: plan.monthlyPrice,
      status: "active",
      startedAt,
      canceledAt: null,
    });
  }

  const churnedIndexes = shuffle(
    subscriptions.map((_, index) => index),
    random,
  ).slice(0, CHURNED_COUNT);
  const churnEvents: ChurnEvent[] = [];

  for (const index of churnedIndexes) {
    const subscription = subscriptions[index];
    const customer = customers[index];
    const startedMs = Date.parse(`${subscription.startedAt}T00:00:00.000Z`);
    const canceledAt = formatDay(startedMs + Math.floor(random() * (ANCHOR_MS - startedMs)));
    subscription.status = "canceled";
    subscription.canceledAt = canceledAt;
    customer.status = "churned";
    churnEvents.push({
      id: `churn_${subscription.id}`,
      customerId: customer.id,
      subscriptionId: subscription.id,
      occurredAt: canceledAt,
      reason: CHURN_REASONS[Math.floor(random() * CHURN_REASONS.length)],
    });
  }

  churnEvents.sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
  );

  const records: DatasetRecords = {
    id: `acmeflow-${ACME_SEED}`,
    company: "AcmeFlow",
    source: "synthetic",
    seed: ACME_SEED,
    generatedAt: GENERATED_AT,
    customers,
    subscriptions,
    pricing: PLANS,
    pricingHistory: PRICING_HISTORY,
    churnEvents,
    invoices: [],
    payments: [],
    customerActivity: [],
    supportTickets: [],
    usageDaily: [],
    historicalExperiments: [],
    salesCapacity: SALES_CAPACITY,
    monthlyMarketingSpend: MONTHLY_MARKETING_SPEND,
  };

  return { ...records, summary: summarizeDataset(records) };
}

let cachedDataset: BusinessDataset | undefined;

export function getAcmeFlowDataset(): BusinessDataset {
  cachedDataset ??= generateAcmeFlowDataset();
  return cachedDataset;
}

const syntheticAcmeFlowProvider: BusinessDataProvider = {
  id: "acmeflow-synthetic",
  label: "AcmeFlow synthetic",
  async load() {
    return getAcmeFlowDataset();
  },
};

export function demoCredentialsReady(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getBusinessDataProvider(): BusinessDataProvider {
  if (demoCredentialsReady()) {
    return liveDemoProvider;
  }
  return syntheticAcmeFlowProvider;
}
