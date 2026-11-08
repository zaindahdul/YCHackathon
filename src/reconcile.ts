import { createClient } from "@usenaive-sdk/managed-agents";
import type { Store } from "./store.js";

export interface ReconcileOptions {
  /** Replace only the official client's HTTP transport for offline verification. */
  fetch?: typeof globalThis.fetch;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Resume accounting for an existing attempt. Never creates or retries model work. */
export async function reconcileJob(
  store: Store,
  jobId: string,
  apiKey: string,
  options: ReconcileOptions = {},
) {
  if (!apiKey.trim())
    throw new Error("NAIVE_API_KEY required for provider reconciliation");
  const job = store.job(jobId);
  if (
    job.mode !== "live" ||
    job.costCents !== null ||
    job.reservationCents <= 0
  )
    throw new Error("Only an unresolved live reservation can be reconciled");
  // Provider IDs must come from controller receipts, never generated output.
  const receipts = store
    .events()
    .filter(
      (e) =>
        ["provider_agent_created", "provider_session_created"].includes(
          e.kind,
        ) && e.data.jobId === jobId,
    )
    .map((e) => e.data);
  const receipt = receipts.at(-1);
  const agentId = typeof receipt?.agentId === "string" ? receipt.agentId : null;
  const taskKey =
    typeof receipt?.idempotencyKey === "string" ? receipt.idempotencyKey : null;
  if (!agentId || !taskKey)
    throw new Error(
      "No durable provider agent/task receipt; retain reservation and inspect provider audit records",
    );
  if (
    receipts.some((r) => r.agentId !== agentId || r.idempotencyKey !== taskKey)
  )
    throw new Error(
      "Conflicting provider attempt receipts; no reservation released",
    );
  const transport = options.fetch ?? globalThis.fetch;
  const client = createClient({
    apiKey,
    baseUrl: "https://api.vetta.sh",
    fetch: (input, init) => {
      const timeout = AbortSignal.timeout(15_000);
      return transport(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, timeout])
          : timeout,
      });
    },
  });
  const sessionReceipts = receipts.flatMap((r) =>
    typeof r.sessionId === "string" ? [r.sessionId] : [],
  );
  const knownIds = new Set([
    ...sessionReceipts,
    ...(job.externalSessionId ? [job.externalSessionId] : []),
  ]);
  if (knownIds.size > 1)
    throw new Error(
      "Conflicting provider session receipts; no reservation released",
    );
  let sessionId = [...knownIds][0];
  if (!sessionId) {
    const sessions = await client.sessions.list({
      agent_id: agentId,
      limit: 100,
    });
    const found = sessions.data.filter(
      (s) => s.agent_id === agentId && s.metadata?.client_task_key === taskKey,
    );
    if (sessions.has_more || found.length !== 1)
      throw new Error(
        "Session creation is still ambiguous; no reservation released",
      );
    sessionId = found[0]!.id;
  }
  const session = await client.sessions.get(sessionId);
  if (
    session.id !== sessionId ||
    session.agent_id !== agentId ||
    session.metadata?.client_task_key !== taskKey
  )
    throw new Error(
      "Provider session does not match the durable agent/task receipt; no reservation released",
    );
  if (
    !["completed", "failed", "cancelled"].includes(session.status) &&
    !(session.status === "idle" && session.stop_reason === "end_turn")
  )
    throw new Error(
      "Provider task is not settled; do not release reserved budget",
    );
  const computer = await client.agents.computer(agentId);
  if (computer && computer.agent_id !== agentId)
    throw new Error(
      "Provider computer does not belong to the recorded agent; reservation retained",
    );
  if (computer) await client.computers.pause(computer.id);
  const spend = await client.agents.spend(agentId, { by: "component" });
  if (
    spend.agent_id !== agentId ||
    !Number.isSafeInteger(spend.spent_micro_usd) ||
    spend.spent_micro_usd < 0 ||
    !Number.isSafeInteger(session.consumed_micro_usd) ||
    session.consumed_micro_usd < 0 ||
    spend.spent_micro_usd < session.consumed_micro_usd
  )
    throw new Error(
      "Provider returned invalid or inconsistent metering; reservation retained",
    );
  const sessionStart = Date.parse(session.started_at ?? session.created_at),
    periodStart = Date.parse(spend.period_start);
  if (
    !Number.isFinite(sessionStart) ||
    !Number.isFinite(periodStart) ||
    periodStart > sessionStart
  )
    throw new Error(
      "Provider billing window does not cover this attempt; reservation retained",
    );
  const document = session.structured_output;
  let validDocument =
    session.status !== "failed" &&
    session.status !== "cancelled" &&
    record(document) &&
    document.status === "completed" &&
    typeof document.summary === "string" &&
    document.summary.length <= 20_000 &&
    record(document.output) &&
    Array.isArray(document.artifacts) &&
    document.artifacts.length <= 50 &&
    document.artifacts.every(
      (a) =>
        record(a) && typeof a.name === "string" && typeof a.fileId === "string",
    );
  const verifiedFiles: Array<{
    id: string;
    name: string;
    sha256: string;
    sizeBytes: number;
  }> = [];
  // Match the runtime adapter: invented published-file references cannot restore
  // a normal completion. Local finalization still validates actual deliverables.
  if (
    validDocument &&
    record(document) &&
    Array.isArray(document.artifacts) &&
    document.artifacts.length
  ) {
    try {
      const files = new Map<
        string,
        { id: string; name: string; sha256: string; size_bytes: number }
      >();
      let after: string | undefined;
      for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
        const page = await client.files.list({
          session_id: session.id,
          scope: "published",
          limit: 100,
          after,
        });
        for (const file of page.data)
          if (
            file.scope === "published" &&
            file.session_id === session.id &&
            file.size_bytes > 0 &&
            file.sha256
          )
            files.set(file.id, file);
        if (!page.has_more) break;
        if (!page.next_cursor || pageNumber === 9)
          throw new Error("Incomplete bounded file listing");
        after = page.next_cursor;
      }
      for (const artifact of document.artifacts) {
        const file = files.get(
          String((artifact as Record<string, unknown>).fileId),
        );
        if (!file) throw new Error("Unverified published artifact");
        if (!verifiedFiles.some((f) => f.id === file.id))
          verifiedFiles.push({
            id: file.id,
            name: file.name,
            sha256: file.sha256,
            sizeBytes: file.size_bytes,
          });
      }
    } catch {
      validDocument = false;
      verifiedFiles.length = 0;
    }
  }
  const actualCost = Math.ceil(spend.spent_micro_usd / 10_000);
  if (actualCost > job.reservationCents) {
    store.setPolicy({ ...store.policy(), liveAuthorized: false });
    store.event("reconciliation_budget_overrun", {
      jobId,
      reserved: job.reservationCents,
      actual: actualCost,
    });
  }
  // Invalid/failed documents do not replace a prior controller result. Recovery
  // validity is a controller field, never a flag accepted from model output.
  const proposal =
    validDocument && record(document) && record(document.output)
      ? document.output
      : (job.output ?? {});
  job.output = {
    ...proposal,
    _recoveryResultValid: validDocument,
    _naive: {
      agentId,
      sessionId,
      meteredMicroUsd: spend.spent_micro_usd,
      costKnown: true,
      status: session.status,
      billingSource: "agents.spend reconciled",
      verifiedFiles,
    },
  };
  if (validDocument && record(document) && typeof document.summary === "string")
    job.summary = document.summary;
  job.recoveryValidated = validDocument;
  job.externalSessionId = sessionId;
  job.status = "blocked";
  job.reason = validDocument
    ? "Provider cost reconciled. Finalize existing validated output without a new paid run."
    : "Provider cost reconciled; failed or invalid output cannot be finalized. Inspect the existing attempt.";
  store.settle(job, actualCost);
  store.event("operator_provider_reconciliation", {
    jobId,
    agentId,
    sessionId,
    meteredMicroUsd: spend.spent_micro_usd,
    recoveryValidated: validDocument,
  });
}
