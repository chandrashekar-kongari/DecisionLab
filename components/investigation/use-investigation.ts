"use client";

import { useEffect, useRef, useState } from "react";
import { createPendingSteps } from "@/lib/agent/events";
import { validateGoalStatement } from "@/lib/agent/planner";
import type { AgentRun, AgentStep, InvestigationStreamMessage } from "@/lib/agent/types";

/**
 * Presentation pacing only. The server has already finished the local stages
 * and stopped at CreateOS provisioning. This timer reveals that result.
 * It does not execute code or invent sandbox output.
 */
const REVEAL_INTERVAL_MS = 600;

export type ComposerPhase = "idle" | "investigating" | "blocked";

export function useInvestigation() {
  const [goal, setGoalState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ComposerPhase>("idle");
  const [visibleRun, setVisibleRun] = useState<AgentRun | null>(null);
  const requestRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function setGoal(nextGoal: string) {
    setGoalState(nextGoal);
    setError(null);
  }

  function reset() {
    requestRef.current += 1;
    stopTimer();
    setPhase("idle");
    setVisibleRun(null);
    setError(null);
  }

  function selectExample(nextGoal: string) {
    if (phase === "investigating") return;
    reset();
    setGoalState(nextGoal);
  }

  async function start() {
    if (phase === "investigating") return;
    const validation = validateGoalStatement(goal);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const requestId = ++requestRef.current;
    stopTimer();
    setError(null);
    setGoalState(validation.statement);
    setPhase("investigating");
    setVisibleRun(createOptimisticRun(validation.statement));

    try {
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement: validation.statement }),
      });
      if (requestId !== requestRef.current) return;

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setPhase("idle");
        setVisibleRun(null);
        setError(body?.message ?? "Could not start the investigation.");
        return;
      }

      const snapshot = await readSnapshot(response);
      if (requestId !== requestRef.current) return;
      play(snapshot, requestId);
    } catch {
      if (requestId !== requestRef.current) return;
      setPhase("idle");
      setVisibleRun(null);
      setError("Could not start the investigation.");
    }
  }

  function play(finalRun: AgentRun, requestId: number) {
    stopTimer();
    let completedCount = 0;
    setVisibleRun(projectRun(finalRun, completedCount));

    timerRef.current = window.setInterval(() => {
      if (requestId !== requestRef.current) return;
      const step = finalRun.steps[completedCount];
      if (!step || step.status !== "completed") {
        stopTimer();
        setPhase("blocked");
        return;
      }
      completedCount += 1;
      setVisibleRun(projectRun(finalRun, completedCount));
      const next = finalRun.steps[completedCount];
      if (!next || next.status !== "completed") {
        stopTimer();
        setPhase("blocked");
      }
    }, REVEAL_INTERVAL_MS);
  }

  return {
    goal,
    setGoal,
    error,
    phase,
    visibleRun,
    start,
    reset,
    selectExample,
  };
}

function createOptimisticRun(statement: string): AgentRun {
  const steps = createPendingSteps();
  steps[0] = {
    ...steps[0],
    status: "running",
    startedAt: new Date().toISOString(),
  };
  return {
    id: "pending",
    goal: {
      id: "pending",
      statement,
      createdAt: new Date().toISOString(),
    },
    status: "running",
    steps,
    dataset: null,
    plan: null,
    code: null,
    sandboxRequest: null,
    sandbox: null,
    results: null,
    recommendation: null,
    events: [],
    blocker: null,
  };
}

export function projectRun(finalRun: AgentRun, completedCount: number): AgentRun {
  const steps: AgentStep[] = finalRun.steps.map((step, index) => {
    if (index < completedCount) return { ...step };
    if (index > completedCount) return pendingStep(step);
    if (step.status === "completed") {
      return {
        ...step,
        status: "running",
        summary: null,
        completedAt: null,
        error: null,
      };
    }
    return { ...step };
  });

  const revealed = new Set(
    steps
      .filter((step) => step.status === "completed" || (step.summary != null && step.status !== "pending"))
      .map((step) => step.id),
  );
  const inspectDone = steps.find((step) => step.id === "inspect_data")?.status === "completed";
  const designDone = steps.find((step) => step.id === "design_experiments")?.status === "completed";
  const codeDone = steps.find((step) => step.id === "generate_code")?.status === "completed";
  const provision = steps.find((step) => step.id === "provision_sandbox");
  const failed = steps.some((step) => step.status === "failed");

  return {
    ...finalRun,
    status: failed
      ? "failed"
      : provision?.status === "running" && finalRun.status === "blocked"
        ? "blocked"
        : "running",
    steps,
    events: finalRun.events.filter((event) => revealed.has(event.stage)),
    dataset: inspectDone ? finalRun.dataset : null,
    plan:
      designDone && finalRun.plan
        ? { ...finalRun.plan, code: codeDone ? finalRun.plan.code : null }
        : null,
    code: codeDone ? finalRun.code : null,
    sandboxRequest: provision && provision.status !== "pending" ? finalRun.sandboxRequest : null,
    sandbox: null,
    results: null,
    recommendation: null,
    blocker: provision && provision.status !== "pending" ? finalRun.blocker : null,
  };
}

function pendingStep(step: AgentStep): AgentStep {
  return {
    ...step,
    status: "pending",
    summary: null,
    startedAt: null,
    completedAt: null,
    error: null,
  };
}

async function readSnapshot(response: Response): Promise<AgentRun> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let snapshot: AgentRun | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    snapshot = applyLines(lines, snapshot);
  }

  if (buffer.trim()) snapshot = applyLines([buffer], snapshot);
  if (!snapshot) throw new Error("Investigation ended without a result.");
  return snapshot;
}

function applyLines(lines: string[], snapshot: AgentRun | null) {
  let next = snapshot;
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line) as InvestigationStreamMessage | { type: "error"; message: string };
    if (message.type === "error") {
      throw new Error(message.message);
    }
    if (message.type === "snapshot") next = message.run;
  }
  return next;
}
