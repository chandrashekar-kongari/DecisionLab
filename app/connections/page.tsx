import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { describeConnections, publicError } from "@/lib/data/connections";
import {
  demoCredentialsReady,
  getBusinessDataProvider,
} from "@/lib/data/business-data";

export const metadata = {
  title: "Connections · DecisionLab",
};

export default async function ConnectionsPage() {
  const connections = describeConnections();
  const ready = demoCredentialsReady();
  const probe = ready ? await probeDemoData() : null;

  return (
    <>
      <PageHeader
        breadcrumb="Connections"
        title="Connections"
        description="Stripe test mode and Supabase supply the demo account. Until both are set, the agent keeps using the AcmeFlow sample."
      />
      <ul className="flex flex-col gap-4">
        {connections.map((connection) => (
          <li
            key={connection.id}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <StatusBadge
              status={connection.connected ? "connected" : "warning"}
            >
              {connection.label}
            </StatusBadge>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {connection.summary}
            </p>
            {connection.connected ? null : (
              <ol className="mt-3 flex max-w-xl list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
                {connection.steps.map((step) => (
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
                ? `${probe.customers} demo customers are available to the agent.`
                : "Both credentials are set, and the demo seed has not been loaded yet."
              : probe?.message}
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Apply scripts/demo/supabase-seed.sql in the Supabase SQL editor,
            then run npm run seed:demo. Add --reset only when you want to delete
            the existing demo customers and create them again.
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
