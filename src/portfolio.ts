import { createHash } from "node:crypto";
import type { Store } from "./store.js";
import { validateExperiment, type Experiment, type Metrics } from "./domain.js";
const fingerprint = (m: Metrics) => JSON.stringify(m);
function lastSame(store: Store, id: string, action: string, m: Metrics) {
  const last = store
    .decisions()
    .filter((d) => d.experimentId === id)
    .at(-1);
  return (
    last?.action === action && fingerprint(last.evidence) === fingerprint(m)
  );
}
export function allocationAvailable(store: Store) {
  const p = store.policy(),
    ledger = store.ledger(p.mode);
  const freeActive = store
    .experiments()
    .filter((e) => e.status === "active")
    .reduce((a, e) => {
      const jobs = store
        .jobs()
        .filter((j) => j.experimentId === e.id && j.mode === p.mode);
      return (
        a +
        Math.max(
          0,
          e.budgetCents -
            jobs.reduce(
              (b, j) => b + (j.costCents ?? 0) + j.reservationCents,
              0,
            ),
        )
      );
    }, 0);
  return Math.max(
    0,
    p.totalBudgetCents - ledger.spentCents - ledger.reservedCents - freeActive,
  );
}
export function reviewPortfolio(store: Store, clock = Date.now()) {
  const p = store.policy();
  if (clock >= Date.parse(p.stopAt)) {
    for (const e of store.experiments().filter((e) => e.status === "active")) {
      e.status = "paused";
      store.saveExperiment(e);
      store.decision({
        experimentId: e.id,
        action: "pause",
        reason: "Execution deadline reached; retain obligations and evidence",
        evidence: store.metrics(e.id, p.mode),
      });
    }
    return;
  }
  const ledger = store.ledger(p.mode);
  if (
    p.totalBudgetCents === 0 ||
    (p.mode === "live" && !p.liveAuthorized) ||
    ledger.unresolvedJobs > 0
  )
    return;
  for (const e of store.experiments().filter((e) => e.status === "active")) {
    const m = store.metrics(e.id, p.mode),
      ss = store
        .signals(e.id)
        .filter(
          (s) => s.mode === p.mode && s.verified && s.type === "qualified_lead",
        );
    const oldest = ss.length
      ? Math.max(...ss.map((s) => Date.parse(s.createdAt)))
      : clock;
    const customerPending = store
      .jobs()
      .some(
        (j) =>
          j.experimentId === e.id &&
          j.kind === "fulfill" &&
          ["pending", "running"].includes(j.status),
      );
    if (
      !customerPending &&
      m.qualifiedLeads >= p.minimumQualifiedLeads &&
      m.replies === 0 &&
      m.approvals === 0 &&
      m.payments === 0 &&
      clock - oldest >= p.responseWindowMinutes * 60_000
    ) {
      e.status = "paused";
      store.saveExperiment(e);
      store.decision({
        experimentId: e.id,
        action: "pause",
        reason:
          "Adequate qualified exposure and response window yielded no substantive response; revise offer, not a PMF verdict",
        evidence: m,
      });
      continue;
    }
    if (
      m.payments >= p.minimumIndependentPayments &&
      m.completedOrders >= p.minimumCompletedOrders &&
      m.contributionCents > 0 &&
      m.refundCents === 0 &&
      !lastSame(store, e.id, "continue", m)
    ) {
      const grant = Math.min(
        Math.floor(e.budgetCents / 2),
        allocationAvailable(store),
      );
      e.budgetCents += grant;
      store.saveExperiment(e);
      store.decision({
        experimentId: e.id,
        action: "continue",
        reason: `Repeatable early paid-delivery signal; add ${grant} uncommitted cents, not proven PMF`,
        evidence: m,
      });
    }
  }
  const responsive = store
    .experiments()
    .filter(
      (e) =>
        e.status === "paused" &&
        p.enabledFulfillmentTypes.includes(e.fulfillmentType),
    )
    .filter((e) => {
      const m = store.metrics(e.id, p.mode);
      return m.payments > 0 || m.approvals > 0 || m.replies > 0;
    });
  for (const e of responsive) {
    const activeOffers = store
      .experiments()
      .filter((x) => x.status === "active");
    if (activeOffers.length > p.maxActiveExperiments) continue;
    if (activeOffers.length === p.maxActiveExperiments) {
      const weaker = activeOffers.find((x) => {
        const m = store.metrics(x.id, p.mode);
        return (
          m.payments === 0 &&
          m.approvals === 0 &&
          m.replies === 0 &&
          !store
            .jobs()
            .some(
              (j) =>
                j.experimentId === x.id &&
                j.kind === "fulfill" &&
                ["pending", "running"].includes(j.status),
            )
        );
      });
      if (!weaker) continue;
      weaker.status = "paused";
      store.saveExperiment(weaker);
      store.decision({
        experimentId: weaker.id,
        action: "pause",
        reason:
          "Reallocate an exploratory slot to a real later customer response",
        evidence: store.metrics(weaker.id, p.mode),
      });
    }
    const used = store
      .jobs()
      .filter((j) => j.experimentId === e.id && j.mode === p.mode)
      .reduce((a, j) => a + (j.costCents ?? 0) + j.reservationCents, 0);
    const grant = Math.min(
      Math.max(p.perTaskBudgetCents, e.budgetCents - used),
      allocationAvailable(store),
    );
    if (grant < p.perTaskBudgetCents) continue;
    e.budgetCents = used + grant;
    e.status = "active";
    store.saveExperiment(e);
    store.decision({
      experimentId: e.id,
      action: "activate",
      reason:
        "A later verified customer response justifies returning this offer to the active portfolio",
      evidence: store.metrics(e.id, p.mode),
    });
  }
  let candidates = store.experiments().filter((e) => e.status === "candidate");
  for (const e of store.experiments().filter((e) => e.status === "active")) {
    const m = store.metrics(e.id, p.mode);
    const ranScout = store
      .jobs()
      .some(
        (j) =>
          j.experimentId === e.id &&
          j.kind === "scout" &&
          j.status === "completed" &&
          j.mode === p.mode,
      );
    const hasWork = store
      .jobs()
      .some(
        (j) =>
          j.experimentId === e.id &&
          j.kind === "fulfill" &&
          ["pending", "running"].includes(j.status),
      );
    if (
      candidates.length &&
      ranScout &&
      !hasWork &&
      m.payments === 0 &&
      m.approvals === 0 &&
      m.replies === 0
    ) {
      e.status = "paused";
      store.saveExperiment(e);
      store.decision({
        experimentId: e.id,
        action: "pause",
        reason:
          "Rotate bounded exploration to an untested offer; insufficient evidence, not a failed market",
        evidence: m,
      });
    }
  }
  let active = store.experiments().filter((e) => e.status === "active").length;
  candidates = store.experiments().filter((e) => e.status === "candidate");
  for (const e of candidates.sort((a, b) =>
    a.fulfillmentType.localeCompare(b.fulfillmentType),
  )) {
    if (!p.enabledFulfillmentTypes.includes(e.fulfillmentType)) continue;
    if (active >= p.maxActiveExperiments) break;
    const available = allocationAvailable(store),
      cap = Math.min(e.budgetCents, available);
    if (cap < p.perTaskBudgetCents) continue;
    e.budgetCents = cap;
    e.status = "active";
    store.saveExperiment(e);
    active++;
    store.decision({
      experimentId: e.id,
      action: "activate",
      reason: "Fund a bounded first experiment within existing authority",
      evidence: store.metrics(e.id, p.mode),
    });
  }
}
export function admitExpansion(
  store: Store,
  parentId: string,
  proposed: unknown,
  evidenceIds: unknown,
): Experiment {
  const p = store.policy();
  if (!p.allowAutonomousExpansion)
    throw new Error("Autonomous expansion disabled");
  if (store.experiments().length >= p.maxExperiments)
    throw new Error("Experiment limit reached");
  if (
    !Array.isArray(evidenceIds) ||
    evidenceIds.length < 2 ||
    evidenceIds.some((x) => typeof x !== "string")
  )
    throw new Error("Expansion requires at least two real evidence references");
  const parent = store.experiment(parentId);
  const evidence = store
    .signals(parentId)
    .filter(
      (s) =>
        evidenceIds.includes(s.id) &&
        s.mode === p.mode &&
        store.isIndependent(s) &&
        s.verified &&
        ["reply", "rejection", "repeat_order"].includes(s.type),
    );
  if (new Set(evidence.map((s) => s.customerId)).size < 2)
    throw new Error(
      "Expansion requires verified signals from two independent customers",
    );
  const e = validateExperiment(proposed);
  if (e.parentExperimentId !== parent.id || e.status !== "candidate")
    throw new Error(
      "Expansion must be a candidate child of the evidenced parent",
    );
  if (store.experiments().some((x) => x.id === e.id))
    return store.experiment(e.id);
  if (!p.enabledFulfillmentTypes.includes(e.fulfillmentType))
    throw new Error("Expansion requires a connected enabled capability");
  if (e.channels.some((c) => !p.allowedChannels.includes(c)))
    throw new Error("Expansion cannot grant a new channel permission");
  if (e.budgetCents > allocationAvailable(store))
    throw new Error("Expansion exceeds uncommitted budget");
  const id = createHash("sha256")
    .update(
      `${parentId}:${e.id}:${evidence
        .map((s) => s.id)
        .sort()
        .join(":")}`,
    )
    .digest("hex")
    .slice(0, 12);
  store.saveExperiment(e);
  store.decision({
    experimentId: parent.id,
    action: "expand",
    reason: `Create ${e.id} from cited customer evidence ${id}; same global authority and supported capabilities`,
    evidence: store.metrics(parent.id, p.mode),
  });
  return e;
}
