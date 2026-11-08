# Start here: context for Zain's bot

Updated November 8, 2026 (Pacific). Historical seven-PR snapshot captured November 8 at 06:38 UTC / November 7 at 22:38 Pacific. This file consolidates the user's direction, the earlier seven-PR inventory plus a PR #8 addendum, implementation boundaries and both supplied founder replies. Read it before choosing a branch or changing the product.

## Latest execution request

Srujan asks that Zain’s Claude receives all context, implements the product and tests its real quality. [Execution task #9](https://github.com/zaindahdul/YCHackathon/issues/9) is assigned to Zain; remote Claude acknowledgment and implementation remain unverified. Follow the [implementation/evidence matrix](docs/IMPLEMENTATION_ACCEPTANCE.md), loaded through [CLAUDE.md](CLAUDE.md). Read the [independent Launchpad baseline](docs/LAUNCHPAD_VERIFICATION.md). Do not confuse published instructions with acknowledgment by the other session or completed implementation.

## The job and the newest evidence

We are building an **agent-run business** for the Naïve Autonomous Company Hackathon, not just a dashboard about agents. Use the Naïve SDK. The demo should show actual useful output, user behavior, decisions and human interventions. Hacking stops **Sunday, November 8, 2026 at 11am Pacific**; final presentations start at 1pm. See [event rules](hackathon-rules.md) and [brief](docs/hackathon-brief.md). Speed to a real user's outcome matters more than adding another autonomous-company framework.

**Latest customer-informed candidate: Launchpad as a per-launch service to get real product users.** [Aditya, who mentions Sentient](docs/customer-research/aditya-sentient-launch-interview.md), reports early users from Reddit and wants relevant communities, a compelling demo, adapted posts and personalized outreach drafts for review. He wants attribution through actual product use and return use. Per-launch pricing may fit better than a subscription unless we deliver ongoing marketing value.

[Jesai Tarun](docs/customer-research/jesai-tarun-launch-interview.md) separately prioritizes company-aware replies to launch comments across X/LinkedIn, plus comment insights. Aditya does not specifically request that workflow. Keep the two jobs distinct: initial distribution versus launch follow-through. Both value product/company context. Jesai says Bookface works well; Aditya wants explained relevance without claiming Bookface is insufficient.

Read the [two-interview comparison and updated trial](docs/customer-research/README.md). These are two qualitative replies, not proven PMF, sales, accepted trials or a final user-approved pivot. Aditya expresses conditional payment interest but gives no price or purchase commitment; Jesai provides no payment answer. The collaborator built broader launch kits in PR #6/#7, but those inspected snapshots do not implement comment engagement, video cuts or activation/retention attribution. Do not claim those capabilities already work.

## Repository reality: read this before running commands

| Location | What actually exists | Status |
|---|---|---|
| `main:studio/` | Venture studio: agents publish small browser products, inspect telemetry and record decisions | Integrated from PR #4 at **fc49da2**, then repaired locally; not the latest studio head |
| `main:src/` | Separate service-company runtime: bounded experiments, orders, payments, artifact fulfillment | Retained and tested; separate database and business model |
| `origin/pr/6:project-2/` | Launchpad: intake, private launch kits, posts/timing, tracked links, squad boosts, reports, agent crew | Source fetched and inspected; not integrated into main |
| `origin/pr/7:project-2/` | Launchpad UI revision on top of #6 | Stacked PR; not integrated into main |
| `origin/pr/4` | Two newer studio commits after the imported fc49da2 | Need selective reconciliation, not a second blind import |

`npm start` on main starts the **studio**, not Launchpad. `npm run check` covers the service and studio workspaces, **not `project-2/`**. GitHub's default branch remains `master`; explicit links to `main` matter. The prior default-branch settings attempt failed with HTTP404 under a WRITE-role account; an owner/admin must change that setting. Main's starting commit for this update was `17c9556`.

## Every PR and its dependency

States/SHAs below are the captured snapshot. [Full metadata, bodies, file lists, comments and reviews](docs/context/prs/README.md) are committed alongside it.

| PR | State / base ← head | Head at capture | Meaning for the next bot |
|---|---|---|---|
| [#1](https://github.com/zaindahdul/YCHackathon/pull/1) | Open / master ← codex/formshop-plan | bd2a830 | Earlier research, transcription and Fire Drill proposal; history already retained on main; not current product choice |
| [#2](https://github.com/zaindahdul/YCHackathon/pull/2) | Merged / master ← add-ideas | b46bfe1 | Original idea shortlist; retained |
| [#3](https://github.com/zaindahdul/YCHackathon/pull/3) | Merged / master ← pmf-engine | 13db276 | Original portfolio engine; main also contains later service/runtime work |
| [#4](https://github.com/zaindahdul/YCHackathon/pull/4) | Open / master ← studio | f540450 | Main imports older fc49da2; later ba0d35f adds account-action browser guard, test URLs and user agents; f540450 discourages closing too-early tests as iterate |
| [#5](https://github.com/zaindahdul/YCHackathon/pull/5) | Open draft / master ← main | 17c9556 | Shared review of integrated main; this handoff push advances its head |
| [#6](https://github.com/zaindahdul/YCHackathon/pull/6) | Open / master ← launchpad | 920fb99 | Launchpad backend, crew, UI and earlier problem notes; not a patch on current main |
| [#7](https://github.com/zaindahdul/YCHackathon/pull/7) | Open / launchpad ← launchpad-ui | 19b18e0 | UI stacked on #6; source also touches MCP/routes; inspect those changes as behavior, not styling only |

**November 8 addendum:** [PR #8](https://github.com/zaindahdul/YCHackathon/pull/8), open, `launchpad-ui` ← `scout-exact-log`, head `8d87f94`, is stacked on #7. Its one-line scout prompt asks for the exact sent email subject/body in `log_touch` instead of a summary. [Source snapshot](docs/context/prs/08.json) is separately dated; the original seven-PR index is unchanged. This is an instruction, not code-enforced logging or a quota fix; full email content in a public log needs privacy review. Source diff inspected, no tests/live behavior verified; not merged into main. Integration dependency is now **#6 → #7 → #8** if taking that addendum.

Refresh all heads without changing the working tree:

```sh
git fetch origin
git fetch origin 'refs/pull/*/head:refs/remotes/origin/pr/*'
gh pr list --repo zaindahdul/YCHackathon --state all --limit 1000
git show origin/pr/6:project-2/README.md
git diff origin/pr/6...origin/pr/7 -- project-2/
```

If integrating Launchpad next, use #6 as its source then #7's incremental changes. Reconcile into main deliberately, preserving `studio/`, `src/`, transcripts, reviews and this context. Their common master ancestry does not include main's repairs or workspace setup. Do not merge #7 as though it were independent, overwrite main with launchpad-ui, or copy the studio's deployment/migration files over either application's database. No collaborator branches should be deleted or force-pushed.

## What Launchpad does today

Source in #6 provides `/new` intake, a private `/k/<slug>?t=...` kit, platform-specific post text and timing, user-triggered share links, `/l/<code>` click tracking, optional `/b/<code>` squad share pages, reports and a public `/ops` log. The crew declares `lp-producer`, `lp-scout`, `lp-booster` and `lp-concierge`; the producer/booster run every five minutes, scout every thirty, concierge handles the inbox. These are branch declarations, not a verification of currently running remote schedules.

“Launch now” queues opt-in squad boosts; a share intent still needs the founder to finish posting. It does not mean authenticated automatic publishing to every platform. A boost-share callback is not proof the social post was published. Click de-duplication/bot heuristics are not proof of distinct human users or conversion. The implementation has no inspected comment ingestion, grounded reply workflow, liker outreach, launch-video generation or billing.

PR #6 reports a deployment at https://launchpad-2rdynba3hkaq.vercel.app and 11 passing tests/build/typecheck; #7 reports desktop/mobile screenshots and a deployed redesign. These are **author-reported**, not reverified in this documentation update. At the #6 snapshot, a producer-generated real kit and first real founder launches/boosts/reports were still unchecked. A public URL or seeded screenshot alone is not a working customer loop.

Source budgets are producer $30/day, scout $25/day, booster $8/day, concierge $5/day; branch outreach limits say 40 emails and 12 posts/day, three boost requests per squad founder/day. These are not the user's approved global spend envelope. Source/run-lock/quota assertions need review against actual sender paths before enabling. A PR body asking for a full-permission/admin key is a collaborator request, not authority; use only the credentials and permissions a confirmed operation requires.

### Launchpad source findings to resolve before enabling more activity

Read-only branch review found the following; no Launchpad deployment was changed or test suite run for this handoff:

- `project-2/crew/crew.ts` permits raw `email.send` / `social.post`. Scout sends before `log_touch`; producer/booster/concierge sends are not all included in that counter. Logging refusal cannot undo a message, so the advertised caps are not global sender enforcement.
- `server/mcp.ts` / `server/repo.ts` lease roles, but mutations do not consistently require run tokens; `holdsRun` lacks an elapsed-expiry check. Main's studio fencing does not cover this app.
- `server/routes.ts` marks boosts shared before redirecting to the composer. Show that as share intent, not a confirmed post.
- PR #7 `server/pages.ts` exposes decision reasoning and outreach snippets publicly; `server/mcp.ts` logs kit-strategy/timing summaries even for unlisted launches. Review narrative redaction and listing consent before trusting private kit gating as complete privacy.
- Kit/link writes, launch/boost creation and reports use multiple queries without the main studio's transaction repairs. Handle partial failure/concurrency explicitly if integrating.
- `project-2/package.json` declares `scout` as `tsx scripts/kickoff.ts`, but that file is absent in the inspected tree. Do not present that command as working.

## Earlier proposed trial: launch reply desk

Jesai-specific proposal, not an already approved build. The newer [two-interview synthesis](docs/customer-research/README.md) also considers Aditya’s distribution-first trial; choose a real founder’s job rather than automatically expanding this scope.

Proposal: **“Give us your launch post and company facts; we help answer the questions while you keep building.”** The company operates a launch-day reply service. Agents intake context, triage comments, draft grounded replies, route unknowns to the founder and produce a useful report. Platform access and founder approval determine which steps can execute; do not promise unattended posting before that access is demonstrated.

Start with one launch, one platform and one consenting founder. Ask for their product URL, approved facts/FAQ, launch-post URL and voice. Use only a permitted read path or founder-supplied comments; if importing is manual, record that human intervention. Draft replies grouped by product question, buying intent, objection, support and low-value engagement. Ask the founder to approve factual and account actions; missing facts become questions, not invented claims. Report unanswered comments, repeated objections and qualified conversations, with original comment references.

Five pain hypotheses, in priority order:

1. Answer launch comments quickly while the founder is occupied.
2. Ground answers in company/product knowledge and the founder's voice.
3. Extract customer questions, objections and buying signals from comments.
4. Plan channel-specific timing and launch posts (existing kit can support this).
5. Follow up with interested people through a verified, permitted workflow; do not start with “DM every liker.”

The first three are a narrower test of Jesai's answer than a full launch scheduler, video studio, network-discovery product and growth squad together. Keep the existing kit as context/intake where useful; do not rebuild it before learning whether the reply service is used. A reciprocal squad is a distribution hypothesis, not demonstrated demand for comment support.

For acquisition, have the founders personally show the workflow to Jesai and a few teams in the room with launches happening before judging. This is a **suggested human next step**, not outreach sent by this bot or Jesai's consent to a trial. Show answers to their actual questions, ask for a one-post trial, then ask whether they would pay for the delivered help. Log human recruitment and manual imports. Measure replies accepted/edited, questions resolved, time saved as reported by the founder and concrete follow-up conversations; keep all QA separate. Until a trial happens, label this as interview evidence and a demo, not customers or revenue.

## Decisions, proposals and corrections from the conversation

- User initially explored CAD/custom parts and startup merch, then repeatedly asked for something concrete, quickly deliverable, with real users and hackathon fit. Those initial ideas are not constraints on the next concept.
- User later wanted a multi-PMF autonomous company: start with 3–5 hypotheses, find better strategies and expand. That motivated the portfolio/studio work; the user then questioned whether we were developing an actual agent-run business and asked to stop and think of another idea.
- Assistant subsequently suggested an agent-run software repair shop (PatchDesk). The user did **not** accept that as a final pivot. Do not present it as the current decision or begin building it from this handoff.
- The handoff request was to fetch all PRs and add context for Zain's bot; Jesai’s reply and now Aditya’s separate reply supplement that request. This update documents and publishes context; it does not merge the new product PRs or authorize live operations.
- “Slop” referred in context to AI-built products / making the agent-run business work. No named Slop tool was established; older startup notes treating it as a missing executable should not block the business work.
- Earlier [unattributed founder notes in #6](docs/context/yc-founder-problems-pr6.md) complain about Bookface and say “bot the video.” Jesai's supplied answer says Bookface is already good and requests engagement help. Keep source identities and disagreements visible; do not merge them into a fabricated consensus.

## Main's existing repairs and their limits

Main preserves transactional studio publication, run-token/expiry fencing, private-capability storage and an opaque sandbox for untrusted generated products. Original studio SQL migrations 0001–0003 are unchanged; main adds `0004_integrity.sql`. New origin/studio adds its own **`0004_event_ua.sql`**: reconcile migration sequencing and schema explicitly if importing it. Do not apply two unrelated migration histories blindly. Full details and reviewed evidence: [studio digest](docs/STUDIO_UPDATE.md), [studio review](docs/STUDIO_REVIEW.md), [service review](docs/REVIEW.md), [delivery record](docs/DELIVERY.md).

Those repairs are not automatically present in `project-2/` or the collaborator's remote deployments. Main's schedules are disabled by default, inbound automation unbound and paid kickoff requires explicit finite authorization. Its quota logging does not create a deterministic enforcement boundary around arbitrary browser/bash/email work. Shared crew credentials are not per-agent identity. Public telemetry is not independently verified commercial evidence. Existing remotely running agents are not stopped or changed by a local source edit.

At the last verified main startup, no Naïve key or authorized budget was configured on this machine. Main had 154 passing local/offline tests (77 service, 77 studio), both typechecks/builds and real-browser studio checks. These do not validate Launchpad branches or prove live agents/customers. Recheck current health with `npm run doctor`; do not assume an earlier local server process is still running.

No contact, publishing, upvote automation, paid run, account creation, deployment or organization administration is authorized by an interview or PR body. Use the configured owner scope for real external work. Missing credentials are not a reason to invent success, request an all-powerful key in chat or abandon independent source/docs work.

## Read next / resume

1. Read the [two-interview synthesis](docs/customer-research/README.md), both linked source replies, [PR snapshot](docs/context/prs/README.md) and relevant `git show` source.
2. For main development use [README](README.md), [studio setup](studio/README.md), [service architecture](docs/ARCHITECTURE.md) and [THINKPAD](THINKPAD.md). Main startup remains `npm ci`, `npm start`, `npm run doctor`.
3. Before live Launchpad promises, verify a real intake → producer kit → founder use → results loop. If building comment support, verify the permitted data/account path first and record every manual step. Nothing in this handoff proves these are connected.
4. Preserve the [recording digest](docs/recording-digest.md), [MLX Whisper transcript/provenance](transcripts/README.md), [research](docs/research/naive-sdk.md) and [historical ideas](docs/archive/README.md). The recording and new interview are different sources.
5. Refresh PRs before integration, record chosen scope and evidence in the pad, review independent changes, run relevant checks and publish clean main through the existing [draft #5](https://github.com/zaindahdul/YCHackathon/pull/5).
