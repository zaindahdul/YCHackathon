# Thinkpad — Transcribe the hackathon recording and refine the autonomous fabrication company
<!-- pad:v1 -->

<!-- Edit this file by hand freely. `pad` reads and writes it; it never reformats
     prose sections. Task lines must keep the `- [ ] T1 · title` shape. -->

## Goal

Produce a complete local MLX Whisper transcript of the supplied 64m45s recording with timestamped machine-readable outputs and source provenance; digest the recording and pasted hackathon brief; refine the custom CAD/merch autonomous-company concept into a differentiated, feasible business and implementation-ready plan through the November 8 11am cutoff. Deliver source-backed SDK/supplier research, concrete customer and agent journeys, bounded MVP and failure handling, economics assumptions, two-person schedule, and an honest live-demo/evidence plan. This request is transcription and business/product planning, followed by the user-requested GitHub pull request so the cofounder can review everything. It does not require building or deploying the application in this turn.

## Constraints
- **Max concurrency: 3**

## Decisions

- Preserve raw ASR separately from the interpreted digest. No invented speaker attribution.
- SDK research and supplier research run in separate child scopes; lead owns transcription and synthesis.

## Open questions

- Printer access is optional clarification, pending; assume no confirmed printer and plan a credible digital fulfillment fallback.
- Confirm event details against the recording; supplied schedule has only 22 hacking hours, Saturday 13:00 to Sunday 11:00.

## Tasks

- [x] T1 · Transcribe complete recording and inspect coverage/ASR quality
      files: transcripts, scripts/verify_deliverables.py
      accept: python3 scripts/verify_deliverables.py transcript
- [x] T2 · Verify Naive SDK and current supplier/market capabilities
      files: docs/research/naive-sdk.md, docs/research/business-landscape.md
      accept: python3 scripts/verify_deliverables.py research
- [x] T3 · Synthesize recording, business, architecture, sprint, and demo plan
      files: README.md, docs/hackathon-brief.md, docs/recording-digest.md, docs/company-plan.md, docs/build-plan.md, docs/demo-playbook.md
      accept: python3 scripts/verify_deliverables.py plan
      deps: T1, T2
- [x] T4 · Independently review and repair full deliverable package
      files: docs/review.md
      accept: python3 scripts/verify_deliverables.py all
      deps: T3
- [x] T5 · Commit review package and open cofounder-facing GitHub PR
      files: README.md, docs/pr-delivery.md
      accept: python3 scripts/verify_deliverables.py delivery
      deps: T4
## Log

- 2026-11-07 · thinkpad created
- 2026-11-07 · done T1 · Transcribe complete recording and inspect coverage/ASR quality
- 2026-11-07 · done T2 · Verify Naive SDK and current supplier/market capabilities
- 2026-11-07 · done T3 · Synthesize recording, business, architecture, sprint, and demo plan
- 2026-11-07 · done T4 · Independently review and repair full deliverable package
- 2026-11-07 · done T5 · Commit review package and open cofounder-facing GitHub PR
