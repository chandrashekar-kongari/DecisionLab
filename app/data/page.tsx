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

export default async function DataPage() {
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
            Demo data could not be loaded.
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {loaded.message}
          </p>
        </div>
      </>
    );
  }
  const dataset = loaded.dataset;
  const demo = dataset.source !== "synthetic";

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
          {demo
            ? "The agent is reading AcmeFlow demo data from Stripe test mode and Supabase."
            : "The agent is reading the labeled AcmeFlow sample until Stripe and Supabase are connected."}
        </p>
        <ConnectedData
          sources={
            demo
              ? [...CONNECTED_SOURCES, ...DEMO_CONNECTED_SOURCES]
              : CONNECTED_SOURCES
          }
        />
        <DataInspectionPanel
          summary={dataset.summary}
          description={
            demo
              ? "AcmeFlow demo records from Stripe test mode and Supabase."
              : "Synthetic AcmeFlow records available to this workspace."
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
