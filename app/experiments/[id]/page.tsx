import { Suspense } from "react";
import { ExperimentDetail } from "@/components/experiments/experiment-detail";

export const metadata = {
  title: "Experiment · DecisionLab",
};

export default function ExperimentDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading experiment…</p>}>
      <ExperimentDetail />
    </Suspense>
  );
}
