# Launchpad

**One-click launches for YC founders, run by AI agents.** A founder tells Launchpad once what they're launching. Agents work out the right time on each channel given what else is launching, write every post in that channel's style, and rally a real, opt-in squad of founders who boost each other. Afterwards they report what worked, channel by channel.

It's built for the problems in `../yc-founder-problems.md`: too many launch channels, getting the timing right, chasing people to repost, and how much time launching takes away from building.

## How it works

```
founder fills /new ──▶ lp-producer (every 5 min) ──▶ private kit /k/<slug>?t=…
                         researches the URL + what's launching (radar)       ├ timing per channel, with reasons
                         writes X / LinkedIn / Show HN / PH / Launch YC /    ├ every post, with one-click buttons
                         email posts, emails the founder their kit           ├ tracked links per channel
                                                                             └ [Launch now]
founder presses Launch now ──▶ boosts queued for every squad founder
lp-booster (every 5 min) ──▶ one email per squad founder ──▶ /b/<code>: one tap to share on X or LinkedIn
                                                              (tracked, counted, reciprocal)
~2h later: lp-producer writes the launch report (clicks per channel, boosts shared, what to do next time)

lp-scout (every 30 min) finds YC founders launching now (Launch YC, Show HN, Product Hunt, X) and offers a free kit
lp-concierge answers the launch@ inbox
```

**No fake engagement.** Bots, bought views and upvote rings break X's, Product Hunt's and Hacker News's rules, and they get launches buried. Every boost is a real founder choosing to share, and agents never ask anyone to upvote. Launchpad is not affiliated with Y Combinator.

## Pages
| Path | What |
|---|---|
| `/` | Landing page, live numbers, launches we ran |
| `/new` | The launch form |
| `/k/<slug>?t=<token>` | The founder's private kit, the Launch now button, and live results |
| `/b/<code>` | A squad founder's one-tap boost page |
| `/l/<code>` | Tracked short link (counts unique people per channel; ignores bots) |
| `/ops` | The public record: launches, decisions, outreach, the radar, reports and human step-ins |
| `/r/<id>` | A launch report (public if the founder listed the launch, otherwise needs the kit token) |

## Run it
```bash
npm install
npm test             # 11 tests: the whole loop against a real Postgres (PGlite)
npm run dev          # http://localhost:8790
npm run naive:dry    # then: npm run naive:up   (needs NAIVE_API_KEY and PMF_ADMIN_TOKEN)
```

**Spend caps** (`crew/crew.ts`): producer $30/day, scout $25/day, booster $8/day, concierge $5/day.
**Outreach caps** (`naive.config.ts`): 40 emails and 12 posts per day, and at most 3 boost requests per squad founder per day.
