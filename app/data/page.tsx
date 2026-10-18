import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ConnectedData } from "@/components/connected-data";
import { DataInspectionPanel } from "@/components/investigation/data-inspection-panel";
import { PageHeader } from "@/components/page-header";
import type { BusinessDataset } from "@/lib/agent/types";
import { getBusinessDataProvider } from "@/lib/data/business-data";
import { publicError } from "@/lib/data/connections";
import { CONNECTED_SOURCES, DEMO_CONNECTED_SOURCES } from "@/lib/experiment";

export const metadata = {
  title: "Data · DecisionLab",
};

export default function DataPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading account data…</p>
      }
    >
      <DataSources />
    </Suspense>
  );
}

async function DataSources() {
  await connection();
  const loaded = await loadDataset();
  if (!loaded.ok) {
    return (
      <>
        <PageHeader
          breadcrumb="Data Sources"
          title="Sources"
          description="Datasets this workspace can use when designing experiments."
        />
        <div className="rounded-lg border border-border bg-card px-4 py-4">
          <p className="text-sm text-foreground">
            Account data could not be loaded.
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {loaded.message}
          </p>
        </div>
      </>
    );
  }
  const dataset = loaded.dataset;

  return (
    <>
      <PageHeader
        breadcrumb="Data Sources"
        title="Sources"
        description="Datasets this workspace can use when designing experiments."
      />
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">
          Account connections are managed on the{" "}
          <Link
            href="/connections"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Connections
          </Link>{" "}
          page.{" "}
          {dataset.stripeConnected &&
          dataset.supabaseConnected &&
          dataset.supabaseSchemaReady !== false
            ? "The agent is reading the connected Stripe test-mode account and Supabase project."
            : dataset.stripeConnected
              ? "The agent is reading the connected Stripe test-mode account. Activity, tickets, usage, and past experiments stay empty until the Supabase tables exist."
              : "The agent is reading the connected Supabase project. Stripe records stay empty until a test-mode key is set."}
        </p>
        <ConnectedData
          sources={[...CONNECTED_SOURCES, ...DEMO_CONNECTED_SOURCES]}
        />
        <DataInspectionPanel
          summary={dataset.summary}
          description={
            dataset.stripeConnected &&
            dataset.supabaseConnected &&
            dataset.supabaseSchemaReady !== false
              ? "Records from the connected Stripe test-mode account and Supabase project. Sales capacity and marketing spend are workspace assumptions, not account records."
              : dataset.stripeConnected
                ? "Records from the connected Stripe test-mode account. Activity, tickets, usage, and past experiments stay empty until scripts/demo/supabase-seed.sql is applied. Sales capacity and marketing spend are workspace assumptions."
                : "Records from the connected Supabase project. Stripe customers, subscriptions, invoices, and payments stay empty until a test-mode key is set."
          }
        />
      </div>
    </>
  );
}

async function loadDataset(): Promise<
  { ok: true; dataset: BusinessDataset } | { ok: false; message: string }
> {
  try {
    return { ok: true, dataset: await getBusinessDataProvider().load() };
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
}
