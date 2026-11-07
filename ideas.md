# Hackathon Ideas

Shortlist for the Naïve Autonomous Company Hackathon (Nov 7-8, 2026). See `hackathon-rules.md` for the rules and judging criteria.

**Why these ideas:**
- Each one sells to a real market outside the hackathon, so the growth story is credible.
- In each one the agent makes the product before contacting the customer. The outreach shows them finished work instead of asking for a meeting, which is how strangers become users within 20 hours.

---

## 4. PMF Engine: a company that finds its own product-market fit (building this)

One company runs offers as experiments and keeps or kills them by itself. It launches a free offer with its own landing page, does outreach on X and by email, delivers to every signup, and kills or pivots based on numbers it counted itself. Ideas 1 to 3 below are its first three experiments. See `README.md`.

- **Pitch:** "We didn't pick our idea. Our company did."
- **Guardrails:** it can only pivot to offers an agent can deliver by email within 30 minutes. Kill and pivot calls run on fixed rules (`server/rules.ts`) that separate "nobody saw it" from "people saw it and didn't want it".

## 1. A QA agency that tests new mobile apps

Agents find newly launched apps, test them on real cloud iPhones and Androids, and send the developer a free bug report with a screen recording. A recurring test plan is the paid upsell.

- **Finding customers:** new apps from Product Hunt, Show HN, r/SideProject and recent Play Store releases (Apify has scrapers for these). Play Store listings show the developer's email publicly, so the agent gets a contact without any scraping tricks.
- **The standout feature:** the agent reads the app's 1-star reviews first, then tries to reproduce what users complain about. "We reproduced the crash your users are reporting, here's the video" is a very convincing first email.
- **Decisions to show:** which apps to test (recent updates plus complaints in reviews), how severe each bug is, and which developers get a follow-up.
- **Why it wins:** "testing apps" is in the Mobilerun track description, so it targets that $8.5k prize directly. QA is a large market, and indie developers are online on weekends. Hackathon teams can also use it to test their demos before 11 AM.
- **Risk:** you don't know yet whether the cloud phones can install apps from the stores. Test that first.

## 2. Free listing videos for real estate agents (backup)

Agents spot new Bay Area listings, turn the listing photos into a 30-second vertical video with a voiceover, and email it to the listing agent for free. After that it costs $X per listing.

- **Why the timing works:** real estate agents work hardest on weekends because that's when open houses happen. They live on their phones and want marketing for the listing they're promoting right now.
- **Why it scores:** you'll get replies on a Saturday, which B2B ideas rarely do. Judges can watch the videos, which fits People's Choice and Best Design. The US has more than 1.5 million agents, so the market is large.
- **Risk:** listing photos are usually licensed for the listing's marketing, so send each video only to that listing's agent. Cold email has to follow anti-spam law: an unsubscribe link and an honest subject line.

## 3. A tool factory built from people's requests

Agents watch Reddit, Hacker News and X for posts like "is there a tool that…". They pick the best requests, build and deploy a small tool on Vercel within an hour, and send it to the person who asked.

- **Why it's strong:** the most "autonomous company" pitch of these ideas. The agents decide which products should exist. Each request comes with its first user, the person who asked.
- **What you'd show:** "We shipped 11 products overnight, and here are their users."
- **Risk:** platforms limit bots, so replies may be the step that needs a person, which you'd have to log. Quality varies a lot.
