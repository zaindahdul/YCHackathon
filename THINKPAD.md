# Thinkpad — Build the autonomous multi-experiment company and consolidate main
<!-- pad:v1 -->

<!-- Edit this file by hand freely. `pad` reads and writes it; it never reformats
     prose sections. Task lines must keep the `- [ ] T1 · title` shape. -->

## Goal

Build a runnable TypeScript company runtime seeded with four concrete PMF experiments, durable evidence/jobs/budgets, autonomous portfolio decisions and bounded expansion, actual artifact fulfillment, honest simulation vs live operation, and a verified Naïve adapter. Preserve both collaborators’ histories and the recording/research, archive superseded plans, publish a clean main branch, and attempt to make main the remote default. Verify behavior with meaningful automated checks and independent review. Live customer acquisition/paid runs require the pending budget/channel authorization and real provider credentials; no mock, fixture or configured adapter is evidence of a live autonomous company.

## Constraints
- **Max concurrency: 3**

## Decisions

- One shared company engine, four offers, two active experiments at a time by default.
- Simulation fixtures are isolated from live evidence and payments. Native Naïve team availability is not assumed.
- Lead owns branches, dependencies, database contract and integration. SDK and fulfillment modules have disjoint worker ownership.

## Open questions

- Await owner’s global budget and customer-contact scope; effective live spend and sending remain disabled.
- Need a real NAIVE_API_KEY and active account/credits for the live smoke check; never request secrets in chat.
- GitHub viewer permission is WRITE; changing default branch may require repository owner rights.

## Tasks

- [x] T1 · Integrate durable company scheduler, evidence and portfolio expansion
      files: src/domain.ts, src/store.ts, src/company.ts, src/portfolio.ts, src/cli.ts, src/server.ts, src/payments.ts, src/reconcile.ts, package.json, tsconfig.json, tests/company.test.ts, tests/server.test.ts, tests/payments.test.ts, tests/lifecycle.test.ts
      accept: npm run check
- [x] T2 · Implement and verify the Naive execution adapter
      files: src/adapters/naive.ts, docs/NAIVE_SETUP.md, tests/naive.test.ts, tests/reconcile.test.ts
      accept: npx tsx --test tests/naive.test.ts tests/reconcile.test.ts
- [x] T3 · Produce verified artifacts from authorized inputs
      files: src/fulfillment.ts, tests/fulfillment.test.ts
      accept: npx tsx --test tests/fulfillment.test.ts
- [x] T4 · Seed four experiments and document the operating contract
      files: config/experiments.seed.json, docs/OPERATING_MODEL.md, docs/ARCHITECTURE.md, ideas.md, README.md, scripts/verify_deliverables.py
      accept: python3 scripts/verify_deliverables.py all
- [ ] T5 · Review, repair, consolidate and verify main delivery
      files: docs/REVIEW.md, docs/DELIVERY.md
      accept: npm run build && npm run format:check
      deps: T1, T2, T3, T4
## Log

- 2026-11-07 · thinkpad created
- 2026-11-07 · set T1 · files=src/domain.ts, src/store.ts, src/company.ts, src/portfolio.ts, src/cli.ts, src/server.ts, src/payments.ts, src/reconcile.ts, package.json, tsconfig.json, tests/company.test.ts, tests/server.test.ts, tests/payments.test.ts, tests/lifecycle.test.ts
- 2026-11-07 · set T2 · files=src/adapters/naive.ts, docs/NAIVE_SETUP.md, tests/naive.test.ts, tests/reconcile.test.ts, accept
- 2026-11-07 · set T4 · files=config/experiments.seed.json, docs/OPERATING_MODEL.md, docs/ARCHITECTURE.md, ideas.md, README.md, scripts/verify_deliverables.py, accept
- 2026-11-07 · set T5 · accept
- 2026-11-07 · Implemented headless four-offer runtime, secure immutable customer orders, payment/transfer/feedback, bounded evidence-driven expansion, exact-order qualification, real video/microtool artifacts and provider reconciliation. 77 local/offline tests pass; demo produced real HTML with zero live calls. No provider keys, authorized spend/contact scope or public deployment; live-company evidence unavailable.
- 2026-11-07 · done T1 · Integrate durable company scheduler, evidence and portfolio expansion
- 2026-11-07 · done T2 · Implement and verify the Naive execution adapter
- 2026-11-07 · done T3 · Produce verified artifacts from authorized inputs
- 2026-11-07 · done T4 · Seed four experiments and document the operating contract
