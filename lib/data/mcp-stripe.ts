import type Stripe from "stripe";
import {
  assertTestModeStripeKey,
  mapStripeResources,
  type StripeDemoSlice,
} from "@/lib/data/stripe-source";
import { asRecord, stripeMcpUrl, withMcpClient } from "@/lib/data/mcp-client";

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

type StripeContext = {
  accountId: string;
  company: string;
};

export type StripeMcpSlice = StripeDemoSlice & {
  accountId: string;
  company: string;
};

export async function loadStripeMcp(key: string): Promise<StripeMcpSlice> {
  assertTestModeStripeKey(key);
  return withMcpClient(stripeMcpUrl(), key, async (call) => {
    const context = accountContext(await call("get_stripe_account_info", {}));
    if (!context.accountId) {
      throw new Error("Stripe MCP did not return an account id.");
    }
    const [
      customers,
      subscriptions,
      products,
      prices,
      invoices,
      paymentIntents,
    ] = await Promise.all([
      listAll(call, "GetCustomers", {}, context.accountId),
      listAll(
        call,
        "GetSubscriptions",
        {
          status: "all",
          expand: ["data.items.data.price"],
        },
        context.accountId,
      ),
      listAll(call, "GetProducts", {}, context.accountId),
      listAll(call, "GetPrices", { type: "recurring" }, context.accountId),
      listAll(
        call,
        "GetInvoices",
        { expand: ["data.payments"] },
        context.accountId,
      ),
      listAll(call, "GetPaymentIntents", {}, context.accountId),
    ]);
    return {
      accountId: context.accountId,
      company: context.company,
      ...mapStripeResources({
        customers: customers as Stripe.Customer[],
        subscriptions: subscriptions as Stripe.Subscription[],
        products: products as Stripe.Product[],
        prices: prices as Stripe.Price[],
        invoices: invoices as Stripe.Invoice[],
        paymentIntents: paymentIntents as Stripe.PaymentIntent[],
      }),
    };
  });
}

async function listAll(
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  operationId: string,
  parameters: Record<string, unknown>,
  accountId: string,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const seen = new Set<string>();
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await call("stripe_api_read", {
      stripe_api_operation_id: operationId,
      parameters: {
        limit: PAGE_LIMIT,
        ...parameters,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      stripe_context: accountId,
      livemode: false,
    });
    const list = asStripeList(payload);
    let added = 0;
    for (const row of list.data) {
      const id =
        typeof asRecord(row).id === "string" ? String(asRecord(row).id) : "";
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(row);
      added += 1;
    }
    const last = list.data.at(-1);
    const lastId =
      typeof asRecord(last).id === "string" ? String(asRecord(last).id) : "";
    if (!list.hasMore || added === 0 || !lastId || lastId === startingAfter)
      break;
    startingAfter = lastId;
  }
  return rows;
}

function asStripeList(value: unknown): { data: unknown[]; hasMore: boolean } {
  const record = unwrapList(value);
  if (!Array.isArray(record.data)) {
    throw new Error("Stripe MCP did not return a list.");
  }
  return { data: record.data, hasMore: record.has_more === true };
}

function unwrapList(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (Array.isArray(record.data)) return record;
  for (const key of ["response", "result", "body"]) {
    const nested = asRecord(record[key]);
    if (Array.isArray(nested.data)) return nested;
  }
  return record;
}

function accountContext(value: unknown): StripeContext {
  const record = unwrapAccount(value);
  if (record.livemode === true) {
    throw new Error(
      "Stripe MCP returned a live-mode account. DecisionLab requires a test-mode key.",
    );
  }
  const profile = asRecord(record.business_profile);
  const dashboard = asRecord(asRecord(record.settings).dashboard);
  const company =
    text(record.display_name) ||
    text(record.business_name) ||
    text(profile.name) ||
    text(dashboard.display_name) ||
    text(record.name) ||
    "Stripe account";
  const accountId =
    text(record.stripe_context) || text(record.account_id) || text(record.id);
  return { accountId, company };
}

function unwrapAccount(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (text(record.id) || text(record.account_id) || text(record.stripe_context))
    return record;
  for (const key of ["account", "response", "result"]) {
    const nested = asRecord(record[key]);
    if (text(nested.id) || text(nested.account_id)) return nested;
  }
  return record;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
