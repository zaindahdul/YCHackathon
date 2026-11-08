# Independent runtime review

Reviewed November 7, 2026 against the implemented TypeScript/Node 24 runtime, not only its operating plan. Scope: SQLite budgets/state, portfolio allocation and expansion, Company execution, customer/operator APIs, Stripe receipts, the published Naïve SDK adapter, deterministic fulfillment and interrupted-attempt recovery. Review and reproduction used local HTTP, memory databases, fake provider transports and actual local files. No live provider calls, spending or customer outreach occurred.

## Final disposition

**No unresolved material findings remain from this review of the bounded runtime.** The lead repaired the findings below, and independent local rechecks verified the relevant boundaries and customer journey. Current documentation accurately describes the implemented capabilities and limitations.

This is approval of the reviewed local software behavior, **not evidence of a fully autonomous live company**. No authenticated live Naïve task, real customer acquisition, live payment, public deployment or phone execution was demonstrated. GitHub delivery and the remote default branch are verified separately by the lead; this report does not certify those settings.

## Findings and repair evidence

| Initial severity | Finding | Reviewed repair and evidence |
|---|---|---|
| P1 | An earlier customer approval could authorize a different job; payment and delivery were joined only by customer. | Immutable order hashes snapshot inputs/offer/price. Commercial signals bind order, scope and buyer. Independent repro refused old approval on a new scope; tests distinguish deliveries from different orders. |
| P1 | Simulation-created experiments and decisions could survive a switch to live. | A database with operational/evidence history cannot change mode; fresh live and simulation databases are required. Independent mode-switch repro now refuses the transition. |
| P1 | Customer intake did not automatically dispatch fulfillment or hand off generated artifacts. | Exact approval enables cycle dispatch. Private order tokens isolate customers; checked files require exact approval and verified payment, or an explicit free pilot. Independent local journey completed real two-file transfer and order-linked metrics. |
| P2 | Zero-dollar receipts, refunds or another order's delivery could imply paid traction. | Metrics require positive net same-order payment and transfer, with independently qualified evidence. Free pilots and full refunds are excluded. Independent refund replay removed paid completion. |
| P2 | A response window expired from the oldest exposure. | Portfolio review waits from the newest qualifying exposure; regression covers old contacts mixed with recent contacts. |
| P2 | Job idempotency silently accepted changed payloads; missing API idempotency keys collapsed to `"undefined"`. | Immutable contracts conflict on changed key reuse; the API requires a bounded nonempty idempotency key. Replay and changed-payload cases are distinct. |
| P2 | Source-domain instructions were described more strongly than enforcement. | README/operating rules explicitly call this a returned-URL filter and worker instruction, not a hard network boundary. This limitation remains intentional and visible. |
| P2 | QA copied source paths after verifying a different byte snapshot. | QA writes the already-checked bytes. A deterministic source-mutation regression verifies the delivered bytes still match the report hash. |
| P2 | A crash between payment insertion and intent mapping could strand refunds. | A verified checkout replay repairs the validated intent mapping before duplicate return. Independent injected missing-mapping/replay/refund check passed. |
| P2 | Repeated public orders created different independent buyer identities. | Canonical contact HMACs identify repeat contacts without sharing private order tokens. Qualification remains an explicit audited intervention for each order lead. Repeat buyers cannot multiply the buyer count. |
| P2 | Concurrent downloads could bypass the four-transfer limit and release capacity before completion. | Semaphore acquisition precedes filesystem awaits and capacity remains held through response finish/close. The concurrency regression admits four paused 8 MB responses and refuses the fifth; interrupted transfer is not delivery. |
| P2 | Qualification after feedback affected metrics but not strategy/expansion eligibility. | Metrics, scheduling and child admission share `Store.isIndependent()`. Independent recheck qualified two previously unqualified replies, then observed scheduled strategy and cited child admission. |
| P2 | Recovery could trust generated identifiers/markers, accept failed output or fail to freeze on cost overrun. | Reconciliation requires durable controller receipts, matching agent/session/task, settled state, covered billing and valid structured output. Recovery validity is a controller-owned field. Published file references are checked; overruns freeze live execution. Nine SDK-parser recovery tests passed offline. |
| P2 | Revoked capabilities, overrun results and reduced active limits were not consistently enforced. | Fulfillment/finalization check current capabilities; overrun output cannot apply discoveries/expansion/fulfillment. Reactivation respects slot capacity and pending customer obligations. Lifecycle regressions passed. |
| P2 | A no-call configuration block had no concrete retry path. | Audited `retry` atomically checks and requeues only blocked zero-cost jobs without reservations or provider attempts. Existing/ambiguous attempts require reconciliation. The transaction prevents stale retry writes from resetting running accounting. |

## Independent verification

The reviewer executed these focused checks against the repaired sources:

- Customer/payment suites: **15 passed**, including actual Stripe SDK raw-signature verification without network, duplicate/refund behavior, token isolation, secure uploads/path bounds, repeat-contact identity, feedback and download backpressure.
- Reconciliation suite: **9 passed**, using the actual published SDK parser with an offline transport. Tests cover durable receipt binding, ambiguity, invalid/failed documents, file claims, billing windows, overruns and finalization without new paid work.
- Lifecycle suite: **3 passed**, covering safe no-attempt retry, capability revocation and overrun output refusal.
- Independent memory-database reproductions: old-scope approval refusal, changed idempotency conflict, simulation/live barrier and zero-dollar traction exclusion all passed.
- Independent local customer journey: request → exact-scope approval → automatic fulfillment → fake checkout/provider callback → duplicate receipt → payment-gated transfer of both actual files → same-order metrics. A missing intent mapping was deliberately cleared and repaired by replay; full refund removed paid completion.
- Independent strategy/recovery check: two initially unqualified replies became eligible after audited qualification, scheduled a strategy worker and created its bounded child. A failed worker's spoofed recovery marker could not authorize finalization.

The lead owns the full integrated check/build/document verification and delivery record. Focused test totals above are not a count of live customers or proof of market demand.

## Remaining live gates and capability limits

- Configure actual Naïve account access/credits and obtain the owner's explicit budget, tool/channel scope and deadline. The shipped default is simulation, zero budget and no sending. An authorized small live task must establish real session, ending, spend and output evidence.
- Deploy reachable HTTPS customer intake and run the separate finite worker process. Local API tests are not a public service. No deployment or outbound distribution executor is connected; founders still obtain initial users and qualify independent buyers.
- Configure actual live Stripe checkout and signed webhooks, then verify real commercial terms, a genuine receipt and actual handoff. Fixture events and browser return URLs are not revenue. Transfer completion is not proof of use or satisfaction.
- Mobile QA remains disabled for public intake until a real governed collector is connected. Current QA only packages supplied receipts and local hashed evidence; it does not independently execute or replay a phone test.
- Video produces real silent source-media MP4s; captions, voiceover and autonomous product capture are absent. Microtools use three checked templates, not arbitrary generated applications.
- Source-domain filtering does not constrain all remote worker network access. Outbox entries remain drafts. Account/asset rights, new external channels and new execution capabilities require their own real authorization and implementation.
- The tracked contribution measure excludes unmetered local compute, founder time, payment-processing fees, tax and infrastructure costs. Early paid-delivery signals do not establish durable PMF.
