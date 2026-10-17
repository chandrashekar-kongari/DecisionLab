import Stripe from "stripe";
import type {
  ChurnEvent,
  CustomerRecord,
  InvoiceRecord,
  PaymentRecord,
  PricingChange,
  PricingPlan,
  SubscriptionRecord,
} from "@/lib/agent/types";

const DEMO_TAG = "decision-lab";

export type StripeDemoSlice = {
  customers: CustomerRecord[];
  subscriptions: SubscriptionRecord[];
  pricing: PricingPlan[];
  pricingHistory: PricingChange[];
  churnEvents: ChurnEvent[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
};

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error(
      "STRIPE_SECRET_KEY is a live-mode key. DecisionLab demos require a test-mode key.",
    );
  }
  return new Stripe(key);
}

export async function loadStripeDemo(): Promise<StripeDemoSlice> {
  const stripe = stripeClient();
  const [customers, subscriptions, products, prices, invoices, paymentIntents] =
    await Promise.all([
      collect(stripe.customers.list({ limit: 100 })),
      collect(
        stripe.subscriptions.list({
          limit: 100,
          status: "all",
          expand: ["data.items.data.price"],
        }),
      ),
      collect(stripe.products.list({ limit: 100 })),
      collect(
        stripe.prices.list({ limit: 100, active: true, type: "recurring" }),
      ),
      collect(stripe.invoices.list({ limit: 100, expand: ["data.payments"] })),
      collect(stripe.paymentIntents.list({ limit: 100 })),
    ]);

  const demoCustomers = customers.filter(
    (customer) => customer.metadata?.demo === DEMO_TAG,
  );
  const demoIds = new Set(demoCustomers.map((customer) => customer.id));
  const demoProducts = products.filter(
    (product) => product.metadata?.demo === DEMO_TAG,
  );
  const productIds = new Set(demoProducts.map((product) => product.id));
  const demoPrices = prices.filter((price) =>
    productIds.has(idOf(price.product) ?? ""),
  );
  const demoSubscriptions = subscriptions.filter((subscription) =>
    demoIds.has(idOf(subscription.customer) ?? ""),
  );
  const demoInvoices = invoices.filter((invoice) =>
    demoIds.has(idOf(invoice.customer) ?? ""),
  );
  const priceById = new Map(demoPrices.map((price) => [price.id, price]));
  const productName = new Map(
    demoProducts.map((product) => [product.id, product.name]),
  );

  const pricing = currentPlans(demoPrices, productName);
  const pricingHistory = priceChanges(demoPrices);
  const subscriptionRows = demoSubscriptions.map((subscription) =>
    toSubscription(subscription, priceById),
  );
  const subscriptionsByCustomer = groupBy(
    subscriptionRows,
    (row) => row.customerId,
  );

  return {
    customers: demoCustomers.map((customer) =>
      toCustomer(customer, subscriptionsByCustomer.get(customer.id) ?? []),
    ),
    subscriptions: subscriptionRows,
    pricing,
    pricingHistory,
    churnEvents: demoSubscriptions
      .filter((subscription) => subscription.status === "canceled")
      .map(toChurnEvent),
    invoices: demoInvoices.map(toInvoice),
    payments: toPayments(demoInvoices, paymentIntents, demoIds),
  };
}

function currentPlans(
  prices: Stripe.Price[],
  productName: Map<string, string>,
): PricingPlan[] {
  const plans = new Map<string, PricingPlan>();
  for (const price of prices) {
    if (
      price.metadata?.superseded === "true" ||
      price.metadata?.current !== "true"
    )
      continue;
    const planId = price.metadata?.plan_id || price.id;
    const productId = idOf(price.product) ?? "";
    plans.set(planId, {
      id: planId,
      name: productName.get(productId) ?? planId,
      monthlyPrice: dollars(price.unit_amount),
      interval: "month",
    });
  }
  return [...plans.values()];
}

function priceChanges(prices: Stripe.Price[]): PricingChange[] {
  return prices.flatMap((price) => {
    const previous = price.metadata?.previous_amount;
    const planId = price.metadata?.plan_id;
    if (!previous || !planId) return [];
    return [
      {
        id: price.id,
        planId,
        previousPrice: dollars(Number(previous)),
        price: dollars(price.unit_amount),
        effectiveAt:
          price.metadata?.effective_at || dayFromUnix(price.created) || "",
      },
    ];
  });
}

function toCustomer(
  customer: Stripe.Customer,
  subscriptions: SubscriptionRecord[],
): CustomerRecord {
  const segment = customer.metadata?.segment;
  return {
    id: customer.id,
    name: customer.name || customer.metadata?.name || customer.id,
    segment:
      segment === "mid_market" ||
      segment === "enterprise" ||
      segment === "startup"
        ? segment
        : "startup",
    createdAt:
      customer.metadata?.demo_started_at || dayFromUnix(customer.created) || "",
    status: subscriptions.some(
      (subscription) => subscription.status !== "canceled",
    )
      ? "active"
      : "churned",
  };
}

function toSubscription(
  subscription: Stripe.Subscription,
  prices: Map<string, Stripe.Price>,
): SubscriptionRecord {
  const item = subscription.items.data[0];
  const price = item ? (prices.get(item.price.id) ?? item.price) : undefined;
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer) ?? "",
    planId: price?.metadata?.plan_id || price?.id || "unknown",
    monthlyPrice: dollars(price?.unit_amount),
    status: mapSubscriptionStatus(subscription.status),
    startedAt:
      subscription.metadata?.demo_started_at ||
      dayFromUnix(subscription.start_date) ||
      "",
    canceledAt:
      subscription.metadata?.demo_canceled_at ||
      dayFromUnix(subscription.canceled_at) ||
      null,
  };
}

function toChurnEvent(subscription: Stripe.Subscription): ChurnEvent {
  return {
    id: `churn_${subscription.id}`,
    customerId: idOf(subscription.customer) ?? "",
    subscriptionId: subscription.id,
    occurredAt:
      subscription.metadata?.demo_canceled_at ||
      dayFromUnix(subscription.canceled_at) ||
      "",
    reason: churnReason(subscription),
  };
}

function toInvoice(invoice: Stripe.Invoice): InvoiceRecord {
  return {
    id: invoice.id,
    customerId: idOf(invoice.customer) ?? "",
    subscriptionId: invoiceSubscriptionId(invoice),
    status: mapInvoiceStatus(invoice.status),
    amountDue: dollars(invoice.amount_due),
    amountPaid: dollars(invoice.amount_paid),
    attempted: invoice.attempted,
    createdAt: dayFromUnix(invoice.created) || "",
  };
}

function toPayments(
  invoices: Stripe.Invoice[],
  paymentIntents: Stripe.PaymentIntent[],
  demoIds: Set<string>,
): PaymentRecord[] {
  const byId = new Map(paymentIntents.map((intent) => [intent.id, intent]));
  const used = new Set<string>();
  const rows: PaymentRecord[] = [];

  for (const invoice of invoices) {
    for (const payment of invoice.payments?.data ?? []) {
      const reference = payment.payment?.payment_intent;
      const intentId = idOf(reference);
      if (!intentId) continue;
      used.add(intentId);
      const intent =
        typeof reference === "object" && reference
          ? reference
          : byId.get(intentId);
      rows.push(
        toPayment(intentId, intent, idOf(invoice.customer) ?? "", invoice.id),
      );
    }
  }

  for (const intent of paymentIntents) {
    if (used.has(intent.id)) continue;
    const customerId = idOf(intent.customer);
    if (!customerId || !demoIds.has(customerId)) continue;
    if (intent.metadata?.demo !== DEMO_TAG && !demoIds.has(customerId))
      continue;
    rows.push(
      toPayment(
        intent.id,
        intent,
        customerId,
        intent.metadata?.invoice_id || null,
      ),
    );
  }

  return rows;
}

function toPayment(
  id: string,
  intent: Stripe.PaymentIntent | undefined,
  customerId: string,
  invoiceId: string | null,
): PaymentRecord {
  const error = intent?.last_payment_error;
  return {
    id,
    customerId,
    invoiceId,
    status: mapPaymentStatus(intent?.status),
    failureCode: error?.code || error?.decline_code || null,
    failureMessage: error?.message || null,
    amount: dollars(intent?.amount),
    createdAt: dayFromUnix(intent?.created) || "",
  };
}

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionRecord["status"] {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (
    status === "incomplete" ||
    status === "incomplete_expired" ||
    status === "paused"
  )
    return "incomplete";
  return "canceled";
}

function mapInvoiceStatus(status: string | null): InvoiceRecord["status"] {
  if (
    status === "draft" ||
    status === "open" ||
    status === "paid" ||
    status === "uncollectible" ||
    status === "void"
  ) {
    return status;
  }
  return "draft";
}

function mapPaymentStatus(
  status: Stripe.PaymentIntent.Status | undefined,
): PaymentRecord["status"] {
  if (status === "succeeded") return "succeeded";
  if (status === "requires_payment_method" || status === "canceled")
    return "failed";
  return "pending";
}

function churnReason(subscription: Stripe.Subscription): ChurnEvent["reason"] {
  const feedback = subscription.cancellation_details?.feedback;
  if (feedback === "too_expensive") return "price";
  if (feedback === "switched_service") return "competitor";
  if (
    feedback === "unused" ||
    feedback === "missing_features" ||
    feedback === "too_complex"
  )
    return "adoption";
  if (feedback === "customer_service" || feedback === "low_quality")
    return "support";
  const recorded = subscription.metadata?.churn_reason;
  if (
    recorded === "price" ||
    recorded === "adoption" ||
    recorded === "competitor" ||
    recorded === "support"
  ) {
    return recorded;
  }
  return "support";
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}

function dollars(cents: number | null | undefined): number {
  return Math.round(cents ?? 0) / 100;
}

function dayFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function idOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row)) ?? [];
    bucket.push(row);
    grouped.set(key(row), bucket);
  }
  return grouped;
}

async function collect<T>(list: Stripe.ApiListPromise<T>): Promise<T[]> {
  return list.autoPagingToArray({ limit: 200 });
}
