# Ideas and current implementation

**Newest evidence and candidate:** [BOT_HANDOFF.md](BOT_HANDOFF.md) maps the Launchpad PRs and [both founder replies](docs/customer-research/README.md). Aditya adds a distribution-first, per-launch hypothesis; Jesai prioritizes company-aware comment support. Choose one real founder trial rather than building both entire workflows; neither is proven PMF. No final pivot approval is recorded.

## Implemented on main: autonomous venture studio

Build one company whose job is to discover and operate useful small software products. Three founder agents work in different markets, each owns one active product, and they share publishing, analytics, feedback, reports and the studio inbox. Each founder can improve its company or kill it and start a child hypothesis from what it learned.

The concrete user promise is simple: open one of the products, paste your problem or enter a few inputs, and get a useful result immediately. No signup wall should stand between a visitor and the core value.

## First three products

| Market | Current product observed in the collaborator's deployment | Useful outcome |
|---|---|---|
| Developers and indie makers | **CORSfix** | Paste a CORS error, choose a backend, get a diagnosis and suggested fix |
| Freelancers and small businesses | **PayNudge** | Enter an overdue invoice and generate a suitable payment reminder |
| Students and creators | **CramPlan** | Enter exams and available hours, get a weighted study plan |

These products are live artifacts, not proof of PMF. Public counters at the earlier integration check had very small samples and founder QA history. The studio's `scale`, `iterate` and `no_reach` labels are operational hypotheses based on browser telemetry, not independent validation of people, revenue or retention.

## What makes the company autonomous

Each founder discovers complaints, cites source threads, ships a working browser product, inspects its version's activity and feedback, and records its next decision. Required reports explain the hypothesis, implementation, distribution, results, user words, learning and next step. The owner can inspect the full story, including interventions and failed tests.

Expansion means starting another evidence-informed hypothesis within the current capabilities and authority. It does not mean granting new permissions, claiming fake users or letting an unreviewed product change the studio controller. Run tokens fence stale work; trusted-crew names are not a cryptographic per-agent identity boundary.

## Getting users quickly

Use the problem's existing audience and language. A useful first result, a clear link and a relevant explanation make a better first test than building more studio features. The proposed acquisition work is:

1. Find recent threads asking for the exact outcome and record their URLs; a public complaint is research, not permission to message its author.
2. Demonstrate one working product to reachable consenting builders or an approved community. Keep founder QA separate from outside usage.
3. Collect specific feedback: what they tried, whether the result helped and what prevented another use. A signup or compliment alone is weak evidence.
4. Test one change per version where practical. If nobody arrives, change distribution; if visitors arrive but never reach value, repair the product or promise.

The collaborator's source includes social/email distribution. Local declarations now require approval for direct sending tools, and app quotas govern logged actions only. No new outreach is authorized or sent by this update. See [studio boundaries](docs/STUDIO_UPDATE.md) before live operation.

The previous four service offers remain in [config/experiments.seed.json](config/experiments.seed.json) for the retained fulfillment runtime. They are not simultaneous studio product promises. [Earlier proposals](docs/archive/README.md) preserve the history.
