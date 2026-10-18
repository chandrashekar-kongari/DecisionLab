import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { describeConnections, publicError } from "@/lib/data/connections";
import {
  getBusinessDataProvider,
  stripeCredentialsReady,
  supabaseCredentialsReady,
} from "@/lib/data/business-data";

export const metadata = {
  title: "Connections · DecisionLab",
};

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Connections"
        title="Connections"
        description="Stripe test mode and Supabase are read separately through MCP. The agent uses whichever side is configured."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Checking connections…</p>
        }
      >
        <ConnectionStatus />
      </Suspense>
    </>
  );
}

async function ConnectionStatus() {
  await connection();
  const connections = describeConnections();
  const stripeReady = stripeCredentialsReady();
  const supabaseReady = supabaseCredentialsReady();
  const ready = stripeReady || supabaseReady;
  const probe = ready ? await probeDemoData() : null;

  return (
    <>
      <ul className="flex flex-col gap-4">
        {connections.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <StatusBadge
              status={item.connected ? "connected" : "warning"}
            >
              {item.label}
            </StatusBadge>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {item.summary}
            </p>
            {item.connected ? null : (
              <ol className="mt-3 flex max-w-xl list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
      {ready ? (
        <div className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-foreground">
            {probe?.ok
              ? probe.customers > 0
                ? `${probe.customers} customers are available to the agent.`
                : stripeReady
                  ? "Stripe is connected, and the account has no customers yet."
                  : "Supabase is connected. Stripe customers stay empty until STRIPE_SECRET_KEY is set."
              : probe?.message}
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {supabaseReady
              ? "Customer activity, tickets, usage, and past experiments stay empty until those tables exist in the Supabase project. Apply scripts/demo/supabase-seed.sql if you want the demo activity tables."
              : "Customer activity, tickets, usage, and past experiments stay empty until SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are set. Stripe customers, subscriptions, invoices, and payments are still available."}
          </p>
        </div>
      ) : null}
    </>
  );
}

async function probeDemoData(): Promise<
  { ok: true; customers: number } | { ok: false; message: string }
> {
  try {
    const dataset = await getBusinessDataProvider().load();
    return { ok: true, customers: dataset.customers.length };
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
}
