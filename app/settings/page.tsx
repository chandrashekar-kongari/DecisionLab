import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Settings · DecisionLab",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Settings"
        title="Settings"
        description="Preferences for this workspace."
      />
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Appearance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Light interface</p>
          </div>
          <span className="text-xs text-muted-foreground">Light</span>
        </div>
      </div>
    </>
  );
}
