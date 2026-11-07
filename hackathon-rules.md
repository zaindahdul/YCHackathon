# Hackathon Rules
# Naïve Autonomous Company Hackathon — Context & Rules

> **Source of truth for this repo.** Every idea, design decision, and line of code here should be checked against this file.
> Event page: https://events.ycombinator.com/naive-autonomous-companies-hackathon
> Information pulled from the event page and the Naïve docs on **2026-11-06**. Judges and mentors had not been announced yet, so re-check the page on the day.

---

## TL;DR

| | |
|---|---|
| **Event** | Naïve Autonomous Company Hackathon: *"Build an agent-run company that runs itself"* |
| **Hosts** | Naïve + Y Combinator |
| **When** | **Sat Nov 7, 2026 at 11:00 AM** to **Sun Nov 8, 2026 at 2:30 PM** (Pacific) |
| **Hacking window** | **Sat 1:00 PM to Sun 11:00 AM, about 22 hours** |
| **Where** | YC office, San Francisco, CA. In person only, and you must attend both days |
| **Capacity** | 200 attendees |
| **Team size** | Up to **5** (solo is OK, and you can find teammates at kickoff) |
| **Hard requirement** | **You must build with the Naïve SDK.** Docs: https://usenaive.ai/docs |
| **What judges score** | **How much of the company runs without you.** This is a live demo of a company actually operating |
| **Top prize** | iPhone 18 Pro / AirPods 5 + **guaranteed YC interview** + $50k+ in sponsor credits |

---

## The brief (verbatim from the event page)

> **A two-day hackathon for builders who want to start a company run by agents.**
>
> Join Naïve at the YC office in San Francisco. Choose a business, build its team with the Naïve SDK, and put it to work: finding customers, delivering the product, and running day-to-day operations.
>
> At demo time, show the company operating. Not just what it could do, but what its agents actually accomplished. What did they deliver? What decisions did they make? Where did you need to step in?
>
> Applications are reviewed by Naïve and YC, and attendance is subject to approval.

### What you can build

> **Build any company that is primarily run by agents. The industry and business model are up to you.**
>
> **All teams must use the Naïve SDK to build their company.**

Example directions (these are **not** required tracks):

- **Media companies:** Agents decide what to publish, produce the content, and use audience results to plan what comes next.
- **Agencies:** Agents find prospects, scope projects, deliver client work, and manage follow-up.
- **Commerce businesses:** Agents choose what to sell, run campaigns, handle customer requests, and adjust based on sales.
- **Software businesses:** Agents build a product, bring in users, handle support, and decide what to improve from customer feedback.

---

## What the judges are looking for

These points come straight from the brief and the rules. Use them to filter every idea.

1. **Autonomy is the headline metric.** *"Judges will focus on how much of the company runs without you."*
2. **Show real results, not capability.** *"Not just what it could do, but what its agents actually accomplished."* Plan for actual customers or users, actual deliverables, and actual money or engagement during the roughly 22 hours.
3. **Be ready to answer three questions at demo time:**
   - **What did they deliver?** These are concrete outputs and artifacts.
   - **What decisions did they make?** Show the agents choosing things, such as what to sell, publish, or prioritize, not just following a script.
   - **Where did you need to step in?** Be honest about human-in-the-loop points. Fewer interventions score better, but they should be visible and logged.
4. **The whole company loop matters:** finding customers, delivering the product, and running day-to-day operations. Covering more of that loop with agents is stronger.
5. **It's a live demo.** It has to work in front of the judges.

**Implication:** the strongest projects will probably keep a visible **operations log or dashboard** showing agent decisions, spend, outputs, and human interventions over the hackathon window. Start the company running early so there is real history to show.

---

## Schedule (Pacific time)

**Saturday, Nov 7, 2026**
| Time | |
|---|---|
| 11:00 AM | Doors open |
| 11:30 AM | Welcome note |
| 12:00 PM | Lunch served |
| **1:00 PM** | **Hacking begins** |
| 6:30 PM | Dinner served |

**Sunday, Nov 8, 2026**
| Time | |
|---|---|
| 9:00 AM | Breakfast served |
| **11:00 AM** | **Hacking stops, judging begins** |
| 12:00 PM | Lunch served |
| 1:00 PM | Final presentations |
| 1:45 PM | Winner announcement + prizes |
| 2:30 PM | Event ends |

---

## Rules & logistics (verbatim)

- Plan to attend both days in San Francisco. Come solo, bring a team, or meet teammates at kickoff.
- Apply through this page. Only approved attendees may attend.
- Attendees must be at least 15. Participants aged 15-17 must have YC's parental consent form signed before the event.
- Teams will present live demos. Judges will focus on how much of the company runs without you.
- Meals, snacks, and non-alcoholic drinks will be provided. Bring your laptop and charger.

**Application form fields:** date of birth, LinkedIn, education, work history, SF availability for Nov 7-8, affiliation, and parent/guardian contact if under 18. Teams apply together (team applications are enabled, max team size 5).

---

## Prizes

**Overall:** 1st, 2nd and 3rd place.

| Place | Prize |
|---|---|
| **1st** | iPhone 18 Pro / AirPods 5 **AND a guaranteed YC interview**, plus **$50,000+ in sponsor credits** |
| **2nd** | Mac Mini / AirPods 5 |
| **3rd** | Mac Mini |
| **Everyone** | $1k+ in Naïve and sponsor credits |

**Category awards.** The page lists two slightly different sets of categories:
- Section header: *Most Likely to Become a Unicorn*, *People's Choice*, *Best Mobile Automation*
- Prize list: *"Additional prize tracks ($15k+ in prizes including Pocket AI Notetakers): Most likely to scale to millions, People's Choice, Best Design"*

So the categories to target are probably **Unicorn / Scale to millions**, **People's Choice**, **Best Design**, and **Best Mobile Automation**. Confirm at kickoff.

### Best Mobile Automation (Mobile prize track, powered by Mobilerun)

> Allow your agent-run businesses to work on real mobile phones and apps. Publish content, compare ride quotes, place delivery orders, test apps, and much more.
>
> All teams get 72 hours of access with Android and iOS device minutes and six team seats. iPhones are first come, first served.

| Place | Prize (each runs for 12 months) |
|---|---|
| 1st | 3 cloud iPhone packages ($8,520) |
| 2nd | 2 cloud iPhone packages ($5,760) |
| 3rd | 1 cloud iPhone package ($3,000) |

The Naïve SDK also has a built-in `mobile` tool for cloud Android and iPhone devices (see the SDK section below).

---

## Sponsors (likely tools and credits)

| Sponsor | What it is | Possible use in an agent-run company |
|---|---|---|
| [OpenAI](https://openai.com) | GPT models | LLM inference |
| [HubSpot](https://www.hubspot.com) | CRM for marketing, sales, service | Pipeline and customer records the agents manage |
| [Stripe](https://stripe.com) | Payments APIs | Taking real money, which is strong proof the company works |
| [Vercel](https://vercel.com) | Web app hosting | Storefront, landing page, product UI, ops dashboard |
| [OpenRouter](https://openrouter.ai) | One API across hundreds of LLMs | Model routing |
| [AgentMail](https://agentmail.to) | Email inbox API for agents | Agents send, receive, and act on email |
| [Luxor](https://luxor.tech) | GPU compute and AI infrastructure | Heavy model or media jobs |
| [Monid](https://monid.ai) | "OpenRouter for agent tools" (2,981 tools & APIs, pay as you go) | Broad tool access |
| [Apify](https://apify.com) | Web scraping and automation | Lead generation, market research, competitor monitoring |
| [Mobilerun](https://mobilerun.ai) | Agents that operate real Android/iOS phones | Mobile Automation track |
| [Render](https://render.com) | Web services, workers, databases | Backend and workers |

Using sponsor tools in a meaningful way may help with judging and category prizes.

---

## About Naïve

> Naïve is building autonomous companies: agent systems that can run real businesses end to end.
>
> Use the Naïve SDK to create the agents that run your company, connect their tools, set their budgets, and keep their work running. Our studio lets you deploy and operate these systems.
>
> We've raised a $28.5M Series A from Nexus Venture Partners, Y Combinator, Zetta Venture Partners, Liquid 2, and leading operators.

---

## Naïve SDK cheat sheet

> Pulled from https://usenaive.ai/docs, https://usenaive.ai/skill.md and https://usenaive.ai/llms.txt on 2026-11-06. **The live API route table at `GET https://api.vetta.sh/v1/openapi.json` is authoritative.** Where `skill.md` and the docs disagree, `skill.md` says it wins.

### Surfaces & install
- **TypeScript SDK:** `npm i @usenaive-sdk/managed-agents`. It is ESM-only and **TypeScript only, with no Python package.**
- **CLI:** `npm i -g @usenaive-sdk/cli` (binary `naive`, JSON output by default, `--human` for tables). You can also run it with `npx @usenaive-sdk/cli`.
- **REST API:** `https://api.vetta.sh/v1` with `Authorization: Bearer sk_live_...`. "Vetta" is the product's old name, and it is the same product.
- **Studio (web UI):** https://app.usenaive.ai
- **Agent onboarding manifest:** https://usenaive.ai/skill.md. Read it first when setting up.
- **Full docs for LLMs:** https://usenaive.ai/docs/llms.txt (index) and https://usenaive.ai/docs/llms-full.txt (about 1.6 MB of full text)

### Setup flow
```bash
npm i -g @usenaive-sdk/cli
naive login --api-key sk_live_...      # or: naive login --email ... --password ...
naive whoami
naive plan subscribe                    # an active plan is required, or calls return 402 subscription_required
naive credits topup --usd 50            # prepaid real-USD balance
```
Never commit API keys. Use the `NAIVE_API_KEY` env var.

### Core primitives
| Primitive | What it is |
|---|---|
| **Agent** | A versioned config: `name`, `system`, `model`, `harness` (default `pi`), `tools`, `mcp_servers`, `skills`, **required `budget`**, `window`, and `output_schema`. Every edit creates a new immutable version. |
| **Session** | One run of an agent (`queued`, `running`, `idle`, `completed`, `failed`, `cancelled`). It has a resumable, `seq`-keyed event stream. |
| **Computer** | A disposable Linux micro-VM with a shell, filesystem and optional browser, provisioned per session and paused between turns. |
| **Skills** | Versioned playbooks (`slug` or `slug@N`) loaded with progressive disclosure. |
| **Budgets** | `cap_micro_usd`, `max_task_micro_usd`, `period` (`day`, `week` or `month`). Amounts are in micro-USD (1 USD = 1,000,000). Every model call is priced in advance and refused if it would breach the cap. |
| **Policies** | Each tool is set to `allow`, `ask` (pause for human approval) or `deny`. |
| **Deployments** | Cron-scheduled agent runs: `naive deploy create --agent <id> --cron "0 9 * * *" --budget-usd 5 --prompt "..."`. The minimum interval is 5 minutes. |
| **Identity** | A persona the agent acts as: email inboxes, phone numbers, domains, connections, and a write-only credential vault. |
| **Team** | A coordinator plus a version-pinned roster, using `send_to_agent` delegation and a shared board. ⚠️ `skill.md` lists "multiagent teams" as **coming soon**, so verify before depending on it. |
| **Webhooks** | Signed events such as `session.idle` and `budget.exceeded`, plus inbound email and SMS. |
| **Structured outputs** | `output_schema` (JSON Schema). The result comes back as `structured_output`. |
| **Blueprints / templates** | A repo with a `naive.config.ts` (`defineProject({...})`) that declares apps, agents, skills, identities, schedules and tasks. Apply it with `naive up` (run `naive up --dry-run` first). |

### TypeScript example (verbatim from docs)
```typescript
import { createClient } from "@usenaive-sdk/managed-agents";

const naive = createClient({ baseUrl: "https://api.vetta.sh", apiKey: process.env.NAIVE_API_KEY! });

const agent = await naive.agents.create({
  name: "Refunder",
  model: "z-ai/glm-5.3-flash",
  harness: "pi",
  skills: ["refund-policy"],
  budget: { cap_micro_usd: 50_000_000, max_task_micro_usd: 5_000_000, period: "month" },
  window: "immediate",
  system: "You process refunds.",
});
```
Then call `naive.sessions.create({ agent_id, message })` and iterate `naive.stream(session.id)`.

### Built-in tools
- **Shell and files:** `bash`, `read`, `write`, `edit`, `ls`, `find`
- **Browser and mobile:** `browser` (goto, click, type, act, extract…) and `mobile` (cloud Android or iPhone)
- **Web:** `web_search`, `web_fetch`
- **Media:** `generate_image`, `generate_video`, `edit_video`, `generate_3d_model`, `build_3d`, `clip_video`
- **Audio:** `transcribe_audio`, `generate_speech`, `generate_sound_effect`, `generate_music`
- **Data:** `data_search`, `data_describe`, `data_run` (about 1,900 read-only data tools across 18 domains, plus social data on about 21 networks)
- **Coordination:** `send_to_agent`, `wait_for_agents`, `list_agents`, `board_read`, `board_write`
- **Other:** `publish_file`, `fetch_file`, `find_files`, `view_image`, `session_spend`, `apps`, `ask_operator`
- **Connections:** about 1,000 to 1,400 third-party apps via OAuth or API key, exposed as `<connector>.<tool>`
- **MCP servers:** public HTTPS only, up to 20 per agent, defaulting to `ask`

### Available today vs coming soon (per `skill.md`)
- ✅ **Live:** `agency` and `media` blueprints; hosted `frontend_only` and `fullstack` apps (database, storage, MCP endpoint); versioned agents with budgets, policies, skills, identities, vaults, cron schedules and intakes; sessions with streams and approvals; real-USD billing and a spend ledger; audit log; connections to about 1,400 apps; the model proxy; **`email.send` in-turn** (approval-gated by default); **inbound wake** (mail or a text to an owned inbox or number starts a session).
- ❌ **Coming soon (do not depend on):** multiagent teams, memory, outcomes/graders, the agent wallet, cards, **outbound SMS from inside a turn** (SMS goes out only through the API/CLI), and the newsletter, paid-ads and recruiting templates.

### Existing company templates (useful for inspiration and to avoid duplicating)
- **Media:** Short Form v1, Clipping v1 (gaming, news, sports), AI Music Channel (hardstyle, techno, rap, pop), many niche short-form channels (history, comics, UFC, cat stories…), and AI Influencer (ready-made personas or your own)
- **Business:** AI Automation Agency, SEO / GEO Agency, AI Product Design Agency, and Support Inbox
- **Coming soon:** Get Paid (Stripe), Newsletter, Paid Ads Agency, Recruiting Agency, Long Form
- Blueprint repos: https://github.com/usenaive/agency-blueprint and https://github.com/usenaive/media-blueprint
- Directory: https://usenaive.ai/businesses

### Pricing & limits (things that matter during a 22-hour build)
- **Plans:** Standard costs $20/mo (includes $20 credit and a 7-day free trial), Pro costs $200/mo. Hackathon attendees get $1k+ in Naïve and sponsor credits.
- **Meters:** computer about $0.0666/hr; browser $0.001667/min plus $0.010 per model-driven action; mobile $0.05/min (Android) or $0.08/min (iPhone); email send $0.0008.
- **Limits:** 50 concurrent sessions per org; computers run up to 12 hours by default; cron minimum is 5 minutes; handoffs go at most 4 deep and 8 per session.

---

## Discrepancies and open questions

- **Minimum age:** the rules say 15+, but the registration form enforces 16+ on the event date.
- **Category prizes:** two different lists appear on the page (see Prizes). Confirm at kickoff.
- **Pre-built code:** the page does not say whether code written before 1:00 PM Saturday is allowed. Ask the organizers before relying on prep work beyond ideas, research and setup.
- **Multiagent teams:** the docs describe them, but `skill.md` lists them as coming soon. Test early.
- **Judges and mentors:** "Coming soon" on the page as of 2026-11-06.
- **Submission format:** only "live demos" is stated. No repo or video requirement is listed. Confirm at kickoff.

---

## Links
- Event page: https://events.ycombinator.com/naive-autonomous-companies-hackathon
- Naïve: https://usenaive.ai · Docs: https://usenaive.ai/docs · Studio: https://app.usenaive.ai
- Agent manifest: https://usenaive.ai/skill.md · LLM docs index: https://usenaive.ai/docs/llms.txt
- API: https://api.vetta.sh/v1 (`GET /v1/openapi.json` for the live route table)
- Mobilerun: https://mobilerun.ai

> **Tagline:** *Bring a business idea. Build the team that runs it.*


