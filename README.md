# Formshop

**An agent-run custom-object shop: a founder describes what they need; the company designs it, checks it, quotes it, and runs the job.**

This repository currently contains the hackathon recording, research, and an implementation-ready company plan. It does **not** contain a built storefront, connected agents, checkout, or supplier integration.

**First offer:** one QR-display product family; test $29–$49 for an approved digital design package with one revision. Physical production requires a confirmed separate quote. Native Naïve build123d is the first CAD path.

The recommended first product is a **custom branded QR desk display** for startup teams. CAD and merch meet in a useful physical object. Expand into phone stands, organizers and noncritical custom fixtures after the first order loop works. “Formshop” is a working name, not a cleared brand.

## Start here

The existing [hackathon rules](hackathon-rules.md) remain the repo’s event source of truth. This package adds recording evidence and a proposed company plan without changing those rules.

1. [Company and offer](docs/company-plan.md) — customer, product, pricing experiments, agent roles, differentiation and expansion.
2. [22-hour build plan](docs/build-plan.md) — first integration spike, architecture, states, two-person schedule, failure handling and acceptance checks.
3. [Demo playbook](docs/demo-playbook.md) — pitch, live evidence, field validation and judge questions.
4. [Recording digest](docs/recording-digest.md) — timestamped lessons and source limitations.
5. [Event brief](docs/hackathon-brief.md) — supplied rules, logistics, sponsors and schedule.

The formal build window is **Saturday November 7, 13:00 → Sunday November 8, 11:00 Pacific: 22 hours**. The first useful milestone is one real brief → one real CAD export → one complete delivery loop.

## Findings that shape the plan

- Naïve documents native `build_3d` CAD generation with build123d, STEP/STL exports, previews and geometry checks. Use it before creating separate CAD infrastructure. [Verified SDK research](docs/research/naive-sdk.md)
- A company must own revisions, quality, pricing, approval and delivery. A prompt-to-CAD viewer alone does not establish an operating business. [Company plan](docs/company-plan.md)
- Local printer access is unconfirmed. Standard remote merch fulfillment does not support a guaranteed weekend arrival. Sell an explicitly scoped digital design package first; promise physical fulfillment only after a provider confirms it. [Supplier research and alternatives](docs/research/business-landscape.md)
- Current research describes documented capabilities; authenticated SDK runs, customer demand and supplier availability remain build-time checks. All price points and unit economics are labeled experiments/assumptions.

## Recording

Source: `New Recording 35.m4a`, 64m45.46s, left in its original Downloads location. Audio has not been copied into Git. [Source provenance and reproduction command](transcripts/source.json).

- [Plain transcript](transcripts/hackathon-recording-35.txt)
- [Timestamped transcript](transcripts/hackathon-recording-35.srt)
- [WebVTT](transcripts/hackathon-recording-35.vtt)
- [JSON segments](transcripts/hackathon-recording-35.json)
- [TSV](transcripts/hackathon-recording-35.tsv)
- [Transcription notes](transcripts/README.md) and [quality report](transcripts/quality-report.json)

Raw automatic transcription is retained separately from interpretation. Speaker identities and ambiguous names/URLs are not silently corrected into facts. Read the quality notes before quoting it.

## Verification and review

```sh
python3 scripts/verify_deliverables.py all
```

This checks transcript structure, coverage, repetition, source linkage and local document references. It does not validate the future application. [Independent review and repairs](docs/review.md) records the content review. [THINKPAD.md](THINKPAD.md) preserves the planning acceptance criteria and task evidence.

## First build session

Pair on a 45-minute Naïve access/CAD spike. In parallel, obtain one consenting customer's actual request and confirm printer access. Build one supported product through revision and delivery before adding email, additional templates or mobile automation. The detailed [build plan](docs/build-plan.md) defines honest fallbacks and the integration checks the application must pass.
