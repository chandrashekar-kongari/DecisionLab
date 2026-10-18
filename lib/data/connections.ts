import { supabaseAccessMode } from "@/lib/data/business-data";

export type ConnectionCard = {
  id: "stripe" | "supabase";
  label: string;
  connected: boolean;
  summary: string;
  steps: string[];
};

const STRIPE_STEPS = [
  "In the Stripe Dashboard, open a test-mode sandbox and create a restricted or agent key that can read Customers, Subscriptions, Products, Prices, Invoices, and PaymentIntents.",
  "Store the key without committing it: stripe projects variables set stripe-secret-key --env-key STRIPE_SECRET_KEY --value <key>",
  "Run stripe projects env --pull and restart the app. The server sends this key to https://mcp.stripe.com.",
];

const SUPABASE_STEPS = [
  "Create a Supabase project and copy its project ref.",
  "Create a scoped personal access token with Database read for that project.",
  "Store the token: stripe projects variables set supabase-access-token --env-key SUPABASE_ACCESS_TOKEN --value <token>",
  "Store the project ref: stripe projects variables set supabase-project-ref --env-key SUPABASE_PROJECT_REF --value <ref>",
  "Run stripe projects env --pull and restart the app. The server calls https://mcp.supabase.com/mcp in read-only mode.",
];

export function describeConnections(): ConnectionCard[] {
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
  const supabase = supabaseAccessMode();
  return [
    {
      id: "stripe",
      label: "Stripe",
      connected: stripe,
      summary: stripe
        ? "The agent reads this account through Stripe MCP."
        : "Add a test-mode key so the agent can read customers, subscriptions, invoices, payments, and prices through Stripe MCP.",
      steps: STRIPE_STEPS,
    },
    {
      id: "supabase",
      label: "Supabase",
      connected: supabase !== "missing",
      summary:
        supabase === "mcp"
          ? "The agent reads activity through Supabase MCP."
          : supabase === "database"
            ? "The agent reads activity, tickets, usage, and past experiments from this Supabase project."
            : "Add a project ref and access token so the agent can read customer activity, support tickets, usage, and past experiments.",
      steps: SUPABASE_STEPS,
    },
  ];
}

export function sidebarConnectors() {
  return describeConnections().map((connection) => ({
    id: connection.id,
    label: connection.label,
    connected: connection.connected,
  }));
}

export function publicError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Could not load account data.";
  return message
    .replace(/[sr]k_(?:live|test)_[A-Za-z0-9]+/g, "[redacted key]")
    .replace(/sbp_[A-Za-z0-9_]+/g, "[redacted token]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}/g, "[redacted token]");
}
