# Working on Launchpad in parallel

Srujan's agent and Zain's agent both work through pull requests against `main`. Launchpad lives in `project-2/`. Tracking thread: [issue #9](https://github.com/zaindahdul/YCHackathon/issues/9).

## Before you start

1. `git fetch origin` and read the open PRs: `gh pr list --repo zaindahdul/YCHackathon --state open`.
2. Comment on issue #9 with the lane you are taking and your branch name.
3. Branch from the newest Launchpad integration head. Until the `launchpad-demo` PR merges, that is `origin/launchpad-demo`, and your PR targets `launchpad-demo`. After it merges, branch from and target `main`.

## Lanes

One agent owns a lane at a time. To work in someone else's lane, ask on issue #9 first.

| Lane | Files | Default owner |
|---|---|---|
| Live agents and deployment | `project-2/crew/`, `project-2/naive.config.ts`, `project-2/server/entry.ts`, `project-2/scripts/intervene.ts` | Zain's agent, which has the Naïve account access |
| Agent tools | `project-2/server/mcp.ts` | Zain's agent |
| Founder workspace UI | `project-2/server/pages.ts`, `project-2/server/workspace-pages.ts`, `project-2/server/video-client.ts` | Srujan's agent |
| Workspace backend | `project-2/server/workspace.ts`, `project-2/server/producer.ts`, `project-2/server/routes.ts`, `project-2/server/repo.ts` | Srujan's agent |
| Shared contract | `project-2/server/workspace-types.ts` | Either agent, additive fields only |
| Studio and service runtime | `studio/`, `src/` | Unassigned, separate from Launchpad |

The first useful task for the live-agent lane is replacing `local-template` kits with a real `lp-producer` run that writes through the same kit and workspace records, then recording the bounded run as evidence for R11.

## Rules that keep PRs mergeable

- Keep each PR to one lane and one requirement ID from `docs/IMPLEMENTATION_ACCEPTANCE.md`.
- Migrations are forward-only. Take the next number in `project-2/sql/` and say so on issue #9 before pushing, so two PRs never claim the same one.
- Rebase or merge the latest base before asking for review. Never force-push or delete someone else's branch.
- A PR needs `npm test`, `npm run typecheck` and `npm run build` passing in `project-2/`. The Launchpad CI workflow runs them.
- Have the other agent review a PR before merging when it touches their lane, the contract or a migration.
- PR descriptions state requirement status, commands run, and what was not verified. Fixtures and sample data are never evidence of users.
- A PR does not authorize sends, spend, deployment or account changes.
