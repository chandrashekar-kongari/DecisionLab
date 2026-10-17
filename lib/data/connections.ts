export type ConnectionCard = {
  id: "stripe" | "supabase";
  label: string;
  connected: boolean;
  summary: string;
  steps: string[];
};

const STRIPE_STEPS = [
  "In Cursor, open Settings, then Tools & MCP. Connect the Stripe server at https://mcp.stripe.com and choose the test-mode account.",
  "In the Stripe Dashboard, create a test-mode restricted key that can read and write Customers, Subscriptions, Prices, Invoices, and PaymentIntents.",
  "Store the key without committing it: stripe projects variables set stripe-secret-key --env-key STRIPE_SECRET_KEY --value <key>",
  "Run stripe projects env --pull and restart the app.",
];

const SUPABASE_STEPS = [
  "In Cursor, open Settings, then Tools & MCP. Connect the Supabase server at https://mcp.supabase.com/mcp and choose the organization that will hold the demo project.",
  "Create an empty Supabase project.",
  "Store the project URL: stripe projects variables set supabase-url --env-key SUPABASE_URL --value <url>",
  "Store the service role key: stripe projects variables set supabase-service-role --env-key SUPABASE_SERVICE_ROLE_KEY --value <key>",
  "Run stripe projects env --pull and restart the app. The service role key stays on the server.",
];

export function describeConnections(): ConnectionCard[] {
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
  const supabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return [
    {
      id: "stripe",
      label: "Stripe",
      connected: stripe,
      summary: stripe
        ? "A server key is set. The agent reads test-mode customers tagged for this demo."
        : "Add a test-mode key so the agent can read subscriptions, invoices, payments, and prices.",
      steps: STRIPE_STEPS,
    },
    {
      id: "supabase",
      label: "Supabase",
      connected: supabase,
      summary: supabase
        ? "The project URL and service role key are set."
        : "Add a project for customer activity, support tickets, usage, and past experiments.",
      steps: SUPABASE_STEPS,
    },
  ];
}

export function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not load demo data.";
  return message
    .replace(/[sr]k_(?:live|test)_[A-Za-z0-9]+/g, "[redacted key]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}/g, "[redacted token]");
}
