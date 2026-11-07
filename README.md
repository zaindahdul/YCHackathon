# Formshop

**An agent-run merch shop: send your company’s logo; the company handles the design, approval, production order and delivery.**

The current weekend priority is **one simple physical merch item delivered to a real customer**. Start with a standard mug or other SKU that a local provider confirms it can produce in time. CAD/custom parts are a later upgrade. A store-specific SKU, price and ready time are still unconfirmed; no application, checkout or supplier connection is implemented yet.

## Start here

1. **[Current merch-first plan](docs/merch-first.md)** — offer, production-first check, first buyer, minimal agent loop and physical delivery evidence.
2. [Hackathon rules](hackathon-rules.md) and [event brief](docs/hackathon-brief.md) — mandatory Naïve SDK, live operating business and Sunday 11am cutoff.
3. [SDK research](docs/research/naive-sdk.md) — verified documented primitives and account-level uncertainties. Use ordinary SDK sessions first.
4. [Recording digest](docs/recording-digest.md) — lessons and timestamped source context.

The earlier [CAD company plan](docs/company-plan.md), [CAD build plan](docs/build-plan.md), [acquisition playbook](docs/customer-acquisition.md) and [demo script](docs/demo-playbook.md) remain labeled historical alternatives. Their QR-display-first and paid-CAD-file recommendations are superseded by the simpler merch offer. Do not run both plans in parallel.

The source recording and research remain available below. “Formshop” is a working name, not a cleared brand. No customer outreach, supplier purchase or physical fulfillment has occurred as part of this planning work.

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

Confirm the exact product and local ready time first. In parallel, prove one Naïve session and prepare a provider-compatible logo layout. Recruit one independent customer, agree the exact total/artwork, submit an authorized order, collect it and hand it over. Record human checkout/pickup as human work. Follow the [current merch plan](docs/merch-first.md).
