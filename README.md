# Naïve Company

**One agent-run company that tests several offers, fulfills customer work, and starts its next experiment from customer feedback.**

The company is the experiment loop: discover demand → agree an exact job → produce a checked artifact → collect payment → transfer it → learn → allocate the next budget. New audience/offer combinations share the same customer, fulfillment and accounting infrastructure.

This repository contains a working **headless TypeScript runtime and JSON customer API**. Local simulations and offline integration tests pass. **It has not run against a live Naïve account, acquired customers, received real payments or been deployed publicly.** The default spend is zero. These are early market experiments; none has established PMF.

## Four starting experiments

| Offer | Price hypothesis | Current fulfillment |
|---|---:|---|
| Requested browser microtools | $19 | Working offline CSV deduper, JSON formatter or UTM builder; acceptance examples required |
| Property listing reels | $49 | Real silent vertical MP4 from customer-authorized images; approved facts in manifest |
| Indie launch clips | $29 | Same video pipeline; local authorized recording also supported through operator intake |
| Mobile review reproduction | $29 | Seed retained, **disabled** pending real device collector; public intake returns 503 |

Two offers can be active by default. The controller rotates untested offers, protects pending customer jobs, reallocates uncommitted funds after paid-delivery evidence, and can admit a child experiment supported by feedback from two independent customers. It cannot add capabilities, increase its own global budget or grant itself new permissions. Read [ideas.md](ideas.md) for the starting hypotheses and customer acquisition test.

## Run locally

Requires **Node 24+**, npm and `ffmpeg`/`ffprobe` for video. Microtools need no media tools.

```sh
npm ci
npm run check
npm run company -- init
npm run company -- doctor
npm run company -- status
npm run demo -- --db data/demo-first.sqlite
```

The demo uses a fresh, separate simulation database and labeled fixture responses. It creates an actual offline HTML artifact under `data/artifacts/`. It does not contact a provider or count a customer, sale or delivery. Choose another demo database filename when rerunning.

## Live setup

1. Copy `.env.example` to ignored `.env`. Set a real `NAIVE_API_KEY`, a 24+ character owner API token and a separate 32+ character customer secret. Keep credentials out of Git and chat.
2. Copy `config/policy.example.json` to ignored `config/policy.local.json`. Set the owner's **authorized** total/per-task budget, deadline, enabled capabilities, channels and tool permissions. The example deliberately has `liveAuthorized: false`, zero budget and empty permissions. Do not reuse the demo database.
3. Initialize a new live database and apply that policy before any operational history:

```sh
npm run company -- init --db data/live.sqlite
npm run company -- policy --db data/live.sqlite --file config/policy.local.json
npm run company -- doctor --db data/live.sqlite
npm run company -- serve --db data/live.sqlite
# In a separate terminal; finite cycles, bounded by stopAt:
npm run company -- run --db data/live.sqlite --cycles 4 --interval-seconds 900
```

The API defaults to `127.0.0.1:3000`. `serve` and the worker are separate processes sharing SQLite. A process lease prevents two workers from spending concurrently. Setting `--host 0.0.0.0` alone does not deploy or secure a public service; provide your actual HTTPS hosting/URL before external use.

For paid orders, configure real Stripe credentials, `COMPANY_PUBLIC_URL`, and the signed webhook at `/api/stripe/webhook`. Test checkout and test webhook events cannot become live revenue. No key, budget, checkout or provider connection is provisioned by these commands. See [architecture and customer API](docs/ARCHITECTURE.md) and [Naïve setup](docs/NAIVE_SETUP.md).

## Autonomy and evidence

- Durable jobs, scope hashes, provider receipts, cost reservations, decisions and audit events survive restarts. Unknown bills keep their reservation and stop funded cycles; use `reconcile`, then `finalize` existing output rather than retrying paid work blindly.
- Customer requests create immutable orders. Exact approval enables automatic fulfillment. Payment is customer-initiated hosted checkout; signed provider receipts gate downloads. All package responses must complete before a transfer receipt is recorded. Transfer is not proof of use or satisfaction.
- Feedback is private to an order. Public buyers start unqualified; `qualify --lead ID --evidence '...'` is an audited operator intervention. Contact deduplication is not identity verification. PMF decisions require qualified independent evidence.
- Exploration gets bounded cycle slots alongside fulfillment. Generated artifacts, free pilots, draft messages, test payments and simulated evidence stay distinct from paid customer outcomes.
- Scouting can collect public prospects. `allowedSourceDomains` filters accepted source URLs and instructs the worker; it is **not a hard tool-level network boundary**. Outbox entries are drafts; no email/community sender is connected.

The software implements the bounded loop. A fully operating company still needs a live account, authorized budget/contact scope, reachable customer intake and actual customers. Mobile QA needs a collector. The current video renderer does not add voiceover/captions/music, and microtools use three audited templates rather than arbitrary generated apps.

## Repository guide

- [Operating rules and allocation](docs/OPERATING_MODEL.md)
- [Architecture, API examples and recovery](docs/ARCHITECTURE.md)
- [Independent review](docs/REVIEW.md), [delivery record](docs/DELIVERY.md), [durable acceptance plan](THINKPAD.md)
- [Original hackathon rules](hackathon-rules.md), [event brief](docs/hackathon-brief.md)
- [Recording digest](docs/recording-digest.md), [transcription/provenance](transcripts/README.md)
- [Historical ideas and plans](docs/archive/README.md); earlier single-idea proposals are superseded

```sh
npm run check
npm run build
python3 scripts/verify_deliverables.py all
python3 scripts/verify_deliverables.py delivery
```

The Python checks validate retained transcript/document references and remote branch delivery. Behavioral tests exercise local rendering, the real SDK parsers with offline transports, and the customer/payment/transfer loop. They do not establish live demand or a live provider connection.
