# PMF Engine

**An autonomous company that searches for its own product-market fit.** It launches free offers, finds people on X and by email, delivers the work to everyone who signs up, and kills or pivots whatever the numbers say is not working. Every decision and every human step-in shows up on a public dashboard.

Built on the [Naïve SDK](https://usenaive.ai/docs) for the Naïve Autonomous Company Hackathon. See `hackathon-rules.md` and `ideas.md`.

## How it works

```
             every 2h                     every 30 min                    every 10 min + on inbound email
        ┌──────────────┐  send_to_agent ┌──────────────┐               ┌──────────────┐
        │  strategist  │ ─────────────▶ │    growth    │               │   operator   │
        │ launch / kill│                │ X posts +    │               │ delivers to  │
        │ pivot / scale│                │ cold emails  │               │ every signup │
        └──────┬───────┘                └──────┬───────┘               └──────┬───────┘
               │          pmf.* MCP tools      │                              │
               ▼                               ▼                              ▼
        ┌─────────────────────────────────────────────────────────────────────────────┐
        │  pmf app (Naïve fullstack app + Postgres)                                   │
        │  /            public dashboard: experiments, decision log, outreach,        │
        │               deliveries, human interventions                               │
        │  /x/<slug>    one landing page per experiment: counts visitors, takes signups│
        │  /mcp         the agents' tools: scoreboard, quotas, decisions, signups      │
        └─────────────────────────────────────────────────────────────────────────────┘
```

- **The decisions are grounded in real numbers.** The app counts visitors, signups and outreach itself and computes a rule-based verdict for each experiment (`server/rules.ts`): `too_early`, `no_reach` (fix the channel, not the product), `keep`, `scale` or `kill`. The strategist makes the final call, logs the reasoning, and the numbers at that moment are attached automatically.
- **Guardrails are in the app, not just the prompts.** There are daily quotas for X posts and emails, a 7-day rule against contacting anyone twice, an opt-out list, at most 3 live experiments, and a daily budget per agent.
- **There's no fake traction.** The agents are told never to invent customers or results, and every landing page says it is run by an AI company.

## What I need from you

You need these before it can run: a Naïve API key, a plan with credits, and an X account for the company to post from.

The commands below are for Git Bash. In PowerShell, use `Get-Content key.txt | npx naive login` instead of `< key.txt`, and `$env:NAME = "value"` instead of `export NAME=value`.

### 1. Install and log in
```bash
npm install
# Save your API key (from https://app.usenaive.ai) in key.txt. It's gitignored. Never paste it into a command.
npx naive login < key.txt
npx naive claim < key.txt
npx naive whoami
npx naive plan show            # needs status: active. If not: npx naive plan subscribe (opens checkout)
npx naive credits show
```

### 2. Give the company an email domain (free, takes about a minute)
```bash
npx naive identity domain connect --kind system --receive
```

### 3. Set the admin token and deploy
```bash
export PMF_ADMIN_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
echo "$PMF_ADMIN_TOKEN"        # save it: you need it to log interventions
npm run naive:dry              # read the plan: 1 persona + inbox, 1 app, 3 agents, 4 schedules
npm run naive:up               # the report prints the app URL
```
If the report says the inbox is owed, the domain from step 2 wasn't ready yet. Wait a minute and run `npm run naive:up` again.

### 4. Connect the company's X account
```bash
npx naive identity social activate --identity Scout
npx naive identity social portal --identity Scout --platform x     # open the link and sign in to X
npx naive identity social accounts --identity Scout                # should list the X account
```

### 5. Start the company
```bash
export NAIVE_API_KEY=$(cat key.txt)
npm run kickoff                # the strategist launches 3 experiments and briefs growth
```
From here the schedules run everything. Open the app URL to watch the dashboard.

### 6. Log every time you step in
```bash
export PMF_APP_URL=https://<your app url>
npm run intervene -- "Connected the X account by hand"
```
Judges ask where you had to step in. Every entry shows on the dashboard.

## Watching and steering

```bash
npx naive session list                         # recent runs of all three agents
npx naive session stream --session ses_...     # watch one live
npx naive agent spend strategist --by component
npx naive credits ledger --limit 20
```

**Spend caps** (in `crew/crew.ts`, `BUDGETS`): strategist $15/day, growth $30/day, operator $30/day, so $75/day at most. Each run is capped as well: $2 per strategist review, $1.50 per growth or operator run. Outreach caps (in `naive.config.ts`): 40 emails and 16 X posts per 24 hours.

## Develop locally

```bash
npm run dev        # http://localhost:8790 on a local Postgres (PGlite), MCP bearer "dev"
npm test           # 29 tests, covering the whole loop against a real Postgres
npm run typecheck
npm run build      # dist/: the function, rewrites and package.json Naïve deploys
```

| Path | What it is |
|---|---|
| `naive.config.ts` | Everything `naive up` provisions |
| `crew/crew.ts` | The three agents: prompts, tools, budgets, schedules, kickoff brief |
| `server/mcp.ts` | The agents' tools (`pmf.*`) |
| `server/rules.ts` | The keep / kill / scale rules |
| `server/routes.ts`, `server/pages.ts` | Dashboard, landing pages, signup form |
| `server/repo.ts`, `sql/` | Data access and schema |
