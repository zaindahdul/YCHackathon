# PMF Engine studio

This workspace contains the venture studio from [PR #4](https://github.com/zaindahdul/YCHackathon/pull/4), integrated with local integrity repairs. Founder agents discover problems, publish small static web products, inspect browser activity and feedback, and write a report before closing a test. They operate for human owners; the public product discloses that agents do the work.

The collaborator's [existing deployment](https://pmf-2rdynba3hkaq.vercel.app/) is separate from this checkout. The current local repairs have not been deployed. Read [the digest and observed live state](../docs/STUDIO_UPDATE.md) and [integration review](../docs/STUDIO_REVIEW.md).

## Install and run locally

Run commands from the repository root. Node 24+ is required; the shared root lockfile is authoritative.

```sh
npm ci
npm run dev                 # http://127.0.0.1:8790
npm run studio:test
npm run studio:typecheck
npm run studio:build
npm run check               # includes the retained service runtime
```

Local state defaults to `studio/.data/pglite`. Set `PORT` and `PGLITE_DIR` for a separate local instance. Development binds to loopback and defaults to the local `dev` bearer; `PMF_DEV_TOKEN` can override it. No provider, outreach, deployment or paid session starts with `dev`.

A fresh database is empty. The studio's authenticated MCP endpoint accepts JSON-RPC calls. First acquire a run:

```sh
curl http://127.0.0.1:8790/mcp \
  -H 'Authorization: Bearer dev' -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_my_company","arguments":{"founder":"founder-1"}}}'
```

The response's `result.content[0].text` is JSON containing `run_token`. Keep it private. `tools/list` describes the full schema. Pass `founder` and that current token to `start_company`, `publish_product`, `get_upload_link`, `get_product_files`, `set_company_status`, `log_decision`, `write_report`, `log_touch` and `update_touch_metrics`. End the run with `end_run`.

`start_company` requires a name, concrete problem/audience/solution and 1–5 evidence URLs. Local fixtures must be labeled as fixtures; example URLs and test events are not demand. `publish_product` takes real text files, including `index.html`, plus a version note. The upload path stages sandbox files with `curl`, commits the snapshot atomically and consumes the link. Uploads stop working when their founder lease ends, rotates or expires. `NOTES.md`/`AGENTS.md` are private, including nested paths.

## Product browser API

Products live at `/p/<slug>/`. A trusted host shell embeds the generated app in an opaque sandbox; the generated app cannot access host localStorage or another product's storage credentials. Use `window.pmf`:

```js
await pmf.track('result_generated'); // only after the actual core action
const saved = await pmf.db.add('plans', { title: 'Example' });
const mine = await pmf.db.list('plans', { mine: true });
await pmf.db.update(saved.id, { title: 'Updated' });
await pmf.signup('customer@example.com');
await pmf.feedback('Actual feedback');
```

All methods are asynchronous. Storage uses a secret capability scoped to this browser and company, separate from the analytics ID. It is not account login, cross-device sync or production-secret storage. Clearing browser storage can lose access. `shared: true` makes a record publicly readable; only its creator can modify/delete it. A default list shows shared records; `mine: true` lists the caller's own records. Owner hashes never appear in public responses.

Generated assets receive sandbox CSP, including HTML, SVG and XML. Generated code's direct network requests are blocked; use the bridge for supported database and analytics operations. Existing apps depending on direct fetch or localStorage need adaptation to `pmf.db`, or separately reviewed isolation/deployment. The default static-product feature is not arbitrary server code or an LLM proxy.

Use `?qa=1` for testing. QA mode persists per product/browser across navigation and suppresses views, uses, signups and feedback, while still allowing local test storage. Use a separate browser profile for a deliberately clean outside-user simulation. Neither mode verifies a real independent human. Existing pre-repair UID-owned records remain preserved but cannot silently inherit a new secret; owner-authorized recovery/migration is required.

## Versions, metrics and reports

Every successful ship creates a numbered version. Usage is browser-reported, not independently verified people. Signups stay separate from core-action use. Returning activity requires core-action use in more than one hour bucket; it is an operational proxy, not durable retention. The `scale` verdict is an early configurable signal.

Iterate, scale and kill reports require at least 400 characters and all seven sections: `Hypothesis`, `What we built`, `How we tested it`, `Results`, `What users said`, `What we learned`, `Decision and next step`. Database snapshots accompany reports and status/decision changes commit together. Narrative claims remain claims unless backed by separate evidence.

## Authorized provider work

This integration does not provision a key or activate the studio. Use operation-specific provider permissions. A request to deploy or run a bounded task does not require every billing/admin permission. Keep keys out of Git/chat/logs. The root `.env.example` primarily describes the retained service runtime; studio commands use exported environment variables.

- `npm run naive:dry` plans provider deployment. It requires authenticated read access and does not validate live customer demand.
- `npm run naive:up` changes external resources and applies migrations. Review the plan and authorize the actual deployment first. This source declares **disabled schedules** and no inbound-mail binding by default. Editing source does not pause the collaborator's existing remote schedules or remove earlier inbox routing.
- Forward migration `0004_integrity.sql` must be applied with the updated code. Files `0001`–`0003` are unchanged. If historical rows violate new uniqueness rules, migration refuses rather than deleting evidence; inspect those rows before a production update.

Finite paid kickoff requires all of these, set to the owner's approved values:

| Variable | Meaning |
|---|---|
| `NAIVE_API_KEY` | Key with the agent/session permissions used |
| `STUDIO_LIVE_AUTHORIZED=true` | Explicit owner authorization for this live invocation |
| `STUDIO_TOTAL_BUDGET_CENTS` | Total local kickoff envelope, integer cents |
| `STUDIO_TASK_BUDGET_CENTS` | Per-session cap, 1–400 cents |
| `STUDIO_BUDGET_ID` | Stable ID for that authorized envelope; changing its ceiling under the same ID is refused |
| `STUDIO_STOP_AT` | Future ISO admission cutoff |

```sh
npm run kickoff -- founder-1
```

No selected name may be unknown or duplicated. The complete agent listing must be available before paid creation. The ignored local ledger `studio/.local/studio-kickoff.sqlite` reserves full session caps atomically across invocations and records stable idempotency keys/session IDs. Unknown creates retain reservations and block later kickoff; accepted sessions retain their allocation. Do not delete/reset the ledger to retry uncertain paid work. Inspect the actual provider receipt first.

The deadline controls **admission**, not instantaneous cancellation of remote work. These reservations are not an actual invoice or a global organization budget; they exclude existing schedules and other machines. Provider per-agent daily ceilings also do not enforce a studio lifetime budget. No recurring schedule is enabled by kickoff. `STUDIO_ENABLE_INBOX=true` is a separate explicitly gated opt-in; its configured deadline does not automatically remove routing later.

Raw email/social/data-execution tools default to platform approval. App quotas/opt-outs validate logged receipts and cannot undo a direct send. Broad shell/browser access is necessary for building but is not a hard external-write boundary. Governed outbound autonomy requires a narrow sending executor; never present a prompt rule as deterministic enforcement.

## Owner tools

Use `PMF_ADMIN_TOKEN` for intervention logging and a validated `PMF_APP_URL`/actual HTTPS endpoint:

```sh
npm run intervene -- 'Describe the actual human step-in'
npm run fence-ceo                 # read-only preview; requires agent read access
npm run fence-ceo -- --agent AGENT_ID --apply  # explicitly changes that orchestrator
```

The fencing script previews first, requires exact target IDs to apply, checks orchestrator metadata, uses optimistic version checks and needs agent read/update permissions. It does not require blanket billing permissions. Organization-wide changes are not part of local development or this repository integration.
