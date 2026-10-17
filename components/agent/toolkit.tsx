"use client";

import { defineToolkit } from "@assistant-ui/react";
import {
  DataToolCard,
  ExecutePythonCard,
  ExperimentToolCard,
  RunToolCard,
} from "@/components/agent/tool-cards";

/**
 * Render-only backend tools. `/api/chat` executes them. `externalTool()` is
 * omitted because it throws unless the generative compiler strips it.
 */
const dataCard = {
  type: "backend" as const,
  display: "standalone" as const,
  render: DataToolCard,
};

export const agentToolkit = defineToolkit({
  list_data_sources: dataCard,
  inspect_schema: dataCard,
  sample_rows: dataCard,
  execute_python: {
    type: "backend",
    display: "standalone",
    render: ExecutePythonCard,
  },
  save_experiment: {
    type: "backend",
    display: "standalone",
    render: ExperimentToolCard,
  },
  list_experiments: {
    type: "backend",
    display: "inline",
    render: ExperimentToolCard,
  },
  get_experiment: {
    type: "backend",
    display: "standalone",
    render: ExperimentToolCard,
  },
  update_experiment: {
    type: "backend",
    display: "standalone",
    render: ExperimentToolCard,
  },
  pause_experiment: {
    type: "backend",
    display: "standalone",
    render: ExperimentToolCard,
  },
  resume_experiment: {
    type: "backend",
    display: "standalone",
    render: ExperimentToolCard,
  },
  activate_experiment: {
    type: "backend",
    display: "standalone",
    render: ExperimentToolCard,
  },
  run_experiment_now: {
    type: "backend",
    display: "standalone",
    render: RunToolCard,
  },
});
