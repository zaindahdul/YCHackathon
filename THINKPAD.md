# Thinkpad — Build the autonomous multi-experiment company and consolidate main
<!-- pad:v1 -->

<!-- Edit this file by hand freely. `pad` reads and writes it; it never reformats
     prose sections. Task lines must keep the `- [ ] T1 · title` shape. -->

## Goal

Build a runnable TypeScript company runtime seeded with four concrete PMF experiments, durable evidence/jobs/budgets, autonomous portfolio decisions and bounded expansion, actual artifact fulfillment, honest simulation vs live operation, and a verified Naïve adapter. Preserve both collaborators’ histories and the recording/research, archive superseded plans, publish a clean main branch, and attempt to make main the remote default. Verify behavior with meaningful automated checks and independent review. Live customer acquisition/paid runs require the pending budget/channel authorization and real provider credentials; no mock, fixture or configured adapter is evidence of a live autonomous company.

The current update integrates PR #4 (fc49da2) into main as a studio workspace, preserves the verified service runtime, validates the claimed public deployment read-only, repairs locally actionable integrity/access issues and updates current documentation. Acceptance includes both test suites/builds, real browser inspection of the integrated studio, independent review, preserved Git histories and clean pushed main. No deployment, live paid work, outreach or organization permission changes are authorized by this integration.

Current startup request: keep the studio running locally with a simple npm start entry point, safe ignored configuration and secret-free diagnostics; leave the repo clean and pushed. Discover the requested Slop integration; the term is pending clarification. No Slop executable/connector or Naïve credentials are available in this environment, so do not claim paid founders have started.

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
- [x] T5 · Review, repair, consolidate and verify main delivery
      files: docs/REVIEW.md, docs/DELIVERY.md
      accept: npm run build && npm run format:check
      deps: T1, T2, T3, T4
- [x] T6 · Integrate studio workspace while preserving service runtime and histories
      files: package.json, package-lock.json, studio/package.json, studio/tsconfig.json, studio/build.mjs, .gitignore
      accept: npm run check && npm run build
- [x] T7 · Repair studio concurrency storage analytics and publication boundaries
      files: studio/server/repo.ts, studio/server/db.ts, studio/server/local-db.ts, studio/server/routes.ts, studio/server/entry.ts, studio/server/pages.ts, studio/server/mcp.ts, studio/server/rules.ts, studio/sql/0004_integrity.sql, studio/test/integrity.test.ts, studio/test/http-security.test.ts, studio/test/mcp-fencing.test.ts, studio/test/app.test.ts
      accept: npm run studio:test
- [x] T8 · Make live configuration and founder execution authority explicit
      files: studio/crew/crew.ts, studio/naive.config.ts, studio/scripts/kickoff.ts, studio/scripts/kickoff-budget.ts, studio/scripts/fence-ceo.ts, studio/scripts/intervene.ts, studio/test/config.test.ts, studio/test/kickoff-budget.test.ts
      accept: npm run studio:typecheck && npm run studio:test
- [x] T9 · Digest latest studio direction and verify public local behavior
      files: README.md, ideas.md, docs/STUDIO_UPDATE.md, docs/STUDIO_REVIEW.md, docs/DELIVERY.md
      accept: python3 scripts/verify_deliverables.py all
- [x] T10 · Independently review repairs and deliver clean integrated main
      files: docs/STUDIO_REVIEW.md, docs/DELIVERY.md
      accept: npm run check && npm run build
      deps: T6, T7, T8, T9
- [x] T11 · Simplify startup configuration and verify running local studio
      files: package.json, studio/package.json, studio/scripts/env.ts, studio/scripts/doctor.ts, studio/.env.example, studio/server/dev.ts, studio/scripts/kickoff.ts, studio/scripts/fence-ceo.ts, studio/scripts/intervene.ts, studio/test/setup.test.ts, README.md, studio/README.md
      accept: npm run check && npm run build && npm run format:check
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
- 2026-11-07 · Published implementation 69fb2da to origin/main. Default-branch settings update returned HTTP404; viewerPermission WRITE, remote default remains master and requires owner/admin. Both collaborator and research histories retained. Final delivery script will require clean local main matching origin/main plus merge ancestry.
- 2026-11-07 · done T5 · Review, repair, consolidate and verify main delivery
- 2026-11-07 · Final independent review: no unresolved material findings in bounded runtime. pad finish --timeout 60 passed all five tasks with fresh acceptance checks; 77 behavior tests, build/format, 877 transcript segments and 82 Markdown references verified. Final remote clean-head check follows documentation push.
- 2026-11-07 · set T7 · files=studio/server/repo.ts, studio/server/db.ts, studio/server/local-db.ts, studio/server/routes.ts, studio/server/entry.ts, studio/server/pages.ts, studio/server/mcp.ts, studio/server/rules.ts, studio/sql/0004_integrity.sql, studio/test/integrity.test.ts, studio/test/http-security.test.ts, studio/test/mcp-fencing.test.ts, studio/test/app.test.ts
- 2026-11-07 · set T8 · files=studio/crew/crew.ts, studio/naive.config.ts, studio/scripts/kickoff.ts, studio/scripts/kickoff-budget.ts, studio/scripts/fence-ceo.ts, studio/scripts/intervene.ts, studio/test/config.test.ts, studio/test/kickoff-budget.test.ts
- 2026-11-07 · PR4 fc49da2 integrated as studio workspace. Public health/state/dashboard independently reachable, three products live but tiny telemetry includes founder QA; no independent demand/payment claim. Source repairs stay local/undeployed. Atomic store/publication/upload receipt boundaries; opaque product sandbox/private-capability bridge with real-browser save/reload/isolation; reviewer proved XML escape fixed and ES modules/private add-get work; local QA counters remain zero.
- 2026-11-07 · done T6 · Integrate studio workspace while preserving service runtime and histories
- 2026-11-07 · done T7 · Repair studio concurrency storage analytics and publication boundaries
- 2026-11-07 · done T8 · Make live configuration and founder execution authority explicit
- 2026-11-07 · done T9 · Digest latest studio direction and verify public local behavior
- 2026-11-07 · done T10 · Independently review repairs and deliver clean integrated main
- 2026-11-07 · Current integration acceptance finished: 77 service +73 studio tests (150), both builds/typechecks, formatting, audit0, preserved migration hashes, transcript/doc references. pad finish --timeout60 passed all10 tasks. Independent actual-browser XML/module/storage repairs verified; lead save/reload/separate-browser/mobile/desktop checked with QA counters0. Root kickoff without credentials/liveauthorization refused beforeproviderclient; no live modifications. Final Gitpush/clean-head verification next.
- 2026-11-07 · Published main integration1c32a24 plus master-ancestry90f005b. Created draft cofounder review PR5 https://github.com/zaindahdul/YCHackathon/pull/5 (main→master). Clean local/remote90f005b deliverycheckpassed; defaultmaster remains due priorWRITEsettingsblocker. FinaldoccommitwillupdatePRhead automatically; verifyfullHEAD match afterpush.
- 2026-11-07 · done T11 · Simplify startup configuration and verify running local studio
- 2026-11-07 · Startup cleanup complete locally: npmstart serving127.0.0.1:8790, npmdoctor reportsserverrunning/keyfalse/livefalse. Added literal ignored.env loading/exportpriority, secretfree diagnostics, prepared blank inactive studio/.env, removed cleanunusedPR3worktree. 154tests +builds/typechecks/format pass; independent4setuptests clear; padfinish all11passed. Real founder start blocked on absent Naivekey/budget; Slopdefinitionpending. No providerrequest/deploy/outreach performed.
