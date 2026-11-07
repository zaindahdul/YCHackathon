import assert from "node:assert/strict";
import { NaiveAdapter } from "../src/adapters/naive.js";
const now = "2026-11-07T22:00:00.000Z";
const task = {
  kind: "strategy" as const,
  instructions: "Review evidence.",
  context: { facts: [] },
  maxCostCents: 100,
};
const document = {
  status: "completed",
  summary: "No paid evidence yet.",
  output: { decision: "continue-small" },
  artifacts: [],
};
function session(extra: Record<string, unknown> = {}) {
  return {
    id: "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    object: "session",
    agent_id: "agt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
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
    metadata: {},
    started_at: now,
    ended_at: null,
    created_at: now,
    ...extra,
  };
}
function transport(
  options: {
    unknownCost?: boolean;
    doc?: unknown;
    running?: boolean;
    file?: boolean;
  } = {},
) {
  const calls: Array<{ url: string; init: any }> = [];
  let agent: any;
  let polls = 0;
  const fetcher: any = async (input: any, init: any) => {
    const url = String(input);
    calls.push({ url, init });
    let value: any;
    if (url.endsWith("/agents") && init.method === "POST") {
      const b = JSON.parse(init.body);
      agent = {
        ...b,
        id: "agt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        object: "agent",
        name: b.name,
        harness: "pi",
        window: "immediate",
        system: b.system,
        mcp_servers: [],
        skills: [],
        multiagent: false,
        output_schema: null,
        structured_output_required: false,
        description: null,
        metadata: {},
        current_version: 1,
        created_at: now,
      };
      value = agent;
    } else if (url.endsWith("/sessions") && init.method === "POST")
      value = session({
        status: options.running ? "running" : "idle",
        structured_output: options.doc === undefined ? document : options.doc,
      });
    else if (url.endsWith("/sessions/ses_01ARZ3NDEKTSV4RRFFQ69G5FAV/cancel"))
      value = session({ status: "cancelled", stop_reason: "interrupted" });
    else if (url.endsWith("/sessions/ses_01ARZ3NDEKTSV4RRFFQ69G5FAV")) {
      polls++;
      value = session({
        status: options.running ? "running" : "idle",
        structured_output: options.doc === undefined ? document : options.doc,
      });
    } else if (url.includes("/agents/agt_01ARZ3NDEKTSV4RRFFQ69G5FAV/computer"))
      value = null;
    else if (url.includes("/agents/agt_01ARZ3NDEKTSV4RRFFQ69G5FAV/spend")) {
      if (options.unknownCost) throw new Error("billing unavailable");
      value = {
        agent_id: "agt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        period: "day",
        period_start: now,
        spent_micro_usd: 34567,
        by_component: { model: 34567 },
      };
    } else if (url.includes("/files?"))
      value = {
        data: options.file
          ? [
              {
                id: "fil_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                object: "file",
                name: "proof.txt",
                content_type: "text/plain",
                size_bytes: 4,
                scope: "published",
                session_id: "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV",
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
    else if (url.endsWith("/files/fil_01ARZ3NDEKTSV4RRFFQ69G5FAV/url"))
      value = {
        object: "file_url",
        url: "https://files.example.test/proof",
        expires_at: now,
      };
    else throw new Error("unexpected request " + url);
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    fetcher,
    calls,
    get agent() {
      return agent;
    },
    get polls() {
      return polls;
    },
  };
}
async function main() {
  let count = 0;
  const missing = await new NaiveAdapter({
    apiKey: "",
    fetch: (async () => {
      count++;
      throw Error("network");
    }) as any,
  }).run(task);
  assert.equal(count, 0);
  assert.equal(missing.status, "blocked");
  assert.throws(
    () => new NaiveAdapter({ apiKey: "test", allowedTools: ["browser"] }),
    /allowlist/,
  );
  const one = transport();
  const ok = await new NaiveAdapter({ apiKey: "test", fetch: one.fetcher }).run(
    task,
  );
  assert.equal(ok.status, "completed");
  assert.equal(ok.costKnown, true);
  assert.equal(ok.costCents, 4);
  assert.equal(one.agent.handoffs, false);
  assert.equal(one.agent.tools.default_config.permission, "deny");
  assert.equal(one.agent.budget.max_task_micro_usd, 1_000_000);
  const billed = transport({ unknownCost: true });
  const unknown = await new NaiveAdapter({
    apiKey: "test",
    fetch: billed.fetcher,
  }).run(task);
  assert.equal(unknown.status, "blocked");
  assert.equal(unknown.costKnown, false);
  assert.equal(unknown.costCents, 0);
  const noDoc = transport({ doc: null });
  const noOutput = await new NaiveAdapter({
    apiKey: "test",
    fetch: noDoc.fetcher,
  }).run(task);
  assert.equal(noOutput.status, "failed");
  const noArtifact = transport();
  const proposal = await new NaiveAdapter({
    apiKey: "test",
    fetch: noArtifact.fetcher,
  }).run({ ...task, kind: "fulfill" });
  assert.equal(proposal.status, "blocked");
  assert.equal(proposal.artifacts.length, 0);
  const fake = transport({
    doc: {
      ...document,
      artifacts: [{ name: "fake", fileId: "fil_01ARZ3NDEKTSV4RRFFQ69G5FAV" }],
    },
  });
  const rejected = await new NaiveAdapter({
    apiKey: "test",
    fetch: fake.fetcher,
  }).run({ ...task, kind: "fulfill" });
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.artifacts.length, 0);
  const actual = transport({
    file: true,
    doc: {
      ...document,
      artifacts: [{ name: "proof", fileId: "fil_01ARZ3NDEKTSV4RRFFQ69G5FAV" }],
    },
  });
  const proof = await new NaiveAdapter({
    apiKey: "test",
    fetch: actual.fetcher,
  }).run({ ...task, kind: "fulfill" });
  assert.equal(proof.status, "completed");
  assert.equal(proof.artifacts[0]?.name, "proof.txt");
  const timeout = transport({ running: true });
  const stopped = await new NaiveAdapter({
    apiKey: "test",
    fetch: timeout.fetcher,
    timeoutMs: 100,
  }).run(task);
  assert.notEqual(stopped.status, "completed");
  assert(
    timeout.calls.some((c) =>
      c.url.endsWith("/sessions/ses_01ARZ3NDEKTSV4RRFFQ69G5FAV/cancel"),
    ),
  );
  assert.equal(stopped.costKnown, true);
  console.log(
    "PASS: no-call credential gate; unsafe-tool refusal; typed SDK create/completion; metered cost; unknown-cost freeze; missing output; no artifact claim; invented artifact rejection; verified artifact; timeout cancellation.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
