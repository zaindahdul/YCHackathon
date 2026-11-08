# Independent Launchpad verification — November 8, 2026

Inspected and tested `8d87f944cd6ebccce9975bcbffb568c263a36d5a` (PR #8, stacked on #7/#6) in a detached temporary worktree. Main’s source was not replaced. Results below are local/offline unless explicitly stated; no provider job, deployment, outbound message, purchase or real customer was involved.

## Automated results

| Command in project-2 | Actual result |
|---|---|
| `npm ci --ignore-scripts` | Exit0, 77 installed / 78 audited; install scripts intentionally skipped |
| `npm test` under Node24.15.0/npm11.12.1 | Exit0: 11 tests, 2 files (9 app +2 config) |
| `npm run typecheck` | Exit0 |
| `npm run build` | Exit0; app and deployment output produced |
| `npm audit --json` | Exit1: 2 critical +1 moderate package entries |
| Tracked worktree diff | No source changes |

Initial install shell used Node18 and printed engine warnings; test/typecheck/build used Node24 explicitly. The existing tests invoke in-process routes/MCP over PGlite with hand-authored kits, not an actual agent or browser. They establish a launch-kit regression baseline, not complete product quality or live operation.

The audit reports direct dev dependency Vitest3.2.7 with critical aggregate severity, transitive tinypool1.1.1 critical and @vitest/mocker3.2.7 moderate. npm recommends Vitest5.1.0 (major upgrade). No dependency change was made to the collaborator branch. These are test-tool findings, not proof of a production-server exploit. Review compatibility, update the lockfile and rerun affected tests/typecheck/build/audit before resolving.

## Actual browser and route checks by the lead

Used Playwright/Chromium against a local PGlite preview on loopback port18791, separate from the existing main studio. Submitted `Local QA Only`, `qa@example.invalid`, `https://example.com`, with listing and squad unchecked. No real address, customer or outbound sender was used.

- Form submission redirected to a private kit, and the writing state rendered. No producer was running: the copy still claimed it was reading the website and would email in about ten minutes. This needs a truthful queued/offline/failed state and recovery, not a permanent simulated progress message.
- A malformed manual fixture kit was rejected by minimum-length validation. After correcting the fixture, a ready kit was seeded explicitly through local MCP; this was **manual test data, not AI/agent output**.
- Ready kit reloaded correctly. Desktop1280×900 and mobile390×844 screenshots were actually inspected. Both were readable in the inspected viewport; mobile moved Launch now above the plan/posts. This is a partial visual check, not every page/state or keyboard/accessibility certification.
- Clicked X’s Copy button; it changed to `Copied`. Clipboard contents were not independently asserted. Desktop document width matched viewport1280; full-page/mobile overflow was not comprehensively tested.
- Private kit without its token returned404.
- **Privacy failure reproduced:** logged `LOCAL_QA_UNLISTED_REASONING_CANARY` as a decision on the unlisted fixture. Unauthenticated GET `/ops` contained it. Kit-token protection does not protect unlisted decision narratives.
- Ready kit copy said the founder was first in the squad even though they unchecked squad membership; review participation/status wording.
- Initial missing favicon produced404. Subsequent ready-kit console check had zero errors. This is minor compared with privacy and missing operations.

No Launch now action or external composer/email link was activated in browser verification. No real agent generated the kit. Live/report/boost browser journeys, publication, video and comment workflows remain unverified. The local form capture remains under ignored `output/playwright/`. Copies of the inspected ready-kit [desktop](verification/launchpad-kit-desktop.png) and [mobile](verification/launchpad-kit-mobile.png) screenshots are committed for review. They show manually seeded QA content, not a real customer/agent result, and should be regenerated for the final implementation.

## Material findings for the implementation owner

| Priority | Finding and source | Required repair/evidence |
|---|---|---|
| P1 | Reproduced unlisted decision exposure; `server/routes.ts` `/ops`, `server/pages.ts` reasoning/outreach rendering | Enforce listing/privacy for all related narratives/free text, including exact emails added by #8; regression with private canaries in every public surface |
| P1 | Raw send precedes `log_touch`; `crew/crew.ts` scout flow; other sender paths not covered by a global sender cap | Enforce configured approval/scope, cap and opt-out before side effects through the actual sender boundary; test retry/concurrency/unknown send outcomes |
| P1 | Run tokens not required for mutations; `server/mcp.ts` claim/save/report and `server/repo.ts` `holdsRun` ignores elapsed expiry | Fence all relevant mutations with current run authority; test expiry, concurrent takeover and stale work |
| P1 | Multi-query kit/link/launch/boost/report updates lack main studio’s transactional repairs | Fault injection and concurrent retries prove no partial publish or duplicate obligations |
| P1 | Loading copy claims active producer/email when none is running | Truthful persisted queue/running/failed state and user-visible retry/recovery; show actual producer completion separately |
| P1 | Founder-requested community matching, video cuts, draft approval, comment replies, company grounding and activation/retention are absent | Implement and verify the corresponding acceptance rows; existing fixture tests cannot stand in for them |
| P2 | Test dependency audit has critical/moderate advisories | Review/update compatible tooling and lockfile, rerun audit and behavioral checks; do not mislabel dev-tool findings as verified production compromise |
| P2 | `package.json` scout script targets missing `scripts/kickoff.ts` | Provide a real tested command or remove/correct the documented script; keep paid execution explicitly scoped |
| P2 | Boost “shared” means a composer redirect, not a published post | Rename metric or verify through permitted publication evidence; don't claim people posted based on clicks |
| P2 | Squad opt-in wording disagrees with unchecked selection | Test participant and nonparticipant kit copy and amplification semantics |

`test/app.test.ts` has a report test titled “publicly only when … listed,” but its submit helper defaults every launch to listed and no test supplies an unlisted one. That title overstates privacy coverage. Add adversarial unlisted cases rather than trusting its label. Existing public-mask checks only examine a few known email/token strings, not arbitrary private narrative.

## What the passing suite does cover

A basic invalid form, kit-token refusal, sequential claim refusal, supplied kit validation/link rendering, launch/squad intent path, click dedup/bot examples, sequential boost caps/opt-out, report length/HTML escaping, sequential touch log quotas and selected public masking examples. Config tests check names, positive declared budgets, existing tool names and browser action declarations. None demonstrates actual external enforcement or end-to-end provider execution.

Before claiming the product is good, use the [implementation matrix and complete journey checks](IMPLEMENTATION_ACCEPTANCE.md), add missing behavior tests, inspect final rendered states, obtain independent review and repair material findings. No final product acceptance is given here.
