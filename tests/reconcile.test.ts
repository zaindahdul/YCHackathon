import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { DEFAULT_POLICY, type Experiment } from "../src/domain.js";
import { reconcileJob } from "../src/reconcile.js";
import { Company } from "../src/company.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const now = "2026-11-07T22:00:00.000Z";
const agentId = "agt_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sessionId = "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const taskKey = "durable-controller-task-key";
const fileId = "fil_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const document = {
  status: "completed",
  summary: "A checked proposal",
  output: { template: "json-formatter" },
  artifacts: [],
};
const offer: Experiment = {
  id: "recover-tool",
  name: "Small tool",
  audience: "Developers",
  offer: "A checked JSON tool",
  priceCents: 2900,
  currency: "USD",
  fulfillmentType: "microtool",
  status: "active",
  budgetCents: 1000,
  channels: ["owned_intake"],
  hypothesis: "Customers buy a checked file",
  successCriteria: ["paid delivery"],
  killCriteria: ["no demand"],
  evidenceRequirements: ["receipt"],
  parentExperimentId: null,
};
function session(extra: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    object: "session",
    agent_id: agentId,
    agent_version: 1,
    deployment_id: null,
    identity_id: null,
    computer_id: null,
    parent_session_id: null,
    root_session_id: null,
    thread_role: null,
    model: "vetta/auto",
    mode: "build",
    status: "idle",
    stop_reason: "end_turn",
    window: "immediate",
    budget_micro_usd: 1_000_000,
    consumed_micro_usd: 34567,
    token_usage: {
      input: 1,
      cache_write: 0,
      cache_read: 0,
      output: 1,
      reasoning: 0,
    },
    pending_actions: [],
    output_schema: null,
    structured_output: document,
    last_seq: 1,
    metadata: { client_task_key: taskKey },
    started_at: now,
    ended_at: now,
    created_at: now,
    ...extra,
  };
}
function setup(
  t: TestContext,
  receipt: "agent" | "session" | "none" = "session",
) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  store.setPolicy({
    ...DEFAULT_POLICY,
    mode: "live",
    liveAuthorized: true,
    totalBudgetCents: 1000,
    perTaskBudgetCents: 100,
    allowedChannels: ["owned_intake"],
    stopAt: "2100-01-01T00:00:00Z",
  });
  store.seed([offer]);
  const lead = store.addLead({
    experimentId: offer.id,
    customerId: "buyer-one",
    name: "Ada",
    request: "JSON formatter",
    sourceUrl: "owned_intake",
    contact: "ada@example.com",
    channel: "owned_intake",
    consent: true,
    assetRights: true,
  });
  const job = store.enqueue(
    offer.id,
    "fulfill",
    {
      template: "json-formatter",
      acceptanceExamples: [{ input: '{"a":1}', expected: '{\n  "a": 1\n}' }],
    },
    "order-one",
    lead.id,
  );
  if (receipt !== "none")
    store.event("provider_agent_created", {
      jobId: job.id,
      agentId,
      idempotencyKey: taskKey,
    });
  if (receipt === "session") {
    job.externalSessionId = sessionId;
    store.saveJob(job);
    store.event("provider_session_created", {
      jobId: job.id,
      agentId,
      sessionId,
      idempotencyKey: taskKey,
    });
  }
  store.reserve(job.id, 100);
  const interrupted = store.job(job.id);
  interrupted.status = "blocked";
  interrupted.reason = "Interrupted worker";
  interrupted.output = { original: "controller output" };
  store.settle(interrupted, null);
  return { store, job: store.job(job.id) };
}
function transport(
  options: {
    session?: Record<string, unknown>;
    sessions?: unknown[];
    hasMore?: boolean;
    spend?: Record<string, unknown>;
    file?: boolean;
    badWire?: boolean;
    billingError?: boolean;
  } = {},
) {
  const calls: Array<{ url: string; method: string; hasSignal: boolean }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input),
      method = init?.method ?? "GET";
    calls.push({ url, method, hasSignal: Boolean(init?.signal) });
    let value: unknown;
    if (url.includes("/sessions?"))
      value = {
        data: options.sessions ?? [session(options.session)],
        has_more: options.hasMore ?? false,
        next_cursor: options.hasMore ? "cursor" : null,
      };
    else if (url.endsWith(`/sessions/${sessionId}`))
      value = options.badWire ? { id: sessionId } : session(options.session);
    else if (url.endsWith(`/agents/${agentId}/computer`)) value = null;
    else if (url.includes(`/agents/${agentId}/spend`)) {
      if (options.billingError) throw new Error("Offline unavailable metering");
      value = {
        agent_id: agentId,
        period: "day",
        period_start: now,
        spent_micro_usd: 34567,
        by_component: { model: 34567 },
        ...options.spend,
      };
    } else if (url.includes("/files?"))
      value = {
        data: options.file
          ? [
              {
                id: fileId,
                object: "file",
                name: "proof.txt",
                content_type: "text/plain",
                size_bytes: 4,
                scope: "published",
                session_id: sessionId,
                sha256: "a".repeat(64),
                created_at: now,
                title: null,
                description: null,
                tags: [],
                kind: "document",
                source: null,
                thumbnail_file_id: null,
                width: null,
                height: null,
                duration_seconds: null,
                folder: null,
              },
            ]
          : [],
        has_more: false,
        next_cursor: null,
      };
    else
      throw new Error(`Unexpected reconciliation operation: ${method} ${url}`);
    assert.equal(
      method,
      "GET",
      "reconciliation never creates or reruns paid model work",
    );
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetcher, calls };
}
function unresolved(store: Store, id: string) {
  const job = store.job(id);
  assert.equal(job.costCents, null);
  assert.equal(job.reservationCents, 100);
  assert.notEqual(job.recoveryValidated, true);
}

test("known session receipt reconciles real SDK-parsed output and cost without a new create call", async (t) => {
  const { store, job } = setup(t),
    provider = transport();
  await reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher });
  const recovered = store.job(job.id);
  assert.equal(
    recovered.status,
    "blocked",
    "reconciliation restores a proposal; deterministic fulfillment remains separate",
  );
  assert.equal(recovered.costCents, 4);
  assert.equal(recovered.reservationCents, 0);
  assert.equal(recovered.recoveryValidated, true);
  assert.equal(recovered.output?.template, "json-formatter");
  assert.equal(recovered.summary, document.summary);
  assert.equal(recovered.output?._recoveryResultValid, true);
  assert.equal(
    (recovered.output?._naive as any).billingSource,
    "agents.spend reconciled",
  );
  assert(provider.calls.every((c) => c.method === "GET" && c.hasSignal));
  assert.equal(
    provider.calls.some((c) => c.url.includes("/sessions?")),
    false,
  );
  const lead = store.lead(recovered.leadId!);
  store.addSignal({
    experimentId: recovered.experimentId,
    orderId: recovered.id,
    scopeHash: recovered.scopeHash,
    customerId: lead.customerId,
    type: "approval",
    evidence: "Customer approved recovered exact scope",
    amountCents: 0,
    independent: false,
    mode: "live",
    externalId: "recovery-approval",
    verified: true,
  });
  const directory = await mkdtemp(join(tmpdir(), "company-recovery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const company = new Company(store, {
    outputDirectory: directory,
    adapter: () => {
      throw new Error("Recovery must not rerun a provider");
    },
  });
  await company.finalize(recovered);
  const finished = store.job(job.id),
    fulfillment = finished.output?.fulfillment as {
      artifacts: Array<{ path: string }>;
    };
  assert.equal(finished.status, "completed");
  assert.equal(finished.costCents, 4);
  assert.equal(fulfillment.artifacts.length, 2);
  assert.match(
    await readFile(fulfillment.artifacts[0]!.path, "utf8"),
    /Format JSON/,
  );
});

test("agent-only crash receipt recovers exactly one matching existing session", async (t) => {
  const { store, job } = setup(t, "agent"),
    provider = transport();
  await reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher });
  assert.equal(store.job(job.id).externalSessionId, sessionId);
  assert.equal(store.job(job.id).costCents, 4);
  assert.equal(
    provider.calls.filter((c) => c.url.includes("/sessions?")).length,
    1,
  );
});

test("missing, multiple, paginated and running attempts retain the full reservation", async (t) => {
  for (const variant of [
    "zero",
    "multiple",
    "paginated",
    "running",
    "idle-input",
  ] as const) {
    const { store, job } = setup(t, "agent");
    const provider = transport(
      variant === "zero"
        ? { sessions: [] }
        : variant === "multiple"
          ? {
              sessions: [
                session(),
                session({ id: "ses_01ARZ3NDEKTSV4RRFFQ69G5FAW" }),
              ],
            }
          : variant === "paginated"
            ? { hasMore: true }
            : {
                session: {
                  status: variant === "running" ? "running" : "idle",
                  stop_reason: variant === "running" ? null : "awaiting_input",
                },
              },
    );
    await assert.rejects(
      reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher }),
      /ambiguous|not settled/,
    );
    unresolved(store, job.id);
    assert.equal(
      provider.calls.some((c) => c.url.includes("/spend")),
      false,
    );
  }
});

test("untrusted output provider IDs and conflicting durable receipts cannot release budget", async (t) => {
  const { store, job } = setup(t, "none"),
    provider = transport();
  const untrusted = store.job(job.id);
  untrusted.output = {
    _naive: { agentId, sessionId },
    _recoveryResultValid: true,
  };
  store.saveJob(untrusted);
  await assert.rejects(
    reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher }),
    /durable/,
  );
  unresolved(store, job.id);
  assert.equal(provider.calls.length, 0);
  const other = setup(t);
  other.store.event("provider_agent_created", {
    jobId: other.job.id,
    agentId: "agt_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    idempotencyKey: taskKey,
  });
  await assert.rejects(
    reconcileJob(other.store, other.job.id, "offline-key", {
      fetch: provider.fetcher,
    }),
    /Conflicting/,
  );
  unresolved(other.store, other.job.id);
});

test("session-agent, task-key, session identity and billing-agent mismatches retain reservations", async (t) => {
  for (const change of [
    { agent_id: "agt_01ARZ3NDEKTSV4RRFFQ69G5FAW" },
    { metadata: { client_task_key: "other-task" } },
    { id: "ses_01ARZ3NDEKTSV4RRFFQ69G5FAW" },
  ]) {
    const { store, job } = setup(t),
      provider = transport({ session: change });
    await assert.rejects(
      reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher }),
      /does not match/,
    );
    unresolved(store, job.id);
  }
  const { store, job } = setup(t),
    provider = transport({
      spend: { agent_id: "agt_01ARZ3NDEKTSV4RRFFQ69G5FAW" },
    });
  await assert.rejects(
    reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher }),
    /metering/,
  );
  unresolved(store, job.id);
});

test("failed, cancelled and malformed output cannot forge a controller recovery marker", async (t) => {
  for (const change of [
    { status: "failed" },
    { status: "cancelled" },
    {
      structured_output: {
        ...document,
        status: "failed",
        output: { _recoveryResultValid: true, recoveryValidated: true },
      },
    },
    { structured_output: { ...document, output: ["invalid"] } },
    { structured_output: { ...document, artifacts: [{}] } },
    { structured_output: null },
  ]) {
    const { store, job } = setup(t),
      provider = transport({ session: change });
    await reconcileJob(store, job.id, "offline-key", {
      fetch: provider.fetcher,
    });
    const recovered = store.job(job.id);
    assert.equal(recovered.costCents, 4);
    assert.equal(recovered.reservationCents, 0);
    assert.equal(recovered.recoveryValidated, false);
    assert.equal(recovered.output?._recoveryResultValid, false);
    assert.equal(recovered.output?.original, "controller output");
    const company = new Company(store, {
      adapter: () => {
        throw new Error("finalize must not call a provider");
      },
    });
    await assert.rejects(
      company.finalize(recovered),
      /not a validated normal completion/,
    );
  }
});

test("invented artifact claims fail recovery while actual published session files are verified", async (t) => {
  for (const exists of [false, true]) {
    const { store, job } = setup(t),
      provider = transport({
        file: exists,
        session: {
          structured_output: {
            ...document,
            artifacts: [{ name: "proof", fileId }],
          },
        },
      });
    await reconcileJob(store, job.id, "offline-key", {
      fetch: provider.fetcher,
    });
    const recovered = store.job(job.id);
    assert.equal(recovered.recoveryValidated, exists);
    assert.equal(recovered.costCents, 4);
    assert.equal(
      (recovered.output?._naive as any).verifiedFiles.length,
      exists ? 1 : 0,
    );
  }
});

test("official parser failures, unavailable billing and uncovered billing periods retain budget", async (t) => {
  for (const options of [
    { badWire: true },
    { billingError: true },
    { spend: { period_start: "2026-11-08T00:00:00.000Z" } },
    { spend: { spent_micro_usd: 1 } },
    { spend: { spent_micro_usd: -1 } },
  ]) {
    const { store, job } = setup(t),
      provider = transport(options);
    await assert.rejects(
      reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher }),
    );
    unresolved(store, job.id);
  }
});

test("metered overrun settles actual cost and disables further live execution", async (t) => {
  const { store, job } = setup(t),
    provider = transport({ spend: { spent_micro_usd: 1_000_001 } });
  await reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher });
  assert.equal(store.job(job.id).costCents, 101);
  assert.equal(store.job(job.id).reservationCents, 0);
  assert.equal(store.policy().liveAuthorized, false);
  assert.equal(
    store.events().filter((e) => e.kind === "reconciliation_budget_overrun")
      .length,
    1,
  );
  await assert.rejects(
    reconcileJob(store, job.id, "offline-key", { fetch: provider.fetcher }),
    /unresolved live reservation/,
  );
});
