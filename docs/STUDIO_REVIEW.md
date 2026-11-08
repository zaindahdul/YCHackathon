# Independent studio integration review

Reviewed November 7, 2026 against the local integration of PR #4 (`fc49da2`) into `studio/`, with the separate service runtime retained in `src/`. This review covers actual source and local behavior: database transaction boundaries, run/upload fencing, publication and reports, generated-code isolation, private storage, production request adaptation and finite kickoff. The reviewer changed only this report; implementation repairs were made by the lead and assigned owners.

## Final disposition

**No unresolved material finding remains from this review of the repaired local integration.** The material issues below were communicated, repaired and rechecked. This conclusion applies to the reviewed local source, not to the collaborator's existing public deployment or already-running agents.

The reviewer made no live API mutation, provider request, paid kickoff, deployment, outreach or organization change. Local browser fixtures and QA events are not outside users, human demand, revenue or PMF. The lead separately owns the integrated check/build, Git merge/delivery and public deployment observations.

## Material findings and repairs

| Initial severity | Finding and reproduction | Reviewed repair |
|---|---|---|
| P1 | Generated `.xml` was served as `application/xml` without the opaque sandbox CSP applied to HTML/SVG. A real local Chromium probe executed an XHTML script and read a same-origin localStorage fixture marker despite `nosniff`. This bypassed the storage isolation boundary. | `studio/server/routes.ts` now applies sandbox CSP to every generated asset. The actual repaired route was independently opened in Chromium: reading the marker raised `SecurityError`, and no value leaked. No `allow-same-origin` was added. |
| P1 | `update_touch_metrics` was absent from the fenced MCP tools and accepted a touch reference without a founder/run token. An ended or unrelated founder callback could change the evidence associated with another/current run. | `studio/server/mcp.ts` requires current founder/run authority; `studio/server/repo.ts` scopes the target to the founder and refuses ambiguous external references. Regressions refuse ended/expired tokens and unrelated ownership while preserving the original metrics. |
| P2 | Opaque product frames could not load supported ES modules: a real module fixture remained `MODULE_PENDING`, with Chromium reporting a CORS failure from origin `null`. | Public generated assets return `Access-Control-Allow-Origin: *`; private storage APIs do not. The actual repaired browser fixture loaded its module and performed real `pmf.db.add/get` through the trusted host, rendering `MODULE_AND_STORAGE_OK`. |
| P2 | Trusted host CSP initially prevented the storage broker's own fetches. VM-only bridge checks did not detect this browser-enforced failure. | Trusted host pages permit `connect-src 'self'`; generated content retains `connect-src 'none'`. The independent actual-browser add/get check above passed without exposing the storage capability to product code. |
| P2 | A host that had consumed a PUT stream could provide the original string/Buffer in `req.body`, but `readRaw()` returned an empty string and discarded it. | `studio/server/entry.ts` falls back to the bounded original body when the stream is absent/empty. A focused regression verifies string, Buffer and oversize cases. |
| P2 | Finite kickoff inspected only the first provider agent page while claiming exactly one matching founder; hidden duplicates/targets could be missed before paid work. | `studio/scripts/kickoff.ts` refuses a paginated listing before any session create and releases unstarted reservations. The focused regression observed zero paid creates. |

## Other reviewed boundaries

- `studio/server/db.ts` serializes a connection's unrelated queries and holds its queue through a transaction. Nested repository operations join that transaction. This prevents local concurrent work from leaking into another operation's rollback.
- MCP founder mutations and private file reads execute inside `Repo.withRun()`. The current lease row remains locked through the complete mutation. Status/decision/report and product/version/ship-decision writes share the outer transaction rather than committing partial business history.
- Upload links bind the founder's run token. Staging/commit revalidate the current lease; commit locks its staged snapshot and consumes the link in the same transaction. Failure retains the staged version for a deliberate retry.
- Company creation/publication/storage admissions are locked. A partial unique index limits active companies per founder, including winners. Version numbers and canonical signup identities are constrained. Forward migration `0004` refuses conflicting historical rows rather than deleting evidence; migrations `0001`–`0003` are preserved.
- The trusted product shell holds a random storage capability separate from the reported browser ID. Generated code runs in an opaque iframe and calls an allowlisted message broker bound to its frame/company. Private items require the capability; shared items permit public reads but remain creator-writable. Owner hashes are absent from public responses.
- Required closing reports must contain all seven promised sections before a status/decision change. Report markup and public prose are escaped, executable links are refused, and email addresses are redacted in public prose.
- New schedules are disabled. Kickoff requires explicit local authorization, a key, finite names, positive task/total caps, a budget identity and a future admission deadline. Reservations precede provider creates; ambiguous attempts retain their full allocation. Intervention/fence commands use explicit targets and safe defaults. Root npm commands enter the studio workspace, where its deployment config, migrations and build output agree.

## Independent checks

The reviewer ran the focused integrity, HTTP-security and MCP-fencing suites together: **3 files, 26 tests passed**. These cover transactional rollback/concurrency, upload fencing, private/shared storage, broker restrictions, report validation, ended/expired authority, parsed PUT recovery and paginated kickoff refusal. The full root suite/build remains the lead's integrated delivery gate.

Separate real Chromium probes used an ephemeral local Postgres database and the actual `Repo`/`handleRequest` code, in a dedicated browser session:

1. Reproduced executable XHTML served as XML reading only a synthetic localStorage marker before the universal-CSP repair.
2. Reproduced the opaque-frame module CORS failure.
3. Rechecked repaired module loading and actual browser-to-broker-to-storage add/get. The page rendered `MODULE_AND_STORAGE_OK` while its iframe remained sandboxed without same-origin authority.
4. Navigated directly to the generated XML under the repaired headers. Storage access raised `SecurityError`; the synthetic value was absent.

No production data or real credentials were used in those probes. Browser mode was QA; the database was a disposable local fixture. The initial unsupported probe server and review fixtures are not deployed products.

## Live evidence and limits

[The studio digest](STUDIO_UPDATE.md) attributes the existing public deployment observations to the lead's read-only checks: CORSfix, PayNudge and CramPlan were already present. Their small browser counters include founder testing history. This review did not authenticate historical outreach delivery, outside customers, durable retention, payment or PMF, and the repaired local checkout has **not been deployed** to that URL.

The documentation now preserves these boundaries:

- Browser telemetry is spoofable and browser identity is resettable; QA exclusion is a testing aid, not independent human verification. A rule's `scale` label is an early operational signal.
- A shared platform bearer authenticates the trusted crew. Founder strings/run tokens provide coordination and stale-run fencing, not cryptographic separation between agents holding that bearer.
- Outreach caps/opt-outs govern accepted log entries. Raw browser/shell or provider sending can have effects outside that ledger; approval prompts and worker instructions are not a deterministic sender executor.
- Finite kickoff budgets cover the local ledger's attempts, not existing remote schedules, other machines or the organization's invoice. Editing declarations does not disable previously provisioned schedules or inbox bindings.
- Migration and source changes remain local until an authorized deployment. Historical private records created under public browser-ID ownership cannot be made retroactively confidential by issuing new capabilities. Products must not treat this storage as an authenticated account or secrets vault.
- Studio browser events do not become independently qualified paid-order evidence in the separate service runtime. The two systems retain separate databases, budgets and commercial meanings.

The current README, studio guide, idea digest and update note distinguish those facts from installed/configured capabilities. A clean merged/pushed branch and remote default setting require separate delivery evidence from the lead.
