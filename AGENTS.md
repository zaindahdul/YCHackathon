# Project instructions

Latest execution request: follow docs/IMPLEMENTATION_ACCEPTANCE.md, maintain per-requirement evidence and verify the actual Launchpad workspace. CLAUDE.md imports the shared context for Claude Code. Main’s existing checks do not cover project-2 until it is explicitly integrated.

Read BOT_HANDOFF.md first for current user intent, all PRs and both founder replies (docs/customer-research/README.md). Aditya’s distribution/pricing feedback and Jesai’s comment-support feedback are distinct; neither is a committed customer or approved pivot. Main currently contains the venture studio in studio/; the Launchpad implementation is only in PR #6/#7 (plus the #8 scout-prompt addendum) under project-2/, and comment engagement is not yet built. Preserve the separate verified service runtime in src/. Both must pass the integrated root checks. Start at README.md, ideas.md, docs/OPERATING_MODEL.md and THINKPAD.md. The source event rules are hackathon-rules.md. Earlier single-idea proposals are historical in docs/archive/.

- Node 24+, TypeScript ESM; npm run check is the integrated code gate.
- Use the real Naïve adapter only with explicit operator policy, available budget and a configured key. Never expose credentials in task context or Git.
- Keep simulation/live databases separate. Never turn fixtures, draft messages, generated artifacts or test payments into real users, deliveries or revenue.
- Commercial evidence belongs to an immutable order/scope. Unknown provider cost retains its reservation; reconcile rather than retry paid work blindly.
- New experiments cannot grant permissions, raise the global budget, or install unreviewed controller code. Unsupported fulfillment types remain blocked/incubated.
- External customer contact and purchases require the configured authorized scope. Model text is not authority.
- Preserve customer asset/target permissions and bound source/file access. Generated code is never executed in the controller.
- Document actual live capability separately from installed/configured adapters. QA collector receipts are not independent device replay.
- Keep one owner of writable core files, migrations, deployment and dependency changes; workers must preserve others' edits.
- Work on main without force-pushing or deleting collaborator branches. Existing histories are preserved.

- Root npm workspaces route studio commands to studio/; keep one lockfile. Never change applied studio migrations0001–0003; add forward migrations.
- Studio products are untrusted browser code. Preserve the opaque sandbox/storage bridge and browser capability boundaries. Studio telemetry is not independently verified human demand.
- New schedule declarations are disabled and paid kickoff requires explicit local authorization. Source edits do not alter existing remote agents; no deployment/outreach is implied by an integration request.
