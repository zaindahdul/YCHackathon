import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { Company } from "../src/company.js";
import { DEFAULT_POLICY, type Experiment } from "../src/domain.js";
const offer: Experiment = {
  id: "safe-tool",
  name: "Safe tool",
  audience: "Makers",
  offer: "Format JSON",
  priceCents: 1900,
  currency: "USD",
  fulfillmentType: "microtool",
  status: "active",
  budgetCents: 1000,
  channels: ["owned_intake"],
  hypothesis: "Useful tool",
  successCriteria: ["paid use"],
  killCriteria: ["no demand"],
  evidenceRequirements: ["request"],
  parentExperimentId: null,
};
function setup() {
  const store = new Store(":memory:");
  store.setPolicy({
    ...DEFAULT_POLICY,
    mode: "live",
    liveAuthorized: true,
    totalBudgetCents: 2000,
    stopAt: "2100-01-01T00:00:00Z",
  });
  store.seed([offer]);
  return store;
}
test("safe operator retry only requeues no-attempt configuration blocks and audits the intervention", (t) => {
  const s = setup();
  t.after(() => s.close());
  const job = s.enqueue(offer.id, "scout", {}, "no-key");
  job.status = "blocked";
  job.costCents = 0;
  job.reason = "NAIVE_API_KEY is not configured.";
  s.saveJob(job);
  assert.equal(s.retryUnstarted(job.id).status, "pending");
  assert.ok(s.events().some((e) => e.kind === "operator_retry_unstarted"));
  const attempt = s.reserve(job.id, 100);
  attempt.status = "blocked";
  s.settle(attempt, null);
  assert.throws(() => s.retryUnstarted(job.id), /reconcile/);
  s.settle(attempt, 0);
  s.event("provider_agent_created", {
    jobId: job.id,
    agentId: "actual-worker",
  });
  assert.throws(() => s.retryUnstarted(job.id), /reconcile/);
});
test("revoking fulfillment capability blocks execution and recovered finalization before any new worker call", async (t) => {
  const s = setup();
  t.after(() => s.close());
  const lead = s.addLead({
    experimentId: offer.id,
    customerId: "buyer",
    name: "Buyer",
    request: "JSON",
    sourceUrl: "owned_intake",
    contact: "buyer@example.test",
    channel: "owned_intake",
    consent: true,
    assetRights: true,
  });
  const job = s.enqueue(offer.id, "fulfill", {}, "capability", lead.id);
  s.addSignal({
    experimentId: offer.id,
    type: "approval",
    customerId: "buyer",
    evidence: "exact approval",
    amountCents: 0,
    independent: false,
    verified: true,
    mode: "live",
    externalId: "scope",
    orderId: job.id,
    scopeHash: job.scopeHash,
  });
  s.setPolicy({ ...s.policy(), enabledFulfillmentTypes: [] });
  let calls = 0;
  const company = new Company(s, {
    adapter: () => ({
      async run() {
        calls++;
        throw new Error("must not execute");
      },
    }),
  });
  await company.execute(job);
  assert.equal(calls, 0);
  assert.match(s.job(job.id).reason!, /not connected/);
  assert.equal(s.ledger("live").spentCents, 0);
  const recovered = s.job(job.id);
  recovered.costCents = 0;
  recovered.output = { template: "json-formatter" };
  recovered.recoveryValidated = true;
  s.saveJob(recovered);
  await assert.rejects(company.finalize(recovered), /not connected/);
});
test("provider overrun freezes live execution and cannot apply its strategy proposal", async (t) => {
  const s = setup();
  t.after(() => s.close());
  const job = s.enqueue(offer.id, "strategy", {}, "overrun");
  const child = {
    ...offer,
    id: "not-admitted",
    status: "candidate",
    parentExperimentId: offer.id,
  };
  const company = new Company(s, {
    adapter: () => ({
      async run() {
        return {
          status: "completed",
          summary: "Proposal over budget",
          output: { experiment: child, evidenceIds: [] },
          artifacts: [],
          costCents: 101,
          costKnown: true,
        } as const;
      },
    }),
  });
  await company.execute(job);
  assert.equal(s.policy().liveAuthorized, false);
  assert.equal(s.job(job.id).status, "blocked");
  assert.match(s.job(job.id).reason!, /exceeded/);
  assert.equal(s.experiments().length, 1);
  assert.equal(s.ledger("live").spentCents, 101);
});
