# Architecture and operator guide

Node 24+, TypeScript ESM, SQLite, the published Naïve SDK and Stripe SDK. `npm run check` exercises local behavior; no test requires a real provider key or contacts a live provider. Video integration tests require `ffmpeg` and `ffprobe`.

## Modules

| File | Responsibility |
|---|---|
| `src/domain.ts` | Experiment, immutable order, policy and evidence contracts |
| `src/store.ts` | SQLite transactions, reservations, idempotency, qualification, metrics and lease |
| `src/portfolio.ts` | Bounded allocation, rotation, later-response reactivation and child admission |
| `src/company.ts` | Cycles, approval/capability guards, proposal execution and artifact fulfillment |
| `src/adapters/naive.ts` | Official SDK sessions, structured output, provenance, cancellation and metering |
| `src/fulfillment.ts` | Real MP4 renderer and audited offline HTML templates; QA receipt packager |
| `src/payments.ts` | Hosted checkout, signed-event interpretation and order-bound refunds |
| `src/server.ts` | Customer tokens, secure uploads/downloads, feedback and separate owner API |
| `src/reconcile.ts` | Read-only provider recovery and settled billing for interrupted attempts |
| `src/cli.ts` | Initialize, configure, inspect, serve and run finite worker cycles |

SQLite uses WAL and `BEGIN IMMEDIATE` budget transactions. `serve` and the worker may share a database; only one worker holds its renewable execution lease. Do not run live/simulation against the same database. JSON records retain receipts and events for inspection. No cross-process durable message broker, hosted deployment or background supervisor is included.

## Customer API

Start `serve` separately from `run`, as shown in [README](../README.md). Public requests require live policy, authorization, `owned_intake`, an accepting supported experiment and a valid operating window. A configured server is not a publicly deployed service.

Example microtool request body:

```json
{
  "experimentId": "request-microtools",
  "name": "Customer name",
  "contact": "customer@example.com",
  "request": "Format JSON so I can inspect it",
  "consent": true,
  "assetRights": true,
  "input": {
    "template": "json-formatter",
    "acceptanceExamples": [
      {"input": "{\"a\":1}", "expected": "{\n  \"a\": 1\n}"}
    ]
  }
}
```

Send as JSON to `POST /api/requests`. The response returns `order` and a **private token for that order**. Keep it outside logs/Git. Subsequent requests use `Authorization: Bearer <order token>`; an owner token cannot substitute for a customer token and a customer token cannot access the owner API.

| Method and path | Meaning |
|---|---|
| `GET /api/orders/:id` | Safe order status, agreed price/hash and downloadable artifact indices |
| `POST /api/orders/:id/approve` | JSON `{"scopeHash":"the returned hash"}` approves this exact contract |
| `POST /api/orders/:id/checkout` | Creates hosted checkout after a checked artifact is ready; returns its URL |
| `GET /api/orders/:id/artifacts/:index` | Transfers one actual file after approval/payment (or approved zero-price pilot) |
| `POST /api/orders/:id/feedback` | JSON `{"text":"Actual feedback"}`; private, bounded to 2,000 characters, deduplicated |
| `POST /api/stripe/webhook` | Raw signed Stripe event; uses webhook signature rather than a customer token |
| `GET /health` | Public health and execution mode; no credentials or buyer data |

The API is JSON, with downloadable file responses. No customer web form, email notification or hosted storefront is included. The worker does not charge people automatically: the buyer chooses checkout. Payment events are accepted only for recorded checkout/order mappings and exact live commercial terms; changed event replay is refused. Stripe refunds are observed from signed receipts, not issued by this service.

For public video requests, send one to six `assets` objects at the top level: `{"contentType":"image/png","base64":"..."}` (also JPEG/WebP). Each is at most 1 MB; request body is bounded at 8.5 MB. Supported input fields include `durationSeconds` (5–30) and an `approvedFacts` string array. Each upload gets a private random folder. Public clients cannot provide filesystem paths. Actual decoding/playback is checked by the renderer. Operator-only local intake can reference approved assets below `data/assets`, including a supplied recording. Never expose source directories as static hosting.

Responses use bounded body/header/time limits. Downloads acquire a four-transfer semaphore before asynchronous file work, enforce realpath bounds and return attachment/nosniff/sandbox headers. All package responses must complete before a transfer receipt. This records server transfer, not human use. Rate limits are process-local; internet deployment still needs appropriate HTTPS routing and operational controls.

## Owner API and qualification

The separate `COMPANY_API_TOKEN` authorizes:

- `GET /api/status`, `GET /api/events`.
- `POST /api/leads`, `POST /api/jobs`, `POST /api/signals`.

`/api/jobs` requires a nonempty unique `idempotencyKey`; reusing it with changed inputs conflicts. Manual payment/refund/delivery claims from the owner API or CLI are unverified. Editing the local database is administrator control, not autonomous evidence.

Customer contacts are canonicalized and HMAC-deduplicated, but are not identity-verified. Use the lead ID from owner status/events and independently check the actual requester:

```sh
npm run company -- qualify --db data/live.sqlite --lead LEAD_ID --evidence 'How this independent customer was confirmed'
```

This qualification is logged as founder intervention. It applies to the exact order lead; another new order claiming the same contact does not inherit it. Stored feedback can become eligible evidence after qualification without inventing a replacement customer reply. Repeat contacts still count as one independent buyer.

## Budget, failures and recovery

`status` exposes the tracked ledger, jobs, experiments, metrics, decisions and drafts. A missing approval/capability/credential becomes a reasoned block. A crash during a running attempt preserves its reservation and halts new cycles.

After correcting a **no-attempt, zero-cost** configuration block:

```sh
npm run company -- retry --db data/live.sqlite --job JOB_ID
npm run company -- cycle --db data/live.sqlite
```

`retry` only requeues a blocked job with no reservation, known zero or unstarted cost, no provider session/agent receipt and no provider output identity. It audits the intervention. It refuses an ambiguous or already attempted provider job, even when recorded cost is zero. Guards still apply on the next execution.

For an interrupted paid attempt:

```sh
npm run company -- reconcile --db data/live.sqlite --job JOB_ID
npm run company -- finalize --db data/live.sqlite --job JOB_ID
```

Reconciliation makes read/cleanup calls for the existing agent/session; it never creates new model work. Durable receipts, session association/task key, settled state, spend identity and billing window must match. An ambiguous session list or invalid meter keeps the reservation. Known spend settles even for failed/malformed output, but that output cannot authorize finalization. Provider overrun disables live execution.

`finalize` requires a controller-validated normal result and reuses its recorded proposal. It checks current approval/capability/deadline and can regenerate the deterministic local deliverable without another paid task. Unverified provider-file claims are not approved recovered artifacts. Failed completed attempts require inspection/new explicitly scoped work; there is no blind paid retry loop.

Naïve timeout is bounded by the company cutoff, reserving cleanup time. Local render subprocesses are killed at deadline and cannot report late success. Provider cancellation/accounting may finish afterward; the unresolved reservation reflects uncertainty. The runtime does not promise remote cancellation is instantaneous.

## Verification boundary

Tests cover transactional budgets across database connections, isolation between modes, order/scope approval, qualification, exploration, evidence-based expansion, real rendering, template behavior, signed Stripe verification, customer token isolation, payment/download/refund paths, interrupted-provider reconciliation and safe retry. Offline provider-shaped events and fake transports are explicitly fixtures. See [independent review](REVIEW.md).

No fixture demonstrates a real customer, external publication, live charge, live Naïve account or native phone test. The source-domain setting filters result URLs, not all remote worker network traffic. No outbound sender is connected. The remaining live gates are recorded in [delivery](DELIVERY.md).
