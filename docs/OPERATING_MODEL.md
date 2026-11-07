# Operating model

This is the implemented contract for one company with multiple market experiments. The four seed hypotheses are in [ideas.md](../ideas.md); the code is a headless runtime. Offline tests and simulations are distinct from live account access, customers and PMF.

## Authority

The default policy is simulation, zero budget, no external sending and two active experiments. Seed budgets are proposed experiment caps. Only the operator can authorize live execution, set global funds, permit tools/channels/capabilities or change the deadline. Missing credentials or an unanswered authorization question do not grant authority.

`liveAuthorized`, a positive global/task/experiment budget and an unexpired `stopAt` are required before a funded live attempt. SQLite transactionally reserves funds before a provider call. Settled metered cost releases unused funds; unknown cost retains the full reservation and blocks further cycles. An observed overrun disables live execution and remains in the ledger. Naïve metering is recorded in micro-USD and rounded up for cent accounting.

Local compute, founder time, payment-processing fees, tax and infrastructure billing are not automatically metered. `contributionCents` is qualified payment receipts minus refunds minus tracked worker cost; it is not audited net profit. The model has no purchasing/refund or outbound-message tool. Customer-initiated checkout and signed Stripe webhooks are separate server executors.

## Customer work

1. An opted-in customer submits a supported request with input/asset rights. The public API refuses disabled capabilities, unsupported local paths and unconnected QA.
2. The server snapshots offer, price, inputs and customer request into a job with an immutable scope hash. The customer receives a private order token and approves that exact hash.
3. The worker automatically admits consented authorized leads and resumes orders blocked only for missing approval. It selects approved customer work without another manual dispatch step.
4. A Naïve worker supplies a structured proposal. Deterministic fulfillment checks the actual file: video uses authorized snapshots; microtools must pass supplied examples. Failed/unsupported work remains blocked rather than inventing a completed artifact.
5. When a checked artifact is ready, the buyer can initiate hosted checkout. A return URL is not payment. Only signed live Stripe receipts for the exact order, currency, price and scope enable a paid download. Zero-price pilots bypass checkout and remain unpaid.
6. All artifact responses must complete for an order transfer receipt. This proves server-side transfer completion, not publication, use, satisfaction or retention. Feedback is a separate order-authenticated receipt.

Revisions create a new scope/order. Current video exports are silent and facts are retained in a manifest; captions, voiceovers and autonomous product capture are absent. Microtools are CSV deduplication, JSON formatting or UTM building. QA can package a supplied collector receipt and hash-verified evidence, but cannot independently execute a device test; QA stays disabled in the default/example policy.

## Evidence

Simulation and live histories require separate databases once any lead, job, signal or decision exists. Commercial receipts bind an order and scope; one job's payment cannot complete another job's delivery. Provider event IDs and job idempotency keys reject changed replays. Refunds are cumulative and tied to previously recorded verified order payments.

Public contact identity is deduplicated by a stable HMAC of normalized contact. It is still an assertion, not verified identity. New requests start nonindependent. The operator uses `qualify --lead ... --evidence ...` after checking the actual customer; this is an audited founder intervention. Order-bound evidence inherits qualification only from that order's lead. A new order claiming an already qualified contact does not inherit qualification automatically.

Metrics count verified, independently qualified evidence in the current database mode. Unique buyers cannot be multiplied by repeated orders from the same canonical contact. Positive net payments and same-order transfer are necessary for paid completion; test payments, full refunds and free pilots do not qualify. The financial receipt remains recorded even before qualification, while portfolio demand metrics exclude unqualified buyers.

## Allocation and exploration

`reviewPortfolio` runs at each cycle, subject to deadline, authority, funds and unresolved accounting:

- Activate enabled candidates up to the configured slot limit, within uncommitted global funds.
- Rotate a scouted offer with no reply/approval/payment and no pending customer work when untested candidates remain. This is exploration, not a conclusion that a market failed.
- Pause an offer with no response after at least the configured number of independent qualified leads and a response window measured from the newest qualifying exposure. Default: five and thirty minutes. Customer obligations prevent this pause.
- Reactivate a paused offer with a later qualified reply, approval or payment, using free budget and, if needed, an idle exploratory slot. Do not evict an active customer obligation. Lowering the slot cap does not cancel existing jobs; new activation waits until capacity is available.
- Add up to half an offer's allocation from uncommitted funds when minimum independent paid buyers and paid completed orders are met, contribution is positive and no refunds are recorded. Default minima: two and two. This is early evidence, not statistical PMF.

Cycle capacity reserves `ceil(maxTasksPerCycle × explorationShare)` slots for strategy/scouting when available, while retaining at least one customer slot. With only one slot, waiting customers take precedence. Unused slots are backfilled; strategy precedes scouting. Default share 25% becomes one exploratory slot out of a two-task cycle because jobs are indivisible. Old exploration jobs from paused offers do not execute.

Provider sessions are sequential, with a renewable SQLite worker lease. Scouting is deduplicated in fifteen-minute buckets. Strategy tasks are deduplicated by the digest of their evidence IDs. The CLI is finite (`--cycles`) and checks the stop deadline; local rendering has an enforced deadline. Provider cancellation/billing cleanup can finish after the work cutoff, and ambiguous results remain reserved.

## Expansion

Two verified independent customers must contribute replies, rejections or repeat-order evidence for the parent. A strategy worker receives the actual signals and proposes at most one candidate child. `admitExpansion` verifies the cited IDs, independent customer count, parent/schema, enabled fulfillment, permitted channels, uncommitted funds and total experiment cap (eight by default).

The candidate may change audience, offer, price and hypothesis inside those boundaries. It cannot overwrite an approved order, add a capability, raise the global cap, grant a channel or install generated controller code. Unsupported ideas require reviewed implementation before activation. Applying a child is a deterministic controller transition; model text alone has no authority.

## Acquisition boundary

Scouts may return actual public prospects with cited HTTPS sources. `allowedSourceDomains` filters accepted URLs and is passed in instructions; it does **not** enforce the worker's entire network access. Treat it as a result filter unless a constrained collector is added. Research does not create qualified exposure or permission to contact.

The shared outbox records drafts/blocked drafts only. There is no connected email, community publisher, cold-outreach sender or deployment executor. Customer intake, private approval/feedback and paid download are implemented server paths; initial distribution and independent-customer qualification currently require founders. Do not claim a fully autonomous live company until the missing account, channel, public-service and customer evidence exists.

See [architecture and recovery](ARCHITECTURE.md), [provider setup](NAIVE_SETUP.md), [independent review](REVIEW.md) and [delivery evidence](DELIVERY.md).
