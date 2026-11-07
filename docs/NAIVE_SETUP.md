# Naïve runtime setup and verified integration boundary

Checked November 7, 2026 against the published `@usenaive-sdk/managed-agents` **0.12.3** package types and current official documentation. The package is ESM and requires Node 20+; this repository targets Node 24. Its historical API hostname is still `https://api.vetta.sh`. No authenticated call, paid session, customer message or deployment was performed for this implementation.

## What is implemented

`src/adapters/naive.ts` exports `NaiveAdapter`, `AgentTask`, `AgentResult` and `AgentAdapter`. Constructing the adapter makes no network call. A task with a missing key, nonpositive/noninteger budget or invalid instructions is blocked before provider execution.

The adapter uses these published SDK methods:

1. `agents.create`: creates a fresh task-scoped worker, `handoffs: false`, default-deny tools and day/task caps.
2. `sessions.create`: starts one paid task with the same session cap, a required output schema and a stable idempotency key for that create.
3. `sessions.get`: bounded polling until the provider reaches a settled state. Merely creating a session is never reported as completion.
4. `sessions.cancel`: cancels work on a deadline/failure if it is still running; races to a terminal state are checked by reading it back.
5. `files.list`: verifies each claimed artifact is a nonempty **published** file from the actual session, with a provider hash. Invented URLs/file IDs are refused. Pagination is explicit and bounded.
6. `files.url`: gets a temporary read URL for those verified provider files. Links are bearer access; do not publish them in Git or a public log.
7. `agents.computer` / `computers.pause`: pauses the task worker's computer where one exists.
8. `agents.spend`: records provider-reported metering, including the agent's computer cost, rather than guessing from token usage.

The adapter requires a valid structured document and a normal ending (`end_turn` or terminal `completed`). Waiting on approval/input, budget pauses, failures and missing structure remain blocked/failed with their actual reason. For `fulfill`, a model's “completed” claim without an actual verified published artifact becomes **blocked**. Text or generated source in `output` can be a useful proposal, but the company's deterministic executor must materialize and check it before marking a customer deliverable complete. Provider file existence also does not prove artifact quality, rights, deployability or customer receipt.

## Credentials and account gates

Create an organization-scoped Naïve key in the organizer-provided account and keep it in a local ignored environment file or environment variable. The company CLI passes `NAIVE_API_KEY` into the adapter; never put the key into task instructions, task context, a customer URL, logs or Git. `baseUrl`, model and tool permissions are trusted operator configuration, not model-selected task data.

A key alone is insufficient: the organization needs an active plan, usable credits, an available model and permission for the operations enabled. Sponsor credits are not evidence those gates are active. The adapter defaults to the documented `vetta/auto`; an explicitly selected model must exist in the live model catalog.

Before live work, configure the company's overall authorized budget and channels. The application's gate must reserve budget **before** calling this adapter. Zero budget is intentional while authorization or access is missing. No API key or cash spend was provisioned here.

Minimal programmatic usage after those gates are satisfied:

```ts
import { NaiveAdapter } from './src/adapters/naive.js';

const worker = new NaiveAdapter({
  apiKey: process.env.NAIVE_API_KEY ?? '',
  model: process.env.NAIVE_MODEL ?? 'vetta/auto',
  timeoutMs: 120_000,
  allowedTools: [], // explicit operator allowlist; [] is the default
  onSessionCreated: async (receipt) => {
    // Durably attach this receipt to the reserved attempt before continuing.
    // The application supplies its own order/attempt store here.
  },
});
```

This example intentionally does not invoke a funded task. Use the repository's operator budget gate and persist the attempt first, rather than copying an example that silently spends money.

## Cost and restart correctness

Amounts on the wire are integer micro-USD: **one cent = 10,000 micro-USD**. Both `cap_micro_usd` and `max_task_micro_usd`, plus the session `budget_micro_usd`, derive from `AgentTask.maxCostCents`. A fresh worker per task prevents unrelated earlier tasks from contaminating its spend total.

`AgentResult.costKnown` is required. If it is true, `costCents` is provider-reported agent spend rounded **up** to a cent. The exact amount and source are retained in `output._naive.meteredMicroUsd`. This is current provider metering, not an independently audited invoice or a prediction of future price.

If a session create is ambiguous, cancellation/computer cleanup fails, or the meter cannot be read, the result is blocked with `costKnown: false` and `costCents: 0`. **Zero in this state does not mean free.** Keep the full reservation unresolved, stop new funded work as appropriate, and reconcile the receipt/provider ledger before release. A model must never decide an unknown bill is zero.

The optional `onSessionCreated` callback persists `{agentId, sessionId, idempotencyKey}` immediately after create. An interrupted application must reconcile running attempts before issuing replacements. A process crash before the receipt is saved or an ambiguous create cannot be made exactly-once by a prompt; the operator must retain the reservation and investigate the known create/agent metadata. The adapter does not automatically retry paid creates with a new key. It retains task workers as audit records rather than deleting agents and potentially related schedules.

## Tool permissions and what remains unavailable

Default permission is `deny`. The constructor accepts only these explicit read/artifact tool names: `web_search`, `web_fetch`, `read`, `ls`, `find`, `view_image`, `write`, `edit`, `publish_file`. Other names are refused. Missing authorization does not become permission because a task asks the model to “do whatever it takes.”

Generic `bash`, browser, mobile, apps/deployment and communication/payment tools are not supported by this adapter's allowlist. A shell or browser can perform external writes even when an email tool is denied, so a broad tool grant would undermine a claim that communication is controlled. Add narrow, policy-enforced server executors when those integrations are needed; don't loosen the model prompt and call it a boundary. Public-source fetching remains data collection, not authority to reuse assets or contact a person.

This means some live fulfillment jobs will correctly block until the company's deterministic fulfillment adapter or a genuinely governed provider executor is available. No native phone testing, media generation, publication, email send, charge, refund or deployment is implied by installing this SDK adapter.

Native team docs and the onboarding manifest have previously conflicted on availability. This integration uses sequential solo workers, so a native multiagent-team flag is not required. Mobile/browser capabilities also have account and runtime restrictions; no real-device access was tested.

## Verification performed

The implementation was exercised offline through the **actual published SDK parser/client** with a fake fetch transport: missing-key no-call behavior; forbidden broad-tool refusal; required structured output and normal completion; metered spend; unknown-meter budget freeze; no-artifact fulfillment refusal; invented artifact rejection; verified session-published file handling; and deadline cancellation. These are integration contract checks, not a successful live Naïve run.

Before claiming “connected,” perform a deliberately small authorized live task and record its agent/session IDs, real normal ending, provider spend and artifact evidence. Separately prove any outgoing channel or customer delivery integration. Never report a fixture/demo run as a customer, revenue or live account test.

## Official sources

- [TypeScript SDK](https://usenaive.ai/docs/sdk/typescript)
- [Agents and agent spend](https://usenaive.ai/docs/sdk/agents)
- [Session create, state, output schema and cancellation](https://usenaive.ai/docs/sdk/sessions)
- [Streaming and end-of-turn semantics](https://usenaive.ai/docs/sdk/streaming)
- [Files, provenance, pagination and read URLs](https://usenaive.ai/docs/sdk/files)
- [Tool governance](https://usenaive.ai/docs/capabilities/tools)
- [Account quickstart](https://usenaive.ai/docs/quickstart)

The live documentation's Markdown endpoints were fetched read-only when browser extraction failed; the installed 0.12.3 declaration file was also inspected. Documentation and type verification are distinct from authenticated capability verification.
