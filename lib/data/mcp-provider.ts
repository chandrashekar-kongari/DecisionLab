import type { BusinessDataset } from "@/lib/agent/types";
import type { BusinessDataProvider } from "@/lib/data/business-data";
import {
  missingStripeCredentials,
  missingSupabaseCredentials,
  MONTHLY_MARKETING_SPEND,
  SALES_CAPACITY,
  summarizeDataset,
  supabaseAccessMode,
} from "@/lib/data/business-data";
import { loadStripeMcp } from "@/lib/data/mcp-stripe";
import { loadSupabaseMcp } from "@/lib/data/mcp-supabase";
import {
  loadSupabaseDemo,
  type SupabaseDemoSlice,
} from "@/lib/data/supabase-source";

const LIVE_TTL_MS = 60_000;

const EMPTY_SUPABASE: SupabaseDemoSlice = {
  customers: [],
  activity: [],
  tickets: [],
  usage: [],
  experiments: [],
};

let cached:
  | { at: number; signature: string; dataset: BusinessDataset }
  | undefined;

export const mcpProvider: BusinessDataProvider = {
  id: "stripe-supabase-mcp",
  label: "Stripe and Supabase MCP",
  async load() {
    const missingStripe = missingStripeCredentials();
    const missingSupabase = missingSupabaseCredentials();
    const supabaseMode = supabaseAccessMode();
    const missing = [...missingStripe, ...missingSupabase];
    if (missingStripe.length > 0 && missingSupabase.length > 0) {
      throw new Error(`MCP is not connected. Set ${missing.join(", ")}.`);
    }

    const signature = `4|${missing.join(",")}|${supabaseMode}`;
    const now = Date.now();
    if (
      cached &&
      cached.signature === signature &&
      now - cached.at < LIVE_TTL_MS
    ) {
      return cached.dataset;
    }

    const key = process.env.STRIPE_SECRET_KEY ?? "";
    const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
    const projectRef = process.env.SUPABASE_PROJECT_REF ?? "";
    const [stripe, supabase] = await Promise.all([
      missingStripe.length > 0 ? Promise.resolve(null) : loadStripeMcp(key),
      loadSupabase(supabaseMode, token, projectRef),
    ]);
    const supabaseById = new Map(
      supabase.slice.customers.map((customer) => [
        customer.stripeCustomerId,
        customer,
      ]),
    );
    const customers = (stripe?.customers ?? []).map((customer) => {
      const match = supabaseById.get(customer.id);
      return match
        ? {
            ...customer,
            name: match.name || customer.name,
            segment: match.segment,
          }
        : customer;
    });
    const customerIds = new Set(customers.map((customer) => customer.id));
    const subscriptions = (stripe?.subscriptions ?? []).filter((subscription) =>
      customerIds.has(subscription.customerId),
    );
    const records = {
      id: stripe ? `mcp-${stripe.accountId}` : `mcp-supabase-${projectRef}`,
      company: stripe?.company ?? "Supabase project",
      source: "mcp" as const,
      seed: 0,
      generatedAt: new Date().toISOString(),
      customers,
      subscriptions,
      pricing: stripe?.pricing ?? [],
      pricingHistory: stripe?.pricingHistory ?? [],
      churnEvents: (stripe?.churnEvents ?? []).filter((event) =>
        customerIds.has(event.customerId),
      ),
      invoices: (stripe?.invoices ?? []).filter((invoice) =>
        customerIds.has(invoice.customerId),
      ),
      payments: (stripe?.payments ?? []).filter((payment) =>
        customerIds.has(payment.customerId),
      ),
      stripeConnected: missingStripe.length === 0,
      supabaseConnected: missingSupabase.length === 0,
      supabaseSchemaReady: supabase.schemaReady,
      missingCredentials: missing,
      customerActivity: supabase.slice.activity,
      supportTickets: supabase.slice.tickets,
      usageDaily: supabase.slice.usage,
      historicalExperiments: supabase.slice.experiments,
      salesCapacity: SALES_CAPACITY,
      monthlyMarketingSpend: MONTHLY_MARKETING_SPEND,
    };
    const dataset = { ...records, summary: summarizeDataset(records) };
    cached = { at: now, signature, dataset };
    return dataset;
  },
};

async function loadSupabase(
  mode: ReturnType<typeof supabaseAccessMode>,
  token: string,
  projectRef: string,
): Promise<{ slice: SupabaseDemoSlice; schemaReady: boolean }> {
  if (mode === "missing") return { slice: EMPTY_SUPABASE, schemaReady: false };
  try {
    const slice =
      mode === "mcp"
        ? await loadSupabaseMcp(token, projectRef)
        : await loadSupabaseDemo();
    return { slice, schemaReady: true };
  } catch (error) {
    if (!isMissingSupabaseSchema(error)) throw error;
    return { slice: EMPTY_SUPABASE, schemaReady: false };
  }
}

function isMissingSupabaseSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("Supabase is missing") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("PGRST205")
  );
}
