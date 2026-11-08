export const FULFILLMENT_TYPES = ["qa", "video", "microtool"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];
export type Mode = "simulation" | "live";
export type ExperimentStatus = "candidate" | "active" | "paused" | "retired";
export interface Experiment {
  id: string;
  name: string;
  audience: string;
  offer: string;
  priceCents: number;
  currency: "USD";
  fulfillmentType: FulfillmentType;
  status: ExperimentStatus;
  budgetCents: number;
  channels: string[];
  hypothesis: string;
  successCriteria: string[];
  killCriteria: string[];
  evidenceRequirements: string[];
  parentExperimentId: string | null;
}
export interface Policy {
  mode: Mode;
  liveAuthorized: boolean;
  totalBudgetCents: number;
  perTaskBudgetCents: number;
  maxActiveExperiments: number;
  maxTasksPerCycle: number;
  minimumQualifiedLeads: number;
  minimumCompletedOrders: number;
  minimumIndependentPayments: number;
  explorationShare: number;
  responseWindowMinutes: number;
  stopAt: string;
  allowedChannels: string[];
  allowedTools: string[];
  allowedSourceDomains: string[];
  allowAutonomousExpansion: boolean;
  maxExperiments: number;
  enabledFulfillmentTypes: FulfillmentType[];
}
export const DEFAULT_POLICY: Policy = {
  mode: "simulation",
  liveAuthorized: false,
  totalBudgetCents: 0,
  perTaskBudgetCents: 100,
  maxActiveExperiments: 2,
  maxTasksPerCycle: 2,
  minimumQualifiedLeads: 5,
  minimumCompletedOrders: 2,
  minimumIndependentPayments: 2,
  explorationShare: 0.25,
  responseWindowMinutes: 30,
  stopAt: "2026-11-08T19:00:00Z",
  allowedChannels: [],
  allowedTools: [],
  allowedSourceDomains: [],
  allowAutonomousExpansion: true,
  maxExperiments: 8,
  enabledFulfillmentTypes: ["video", "microtool"],
};
export type SignalType =
  | "qualified_lead"
  | "reply"
  | "approval"
  | "payment"
  | "delivery"
  | "repeat_order"
  | "refund"
  | "rejection";
export interface Signal {
  id: string;
  experimentId: string;
  type: SignalType;
  customerId: string;
  evidence: string;
  amountCents: number;
  independent: boolean;
  mode: Mode;
  externalId: string;
  verified: boolean;
  orderId?: string;
  scopeHash?: string;
  createdAt: string;
}
export interface Lead {
  id: string;
  experimentId: string;
  customerId: string;
  name: string;
  request: string;
  sourceUrl: string;
  contact: string;
  channel: string;
  consent: boolean;
  assetRights: boolean;
  jobInput?: Record<string, unknown>;
  independent?: boolean;
  qualificationEvidence?: string;
  mode: Mode;
  createdAt: string;
}
export interface Job {
  id: string;
  experimentId: string;
  leadId: string | null;
  kind: "scout" | "fulfill" | "strategy";
  status: "pending" | "running" | "completed" | "blocked" | "failed";
  mode: Mode;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  summary: string | null;
  reason: string | null;
  reservationCents: number;
  costCents: number | null;
  externalSessionId: string | null;
  recoveryValidated?: boolean;
  idempotencyKey: string;
  scopeHash: string;
  priceCents: number;
  currency: "USD";
  offer: string;
  createdAt: string;
  updatedAt: string;
}
export interface Metrics {
  qualifiedLeads: number;
  replies: number;
  approvals: number;
  payments: number;
  completedOrders: number;
  repeatOrders: number;
  revenueCents: number;
  refundCents: number;
  costCents: number;
  contributionCents: number;
}
export type DecisionAction =
  | "activate"
  | "continue"
  | "pause"
  | "retire"
  | "expand"
  | "wait";
export interface Decision {
  id: string;
  experimentId: string;
  action: DecisionAction;
  reason: string;
  evidence: Metrics;
  createdAt: string;
}
export interface Artifact {
  name: string;
  url?: string;
  path?: string;
  mimeType?: string;
}
export interface Outbox {
  id: string;
  experimentId: string;
  leadId: string;
  channel: string;
  to: string;
  subject: string;
  body: string;
  status: "draft" | "blocked" | "approved" | "sent";
  reason: string | null;
  createdAt: string;
}

export function assertCents(
  value: unknown,
  name: string,
  allowZero = true,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1)
  )
    throw new Error(
      `${name} must be ${allowZero ? "a nonnegative" : "a positive"} integer number of cents`,
    );
}
export function validateExperiment(value: unknown): Experiment {
  if (!value || typeof value !== "object")
    throw new Error("Experiment must be an object");
  const e = value as Experiment;
  for (const key of [
    "id",
    "name",
    "audience",
    "offer",
    "hypothesis",
  ] as const) {
    if (typeof e[key] !== "string" || !e[key].trim())
      throw new Error(`Experiment ${key} is required`);
  }
  if (!/^[a-z0-9][a-z0-9-]{2,70}$/.test(e.id))
    throw new Error("Experiment id must be a lowercase slug");
  if (!FULFILLMENT_TYPES.includes(e.fulfillmentType))
    throw new Error(
      "Unsupported fulfillment type; incubate new capabilities for review",
    );
  if (e.currency !== "USD") throw new Error("Only USD is supported");
  if (!["candidate", "active", "paused", "retired"].includes(e.status))
    throw new Error("Invalid experiment status");
  assertCents(e.priceCents, "priceCents");
  assertCents(e.budgetCents, "budgetCents");
  for (const key of [
    "channels",
    "successCriteria",
    "killCriteria",
    "evidenceRequirements",
  ] as const) {
    if (
      !Array.isArray(e[key]) ||
      e[key].length === 0 ||
      e[key].some((v) => typeof v !== "string" || !v.trim())
    )
      throw new Error(`${key} must contain nonempty strings`);
  }
  if (e.parentExperimentId !== null && typeof e.parentExperimentId !== "string")
    throw new Error("Invalid parent experiment");
  return e;
}
export function validatePolicy(value: unknown): Policy {
  const p = value as Policy;
  if (!p || !["simulation", "live"].includes(p.mode))
    throw new Error("Invalid execution mode");
  for (const key of [
    "totalBudgetCents",
    "perTaskBudgetCents",
    "maxActiveExperiments",
    "maxTasksPerCycle",
    "minimumQualifiedLeads",
    "minimumCompletedOrders",
    "minimumIndependentPayments",
    "maxExperiments",
    "responseWindowMinutes",
  ] as const)
    assertCents(p[key], key);
  if (!Number.isFinite(Date.parse(p.stopAt)))
    throw new Error("stopAt must be an ISO deadline");
  if (
    p.maxTasksPerCycle > 10 ||
    p.maxActiveExperiments > 5 ||
    p.maxExperiments > 20
  )
    throw new Error("Company limits exceed the supported bounded runtime");
  if (
    p.maxActiveExperiments < 1 ||
    p.maxTasksPerCycle < 1 ||
    p.perTaskBudgetCents < 1 ||
    p.maxExperiments < 1
  )
    throw new Error("Task and experiment limits must be positive");
  if (
    p.minimumIndependentPayments < 1 ||
    p.minimumCompletedOrders < 1 ||
    p.minimumQualifiedLeads < 1
  )
    throw new Error("Evidence minimums cannot be zero");
  if (
    typeof p.explorationShare !== "number" ||
    p.explorationShare < 0.1 ||
    p.explorationShare > 0.5
  )
    throw new Error("explorationShare must be between 0.1 and 0.5");
  if (
    !Array.isArray(p.enabledFulfillmentTypes) ||
    p.enabledFulfillmentTypes.some((t) => !FULFILLMENT_TYPES.includes(t))
  )
    throw new Error("Unknown fulfillment capability");
  if (
    typeof p.liveAuthorized !== "boolean" ||
    typeof p.allowAutonomousExpansion !== "boolean"
  )
    throw new Error("Policy authorizations must be boolean");
  for (const key of [
    "allowedChannels",
    "allowedTools",
    "allowedSourceDomains",
  ] as const)
    if (!Array.isArray(p[key]) || p[key].some((v) => typeof v !== "string"))
      throw new Error(`Invalid ${key}`);
  return p;
}
