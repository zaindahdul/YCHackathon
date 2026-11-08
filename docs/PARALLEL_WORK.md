# Working on Launchpad in parallel

Srujan's agent and Zain's agent both work through pull requests against `main`. Launchpad lives in `project-2/`. Tracking thread: [issue #9](https://github.com/zaindahdul/YCHackathon/issues/9).

## Start here if you were working on #11, #12 or #13

PR #10 merged all three into `main`. Don't rebase those branches, because `project-2/` has a different history on `main`. Start fresh and bring over only commits made after the merged point:

```sh
git fetch origin
git switch -c <new-branch> origin/main

# Use the row for your branch. An empty diff means nothing is left to bring over.
git diff 5e1681b origin/launchpad-polish    -- project-2 | git apply --3way
git diff 15e4f70 origin/launchpad-privacy   -- project-2 | git apply --3way
git diff 1306794 origin/launchpad-e2e-fixes -- project-2 | git apply --3way

cd project-2 && npm ci && npm test && npm run typecheck && npm run build
```

Any other branch cut from PR #8 uses `8d87f94` as the left side. What happened to each PR:

| PR | Result on `main` |
|---|---|
| #6, #7, #8 | Included as the `project-2/` starting point |
| #11 styling | Visual system carried over. Its page markup was not, because it removes the workspace |
| #12 privacy | Included, with one change: a one-line email body stays private on `/ops` |
| #13 end-to-end fixes | Included, and carried into the workspace pages |
| #1 | History only, no files missing from `main` |
| #4 studio | Two commits still open, see Open work |

## Run it

```sh
cd project-2 && npm ci && npm run dev     # http://localhost:8790
npm run seed:demo                         # second terminal, prints a private sample workspace URL
```

`npm run dev` turns on the local template producer. Production does not, unless `LAUNCHPAD_LOCAL_PRODUCER=1` is set.

## Open work, in priority order

| Item | Req | Lane |
|---|---|---|
| Real `lp-producer` run that writes kits and workspace records, replacing `local-template` | R11 | Live agents |
| Deploy the merged app from one session and verify the real URL | R11, R13 | Live agents |
| Enforce send-before-log caps, require MCP run tokens, close `crew.ts` raw senders | R12 | Live agents |
| Connect a real product to `/t.js` and observe an activation and a return | R8 | Either |
| Permitted comment import, replacing manual paste | R6 | Either |
| Reconcile PR #4 by hand: browser sign-up guard, founder test links, event user agents. It conflicts with repairs on `main`, so keep the human-owner disclosure and run fencing, and renumber its migration to `0005` | Studio | Either |

The producer needs to fill the same records the local one does. See `server/producer.ts` for the shapes and `server/workspace-types.ts` for the contract.

## Before you start

1. Comment on issue #9 with the lane you are taking and your branch name.
2. Branch from `origin/main` and target `main`.

## Lanes

One agent owns a lane at a time. To work in someone else's lane, ask on issue #9 first.

| Lane | Files | Default owner |
|---|---|---|
| Live agents and deployment | `project-2/crew/`, `project-2/naive.config.ts`, `project-2/server/entry.ts`, `project-2/server/mcp.ts`, `project-2/scripts/run-agent.ts`, `project-2/scripts/intervene.ts` | Zain's agent, which has the Naïve account access |
| Founder workspace UI | `project-2/server/pages.ts`, `project-2/server/workspace-pages.ts`, `project-2/server/video-client.ts` | Srujan's agent |
| Workspace backend | `project-2/server/workspace.ts`, `project-2/server/producer.ts`, `project-2/server/routes.ts`, `project-2/server/repo.ts` | Srujan's agent |
| Shared contract | `project-2/server/workspace-types.ts` | Either agent, additive fields only |
| Studio and service runtime | `studio/`, `src/` | Unassigned, separate from Launchpad |

## Rules that keep PRs mergeable

- Keep each PR to one lane and one requirement ID from `docs/IMPLEMENTATION_ACCEPTANCE.md`.
- Migrations are forward-only. The next free number is `0003`. Claim a number on issue #9 before pushing.
- Merge the latest `main` before asking for review. Never force-push or delete someone else's branch.
- A PR needs `npm test`, `npm run typecheck` and `npm run build` passing in `project-2/`. The Launchpad CI workflow runs them.
- Have the other agent review a PR before merging when it touches their lane, the contract or a migration.
- PR descriptions state requirement status, commands run, and what was not verified. Fixtures and sample data are never evidence of users.
- A PR does not authorize sends, spend, deployment or account changes.
