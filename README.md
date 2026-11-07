# PMF Engine

**An AI venture studio with no human staff.** Several founder agents each run their own company at the same time. Each one finds a real problem people are complaining about online, builds a working web product for it, ships it, goes out and finds users, and then keeps, iterates on, or kills and pivots the company based on what users actually do. The only goal is real users. Every decision, every shipped version, and every time a human stepped in is on a public dashboard.

Built on the [Naïve SDK](https://usenaive.ai/docs) for the Naïve Autonomous Company Hackathon. See `hackathon-rules.md` and `ideas.md`.

## How it works

```
 founder-1 (devs & indie hackers)    founder-2 (freelancers & SMBs)    founder-3 (students & creators)
   every 30 min                         every 30 min, +10                  every 30 min, +20
   find a problem → build → ship → post → read the numbers → iterate / kill → pivot
        │                                    │                                   │
        └──────────────── pmf.* MCP tools ───┴───────────────────────────────────┘
                                             │                   concierge (wakes on inbound email:
                                             ▼                   replies → feedback / signups / opt-outs)
 ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 │ pmf app (Naïve fullstack app + Postgres)                                                   │
 │ /                 studio dashboard: every company, users, versions, decisions, step-ins    │
 │ /c/<slug>         one company: the problem + evidence, versions, decisions, feedback       │
 │ /p/<slug>/        the company's product, shipped by its founder (static web app)           │
 │ /p/<slug>/api/…   the product's backend: a small JSON store (window.pmf.db)                 │
 │ /t.js, /api/t     analytics added to every product page: views, core-action uses,          │
 │                   people who came back, signups, feedback                                  │
 │ /mcp              the agents' tools                                                         │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Real products.** Each founder writes HTML, CSS and JavaScript in its own sandbox computer, checks the code with `node --check`, ships it through `pmf.publish_product`, then opens its own product in a browser and uses it like a new user. Products get `window.pmf` automatically: `pmf.track()` on the core action, `pmf.db.*` for saving data, `pmf.signup()` and `pmf.feedback()`.
- **"Users" means the same thing for every company.** The studio counts unique visitors, people who did the core action, and people who came back in a later hour. It ignores crawlers. Founders never report their own numbers.
- **Decisions are grounded in data** (`server/rules.ts`). Each company gets a verdict: `stalled`, `too_early`, `no_reach` (fix distribution, not the product), `iterate` (people came but didn't use it), `keep` or `scale`. The numbers at that moment are attached to every logged decision.
- **The app enforces the guardrails:** one company per founder, founders can only ship their own company, per-company and studio-wide daily caps on posts and emails, nobody contacted twice in 7 days by any company, an opt-out list, size limits on products and their storage, and a daily budget per agent. Every product page carries a "Built by AI agents" badge.

## What I need from you

You need these before it can run: a Naïve API key, a plan with credits, and at least one social account (X, plus Bluesky, Threads, LinkedIn or Mastodon if you have them; more networks mean more reach).

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

### 2. Give the studio an email domain (free, takes about a minute)
```bash
npx naive identity domain connect --kind system --receive
```

### 3. Set the admin token and deploy
```bash
export PMF_ADMIN_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
echo "$PMF_ADMIN_TOKEN"        # save it: you need it to log interventions
npm run naive:dry              # read the plan: 1 persona + inbox, 1 app, 4 agents, 3 schedules
npm run naive:up               # the report prints the app URL
```
If the report says the inbox is owed, the domain from step 2 wasn't ready yet. Wait a minute and run `npm run naive:up` again.

### 4. Connect the studio's social accounts
```bash
npx naive identity social activate --identity Scout
npx naive identity social portal --identity Scout --platform x     # open the link and sign in (add --platform bluesky etc.)
npx naive identity social accounts --identity Scout
```

### 5. Open the studio
```bash
export NAIVE_API_KEY=$(cat key.txt)
npm run kickoff                # every founder finds a problem, builds, ships and posts, in parallel
```
From here the schedules run everything. Open the app URL to watch.

### 6. Log every time you step in
```bash
export PMF_APP_URL=https://<your app url>
npm run intervene -- "Connected the X account by hand"
```

## Watching and steering

```bash
npx naive session list                         # recent runs of every agent
npx naive session stream --session ses_...     # watch one founder work, live
npx naive agent spend founder-1 --by component
npx naive credits ledger --limit 20
```

- **More companies at once:** add a row to `FOUNDERS` in `crew/crew.ts` (a name, a market, two minutes past the hour), then run `npm run naive:up` and `npm run kickoff -- founder-4`.
- **Spend caps** (`BUDGETS` in `crew/crew.ts`): each founder can spend up to $40/day and $3 per scheduled run. The concierge can spend up to $10/day. With three founders that's $130/day at most.
- **Outreach caps** (`naive.config.ts`): each company gets 6 posts and 15 emails per 24 hours. Across the whole studio the caps are 18 posts and 45 emails.

## Develop locally

```bash
npm run dev        # http://localhost:8790 on a local Postgres (PGlite), MCP bearer "dev"
npm test           # 31 tests: the whole studio against a real Postgres, including the tracker script
npm run typecheck
npm run build      # dist/: the function, rewrites and package.json Naïve deploys
```

| Path | What it is |
|---|---|
| `naive.config.ts` | Everything `naive up` provisions |
| `crew/crew.ts` | The founders and the concierge: markets, prompts, tools, budgets, schedules, kickoff |
| `server/mcp.ts` | The agents' tools (`pmf.*`) |
| `server/rules.ts` | The verdict rules, path and quota rules |
| `server/routes.ts` | Dashboard, products, product backend, analytics |
| `server/pages.ts` | HTML, plus the `window.pmf` tracker every product gets |
| `server/repo.ts`, `sql/` | Data access and schema |
