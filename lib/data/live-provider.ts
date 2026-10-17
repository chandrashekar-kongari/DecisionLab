import type { BusinessDataProvider } from "@/lib/data/business-data";
import { MONTHLY_MARKETING_SPEND, SALES_CAPACITY, summarizeDataset } from "@/lib/data/business-data";
import { loadStripeDemo } from "@/lib/data/stripe-source";
import { loadSupabaseDemo } from "@/lib/data/supabase-source";
import type { BusinessDataset } from "@/lib/agent/types";

const LIVE_TTL_MS = 60_000;

let cached: { at: number; dataset: BusinessDataset } | undefined;

export const liveDemoProvider: BusinessDataProvider = {
  id: "stripe-supabase-demo",
  label: "Stripe test mode and Supabase",
  async load() {
    const now = Date.now();
    if (cached && now - cached.at < LIVE_TTL_MS) return cached.dataset;

    const [stripe, supabase] = await Promise.all([loadStripeDemo(), loadSupabaseDemo()]);
    const supabaseById = new Map(supabase.customers.map((customer) => [customer.stripeCustomerId, customer]));
    const customers = stripe.customers.map((customer) => {
      const match = supabaseById.get(customer.id);
      return match ? { ...customer, name: match.name || customer.name, segment: match.segment } : customer;
    });
    const records = {
      id: "demo-stripe-supabase",
      company: "AcmeFlow",
      source: "supabase" as const,
      seed: 0,
      generatedAt: new Date().toISOString(),
      customers,
      subscriptions: stripe.subscriptions,
      pricing: stripe.pricing,
      pricingHistory: stripe.pricingHistory,
      churnEvents: stripe.churnEvents,
      invoices: stripe.invoices,
      payments: stripe.payments,
      customerActivity: supabase.activity,
      supportTickets: supabase.tickets,
      usageDaily: supabase.usage,
      historicalExperiments: supabase.experiments,
      salesCapacity: SALES_CAPACITY,
      monthlyMarketingSpend: MONTHLY_MARKETING_SPEND,
    };
    const dataset = { ...records, summary: summarizeDataset(records) };
    cached = { at: now, dataset };
    return dataset;
  },
};
