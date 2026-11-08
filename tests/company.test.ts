import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { Company, selectCycleJobs } from "../src/company.js";
import {
  reviewPortfolio,
  admitExpansion,
  allocationAvailable,
} from "../src/portfolio.js";
import {
  DEFAULT_POLICY,
  type Experiment,
  type Policy,
  type Signal,
  type Mode,
  type Job,
} from "../src/domain.js";
import { FixtureAdapter } from "../src/adapters/fixture.js";
import type { AgentAdapter, AgentResult } from "../src/adapters/naive.js";

const deadline = "2100-01-01T00:00:00.000Z";
function experiment(
  id = "test-offer",
  overrides: Partial<Experiment> = {},
): Experiment {
  return {
    id,
    name: `Offer ${id}`,
    audience: "Independent makers with a current task",
    offer: "Deliver the agreed artifact",
    priceCents: 2900,
    currency: "USD",
    fulfillmentType: "microtool",
    status: "candidate",
    budgetCents: 200,
    channels: ["owned_intake"],
    hypothesis: "A specific customer will use the output",
    successCriteria: ["Independent accepted delivery"],
    killCriteria: ["No relevant demand after the response window"],
    evidenceRequirements: ["Customer request and actual artifact"],
    parentExperimentId: null,
    ...overrides,
  };
}
function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    ...DEFAULT_POLICY,
    totalBudgetCents: 1000,
    perTaskBudgetCents: 100,
    stopAt: deadline,
    allowedChannels: ["owned_intake"],
    ...overrides,
  };
}
function memory(
  t: TestContext,
  experiments: Experiment[] = [experiment()],
  configuration = policy(),
): Store {
  const store = new Store(":memory:");
  t.after(() => store.close());
  store.setPolicy(configuration);
  store.seed(experiments);
  return store;
}
let reference = 0;
function order(
  store: Store,
  experimentId: string,
  customerId: string,
  input: Record<string, unknown> = {},
  key = `order-${++reference}`,
): Job {
  const lead = store.addLead({
    experimentId,
    customerId,
    name: customerId,
    request: "Format my JSON",
    sourceUrl: "https://example.com/request",
    contact: `${customerId}@example.com`,
    channel: "owned_intake",
    consent: false,
    assetRights: false,
    jobInput: input,
  });
  return store.enqueue(experimentId, "fulfill", input, key, lead.id);
}
function signal(
  store: Store,
  experimentId: string,
  type: Signal["type"],
  customerId: string,
  overrides: Partial<Omit<Signal, "id" | "createdAt">> = {},
): Signal {
  const commercial = ["approval", "payment", "delivery", "refund"].includes(
    type,
  );
  const existing = commercial
    ? store
        .jobs()
        .find(
          (j) =>
            j.kind === "fulfill" &&
            j.experimentId === experimentId &&
            j.leadId &&
            store.lead(j.leadId).customerId === customerId,
        )
    : undefined;
  const job = commercial
    ? overrides.orderId
      ? store.job(overrides.orderId)
      : (existing ?? order(store, experimentId, customerId))
    : undefined;
  return store.addSignal({
    experimentId,
    type,
    customerId,
    evidence: `Recorded customer evidence ${++reference}`,
    amountCents: type === "payment" ? job!.priceCents : 0,
    independent: true,
    mode: store.policy().mode,
    externalId: `event-${reference}`,
    verified: true,
    ...(job ? { orderId: job.id, scopeHash: job.scopeHash } : {}),
    ...overrides,
  });
}
function result(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    status: "completed",
    summary: "Offline fixture; no external work",
    output: { leads: [] },
    artifacts: [],
    costCents: 10,
    costKnown: true,
    ...overrides,
  };
}

test("transactional reservations across connections cannot overspend the company cap", (t) => {
  const root = mkdtempSync(join(tmpdir(), "company-budget-"));
  const first = new Store(join(root, "company.sqlite"));
  const second = new Store(join(root, "company.sqlite"));
  t.after(() => {
    first.close();
    second.close();
    rmSync(root, { recursive: true, force: true });
  });
  first.setPolicy(policy({ totalBudgetCents: 150 }));
  first.seed([
    experiment("offer-one", { budgetCents: 500 }),
    experiment("offer-two", { budgetCents: 500 }),
  ]);
  const a = first.enqueue("offer-one", "scout", {}, "reservation-a");
  const b = second.enqueue("offer-two", "scout", {}, "reservation-b");
  const reservedA = first.reserve(a.id, 100);
  assert.throws(() => second.reserve(b.id, 100), /Budget/);
  assert.equal(second.jobs().find((j) => j.id === b.id)!.status, "pending");
  assert.equal(second.jobs().find((j) => j.id === b.id)!.reservationCents, 0);
  second.reserve(b.id, 50);
  assert.deepEqual(first.ledger("simulation"), {
    spentCents: 0,
    reservedCents: 150,
    unresolvedJobs: 2,
  });
  first.settle(reservedA, 40);
  const c = second.enqueue("offer-one", "scout", {}, "reservation-c");
  assert.throws(() => second.reserve(c.id, 61), /Budget/);
  second.reserve(c.id, 60);
  assert.equal(
    first.ledger("simulation").spentCents +
      first.ledger("simulation").reservedCents,
    150,
  );
});

test("per-task and per-experiment caps reject an unaffordable reservation atomically", (t) => {
  const store = memory(t, [experiment("small-offer", { budgetCents: 75 })]);
  const a = store.enqueue("small-offer", "scout", {}, "small-a");
  assert.throws(() => store.reserve(a.id, 76), /cap/);
  assert.equal(store.jobs()[0]!.status, "pending");
  assert.deepEqual(store.ledger("simulation"), {
    spentCents: 0,
    reservedCents: 0,
    unresolvedJobs: 0,
  });
  store.reserve(a.id, 75);
  const b = store.enqueue("small-offer", "scout", {}, "small-b");
  assert.throws(() => store.reserve(b.id, 1), /cap/);
  const other = experiment("large-offer", { budgetCents: 500 });
  store.saveExperiment(other);
  const c = store.enqueue(other.id, "scout", {}, "large-c");
  assert.throws(() => store.reserve(c.id, 101), /cap/);
  for (const amount of [0, -1, 0.5, Number.NaN])
    assert.throws(() => store.reserve(c.id, amount), /integer/);
});

test("zero budget and missing live authorization produce no funded live work", async (t) => {
  const store = memory(
    t,
    [experiment()],
    policy({ mode: "live", liveAuthorized: false, totalBudgetCents: 0 }),
  );
  let calls = 0;
  const company = new Company(store, {
    adapter: () => ({
      run: async () => {
        calls++;
        return result();
      },
    }),
  });
  await company.cycle();
  assert.equal(calls, 0);
  assert.equal(store.experiments()[0]!.status, "candidate");
  const job = store.enqueue("test-offer", "scout", {}, "unfunded-live");
  assert.throws(() => store.reserve(job.id, 1), /authorized and funded/);
  assert.equal(store.ledger("live").reservedCents, 0);
});

test("unknown provider cost retains the full reservation and stops subsequent cycles", async (t) => {
  const store = memory(t, [experiment("unknown-offer")]);
  let calls = 0;
  const adapter: AgentAdapter = {
    run: async () => {
      calls++;
      return result({
        costKnown: false,
        costCents: 0,
        externalSessionId: "unreconciled-session",
      });
    },
  };
  const company = new Company(store, { adapter: () => adapter });
  await company.cycle();
  assert.equal(calls, 1);
  const job = store.jobs()[0]!;
  assert.equal(job.status, "blocked");
  assert.equal(job.costCents, null);
  assert.equal(job.reservationCents, 100);
  assert.equal(job.externalSessionId, "unreconciled-session");
  assert.match(job.reason!, /Cost unknown/);
  await company.cycle();
  assert.equal(calls, 1);
  assert.deepEqual(store.ledger("simulation"), {
    spentCents: 0,
    reservedCents: 100,
    unresolvedJobs: 1,
  });
  assert.ok(
    store.events().some((e) => "kind" in e && e.kind === "cycle_blocked"),
  );
});

test("an adapter exception leaves ambiguous cost reserved rather than permitting a free retry", async (t) => {
  const store = memory(t);
  let calls = 0;
  const company = new Company(store, {
    adapter: () => ({
      run: async () => {
        calls++;
        throw new Error("connection lost after submission");
      },
    }),
  });
  await company.cycle();
  await company.cycle();
  assert.equal(calls, 1);
  assert.equal(store.jobs()[0]!.costCents, null);
  assert.equal(store.jobs()[0]!.reservationCents, 100);
  assert.ok(
    store.events().some((e) => "kind" in e && e.kind === "execution_uncertain"),
  );
});

test("simulation evidence cannot be promoted to live by changing policy or copying signals", async (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 5000 })]);
  const company = new Company(store, { adapter: () => new FixtureAdapter() });
  await company.cycle();
  assert.ok(
    store
      .jobs()
      .some((j) => j.mode === "simulation" && j.status === "completed"),
  );
  signal(store, "test-offer", "qualified_lead", "fixture-customer");
  const payment = signal(store, "test-offer", "payment", "fixture-customer");
  signal(store, "test-offer", "delivery", "fixture-customer");
  assert.throws(
    () => store.setPolicy(policy({ mode: "live", liveAuthorized: true })),
    /separate databases/,
  );
  assert.equal(store.policy().mode, "simulation");
  assert.equal(store.metrics("test-offer", "live").revenueCents, 0);
  assert.equal(store.metrics("test-offer", "live").completedOrders, 0);
  assert.equal(store.metrics("test-offer", "simulation").revenueCents, 5000);
  const live = memory(
    t,
    [experiment("test-offer", { priceCents: 5000 })],
    policy({ mode: "live", liveAuthorized: true }),
  );
  const { id: _id, createdAt: _createdAt, ...copied } = payment;
  assert.throws(() => live.addSignal(copied), /mode differs/);
  assert.equal(live.metrics("test-offer", "live").payments, 0);
  assert.equal(live.ledger("live").spentCents, 0);
  assert.match(
    new Company(live, { adapter: () => new FixtureAdapter() }).status().note,
    /configuration is not proof/,
  );
});

test("unverified or nonindependent claims cannot inflate portfolio success", (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 50_000 })]);
  signal(store, "test-offer", "payment", "invented-payment", {
    verified: false,
    amountCents: 50_000,
  });
  signal(store, "test-offer", "delivery", "invented-payment", {
    verified: false,
  });
  signal(store, "test-offer", "payment", "founder-purchase", {
    independent: false,
    amountCents: 50_000,
  });
  signal(store, "test-offer", "delivery", "founder-purchase", {
    independent: false,
  });
  assert.equal(store.metrics("test-offer", "simulation").payments, 0);
  assert.equal(store.metrics("test-offer", "simulation").completedOrders, 0);
  assert.equal(store.metrics("test-offer", "simulation").revenueCents, 0);
});

test("external payment events are idempotent and changed replays are rejected", (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 900 })]);
  const job = order(store, "test-offer", "buyer-one");
  const input = {
    orderId: job.id,
    scopeHash: job.scopeHash,
    experimentId: "test-offer",
    type: "payment" as const,
    customerId: "buyer-one",
    evidence: "provider receipt pay-1",
    amountCents: 900,
    independent: true,
    mode: "simulation" as Mode,
    externalId: "payment-provider-event-1",
    verified: true,
  };
  const first = store.addSignal(input),
    duplicate = store.addSignal(input);
  assert.equal(first.id, duplicate.id);
  assert.equal(store.signals().length, 1);
  assert.equal(store.metrics("test-offer", "simulation").revenueCents, 900);
  assert.throws(
    () => store.addSignal({ ...input, evidence: "different provider receipt" }),
    /reused with different data/,
  );
  assert.equal(store.signals().length, 1);
});

test("duplicate refunds are not double counted and cumulative refunds cannot exceed receipts", (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 900 })]);
  signal(store, "test-offer", "payment", "buyer-one", { amountCents: 900 });
  const refund = signal(store, "test-offer", "refund", "buyer-one", {
    amountCents: 200,
    externalId: "refund-first",
    evidence: "confirmed refund first",
  });
  const { id: _id, createdAt: _createdAt, ...sameRefund } = refund;
  assert.equal(store.addSignal(sameRefund).id, refund.id);
  signal(store, "test-offer", "refund", "buyer-one", { amountCents: 700 });
  assert.equal(store.metrics("test-offer", "simulation").refundCents, 900);
  assert.throws(
    () =>
      signal(store, "test-offer", "refund", "buyer-one", { amountCents: 1 }),
    /exceeds/,
  );
  assert.equal(store.signals().filter((s) => s.type === "refund").length, 2);
  assert.throws(
    () =>
      signal(store, "test-offer", "refund", "different-buyer", {
        amountCents: 1,
      }),
    /exceeds/,
  );
  assert.throws(
    () =>
      signal(store, "test-offer", "refund", "buyer-one", {
        amountCents: 1,
        mode: "live",
      }),
    /mode differs/,
  );
});

test("a confirmed refund cannot be funded by an unverified payment claim", (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 1000 })]);
  signal(store, "test-offer", "payment", "unconfirmed-buyer", {
    amountCents: 1000,
    verified: false,
  });
  assert.throws(
    () =>
      signal(store, "test-offer", "refund", "unconfirmed-buyer", {
        amountCents: 1000,
      }),
    /payment|verified|exceeds/i,
  );
  assert.equal(store.signals().filter((s) => s.type === "refund").length, 0);
});

test("negative-demand decisions require independent minimum sample and elapsed response window", (t) => {
  const store = memory(
    t,
    [experiment("sample-offer", { status: "active" })],
    policy({ responseWindowMinutes: 30 }),
  );
  for (let i = 0; i < 4; i++)
    signal(store, "sample-offer", "qualified_lead", `prospect-${i}`);
  const origin = Date.parse(store.signals()[0]!.createdAt);
  reviewPortfolio(store, origin + 31 * 60_000);
  assert.equal(
    store.experiment("sample-offer").status,
    "active",
    "four contacts are insufficient",
  );
  const latest = signal(store, "sample-offer", "qualified_lead", "prospect-4");
  const latestAt = Date.parse(latest.createdAt);
  reviewPortfolio(store, latestAt + 30 * 60_000 - 1);
  assert.equal(
    store.experiment("sample-offer").status,
    "active",
    "the response window must elapse",
  );
  reviewPortfolio(store, latestAt + 30 * 60_000);
  assert.equal(store.experiment("sample-offer").status, "paused");
  assert.match(
    store.decisions().at(-1)!.reason,
    /qualified exposure.*response window/i,
  );
  assert.match(store.decisions().at(-1)!.reason, /not a PMF verdict/);
});

test("repeated events from the same person cannot satisfy the minimum qualified sample", (t) => {
  const store = memory(t, [
    experiment("duplicate-offer", { status: "active" }),
  ]);
  for (let i = 0; i < 8; i++)
    signal(store, "duplicate-offer", "qualified_lead", "one-person");
  reviewPortfolio(
    store,
    Date.parse(store.signals()[0]!.createdAt) + 60 * 60_000,
  );
  assert.equal(
    store.metrics("duplicate-offer", "simulation").qualifiedLeads,
    1,
  );
  assert.equal(store.experiment("duplicate-offer").status, "active");
});

test("a queued customer obligation prevents pausing an offer for zero replies", (t) => {
  const store = memory(t, [
    experiment("obligation-offer", { status: "active" }),
  ]);
  for (let i = 0; i < 5; i++)
    signal(store, "obligation-offer", "qualified_lead", `person-${i}`);
  store.enqueue("obligation-offer", "fulfill", {}, "customer-obligation");
  reviewPortfolio(
    store,
    Date.parse(store.signals()[0]!.createdAt) + 60 * 60_000,
  );
  assert.equal(store.experiment("obligation-offer").status, "active");
});

test("bounded exploration rotates through the four offers without claiming market failure", async (t) => {
  const seeds = ["offer-one", "offer-two", "offer-three", "offer-four"].map(
    (id) => experiment(id),
  );
  const store = memory(
    t,
    seeds,
    policy({
      totalBudgetCents: 500,
      maxActiveExperiments: 2,
      maxTasksPerCycle: 2,
    }),
  );
  const company = new Company(store, { adapter: () => new FixtureAdapter() });
  await company.cycle();
  const firstActive = store
    .experiments()
    .filter((e) => e.status === "active")
    .map((e) => e.id);
  assert.equal(firstActive.length, 2);
  assert.equal(store.jobs().filter((j) => j.status === "completed").length, 2);
  await company.cycle();
  const secondActive = store
    .experiments()
    .filter((e) => e.status === "active")
    .map((e) => e.id);
  assert.equal(secondActive.length, 2);
  assert.ok(secondActive.every((id) => !firstActive.includes(id)));
  assert.equal(
    new Set(
      store
        .jobs()
        .filter((j) => j.kind === "scout" && j.status === "completed")
        .map((j) => j.experimentId),
    ).size,
    4,
  );
  for (const d of store.decisions().filter((d) => d.action === "pause"))
    assert.match(d.reason, /insufficient evidence, not a failed market/);
  assert.ok(allocationAvailable(store) >= 0);
});

test("positive allocation requires independent paid deliveries and preserves global headroom", (t) => {
  const store = memory(
    t,
    [
      experiment("winner-offer", {
        status: "active",
        budgetCents: 100,
        priceCents: 500,
      }),
    ],
    policy({ totalBudgetCents: 500 }),
  );
  signal(store, "winner-offer", "payment", "buyer-one", { amountCents: 500 });
  signal(store, "winner-offer", "delivery", "buyer-one");
  reviewPortfolio(store);
  assert.equal(
    store.experiment("winner-offer").budgetCents,
    100,
    "one buyer is not a repeatable signal",
  );
  signal(store, "winner-offer", "payment", "buyer-two", { amountCents: 500 });
  signal(store, "winner-offer", "delivery", "buyer-two");
  reviewPortfolio(store);
  assert.equal(store.experiment("winner-offer").budgetCents, 150);
  assert.match(store.decisions().at(-1)!.reason, /not proven PMF/);
  const after = store.experiment("winner-offer").budgetCents;
  reviewPortfolio(store);
  assert.equal(
    store.experiment("winner-offer").budgetCents,
    after,
    "same evidence cannot repeatedly mint allocation",
  );
  assert.ok(allocationAvailable(store) >= 0);
});

function expansionEnvironment(t: TestContext, overrides: Partial<Policy> = {}) {
  const store = memory(
    t,
    [experiment("parent-offer", { status: "active", budgetCents: 100 })],
    policy(overrides),
  );
  const child = experiment("child-offer", {
    parentExperimentId: "parent-offer",
    budgetCents: 100,
  });
  return { store, child };
}

test("expansion refuses fabricated evidence and multiple signals from one customer", (t) => {
  const { store, child } = expansionEnvironment(t);
  assert.throws(
    () =>
      admitExpansion(store, "parent-offer", child, ["made-up-1", "made-up-2"]),
    /two independent customers/,
  );
  const a = signal(store, "parent-offer", "reply", "one-person");
  const b = signal(store, "parent-offer", "rejection", "one-person");
  assert.throws(
    () => admitExpansion(store, "parent-offer", child, [a.id, b.id]),
    /two independent customers/,
  );
  assert.equal(store.experiments().length, 1);
});

test("unverified or nonindependent signals cannot justify live expansion, and simulation evidence is refused", (t) => {
  const { store, child } = expansionEnvironment(t, {
    mode: "live",
    liveAuthorized: true,
  });
  const bad = [
    signal(store, "parent-offer", "reply", "person-one", { verified: false }),
    signal(store, "parent-offer", "reply", "person-two", {
      independent: false,
    }),
  ];
  assert.throws(
    () =>
      signal(store, "parent-offer", "reply", "person-three", {
        mode: "simulation",
      }),
    /mode differs/,
  );
  assert.throws(
    () =>
      admitExpansion(
        store,
        "parent-offer",
        child,
        bad.map((s) => s.id),
      ),
    /two independent customers/,
  );
  assert.equal(store.experiments().length, 1);
});

test("real demand can create a candidate child but cannot grant a channel or capability", (t) => {
  const { store, child } = expansionEnvironment(t);
  const refs = [
    signal(store, "parent-offer", "reply", "customer-one").id,
    signal(store, "parent-offer", "rejection", "customer-two").id,
  ];
  assert.throws(
    () =>
      admitExpansion(
        store,
        "parent-offer",
        { ...child, channels: ["cold_email"] },
        refs,
      ),
    /new channel/,
  );
  assert.throws(
    () =>
      admitExpansion(
        store,
        "parent-offer",
        { ...child, fulfillmentType: "arbitrary-shell" },
        refs,
      ),
    /Unsupported fulfillment/,
  );
  assert.throws(
    () =>
      admitExpansion(
        store,
        "parent-offer",
        { ...child, status: "active" },
        refs,
      ),
    /candidate child/,
  );
  assert.throws(
    () =>
      admitExpansion(
        store,
        "parent-offer",
        { ...child, parentExperimentId: null },
        refs,
      ),
    /candidate child/,
  );
  assert.equal(store.experiments().length, 1);
  const accepted = admitExpansion(store, "parent-offer", child, refs);
  assert.equal(accepted.status, "candidate");
  assert.equal(accepted.parentExperimentId, "parent-offer");
  assert.equal(store.policy().totalBudgetCents, 1000);
  assert.deepEqual(store.policy().allowedChannels, ["owned_intake"]);
  assert.equal(
    store.decisions().filter((d) => d.action === "expand").length,
    1,
  );
  assert.deepEqual(
    admitExpansion(store, "parent-offer", child, refs),
    accepted,
  );
  assert.equal(
    store.decisions().filter((d) => d.action === "expand").length,
    1,
    "repeat proposal is idempotent",
  );
});

test("expansion respects both the uncommitted funds and total experiment count", (t) => {
  const { store, child } = expansionEnvironment(t, {
    totalBudgetCents: 150,
    maxExperiments: 2,
  });
  const refs = [
    signal(store, "parent-offer", "reply", "buyer-one").id,
    signal(store, "parent-offer", "repeat_order", "buyer-two").id,
  ];
  assert.equal(allocationAvailable(store), 50);
  assert.throws(
    () => admitExpansion(store, "parent-offer", child, refs),
    /uncommitted budget/,
  );
  admitExpansion(store, "parent-offer", { ...child, budgetCents: 50 }, refs);
  assert.throws(
    () =>
      admitExpansion(
        store,
        "parent-offer",
        { ...child, id: "third-offer", budgetCents: 1 },
        refs,
      ),
    /Experiment limit/,
  );
  assert.equal(store.experiments().length, 2);
});

test("interrupted running jobs retain their reservation and prevent replacement execution", async (t) => {
  const store = memory(t, [experiment("stale-offer", { status: "active" })]);
  const job = store.enqueue("stale-offer", "scout", {}, "stale-running");
  store.reserve(job.id, 100);
  let calls = 0;
  const company = new Company(store, {
    adapter: () => ({
      run: async () => {
        calls++;
        return result();
      },
    }),
  });
  await company.cycle();
  assert.equal(calls, 0);
  assert.equal(store.jobs().length, 1);
  assert.equal(store.jobs()[0]!.status, "blocked");
  assert.equal(store.jobs()[0]!.costCents, null);
  assert.equal(store.jobs()[0]!.reservationCents, 100);
  assert.match(store.jobs()[0]!.reason!, /Previous worker stopped/);
  assert.equal(store.ledger("simulation").unresolvedJobs, 1);
});

test("the execution lease rejects a second worker while an adapter is running", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "company-lease-"));
  const first = new Store(join(root, "company.sqlite")),
    second = new Store(join(root, "company.sqlite"));
  t.after(() => {
    first.close();
    second.close();
    rmSync(root, { recursive: true, force: true });
  });
  first.setPolicy(policy());
  first.seed([experiment("lease-offer")]);
  let resolveRun!: (value: AgentResult) => void;
  let calls = 0;
  const deferred = new Promise<AgentResult>((resolve) => {
    resolveRun = resolve;
  });
  const owner = new Company(first, {
    adapter: () => ({
      run: async () => {
        calls++;
        return deferred;
      },
    }),
  });
  const rival = new Company(second, {
    adapter: () => ({
      run: async () => {
        calls++;
        return result();
      },
    }),
  });
  const running = owner.cycle();
  assert.equal(calls, 1);
  await assert.rejects(rival.cycle(), /Another company worker/);
  assert.equal(calls, 1);
  second.release("not-the-owner");
  assert.equal(
    second.lease("another-worker"),
    false,
    "wrong owner cannot release the lease",
  );
  resolveRun(result());
  await running;
  assert.equal(
    second.lease("next-worker"),
    true,
    "lease is released after the completed cycle",
  );
  second.release("next-worker");
});

test("the execution deadline prevents new work and retains customer job evidence", async (t) => {
  const store = memory(
    t,
    [experiment("expired-offer", { status: "active" })],
    policy({ stopAt: "2020-01-01T00:00:00.000Z" }),
  );
  const pending = store.enqueue(
    "expired-offer",
    "fulfill",
    {},
    "pending-obligation",
  );
  let calls = 0;
  await new Company(store, {
    adapter: () => ({
      run: async () => {
        calls++;
        return result();
      },
    }),
  }).cycle();
  assert.equal(calls, 0);
  assert.equal(store.experiment("expired-offer").status, "paused");
  assert.equal(
    store.jobs().find((j) => j.id === pending.id)!.status,
    "pending",
  );
  assert.match(store.decisions().at(-1)!.reason, /retain obligations/);
});

test("commercial evidence must identify the exact fulfillment order, scope and customer", (t) => {
  const store = memory(t, [
    experiment("test-offer", { priceCents: 900 }),
    experiment("other-offer"),
  ]);
  const job = order(store, "test-offer", "buyer-one");
  const base = {
    experimentId: "test-offer",
    type: "approval" as const,
    customerId: "buyer-one",
    evidence: "Owner approved this exact contract",
    amountCents: 0,
    independent: true,
    mode: "simulation" as Mode,
    externalId: "scope-event",
    verified: true,
  };
  assert.throws(() => store.addSignal(base), /orderId and scopeHash/);
  assert.throws(
    () =>
      store.addSignal({ ...base, orderId: job.id, scopeHash: "wrong-version" }),
    /exact order/,
  );
  assert.throws(
    () =>
      store.addSignal({
        ...base,
        orderId: job.id,
        scopeHash: job.scopeHash,
        customerId: "other-person",
      }),
    /exact order/,
  );
  assert.throws(
    () =>
      store.addSignal({
        ...base,
        orderId: job.id,
        scopeHash: job.scopeHash,
        experimentId: "other-offer",
      }),
    /exact order/,
  );
  const scout = store.enqueue(
    "test-offer",
    "scout",
    {},
    "not-a-customer-order",
  );
  assert.throws(
    () =>
      store.addSignal({
        ...base,
        orderId: scout.id,
        scopeHash: scout.scopeHash,
      }),
    /exact order/,
  );
  assert.equal(store.signals().length, 0);
  assert.equal(
    store.addSignal({ ...base, orderId: job.id, scopeHash: job.scopeHash })
      .orderId,
    job.id,
  );
});

test("payment must match the snapshotted order price even after experiment pricing changes", (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 900 })]);
  const job = order(store, "test-offer", "buyer-one");
  store.saveExperiment({ ...store.experiment("test-offer"), priceCents: 1500 });
  assert.throws(
    () =>
      signal(store, "test-offer", "payment", "buyer-one", {
        orderId: job.id,
        amountCents: 1500,
      }),
    /agreed order price/,
  );
  const paid = signal(store, "test-offer", "payment", "buyer-one", {
    orderId: job.id,
    amountCents: 900,
  });
  assert.equal(paid.amountCents, 900);
  assert.equal(store.job(job.id).priceCents, 900);
  assert.equal(order(store, "test-offer", "buyer-two").priceCents, 1500);
});

test("a delivery for one order cannot complete a different paid order from the same customer", (t) => {
  const store = memory(t, [experiment("test-offer", { priceCents: 900 })]);
  const paidOrder = order(store, "test-offer", "same-buyer", {
    variant: "paid",
  });
  const unpaidOrder = order(store, "test-offer", "same-buyer", {
    variant: "unpaid",
  });
  signal(store, "test-offer", "payment", "same-buyer", {
    orderId: paidOrder.id,
  });
  signal(store, "test-offer", "delivery", "same-buyer", {
    orderId: unpaidOrder.id,
  });
  assert.equal(store.metrics("test-offer", "simulation").payments, 1);
  assert.equal(store.metrics("test-offer", "simulation").completedOrders, 0);
  assert.throws(
    () =>
      signal(store, "test-offer", "refund", "same-buyer", {
        orderId: unpaidOrder.id,
        amountCents: 1,
      }),
    /exceeds/,
  );
  signal(store, "test-offer", "delivery", "same-buyer", {
    orderId: paidOrder.id,
  });
  assert.equal(store.metrics("test-offer", "simulation").completedOrders, 1);
  signal(store, "test-offer", "payment", "same-buyer", {
    orderId: unpaidOrder.id,
  });
  assert.equal(store.metrics("test-offer", "simulation").completedOrders, 2);
  assert.equal(
    store.metrics("test-offer", "simulation").payments,
    1,
    "two orders do not become two independent buyers",
  );
});

test("zero-dollar and fully refunded orders are not paid traction", (t) => {
  const store = memory(t, [
    experiment("free-offer", { priceCents: 0 }),
    experiment("paid-offer", { priceCents: 900 }),
  ]);
  signal(store, "free-offer", "payment", "free-user");
  signal(store, "free-offer", "delivery", "free-user");
  assert.equal(store.metrics("free-offer", "simulation").payments, 0);
  assert.equal(store.metrics("free-offer", "simulation").completedOrders, 0);
  signal(store, "paid-offer", "payment", "refunded-user");
  signal(store, "paid-offer", "delivery", "refunded-user");
  assert.equal(store.metrics("paid-offer", "simulation").completedOrders, 1);
  signal(store, "paid-offer", "refund", "refunded-user", { amountCents: 900 });
  const after = store.metrics("paid-offer", "simulation");
  assert.equal(after.payments, 0);
  assert.equal(after.completedOrders, 0);
  assert.equal(after.revenueCents - after.refundCents, 0);
});

test("order hashes are stable for equivalent inputs and reject changed idempotency contracts", (t) => {
  const store = memory(t);
  const job = order(
    store,
    "test-offer",
    "buyer-one",
    { a: 1, nested: { x: 2, y: 3 } },
    "stable-order",
  );
  assert.equal(
    store.enqueue(
      "test-offer",
      "fulfill",
      { nested: { y: 3, x: 2 }, a: 1 },
      "stable-order",
      job.leadId,
    ).id,
    job.id,
  );
  assert.throws(
    () =>
      store.enqueue(
        "test-offer",
        "fulfill",
        { a: 2, nested: { x: 2, y: 3 } },
        "stable-order",
        job.leadId,
      ),
    /different order contract/,
  );
  store.saveExperiment({ ...store.experiment("test-offer"), priceCents: 5000 });
  assert.throws(
    () =>
      store.enqueue(
        "test-offer",
        "fulfill",
        job.input,
        "stable-order",
        job.leadId,
      ),
    /different order contract/,
  );
  assert.equal(store.job(job.id).priceCents, 2900);
  assert.equal(store.jobs().length, 1);
});

test("saved jobs cannot mutate the fields covered by an approved order contract", (t) => {
  const store = memory(t, [
    experiment("test-offer"),
    experiment("other-offer"),
  ]);
  const job = order(store, "test-offer", "buyer-one", { task: "original" });
  const mutations: Partial<Job>[] = [
    { input: { task: "different" } },
    { scopeHash: "different-hash" },
    { priceCents: 1 },
    { offer: "Different work" },
    { leadId: null },
    { mode: "live" },
    { kind: "scout" },
    { experimentId: "other-offer" },
  ];
  for (const mutation of mutations)
    assert.throws(
      () => store.saveJob({ ...job, ...mutation }),
      /immutable/,
      JSON.stringify(mutation),
    );
  assert.deepEqual(store.job(job.id).input, { task: "original" });
  assert.equal(store.job(job.id).kind, "fulfill");
});

test("an old approval for the same customer cannot authorize a revised or new job", async (t) => {
  const store = memory(t);
  const lead = store.addLead({
    experimentId: "test-offer",
    customerId: "same-buyer",
    name: "Buyer",
    request: "Format JSON",
    sourceUrl: "https://example.com/request",
    contact: "buyer@example.com",
    channel: "owned_intake",
    consent: true,
    assetRights: true,
  });
  const approved = store.enqueue(
    "test-offer",
    "fulfill",
    { version: 1 },
    "approved-version",
    lead.id,
  );
  const newJob = store.enqueue(
    "test-offer",
    "fulfill",
    { version: 2 },
    "unapproved-version",
    lead.id,
  );
  signal(store, "test-offer", "approval", "same-buyer", {
    orderId: approved.id,
  });
  let calls = 0;
  const company = new Company(store, {
    adapter: () => ({
      run: async () => {
        calls++;
        return result();
      },
    }),
  });
  await company.execute(newJob);
  assert.equal(calls, 0);
  assert.equal(store.job(newJob.id).status, "blocked");
  assert.equal(store.job(newJob.id).reason, "Exact scope approval is missing");
  assert.equal(store.job(newJob.id).reservationCents, 0);
  assert.notEqual(approved.scopeHash, newJob.scopeHash);
});

test("recent qualified exposures receive their full response window", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-07T22:00:00Z"),
  });
  const store = memory(
    t,
    [experiment("fresh-offer", { status: "active" })],
    policy({ responseWindowMinutes: 30 }),
  );
  for (let i = 0; i < 5; i++)
    signal(store, "fresh-offer", "qualified_lead", `old-person-${i}`);
  t.mock.timers.tick(31 * 60_000);
  signal(store, "fresh-offer", "qualified_lead", "fresh-person-one");
  signal(store, "fresh-offer", "qualified_lead", "fresh-person-two");
  reviewPortfolio(store, Date.now());
  assert.equal(
    store.experiment("fresh-offer").status,
    "active",
    "old contacts must not expire the two new contacts immediately",
  );
  t.mock.timers.tick(29 * 60_000);
  reviewPortfolio(store, Date.now());
  assert.equal(store.experiment("fresh-offer").status, "active");
  t.mock.timers.tick(60_000);
  reviewPortfolio(store, Date.now());
  assert.equal(store.experiment("fresh-offer").status, "paused");
});

test("a simulation-created child remains confined to its simulation database", (t) => {
  const { store, child } = expansionEnvironment(t);
  const refs = [
    signal(store, "parent-offer", "reply", "person-one").id,
    signal(store, "parent-offer", "reply", "person-two").id,
  ];
  admitExpansion(store, "parent-offer", child, refs);
  assert.throws(
    () => store.setPolicy(policy({ mode: "live", liveAuthorized: true })),
    /separate databases/,
  );
  assert.equal(store.policy().mode, "simulation");
  const live = memory(
    t,
    [experiment("parent-offer")],
    policy({ mode: "live", liveAuthorized: true }),
  );
  assert.throws(() => live.experiment(child.id), /Unknown experiment/);
  assert.equal(live.signals().length, 0);
});

test("mode changes are rejected once any lead, job, signal or decision history exists", (t) => {
  for (const kind of ["lead", "job", "signal", "decision"] as const) {
    const store = memory(t);
    if (kind === "lead")
      store.addLead({
        experimentId: "test-offer",
        customerId: "person-one",
        name: "Person",
        request: "Actual request",
        sourceUrl: "https://example.com",
        contact: "",
        channel: "owned_intake",
        consent: false,
        assetRights: false,
      });
    if (kind === "job") store.enqueue("test-offer", "scout", {}, "prior-job");
    if (kind === "signal") signal(store, "test-offer", "reply", "person-one");
    if (kind === "decision")
      store.decision({
        experimentId: "test-offer",
        action: "wait",
        reason: "Recorded evidence history",
        evidence: store.metrics("test-offer", "simulation"),
      });
    assert.throws(
      () => store.setPolicy(policy({ mode: "live", liveAuthorized: true })),
      /separate databases/,
      kind,
    );
    assert.equal(store.policy().mode, "simulation");
  }
});

test("a consented request is admitted once, waits for its exact approval, then produces a real artifact", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "company-request-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = memory(t, [experiment("request-offer", { status: "active" })]);
  const input = {
    acceptanceExamples: [{ input: '{"a":1}', expected: '{\n  "a": 1\n}' }],
  };
  const lead = store.addLead({
    experimentId: "request-offer",
    customerId: "requester-one",
    name: "Requester",
    request: "Format JSON",
    sourceUrl: "https://example.com/request",
    contact: "owner@example.com",
    channel: "owned_intake",
    consent: true,
    assetRights: true,
    jobInput: input,
  });
  assert.equal(lead.mode, "simulation");
  let calls = 0;
  const company = new Company(store, {
    outputDirectory: join(root, "outputs"),
    assetsDirectory: join(root, "assets"),
    adapter: () => ({
      run: async () => {
        calls++;
        return result({ output: { template: "json-formatter" } });
      },
    }),
  });
  await company.cycle();
  let jobs = store.jobs().filter((j) => j.kind === "fulfill");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]!.reason, "Exact scope approval is missing");
  assert.deepEqual(jobs[0]!.input, input);
  assert.equal(calls, 0);
  signal(store, "request-offer", "approval", "requester-one", {
    orderId: jobs[0]!.id,
  });
  await company.cycle();
  jobs = store.jobs().filter((j) => j.kind === "fulfill");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]!.status, "completed", jobs[0]!.reason ?? undefined);
  assert.equal(calls, 1);
  const fulfillment = jobs[0]!.output!.fulfillment as {
    artifacts: Array<{ path?: string }>;
  };
  const artifactPath = fulfillment.artifacts[0]!.path!;
  assert.ok(
    existsSync(artifactPath),
    "completed generation has an actual file",
  );
  assert.match(readFileSync(artifactPath, "utf8"), /<!doctype html>/i);
  assert.equal(store.outbox().length, 1);
  assert.equal(store.outbox()[0]!.status, "draft");
  assert.equal(
    store.metrics("request-offer", "simulation").completedOrders,
    0,
    "artifact generation is not verified payment plus customer delivery",
  );
});

test("order-bound feedback inherits independence only from each exact qualified order lead", (t) => {
  const { store, child } = expansionEnvironment(t);
  const first = order(store, "parent-offer", "buyer-one");
  const second = order(store, "parent-offer", "buyer-two");
  const a = signal(store, "parent-offer", "reply", "buyer-one", {
    independent: false,
    orderId: first.id,
    scopeHash: first.scopeHash,
  });
  const b = signal(store, "parent-offer", "rejection", "buyer-two", {
    independent: false,
    orderId: second.id,
    scopeHash: second.scopeHash,
  });
  const refs = [a.id, b.id];
  assert.equal(store.isIndependent(a), false);
  assert.equal(store.isIndependent(b), false);
  assert.equal(store.metrics("parent-offer", "simulation").replies, 0);
  assert.throws(
    () => admitExpansion(store, "parent-offer", child, refs),
    /two independent customers/,
  );
  store.qualifyLead(
    first.leadId!,
    "Verified buyer-one is an outside customer for the first order",
  );
  assert.equal(store.isIndependent(a), true);
  assert.equal(store.isIndependent(b), false);
  assert.throws(
    () => admitExpansion(store, "parent-offer", child, refs),
    /two independent customers/,
  );
  const unrelated = order(store, "parent-offer", "buyer-two", {
    unrelated: true,
  });
  store.qualifyLead(
    unrelated.leadId!,
    "A different inquiry from buyer-two was independently qualified",
  );
  assert.equal(
    store.isIndependent(b),
    false,
    "qualification of a different lead must not promote this order feedback",
  );
  assert.throws(
    () => admitExpansion(store, "parent-offer", child, refs),
    /two independent customers/,
  );
  store.qualifyLead(
    second.leadId!,
    "Verified buyer-two owns the exact second order",
  );
  assert.equal(store.isIndependent(b), true);
  const accepted = admitExpansion(store, "parent-offer", child, refs);
  assert.equal(accepted.id, child.id);
  assert.equal(accepted.status, "candidate");
  assert.equal(
    store.signals().find((s) => s.id === a.id)!.independent,
    false,
    "original feedback evidence is retained rather than rewritten",
  );
});

test("qualified order feedback reaches the strategy worker and admits its cited child", async (t) => {
  const { store, child } = expansionEnvironment(t, { maxTasksPerCycle: 2 });
  const first = order(store, "parent-offer", "buyer-one");
  const second = order(store, "parent-offer", "buyer-two");
  const feedback = [
    signal(store, "parent-offer", "reply", "buyer-one", {
      independent: false,
      orderId: first.id,
      scopeHash: first.scopeHash,
    }),
    signal(store, "parent-offer", "rejection", "buyer-two", {
      independent: false,
      orderId: second.id,
      scopeHash: second.scopeHash,
    }),
  ];
  const kinds: string[] = [];
  const company = new Company(store, {
    adapter: () => ({
      run: async (task) => {
        kinds.push(task.kind);
        return result(
          task.kind === "strategy"
            ? {
                output: {
                  experiment: child,
                  evidenceIds: feedback.map((s) => s.id),
                },
              }
            : {},
        );
      },
    }),
  });
  await company.cycle();
  assert.equal(
    store.jobs().some((j) => j.kind === "strategy"),
    false,
    "unqualified feedback cannot schedule strategy work",
  );
  store.qualifyLead(
    first.leadId!,
    "Outside customer one, verified against exact intake",
  );
  store.qualifyLead(
    second.leadId!,
    "Outside customer two, verified against exact intake",
  );
  await company.cycle();
  const strategy = store.jobs().find((j) => j.kind === "strategy");
  assert.ok(
    strategy,
    "the strategy opportunity is scheduled from qualified feedback",
  );
  assert.equal(strategy.status, "completed", strategy.reason ?? undefined);
  assert.ok(kinds.includes("strategy"));
  assert.equal(store.experiment(child.id).status, "candidate");
  assert.equal(store.experiment(child.id).parentExperimentId, "parent-offer");
  assert.equal(
    store.decisions().filter((d) => d.action === "expand").length,
    1,
  );
});

test("a paused offer returns after a verified response by replacing only idle exploration", (t) => {
  const store = memory(
    t,
    [
      experiment("paused-offer", { status: "paused" }),
      experiment("idle-offer", { status: "active" }),
    ],
    policy({ maxActiveExperiments: 1 }),
  );
  signal(store, "paused-offer", "reply", "unverified-person", {
    verified: false,
  });
  reviewPortfolio(store);
  assert.equal(
    store.experiment("paused-offer").status,
    "paused",
    "unverified response cannot reactivate the offer",
  );
  signal(store, "paused-offer", "reply", "actual-prospect");
  reviewPortfolio(store);
  assert.equal(store.experiment("paused-offer").status, "active");
  assert.equal(store.experiment("idle-offer").status, "paused");
  assert.equal(
    store.experiments().filter((e) => e.status === "active").length,
    1,
  );
  const activation = store
    .decisions()
    .find((d) => d.experimentId === "paused-offer" && d.action === "activate");
  assert.ok(activation);
  assert.match(activation.reason, /later verified customer response/);
});

test("a returning offer cannot displace an active offer with pending customer fulfillment", (t) => {
  const store = memory(
    t,
    [
      experiment("paused-offer", { status: "paused" }),
      experiment("working-offer", { status: "active" }),
    ],
    policy({ maxActiveExperiments: 1 }),
  );
  const obligation = order(store, "working-offer", "waiting-buyer");
  signal(store, "paused-offer", "reply", "actual-prospect");
  reviewPortfolio(store);
  assert.equal(store.experiment("paused-offer").status, "paused");
  assert.equal(store.experiment("working-offer").status, "active");
  assert.equal(store.job(obligation.id).status, "pending");
  assert.equal(
    store.experiments().filter((e) => e.status === "active").length,
    1,
  );
  assert.equal(
    store
      .decisions()
      .some((d) => d.experimentId === "working-offer" && d.action === "pause"),
    false,
  );
});

test("exploration share reserves bounded strategy capacity while customer work keeps the majority", (t) => {
  const store = memory(t);
  const customerJobs = Array.from({ length: 8 }, (_, i) =>
    order(store, "test-offer", `buyer-${i}`),
  );
  const strategy = store.enqueue(
    "test-offer",
    "strategy",
    {},
    "fresh-strategy",
  );
  const scout = store.enqueue("test-offer", "scout", {}, "fresh-scout");
  const backlog = [...customerJobs, scout, strategy];
  const quarter = selectCycleJobs(
    backlog,
    policy({ maxTasksPerCycle: 4, explorationShare: 0.25 }),
  );
  assert.equal(quarter.length, 4);
  assert.equal(quarter.filter((j) => j.kind === "fulfill").length, 3);
  assert.equal(quarter.filter((j) => j.kind !== "fulfill").length, 1);
  assert.ok(
    quarter.some((j) => j.id === strategy.id),
    "evidence-backed strategy precedes new scouting",
  );
  const half = selectCycleJobs(
    backlog,
    policy({ maxTasksPerCycle: 4, explorationShare: 0.5 }),
  );
  assert.equal(half.filter((j) => j.kind === "fulfill").length, 2);
  assert.equal(half.filter((j) => j.kind !== "fulfill").length, 2);
  assert.equal(new Set(half.map((j) => j.id)).size, half.length);
  const single = selectCycleJobs(backlog, policy({ maxTasksPerCycle: 1 }));
  assert.equal(
    single[0]!.kind,
    "fulfill",
    "one available slot must not starve a customer",
  );
  const noExploration = selectCycleJobs(
    customerJobs,
    policy({ maxTasksPerCycle: 4 }),
  );
  assert.equal(
    noExploration.length,
    4,
    "unused exploration capacity returns to customer work",
  );
});
