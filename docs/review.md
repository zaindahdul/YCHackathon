# Independent deliverable review

Reviewed November 7, 2026 by a separate reviewer against the user's request to transcribe the recording, digest the hackathon, and refine an autonomous custom-CAD/merch company for a two-day build.

## Scope and status

Initial review covered `company-plan.md`, `build-plan.md`, `demo-playbook.md`, `hackathon-brief.md`, and both research documents. The replacement transcription was still running during the initial pass. The final pass below reviews the accepted recovered outputs, provenance, quality report, digest and README in addition to the planning package.

No application has been implemented or deployed. That is correctly disclosed throughout the plan and is not a missing deliverable for this transcription/refinement request. No live Naïve session, payment, supplier order, customer demand or manufacturing outcome was inferred from documentation research.

## Material findings reported to the lead

1. **P2 — Resolve conflicting default CAD stacks.** `research/business-landscape.md` originally called CadQuery the default at line 37, while `build-plan.md` lines 14–20 selected native Naïve build123d with CadQuery as fallback. A builder should receive one authoritative choice. Keep the main build plan authoritative and label the research alternative as superseded by the integrated SDK finding.
2. **P2 — Resolve one versus three first products.** `research/naive-sdk.md` originally recommended starting with three parameterized products at line 122; `company-plan.md` line 31 and the actual sprint commit only the QR display. Change the research recommendation to one product, keeping others explicitly optional.
3. **P2 — Resolve competing first offers.** Business research originally proposed a $49 credited deposit against a $399 batch at lines 51/78, whereas `company-plan.md` line 64 selected a $29–$49 digital package and separately quoted physical jobs. These are legitimate alternatives but must not read as simultaneous operating instructions. Name the main plan's current offer and label the batch/deposit economics as a discarded or later experiment.
4. **P2 — Define post-payment cancellation and failure handling.** The customer loop accepts real payment, but the plan originally named `cancelled` and `supplier_blocked` without a refund/reprint policy. `demo-playbook.md` line 52 tells the team to show that policy although none was defined. Specify the offer's included revision limit, cancellation boundary before/after delivery or supplier commitment, failure notification, refund/rework decision owner, and retry-safe reconciliation. Keep financial actions within an explicit configured policy and distinguish refund requested from refund confirmed.

No P0/P1 finding was identified in the initial scope. Line numbers refer to the initially reviewed files and may shift during repairs.

## Strengths relevant to acceptance

- CAD and merchandise are connected through useful branded objects, while custom noncritical parts remain an explicit expansion path.
- The plan accounts for the actual 22-hour hacking window and includes rest, customer validation, verification and a freeze buffer.
- The SDK research separates documented API shapes from authenticated execution. The reviewer independently rechecked the official TypeScript SDK and Computers SDK pages; ESM/client construction and `build3d` example shapes match those docs.
- Payment truth, version-bound approvals, immutable files, duplicate prevention, customer ownership and supplier acknowledgment are explicitly treated as application responsibilities.
- Physical arrival is not promised without confirmed capacity; digital fulfillment has an explicit scope and does not purport to validate physical-demand assumptions.
- Demo claims are tied to actual evidence and founder intervention is counted separately from ordinary customer approvals.

## Optional suggestions, not release blockers

- Use one canonical first-offer box at the top of the README so a new teammate can identify the product, price experiment, CAD path and 11am cutoff quickly.
- For the eventual application, prioritize a completed real order over additional agent roles, templates or mobile-prize integrations.

## Repair check and additional context

The lead repaired all four initial findings: the business research now labels its CAD/price alternatives as unselected and links to the authoritative synthesis; SDK research specifies one first product; and `build-plan.md` now defines cancellation, supplier rejection, refund/reprint state, duplicate prevention, provider reconciliation and manual exception ownership. These changes were read in the actual files.

The preserved remote `hackathon-rules.md` was also reviewed. It flags the `skill.md` versus team-documentation availability discrepancy, which must remain an explicit early integration test with a sequential SDK-session fallback. It also records an unconfirmed submission format and organizer discretion on prebuilt code. Those should be carried into the build/submission checklist, not silently resolved by the plan.

The replacement full-model transcript was sampled across the opening, 5/10/15/20/30/40/50/60/64-minute regions. It is substantially more coherent than the rejected turbo pass. A localized repeated-phrase failure at approximately 57:35–58:01 was reported to the lead for focused recovery; unusually long “Thank you” segments were also identified as uncertainty regions, not proof of substantive coverage. These findings remain subject to the recovery/quality report and final digest review.

## Final review evidence

The final pass read the README, recording digest, transcript notes, source metadata, quality report, recovery/merge scripts and updated plan/research. The sequential SDK-session baseline now explicitly avoids depending on the disputed native team feature. The README links the preserved existing hackathon rules. Refund arithmetic now correctly bounds a new refund by collected funds minus confirmed prior refunds, with cumulative confirmed refunds capped at the collected amount.

The accepted transcript has 877 ordered segments and 8,717 words, covering offsets 0.00 through 3884.02 seconds of a 3885.46-second source. All five formats exist. Independent checks confirmed TXT/JSON agreement, SRT/VTT cue counts, preserved original full-model output, and exact text provenance for all 14 segments inserted from the three focused repairs. The repeated phrase previously reported around 57–58 minutes no longer appears as a consecutive loop. Seven long low-content transition segments and six gaps over ten seconds remain explicitly flagged; they are not represented as an accuracy score or invented recovered speech.

The digest's material themes were checked against transcript windows, including first-customer advice around 32:45–35:25, critical user journeys around 11–14 minutes, and sponsor introductions. It distinguishes the user's proposed company from the recorded talks and identifies inferred sponsor names and unreliable URLs/codes. There was no complete human audio listening audit, so uncertain names, technical terms and room chatter remain declared transcription limitations.

The reviewer independently ran:

- `python3 scripts/verify_deliverables.py transcript` — passed.
- `python3 scripts/verify_deliverables.py research` — passed.
- `python3 scripts/verify_deliverables.py plan` — passed, including all 33 planning document links and 3 research-local links.
- Additional JSON provenance and SRT/VTT cue-count checks — passed.

These checks verify repository artifacts and source traceability. They do not establish live SDK access, customer demand, checkout, supplier capacity, physical manufacturability or future application acceptance. The planned PR delivery requires the lead's separate remote/PR verification after publishing.

## Final disposition

**No unresolved material findings** in the reviewed transcription, research, business refinement and implementation planning package. All four initial planning findings and the later refund-arithmetic correction were repaired and rechecked. The native-team availability discrepancy has an explicit working fallback and remains a disclosed account-level experiment. Remaining ASR uncertainty and untested business/integration assumptions are stated with their practical limits; they are not presented as completed product behavior.

## Follow-up acquisition-plan review — November 7, 2026

Reviewed the newly added `customer-acquisition.md` and the actual README, company-plan, build-plan, demo-playbook and verifier changes for the user's request to market the idea and obtain real users within the remaining hackathon window. This review covers the written acquisition strategy and its integration; it does not establish that any outreach or customer acquisition occurred.

No material finding was identified:

- The plan targets an actual job, deadline, buyer and fabrication route. It directly addresses the weak fit between physical-object demand and a digital-only deliverable instead of treating free renders as validation.
- Nearby opt-in conversations and warm introductions have bounded effort while the second founder builds. Channel access and conversions are explicitly unverified; proposed counts and timing are learning targets rather than forecasts or promised outcomes.
- The $39 pilot is a concrete experiment within the existing digital-service range. Copy distinguishes files from printing/shipping and is conditional on an actual deliverable and agreed window. Latency, scarce slots and physical delivery are not invented.
- The plan distinguishes previews, substantive revision, payment, digital delivery, downstream activity and physical use. Founder/team purchases and test payments are excluded from independent customer revenue.
- The demand-based cradle/fixture alternative explicitly replaces the first template and updates scope; it does not authorize an arbitrary-CAD backlog or a simultaneous second catalog.
- Founder-led recruiting is disclosed separately from agent operations. Draft messages remain drafts, scheduling depends on an agreed communication policy, and this planning request does not authorize sending or posting.
- The acquisition loop stops adding leads when delivery is failing, preserves a review time before people sleep, and avoids unfulfillable commitments near judging.

`python3 scripts/verify_deliverables.py plan` passed with 40 valid local links. The reviewer also checked the official Stripe Payment Links setup page: hosted checkout is a supported option, while the plan correctly retains account-readiness, test/live and payment-reconciliation requirements. The YC source URL was reachable but did not expose readable text through the browser reader; its general advice is background context, not evidence of demand or channel access.

**Follow-up disposition: No unresolved material findings** in the acquisition-plan addition and its reviewed consistency edits. Real customer need, willingness to pay, delivery capability and access remain explicit experiments for execution. Existing PR updates and remote commit verification remain the lead's delivery responsibility.

## Merch-first correction review — November 7, 2026

Reviewed the current `merch-first.md`, rewritten README, superseded banners in the former CAD company/build/acquisition/demo documents, and the planning-reference check. Scope is the latest short-window business plan and PR documentation update, not an implemented shop or authorization to contact suppliers or place orders.

**No unresolved material findings** in this correction:

- One simple standard physical item replaces the CAD-file offer; no CAD exporter, viewer, custom geometry or separate hardware need remains on the critical path.
- Default completion is the actual physical handoff to an independent customer before judging. A mockup, approved layout, payment, accepted order and later-delivery promise are explicitly distinct from that outcome.
- Supplier selection precedes customization work. Exact store/SKU, equipment, stock, cutoff, ready time, collection and customer receipt must all be checked; generic same-day advertising is expressly insufficient.
- The standard Staples noon cutoff is correctly described as passed. An independent check of the same official page additionally found paid express pickup for limited quantities, with a stated three-hour turnaround and a cutoff three hours before closing. This was sent to the lead as an optional route to verify, not confirmation that a given mug/store supports it.
- CVS remained inaccessible to this reviewer on the attempted page fetch. The plan treats it as a candidate requiring store-specific confirmation, not guaranteed capacity, and does not require CVS to succeed.
- The first buyer can be a nearby hackathon team with a real merch need. The price is based on actual supplier/handling cost; the former $39 digital offer no longer governs this plan.
- Human supplier checkout, collection and exception handling are allowed but explicitly counted as human work; ordinary Naïve SDK sessions handle the measurable agent work. Assisted fulfillment is not presented as unattended autonomy.
- README precedence and all four historical-plan banners consistently point to the merch-first plan. CAD is a later option, not a parallel weekend commitment. Existing research and transcript remain supporting context rather than evidence of live orders.

`python3 scripts/verify_deliverables.py plan` passed with 43 valid local links. This disposition does not verify store capacity, order placement, actual customer demand, public deployment, or physical delivery; those remain explicit execution checks. The lead retains responsibility for the updated PR commit and remote verification.
