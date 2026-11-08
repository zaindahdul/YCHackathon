# PMF Engine

**An AI venture studio: several founder agents build products, find users and decide what to improve or pivot.** Each founder starts with a different market, shares the studio's publishing and analytics infrastructure, and keeps its product/version history and reports visible.

The latest direction comes from [PR #4](https://github.com/zaindahdul/YCHackathon/pull/4). It is integrated in [`studio/`](studio/README.md). The earlier fulfillment/payment company remains available under `src/`; both are tested together.

## Current studio

The collaborator's [existing live deployment](https://pmf-2rdynba3hkaq.vercel.app/) currently lists **CORSfix**, **PayNudge** and **CramPlan**. These are the founders' first products, not fixed tracks. During this update, read-only health/state checks and a real browser confirmed the public dashboard responds. Its small counters include founder QA history and do not prove real outside customers or PMF. See the [full digest and verification boundary](docs/STUDIO_UPDATE.md).

The studio provides:

- A public dashboard and company pages with problems, source threads, shipped versions and decisions.
- Static products at `/p/<slug>/`, with a browser SDK for core-action telemetry, feedback, signup and small JSON storage.
- Structured reports with database snapshots when a founder iterates, scales or kills a test.
- Founder run leases, uploads from sandbox files, transactional publication and forward-only migrations.
- Explicit local authorization for finite paid kickoff; schedules and inbound automation are disabled by default in this checkout.

The local integration repairs are **not deployed** to that live URL. Editing these files does not change the collaborator's already-running agents or permissions.

## Develop locally

Requires **Node 24+** and npm. Video tests for the retained runtime also require `ffmpeg` and `ffprobe`.

```sh
npm ci
npm run dev             # studio at http://127.0.0.1:8790; local PGlite
npm run check           # both workspaces: typecheck + tests
npm run build           # both workspaces
```

A fresh local studio is empty. Use its MCP API to start a company and publish a local test product; see [studio setup](studio/README.md). Local development uses the `dev` bearer on loopback. It does not create Naïve resources, send outreach or start a provider session.

```sh
npm run studio:test
npm run studio:typecheck
npm run studio:build
npm run naive:dry        # authenticated deployment planning; read setup first
npm run naive:up         # deployment changes external resources; explicitly authorize first
npm run kickoff -- founder-1  # paid work; requires explicit live preflight
```

The root commands route to the studio workspace and its `naive.config.ts`. Keep provider keys, owner tokens and customer state out of Git. This integration does not require a new all-permission/admin key. Use permissions specific to the operation; the organization CEO script previews proposed changes and requires separate explicit application.

## Retained service runtime

The `src/` runtime operates bounded service experiments: microtools, property reels, launch clips and disabled mobile QA. It produces checked local artifacts, binds approval/payment/download to an immutable order, and allocates from independently qualified evidence. It remains a separate system with its own SQLite database; studio telemetry does not become qualified paid-order evidence.

```sh
npm run company -- init
npm run company -- doctor
npm run demo -- --db data/demo-first.sqlite
npm run runtime:test
```

The demo uses labeled fixtures and makes no live calls. [Service architecture](docs/ARCHITECTURE.md), [operating rules](docs/OPERATING_MODEL.md) and [Naïve adapter details](docs/NAIVE_SETUP.md) describe that runtime. Studio products are free; no automatic Stripe connection or shared budget between workspaces is implied.

## Start here

- [Current idea and markets](ideas.md)
- [Studio digest, live observations and limitations](docs/STUDIO_UPDATE.md)
- [Studio setup](studio/README.md) and [independent integration review](docs/STUDIO_REVIEW.md)
- [Delivery record](docs/DELIVERY.md), [durable acceptance plan](THINKPAD.md)
- [Hackathon rules](hackathon-rules.md), [recording digest](docs/recording-digest.md), [MLX Whisper transcript and provenance](transcripts/README.md)
- [Historical proposals](docs/archive/README.md), [earlier service-runtime review](docs/REVIEW.md)

```sh
python3 scripts/verify_deliverables.py all
python3 scripts/verify_deliverables.py delivery
```
