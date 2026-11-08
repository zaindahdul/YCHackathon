# Naïve SDK research for an autonomous fabrication company

> **Research context:** this file was written for the earlier CAD/merch proposals. [Fire Drill is the latest fresh recommendation](../archive/fresh-recommendation.md). SDK sessions, tool governance and evidence limits remain relevant; product-specific CAD/supplier recommendations are historical alternatives.

Verified against official documentation on November 7, 2026. These are documented capabilities, not a live account test. No package was installed, account accessed, credential used, or paid request made during this research.

## Availability conflict: do not depend on native teams

The repo's [hackathon rules](../../hackathon-rules.md) are the project source of truth. Rechecking the official [onboarding manifest](https://usenaive.ai/skill.md) on November 7 confirms it still lists multiagent teams, memory, outcomes/graders and the agent wallet as coming soon. Meanwhile, the detailed [team overview](https://usenaive.ai/docs/team/overview) explicitly describes teams as shipped. These official sources conflict; neither description establishes access in this team's organization.

The current manifest says the deployed `GET https://api.vetta.sh/v1/openapi.json` route table takes precedence over documentation. An unauthenticated read during this follow-up returned **HTTP 403**, so that route table did not resolve the discrepancy. No authenticated capability probe was authorized or performed. Even an advertised route would not prove this account can execute a team.

**Baseline: orchestrate sequential Naïve SDK sessions from the application and store handoff state in its own database.** Treat native coordinator/board orchestration below as an optional replacement only after an authenticated create → delegate/assign → result experiment succeeds in the actual hackathon organization. Do not spend the build window waiting for it. Native CAD is likewise a documented capability to test in the first-hour spike, not a capability already proven in this account.

## The discovery that changes the build

Naïve documents **`build_3d`**, which runs build123d CAD scripts in millimeters or Blender scripts in meters. CAD builds can publish STEP, STL and 3MF, render preview PNGs, and return solid validity, watertightness, bounding box and volume checks. First use installs the toolchain. A script failure returns an error the agent can repair. The separate `generate_3d_model` tool produces appearance-oriented meshes; it should not substitute for dimensioned CAD.

This means the hackathon can focus on operating a fabrication business rather than building a CAD execution platform. A valid/watertight model still needs process-specific manufacturability checks: wall thickness, clearances, material, printer envelope, orientation, supports and tolerances are your product rules. Geometry validity is not an engineering guarantee.

Source: [3D assets](https://usenaive.ai/docs/capabilities/3d).

## Install, authenticate, run

The official client is **TypeScript, ESM only**; there is no Python SDK. Use `npm i @usenaive-sdk/managed-agents`, set `"type": "module"`, and use `node16`/`nodenext` module settings if compiling with TypeScript. The current package replaces the older `@usenaive-sdk/vetta` name. The API host remains `https://api.vetta.sh`. Keep the client server-side.

```ts
import { createClient } from "@usenaive-sdk/managed-agents";

const naive = createClient({
  baseUrl: "https://api.vetta.sh",
  apiKey: process.env.NAIVE_API_KEY!,
});

const agent = await naive.agents.create({
  name: "fabrication-designer",
  model: "z-ai/glm-5.3-flash", // official example; check live model catalogue first
  system: "Design dimensioned parts, use build_3d, inspect checks and previews.",
  budget: {
    cap_micro_usd: 20_000_000,
    max_task_micro_usd: 2_000_000,
    period: "day",
  },
});

const session = await naive.sessions.create({
  agent_id: agent.id,
  message: "Design a 60 x 40 x 4 mm desk nameplate; export STEP and STL.",
});
for await (const event of naive.stream(session.id)) {
  // Persist event.seq and send selected progress to the customer UI.
  console.log(event.type);
}
```

These are documented API shapes, not executed application code. Creation alone does not configure the complete production tool policy. The SDK does not implement retries; paginated lists need explicit cursors. Use stable idempotency keys when retrying writes.

Sources: [TypeScript SDK](https://usenaive.ai/docs/sdk/typescript), [sessions](https://usenaive.ai/docs/sdk/sessions).

Optional CLI: `npm i -g @usenaive-sdk/cli`; then authenticate and inspect `naive whoami`, `naive plan show`, `naive credits show`, and `naive models list`. The generic quickstart requires an active plan and available prepaid credits. Confirm how hackathon credits satisfy those requirements with organizers; do not assume sponsorship automatically activated the account. Agents receive their own computer lazily when a tool needs one; a computer separately created through the API is not assigned to an agent.

Source: [Quickstart](https://usenaive.ai/docs/quickstart).

Programmatic access needs an organization-scoped `NAIVE_API_KEY`. Agent/session read and write scopes cover the initial run; add file, computer, webhook and billing-read scopes only for the operations implemented. Keys are returned once. `GET /v1/me` identifies the actual organization. External suppliers and payment systems retain their own account and authentication requirements.

Source: [Authentication](https://usenaive.ai/docs/api/authentication).

## Capabilities to use

| Business need | Documented primitive | Practical implication |
| --- | --- | --- |
| Autonomous work | Versioned agents and sessions | Each customer job can retain a run ID and exact configuration. |
| Durable execution | Runtime commits between turns and wakes from schedules, messages and tool results | Work can pause for a customer answer instead of holding your laptop process open. |
| Company team | Detailed docs describe coordinator config with `multiagent: { type: "coordinator", agents: [...], board: true }`; manifest says coming soon | Use application-managed sequential session handoffs until live account proof exists. |
| Artifact delivery | Organization-scoped Files | Publish CAD and previews, pass file IDs, and keep customer/job ownership in the application. |
| Repeat operations | `deployments.create`, `.run`, `.pause`, `.runs` | Schedule a bounded queue/status review. Cron intervals shorter than five minutes are refused. |
| Live evidence | Resumable sequence-numbered event stream | Show real tool actions and measured cost rather than fabricated agent activity. |
| Tools | Built-ins, connected apps and HTTPS MCP servers | Expose narrow application tools for quote, order, and supplier state changes. |

Sources: [Runtime](https://usenaive.ai/docs/concepts/runtime), [Files](https://usenaive.ai/docs/capabilities/files), [Deployments SDK](https://usenaive.ai/docs/sdk/deployments), [Tools](https://usenaive.ai/docs/capabilities/tools), [Streaming](https://usenaive.ai/docs/sdk/streaming).

**Conditional team reference, not an availability claim:** detailed docs configure a team by creating specialists, creating a coordinator, then calling `agents.update(coordinator.id, { expected_version: coordinator.current_version, multiagent: ... })`. Roster members use `agt_` IDs and version pins. `advisor` entries are documented as rejected at save. The board documentation says assigning an unblocked `todo` card starts its specialist; card-started sessions use the specialist's budget, whereas delegated member threads use the coordinator's. Only use this path after resolving the availability conflict through a live account experiment. Avoid having the application and coordinator both start the same stage.

Sources: [Coordinator](https://usenaive.ai/docs/team/coordinator), [Company board](https://usenaive.ai/docs/team/board).

## CAD API fallback

If the first agent cannot reliably invoke the built-in CAD tool, this documented SDK method runs a build directly on a separately managed computer:

```ts
const build = await naive.computers.build3d(computerId, {
  engine: "cad",
  name: "plate",
  script: "from build123d import *\nresult = Box(60, 40, 4)",
  export: ["step", "stl"],
  render: { views: ["iso", "top"] },
});
if (!build.ok) {
  // Show a design failure or request a bounded agent repair.
  console.error(build.error?.message, build.error?.line);
}
```

`build3d` resolves script errors with `ok: false`; handling only thrown errors misses these failures. This fallback is a different execution path and does not attach the separately created computer to an agent.

Source: [Computers SDK](https://usenaive.ai/docs/sdk/computers).

## Budgets and permissions

Agent budgets are required: period cap, per-task ceiling, and day/week/month reset. Wire amounts are integer micro-USD: one dollar equals 1,000,000. Calls are preflight checked against org balance and applicable caps; paused work can resume when its cap is raised. Inference caps are distinct from a supplier purchase limit: implement order amount/currency/vendor checks in your own purchase tool.

Source: [Budgets](https://usenaive.ai/docs/concepts/budgets).

Tool permission is `allow`, `ask` or `deny`. For an unattended demo, explicitly permit bounded read/design tools; leave payment and purchase steps dependent on the actual customer/order authorization. MCP configuration declares public HTTPS servers under `mcp_servers` and per-tool settings under `tools.configs`. Remote servers cannot point to localhost. Their auth is injected from the vault, not inline agent headers. Platform-hosted app MCP endpoints can also expose business tools.

Source: [Tools, connections & context](https://usenaive.ai/docs/capabilities/tools).

## Deployment and event delivery

Naïve supports hosted `frontend_only` or `fullstack` apps through `apps.create`, followed by `apps.deploy(id, files)` with a map of file paths to base64 content. Builds are asynchronous; poll deployment state and inspect the served URL. Fullstack apps have database support and can expose an MCP route. This is an available route, not a confirmed compatibility claim for a framework that has not been tested.

Source: [Apps SDK](https://usenaive.ai/docs/sdk/apps).

Signed webhooks can deliver session idle, completed messages and budget events to a public HTTPS receiver. Save the signing secret at create/rotate time; it is not readable later. Verify signatures and deduplicate event IDs before advancing an order. Retrying a delivery must not create a second purchase. Failed receivers can be automatically disabled, so inspect delivery logs.

Source: [Webhooks SDK](https://usenaive.ai/docs/sdk/webhooks).

## Recommended two-day architecture — proposal, not SDK fact

1. **Customer app and durable order ledger:** accept a brief, dimensions, logo authorization, quantity and deadline; own the authoritative quote, revision and payment state.
2. **Application-owned operations queue:** start a Naïve design session with `sessions.create`, persist its session ID and event cursor, verify its output, then start the QA/quote session with the approved artifact references. Persist each transition and use a stable idempotency key per order/revision/stage. Resume interrupted work from the ledger. The specialists are ordinary Naïve agents; this requires no native `multiagent` config, delegation tool or board.
3. **CAD specialist:** start with one parameterized low-risk QR-display product; treat other product families as later options, produce actual editable source plus STEP/STL and previews, then attempt bounded repair on invalid builds.
4. **QA/quoting specialist:** inspect deterministic dimensions and process rules, require missing measurements, and obtain a real supplier estimate. Use an explicitly labeled estimate until one exists.
5. **Fulfillment specialist:** after customer approval and confirmed payment/order authorization, submit via one supplier integration; otherwise prepare a complete handoff packet. An RFQ, accepted quote, placed order and shipped item are different states.
6. **Evidence view:** show original brief, revision, generated files, checks, supplier response, payment mode, tool events, actual spend and every human intervention.

The highest-value initial integration experiment is one brief → one real native CAD build → published files → recoverable session record. Prove that before building a large agent org or integrating several vendors. The SDK alone does not provide a manufacturing partner, physical stock, a printer, customer revenue or automatic proof of delivery. Those need separate implementation and evidence.

If native teams later pass the account probe, replace the queue's handoff mechanism with the documented coordinator/board without changing customer-visible order states. If CAD execution fails, retain the SDK-run business workflow and execute a bounded, parameterized CAD template in an application worker; disclose that execution path rather than pretending the native tool ran.

## First-hour account checks

- Verify organizer access, active plan/credits and current model IDs.
- Run a cheap SDK session and inspect its usage/events.
- Exercise one `build_3d` result with preview and downloadable CAD exports.
- Confirm actual tool permissions, sandbox availability and installed toolchain.
- Keep native teams off the critical path; optionally test them only after the sequential SDK journey works.
- Confirm one supplier, production process, shipping/pickup deadline and credentials.
- Record which checks were live, failed or unavailable. No live checks were performed for this research document.
