import type { BusinessDataset, DatasetSummary, SalesCapacity } from "@/lib/agent/types";
import { mcpProvider } from "@/lib/data/mcp-provider";

/**
 * Business data access for the investigation agent.
 * Stripe test mode and Supabase are read through MCP independently.
 * load() fails only when neither credential set is present.
 */

export const SALES_CAPACITY: SalesCapacity = {
  representatives: 8,
  quotaPerRepresentativeMonthly: 15000,
  openPipeline: 186000,
  averageSalesCycleDays: 34,
};

export const MONTHLY_MARKETING_SPEND = 28000;

export interface BusinessDataProvider {
  id: string;
  label: string;
  load(): Promise<BusinessDataset>;
}

type DatasetRecords = Omit<BusinessDataset, "summary">;

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

export function missingStripeCredentials(): string[] {
  return process.env.STRIPE_SECRET_KEY ? [] : ["STRIPE_SECRET_KEY"];
}

export type SupabaseAccessMode = "mcp" | "database" | "missing";

export function supabaseAccessMode(): SupabaseAccessMode {
  if (process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_PROJECT_REF) return "mcp";
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "database";
  return "missing";
}

export function missingSupabaseCredentials(): string[] {
  if (supabaseAccessMode() !== "missing") return [];
  return ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
}

export function missingMcpCredentials(): string[] {
  return [...missingStripeCredentials(), ...missingSupabaseCredentials()];
}

export function stripeCredentialsReady(): boolean {
  return missingStripeCredentials().length === 0;
}

export function supabaseCredentialsReady(): boolean {
  return missingSupabaseCredentials().length === 0;
}

export function mcpCredentialsReady(): boolean {
  return stripeCredentialsReady() && supabaseCredentialsReady();
}

export function getBusinessDataProvider(): BusinessDataProvider {
  return mcpProvider;
}
