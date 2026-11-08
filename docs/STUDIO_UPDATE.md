# Studio update — November 7, 2026

Source: [PR #4](https://github.com/zaindahdul/YCHackathon/pull/4), commit `fc49da2`, following [PR #3](https://github.com/zaindahdul/YCHackathon/pull/3). The current update integrates that history into `main` as the `studio/` npm workspace. The service runtime under `src/` and its payment/fulfillment evidence remain available separately.

## What changed

The latest direction is an AI venture studio. Three founder agents choose different markets and each run a small software company. They discover a concrete complaint, publish a working browser product, find users, inspect usage/feedback, then improve or kill/pivot the company. A concierge handles the shared inbox when explicitly enabled.

| Founder | Initial market | Product observed on the existing deployment |
|---|---|---|
| `founder-1` | Developers and indie makers | CORSfix: interpret a browser CORS error and suggest a backend-specific fix |
| `founder-2` | Freelancers and small businesses | PayNudge: generate a payment reminder based on an overdue invoice |
| `founder-3` | Students and creators | CramPlan: allocate study time across upcoming exams |

These are products discovered/built by the studio, not permanently hardcoded tracks. Each founder can pivot to another supported static web product. Prices, transactions and revenue are not part of this free-product studio's metrics. The retained service runtime implements a separate paid-order flow; integrating the workspaces does not connect studio products to Stripe.

## Public deployment verification

The PR links [the existing studio](https://pmf-2rdynba3hkaq.vercel.app/). Read-only checks during this update found `/health` returning 200 and `/api/state` returning three `live` products. A real browser rendered the dashboard, company/version history and report links.

At the initial observation, CORSfix had three versions and zero reported active browsers; PayNudge had four versions and one reported active browser; CramPlan had two versions and one reported active browser. The public decisions themselves describe founder QA visits, and the intervention log records removing earlier founder test visits. **These counters are not independent customer evidence.** No payment, retention, qualified outside buyer or PMF is established by those observations. The live service may continue changing independently of this checkout.

The public dashboard reports prior emails. This update did not send those messages or authenticate their delivery. It did not connect an account, provision a key, deploy, run a paid task, modify organization permissions, or alter the existing running agents. The new local repairs require a separately authorized deployment before they affect that URL.

## How the code works

- `studio/crew/crew.ts`: founder markets, system prompts, budgets and schedule declarations; concierge.
- `studio/server/mcp.ts`: discover/read/start/publish/report/decision tools. A current run token fences founder mutations and private file reads.
- `studio/server/repo.ts`: Postgres state, company/run leases, uploads, immutable version records, reports, browser events, feedback and outreach logs.
- `studio/server/routes.ts`: dashboard, company/report pages, product serving, upload intake, telemetry and JSON storage.
- `studio/server/pages.ts`: the UI and browser SDK/bridge.
- `studio/sql/`: numbered migrations. The deployed `0001`–`0003` files are preserved; integration repairs use forward migrations.
- `src/`: the retained service company with four seed offers, checked MP4/HTML fulfillment, immutable paid orders and Stripe receipts. It uses its own SQLite database and evidence model.

Both workspaces share one root lockfile. `npm run check` and `npm run build` validate both. Deployment and kickoff commands explicitly enter the studio workspace so config and build paths agree.

## Boundaries to keep clear

**Usage:** studio analytics describe browser-reported activity. They can be spoofed, browser IDs can be cleared, and a founder can test without QA mode. The QA flag suppresses normal testing events but is not independent identity verification. Signups and views are not equivalent to core-action use, returning browsers are not proof of durable retention, and a `scale` verdict is a configurable early signal.

**Reports:** required structured write-ups preserve a hypothesis, product/version, distribution, results, user feedback, learning and next decision. Database snapshots preserve the studio's counters. They do not make every narrative statement or quoted customer claim independently verified.

**Founder identity:** the platform bearer authenticates the trusted crew. Caller-supplied founder names and run tokens provide coordination and stale-run fencing, not cryptographic isolation between agents sharing that bearer. Strong per-agent authority needs separately authenticated principals; do not call a founder string an identity check.

**Outreach:** app quotas and opt-outs control accepted log entries. They cannot undo direct email/social sends. Default send/data tools require approval in the updated declarations, but broad browser/shell capabilities are not a deterministic sending boundary. There is no claim that every possible external write is governed by the app. A fully governed sender needs a narrow provider executor that reserves permission/quota before the side effect.

**Spend:** disabled schedule declarations and explicit finite-kickoff authorization prevent this checkout from starting paid work on deployment by default. Session/daily caps are distinct from a studio-wide lifetime budget. Local kickoff reservations cover this machine's attempts only, not already-running agents, other machines or organization-wide invoices. Existing remote schedules/inbox bindings are not changed by editing source.

**Generated products:** static product code is untrusted. The integrated host isolates it in a sandbox and mediates the supported storage/analytics API. Browser-local capabilities are not account authentication, sync, backup or a safe place for production secrets. Shared records are deliberately public. Existing stored private records created under the older public-ID scheme cannot be retroactively made confidential by a new client token.

## Handoff

Start at [the root README](../README.md), [studio setup](../studio/README.md) and [current review](STUDIO_REVIEW.md). The earlier [service architecture](ARCHITECTURE.md) and [operating model](OPERATING_MODEL.md) describe the preserved runtime, not the studio's current product-discovery loop.
