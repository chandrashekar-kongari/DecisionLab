export type ExecutionStatus = "pending" | "running" | "completed" | "failed";

export type AgentStageId =
  | "understand_objective"
  | "inspect_data"
  | "identify_variables"
  | "design_experiments"
  | "generate_code"
  | "provision_sandbox"
  | "execute_simulation"
  | "analyze_outputs"
  | "prepare_recommendations";

export type ConstraintOperator = "lt" | "lte" | "gt" | "gte" | "eq";

export type BusinessGoal = {
  id: string;
  statement: string;
  createdAt: string;
};

export type BusinessConstraint = {
  id: string;
  metric: string;
  operator: ConstraintOperator;
  value: number;
  unit: string;
  source: "goal" | "policy";
  statement: string;
};

export type ExperimentVariable = {
  id: string;
  name: string;
  description: string;
  unit: string;
  baseline: number;
  min: number;
  max: number;
  step: number;
  rationale: string;
};

export type SimulationScenario = {
  id: string;
  label: string;
  values: Record<string, number>;
};

export type ExperimentPlan = {
  id: string;
  goalId: string;
  rationale: string;
  variables: ExperimentVariable[];
  constraints: BusinessConstraint[];
  scenarios: SimulationScenario[];
  code: string | null;
};

export type CustomerRecord = {
  id: string;
  name: string;
  segment: "startup" | "mid_market" | "enterprise";
  createdAt: string;
  status: "active" | "churned";
};

export type SubscriptionRecord = {
  id: string;
  customerId: string;
  planId: string;
  monthlyPrice: number;
  status: "active" | "canceled" | "past_due" | "incomplete";
  startedAt: string;
  canceledAt: string | null;
};

export type InvoiceRecord = {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  amountDue: number;
  amountPaid: number;
  attempted: boolean;
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  customerId: string;
  invoiceId: string | null;
  status: "succeeded" | "failed" | "pending";
  failureCode: string | null;
  failureMessage: string | null;
  amount: number;
  createdAt: string;
};

export type CustomerActivityRecord = {
  customerId: string;
  lastSeenAt: string;
  loginCount30d: number;
  featureAdoption: number;
};

export type SupportTicketRecord = {
  id: string;
  customerId: string;
  status: "open" | "closed";
  topic: "billing" | "bug" | "onboarding";
  sentiment: "negative" | "neutral" | "positive";
  openedAt: string;
  summary: string;
};

export type UsageDailyRecord = {
  customerId: string;
  period: string;
  events: number;
  seats: number;
};

export type HistoricalExperimentRecord = {
  id: string;
  name: string;
  strategy: string;
  startedAt: string;
  endedAt: string;
  outcome: string;
  metricDelta: number;
};

export type PricingPlan = {
  id: string;
  name: string;
  monthlyPrice: number;
  interval: "month";
};

export type PricingChange = {
  id: string;
  planId: string;
  previousPrice: number;
  price: number;
  effectiveAt: string;
};

export type ChurnEvent = {
  id: string;
  customerId: string;
  subscriptionId: string;
  occurredAt: string;
  reason: "price" | "adoption" | "competitor" | "support";
};

export type SalesCapacity = {
  representatives: number;
  quotaPerRepresentativeMonthly: number;
  openPipeline: number;
  averageSalesCycleDays: number;
};

export type PlanSnapshot = {
  id: string;
  name: string;
  monthlyPrice: number;
  activeSubscriptions: number;
};

export type PricingChangeSnapshot = {
  planName: string;
  previousPrice: number;
  price: number;
  effectiveAt: string;
};

export type DatasetSummary = {
  company: string;
  source: "synthetic" | "supabase" | "mcp";
  customerCount: number;
  subscriptionCount: number;
  activeSubscriptionCount: number;
  monthlyRecurringRevenue: number;
  averageRevenuePerAccount: number;
  churnRate: number;
  plans: PlanSnapshot[];
  pricingChanges: PricingChangeSnapshot[];
  salesCapacity: SalesCapacity;
  monthlyMarketingSpend: number;
  pricingChangeCount: number;
  churnEventCount: number;
};

export type BusinessDataset = {
  id: string;
  company: string;
  source: DatasetSummary["source"];
  seed: number;
  generatedAt: string;
  customers: CustomerRecord[];
  subscriptions: SubscriptionRecord[];
  pricing: PricingPlan[];
  pricingHistory: PricingChange[];
  churnEvents: ChurnEvent[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  customerActivity: CustomerActivityRecord[];
  supportTickets: SupportTicketRecord[];
  usageDaily: UsageDailyRecord[];
  historicalExperiments: HistoricalExperimentRecord[];
  salesCapacity: SalesCapacity;
  monthlyMarketingSpend: number;
  summary: DatasetSummary;
};

export type AgentStep = {
  id: AgentStageId;
  label: string;
  status: ExecutionStatus;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
};

export type AgentEventKind = "stage" | "tool" | "status";

export type AgentEvent = {
  id: string;
  at: string;
  stage: AgentStageId;
  kind: AgentEventKind;
  message: string;
};

/** Populated only after a real sandbox execution returns outputs. */
export type ExperimentResult = {
  scenarioId: string;
  metrics: Record<string, number>;
  feasible: boolean;
  stdout?: string;
};

/** Populated only after real outputs have been analyzed. */
export type Recommendation = {
  scenarioId: string;
  summary: string;
};

export type SandboxShape = "s-1vcpu-1gb";

export type SandboxSession = {
  id: string;
  name: string;
  shape: SandboxShape;
};

export type SandboxRequest = {
  shape: SandboxShape;
  name: string;
};

export type AgentBlocker = {
  code: string;
  message: string;
};

export type AgentRunStatus = "running" | "blocked" | "completed" | "failed";

export type AgentRun = {
  id: string;
  goal: BusinessGoal;
  status: AgentRunStatus;
  steps: AgentStep[];
  dataset: DatasetSummary | null;
  plan: ExperimentPlan | null;
  code: string | null;
  sandboxRequest: SandboxRequest | null;
  sandbox: SandboxSession | null;
  results: ExperimentResult[] | null;
  recommendation: Recommendation | null;
  events: AgentEvent[];
  blocker: AgentBlocker | null;
};

export type InvestigationStreamMessage =
  | { type: "event"; event: AgentEvent }
  | { type: "snapshot"; run: AgentRun };
