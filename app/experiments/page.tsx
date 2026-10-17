import { ExperimentList } from "@/components/experiments/experiment-list";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Experiments · DecisionLab",
};

export default function ExperimentsPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Experiments"
        title="Experiments"
        description="Autonomous experiments keep their schedule after you close this page."
      />
      <ExperimentList />
    </>
  );
}
