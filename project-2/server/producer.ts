/**
 * The local producer: pure functions that turn a founder's intake and approved facts into a kit,
 * a community shortlist, a demo plan and a post-launch plan. It uses templates and keyword matching,
 * not a model, and it only repeats what the founder told us. Anything missing becomes a question.
 */
import type { Launch } from "./repo.ts";
import { CHANNELS, CHANNEL_NAMES, validateKit, type Channel, type Kit } from "./rules.ts";
import type { CommentCategory, Community, DemoPlan, Facts, WaveAdvice, WaveCheck, WavePlan } from "./workspace-types.ts";

export const PRODUCER_LOCAL = "local-template";
export const CATALOG_DATE = "2026-11-08";

export const emptyFacts = (): Facts => ({ audience: "", problem: "", proof: "", pricing: "", voice: "", b2b: false, faq: [] });
export const withFacts = (raw: unknown): Facts => ({ ...emptyFacts(), ...(typeof raw === "object" && raw !== null ? (raw as Partial<Facts>) : {}) });

const clean = (s: string) => s.split("{link}").join("").trim();
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const firstSentence = (s: string) => (/^(.{20,}?[.!?])(\s|$)/s.exec(s)?.[1] ?? s).trim();

export function parseFaq(raw: string): Facts["faq"] {
  const out: Facts["faq"] = [];
  for (const block of raw.split(/\n\s*\n/)) {
    const m = /^\s*Q:\s*([\s\S]+?)\n\s*A:\s*([\s\S]+)$/i.exec(block.trim());
    if (m) out.push({ q: clean(m[1]!).slice(0, 300), a: clean(m[2]!).slice(0, 1000) });
  }
  return out.slice(0, 30);
}

export function missingFacts(f: Facts): string[] {
  const out: string[] = [];
  if (!f.audience) out.push("Who exactly is this for? Replies and community picks are generic until you say.");
  if (!f.problem) out.push("What problem does it solve, in the words your users use?");
  if (!f.proof) out.push("What can you prove today: a customer, a number, a benchmark? We won't make one up.");
  if (!f.pricing) out.push("What does it cost? Pricing questions go to you until this is filled in.");
  if (!f.voice) out.push("How do you sound? A sentence or a sample post is enough.");
  if (f.faq.length === 0) out.push("What do people always ask? Each Q and A becomes something replies can cite.");
  return out;
}

// ------------------------------------------------------------------------------- time

function safeZone(tz: string | null): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz ?? "UTC" }); return tz ?? "UTC"; } catch { return "UTC"; }
}
function zoneOffsetMs(at: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p["year"]), Number(p["month"]) - 1, Number(p["day"]), Number(p["hour"]), Number(p["minute"]), Number(p["second"])) - Math.floor(at / 1000) * 1000;
}
function zoned(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m, d, h, min);
  return new Date(guess - zoneOffsetMs(guess, tz));
}
export const labelTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);

/** The next Tuesday to Thursday at least 18 hours away, as a UTC calendar date. */
function launchDay(now: Date): { y: number; m: number; d: number } {
  const t = new Date(now.getTime() + 18 * 3_600_000);
  while (![2, 3, 4].includes(t.getUTCDay())) t.setUTCDate(t.getUTCDate() + 1);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

const SLOTS: Record<Channel, { tz: string; h: number; min: number; why: string }> = {
  product_hunt: { tz: "America/Los_Angeles", h: 0, min: 1, why: "Product Hunt's day starts at midnight Pacific, so this gets the whole day." },
  show_hn: { tz: "America/New_York", h: 8, min: 0, why: "Weekday mornings US time are the usual advice for Hacker News." },
  linkedin: { tz: "America/New_York", h: 8, min: 30, why: "Before the US workday fills up, which suits a professional audience." },
  x: { tz: "America/New_York", h: 9, min: 0, why: "US morning leaves you the first hour free to answer every reply." },
  launch_yc: { tz: "America/New_York", h: 9, min: 30, why: "After X is up, so the YC post can point at live activity." },
  email: { tz: "America/New_York", h: 10, min: 30, why: "Your network hears it once the public posts exist to share." },
};

// ------------------------------------------------------------------------------- the kit

export function buildKit(l: Launch, f: Facts, now: Date): Kit {
  const company = clean(l.company), one = clean(l.one_liner), desc = clean(l.description);
  const problem = clean(f.problem), proof = clean(f.proof), audience = clean(f.audience);
  const chosen = CHANNELS.filter((c) => l.channels.includes(c));
  const tz = safeZone(l.timezone);
  const day = launchDay(now);
  const timing = chosen.map((c) => {
    const s = SLOTS[c];
    return { channel: c, when: labelTime(zoned(day.y, day.m, day.d, s.h, s.min, s.tz), tz), why: `${s.why} General practice, not measured for your product.` };
  }).sort((a, b) => chosen.indexOf(a.channel) - chosen.indexOf(b.channel));

  const x = [clip(`${company}: ${one}\n\n{link}`, 280), clip(problem || firstSentence(desc), 280)];
  if (proof) x.push(clip(proof, 280));
  x.push(clip(audience ? `Built for ${audience}. If that's you, tell us what's missing.` : "Tell us what's missing. We're reading every reply.", 280));

  const para = [one, problem, desc, proof ? `Where it stands today: ${proof}` : ""].filter(Boolean);
  const body = para.join("\n\n");
  const longEnough = (s: string, min: number) => (s.length >= min ? s : `${s}\n\nWe're launching ${company} today and would value honest feedback from anyone this is relevant to.`);

  const raw = {
    strategy: [
      `**${company}** goes out on ${chosen.map((c) => CHANNEL_NAMES[c]).join(", ")}.${l.launch_when ? ` You asked for: ${clean(l.launch_when)}. Move the times below to match.` : ""}`,
      "Times are general practice for each channel, not measured for your product. Use the Results tab in the first hour to decide whether to push harder.",
      "**Written from a template using only what you told us.** No model wrote this and nothing was added. Edit anything before you post it.",
    ].join("\n\n"),
    timing,
    posts: {
      x,
      linkedin: longEnough(`${body}\n\nTry it: {link}`, 80),
      show_hn: { title: clip(`Show HN: ${company} – ${one}`, 80), text: clip(longEnough(`${desc}\n\nHappy to answer questions here.`, 80), 2000) },
      product_hunt: { tagline: clip(one, 60), description: clip(desc, 260), first_comment: clip(longEnough(`I'm one of the makers of ${company}. ${desc}\n\nI'd really like to hear what you'd change.`, 80), 1500) },
      launch_yc: { title: clip(`${company}: ${one}`, 90), body: longEnough(`## What it is\n\n${one}\n\n## Details\n\n${desc}${problem ? `\n\n## The problem\n\n${problem}` : ""}${proof ? `\n\n## Where it stands\n\n${proof}` : ""}\n\n## Try it\n\n{link}`, 200) },
      email: { subject: clip(`We just launched ${company}`, 120), body: longEnough(`Quick note: we just launched ${company}. ${one}\n\n${desc}\n\nIf you know someone it would help, forwarding this means a lot: {link}`, 80) },
    },
    boost_text: clip(`${company}: ${one}`, 225) + " {link}",
    checklist: ["Read every post and fix anything that doesn't sound like you", ...chosen.map((c) => `Post on ${CHANNEL_NAMES[c]}`), "Press Launch now once the first post is live", "Enter your numbers an hour after the first post"],
  };
  return validateKit(raw, chosen);
}

// ------------------------------------------------------------------------------- communities

interface Entry { name: string; url: string; kind: Community["kind"]; rules: string; rules_url: string; tags: string[]; general?: boolean; b2b?: boolean; angle: string }
const CHECK = "From our catalog, not checked against the live page. Read the current rules before posting.";
const r = (name: string, rules: string, tags: string[], angle: string, extra: Partial<Entry> = {}): Entry => ({ name: `r/${name}`, url: `https://www.reddit.com/r/${name}/`, kind: "reddit", rules: `${rules} ${CHECK}`, rules_url: `https://www.reddit.com/r/${name}/about/rules/`, tags, angle, ...extra });

const CATALOG: Entry[] = [
  r("SideProject", "Sharing projects is what this community is for.", ["project", "built", "app", "tool", "launch"], "Show what you built and what you learned building it.", { general: true }),
  r("SaaS", "Self-promotion is usually restricted to specific threads.", ["saas", "subscription", "b2b", "customers", "churn", "software"], "Share a lesson from building it, with the product as context.", { b2b: true }),
  r("startups", "Promotion is generally limited to designated threads.", ["startup", "founder", "founders", "fundraising", "yc"], "Ask for feedback on a specific decision instead of announcing.", { b2b: true }),
  r("Entrepreneur", "Direct promotion is generally discouraged.", ["founder", "business", "marketing", "sales", "growth"], "Tell the story and lead with the problem."),
  r("devops", "Vendor posts are generally scrutinized.", ["devops", "kubernetes", "infrastructure", "deploy", "deployment", "ci", "observability", "monitoring", "incident", "cloud", "terraform"], "Lead with the technical detail and how it fails."),
  r("LocalLLaMA", "Focused on running and building with local models.", ["llm", "llama", "local", "inference", "model", "models", "gpu", "embedding", "embeddings"], "Share benchmarks, setup and limits."),
  r("MachineLearning", "Projects are expected to be technical and tagged as projects.", ["ml", "machine", "learning", "training", "dataset", "research", "neural", "model", "models"], "Write it as a technical project post."),
  r("programming", "Product announcements are generally unwelcome. Technical articles do better.", ["compiler", "language", "programming", "performance", "code", "developer", "developers"], "Post a technical write-up, not the product."),
  r("webdev", "Self-promotion is generally limited to a designated showcase.", ["web", "frontend", "javascript", "typescript", "react", "css", "browser", "website"], "Show it working, and explain one hard part."),
  r("selfhosted", "Relevant only if people can actually host it themselves.", ["self-hosted", "selfhosted", "docker", "homelab", "open-source", "opensource"], "Lead with the install path and what's self-hostable."),
  r("opensource", "Relevant only if the project is genuinely open source.", ["open-source", "opensource", "license", "github", "contributors"], "Link the repo and say what help you want."),
  r("artificial", "A broad AI community, with limits on promotion.", ["ai", "agent", "agents", "llm", "gpt", "automation"], "Show one concrete task it completes."),
  r("marketing", "Self-promotion is generally restricted.", ["marketing", "ads", "seo", "content", "campaign", "brand", "inbound"], "Share a tactic and the result you actually saw."),
  { name: "Show HN", url: "https://news.ycombinator.com/show", kind: "forum", rules: `For things people can try now. No signup walls, no marketing language. ${CHECK}`, rules_url: "https://news.ycombinator.com/showhn.html", tags: ["developer", "developers", "open-source", "technical", "api", "infrastructure", "code"], general: true, angle: "Plain language, the technical how, and be there to answer." },
  { name: "Indie Hackers", url: "https://www.indiehackers.com/", kind: "forum", rules: `Community for builders. Value-first posts tend to work better than announcements. ${CHECK}`, rules_url: "https://www.indiehackers.com/", tags: ["founder", "bootstrapped", "revenue", "saas", "indie"], general: true, angle: "Share the numbers you can stand behind and what you tried." },
  { name: "Lobsters", url: "https://lobste.rs/", kind: "forum", rules: `Invite-only, technical, and strict about self-promotion. ${CHECK}`, rules_url: "https://lobste.rs/about", tags: ["compiler", "language", "programming", "security", "systems", "database"], angle: "Only if a member can post a real technical write-up." },
  { name: "Product Hunt", url: "https://www.producthunt.com/", kind: "launch_site", rules: `Launches run on a daily cycle. Don't ask directly for upvotes. ${CHECK}`, rules_url: "https://www.producthunt.com/launch", tags: ["app", "tool", "consumer", "launch", "productivity"], general: true, angle: "A clear tagline and a maker comment that invites criticism." },
];

const WORDS = (s: string) => new Set(s.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? []);

export function buildCommunities(l: Launch, f: Facts): Community[] {
  const words = WORDS(`${l.one_liner} ${l.description} ${f.audience} ${f.problem}`);
  const scored = CATALOG.map((e) => {
    const hits = e.tags.filter((t) => words.has(t));
    return { e, hits, score: hits.length * 3 + (f.b2b && e.b2b ? 2 : 0) + (e.general ? 1 : 0) };
  }).filter((x) => x.hits.length > 0 || x.e.general || (f.b2b && x.e.b2b)).sort((a, b) => b.score - a.score).slice(0, 7);
  const who = f.audience ? ` You said you're building for ${clean(f.audience)}.` : " Add your audience to sharpen this.";
  return scored.map(({ e, hits }) => ({
    name: e.name, url: e.url, kind: e.kind, rules: e.rules, rules_url: e.rules_url, angle: e.angle, reviewed: CATALOG_DATE,
    why: `${hits.length ? `Your description mentions ${hits.slice(0, 4).map((h) => `"${h}"`).join(", ")}.` : f.b2b && e.b2b ? "You marked this as B2B." : "A general builder audience, with no specific keyword match."}${who}`,
    draft_title: clip(`${clean(l.company)}: ${clean(l.one_liner)}`, 120),
    draft_body: `${clean(f.problem) || firstSentence(clean(l.description))}\n\n${clean(l.description)}\n\n${l.url}\n\nWhat would you change?`,
  }));
}

// ------------------------------------------------------------------------------- demo plan

export function buildDemo(l: Launch, f: Facts): DemoPlan {
  const company = clean(l.company), one = clean(l.one_liner), problem = clean(f.problem) || firstSentence(clean(l.description));
  const scenes = [
    { seconds: 4, heading: company, caption: one },
    { seconds: 7, heading: "The problem", caption: clip(problem, 140) },
    { seconds: 10, heading: "How it works", caption: clip(firstSentence(clean(l.description)), 140) },
    { seconds: 6, heading: f.proof ? "Where it stands" : "Try it yourself", caption: clip(clean(f.proof) || "Judge it on your own workflow.", 140) },
    { seconds: 3, heading: "Try it", caption: l.url.replace(/^https?:\/\//, "") },
  ];
  const topics = [
    ...f.faq.slice(0, 2).map((x) => ({ topic: `Answer on camera: ${clean(x.q)}`, why: "Your FAQ says people keep asking this." })),
    ...(f.problem ? [{ topic: "One real workflow, start to finish, with no cuts", why: `Shows the problem you named: ${clip(clean(f.problem), 80)}` }] : []),
    ...(f.b2b ? [{ topic: "Architecture walk-through: how it works and where it breaks", why: "Technical buyers trust limits more than polish." }] : []),
    { topic: "What changed this week, shown in the product", why: "A regular, simple demo keeps showing the product is alive." },
    { topic: "A failure you fixed and how", why: "Credibility you don't need to invent." },
  ].slice(0, 4);
  return { title: `${company} in 30 seconds`, format: f.b2b ? "technical_b2b" : "consumer", scenes, cadence: topics.map((t, i) => ({ week: i + 1, ...t })) };
}

// ------------------------------------------------------------------------------- the wave

export function buildWavePlan(l: Launch, now: Date): WavePlan[] {
  const tz = safeZone(l.timezone), day = launchDay(now), start = zoned(day.y, day.m, day.d, SLOTS.x.h, SLOTS.x.min, SLOTS.x.tz);
  const at = (mins: number) => labelTime(new Date(start.getTime() + mins * 60_000), tz);
  const note = "Founders describe X as distributing posts in waves. X doesn't publish this, so treat it as a working assumption.";
  return [
    { channel: "x", step: "Post the thread", when: at(0), why: "Keep the next hour clear." },
    { channel: "x", step: "First-hour push: answer every reply", when: `${at(0)} to ${at(60)}`, why: note },
    { channel: "x", step: "Check your numbers and decide whether to boost", when: at(60), why: "Enter them in Results. Below the threshold, ask the squad to share." },
    { channel: "x", step: "Follow-up post from a different angle", when: at(240), why: "A second chance at a wave, without reposting the same words." },
    { channel: "all", step: "Read what brought real product use", when: at(1440), why: "Clicks aren't users. Attribution shows what activated." },
  ];
}

export const WAVE_RULE = "Our starting rule, not X's: at least 500 impressions an hour is ahead, 150 to 499 is on track, below 150 is behind. Measured over at least 15 minutes.";

export function adviseWave(checks: WaveCheck[], f: Facts): WaveAdvice[] {
  const latest = new Map<string, WaveCheck>();
  for (const c of [...checks].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) latest.set(c.channel, c);
  if (latest.size === 0) return [{ channel: "x", verdict: "no_data", reading: "No numbers entered yet.", action: "An hour after your first post, enter impressions, likes and replies here.", rule: WAVE_RULE }];
  const angle = clean(f.proof) ? "lead with your proof point" : clean(f.problem) ? "lead with the problem" : "show the product doing one thing";
  return [...latest.values()].map((c) => {
    const perHour = Math.round(c.impressions / (Math.max(c.minutes_since_post, 15) / 60));
    const verdict: WaveAdvice["verdict"] = perHour >= 500 ? "ahead" : perHour >= 150 ? "on_track" : "behind";
    const action = verdict === "ahead" ? "Keep replying. Post the follow-up on schedule, and don't boost yet." : verdict === "on_track" ? `Answer every open reply. If it's still under 500 an hour at 90 minutes, press Launch now for the squad.` : `Press Launch now to ask the squad to share. Reply to everyone who engaged. Prepare a follow-up that will ${angle} rather than reposting.`;
    return { channel: c.channel, verdict, reading: `${c.impressions} impressions, ${c.likes} likes and ${c.replies} replies at ${c.minutes_since_post} minutes: about ${perHour} impressions an hour.`, action, rule: WAVE_RULE };
  });
}

// ------------------------------------------------------------------------------- outreach and follow-through

export function draftOutreach(l: Launch, f: Facts, name: string, why: string): string {
  const greeting = /^(someone|role:)/i.test(name) ? "[name]" : name.split(/\s+/)[0]!;
  return `Hi ${greeting},\n\n${why.trim()}\n\nWe built ${clean(l.company)}: ${clean(l.one_liner)}${f.problem ? ` ${clip(clean(f.problem), 200)}` : ""}\n\nWould you be open to trying it and telling me what's wrong with it? ${l.url}`;
}

export function roleOutreach(l: Launch, f: Facts): { name: string; why: string; draft: string }[] {
  const aud = clean(f.audience) || "the people this is built for";
  return [
    { name: `Someone from: ${clip(aud, 60)}`, why: `They match the audience you described: ${clip(aud, 80)}. Replace this with a real person.` },
    { name: "Someone who already asked you about this", why: "Prior interest is the strongest reason to write. Replace this with a real person." },
  ].map((x) => ({ ...x, draft: draftOutreach(l, f, x.name, "[Why you're writing to this person in particular.]") }));
}

export const followupFor = (person: string, context: string, promise: string) =>
  `Hi ${person.split(/\s+/)[0]},\n\n${context ? `Following up from ${context}. ` : ""}I said I'd ${promise.replace(/^i('ll| will)\s+/i, "")}, so here it is: [add it here].\n\nAnything else useful from my side?`;

// ------------------------------------------------------------------------------- comments

const has = (s: string, list: string[]) => list.some((w) => s.includes(w));
export function categorize(body: string): CommentCategory {
  const s = ` ${body.toLowerCase()} `;
  if (has(s, ["pricing", "how much", " cost", " price", "sign up", "signup", " trial", "can i buy", "interested", "we need this", "book a demo", " get access"])) return "buying_intent";
  if (has(s, [" bug", " error", " broken", "doesn't work", "not working", " crash", " 500", "can't log"])) return "support";
  if (has(s, ["expensive", "why not", "just use", " already ", " concern", " worried", "not sure", "skeptical", "doubt", "another "])) return "objection";
  if (s.includes("?")) return "question";
  if (has(s, ["congrats", " love", " great", " awesome", " nice", " amazing", " cool"])) return "praise";
  return "low_value";
}

const STOP = new Set("about after again also been being between both could does doing from have here into just like make many more most much need only other over same should some such than that their them then there these they this those through very want were what when where which while with would your yours will still really know work works using used".split(" "));
const keywords = (s: string) => new Set((s.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

export interface Reply { status: "needs_review" | "needs_founder" | "ignored"; draft: string; fact_refs: string[]; unknown: string | null }

/** Replies cite only approved facts. With nothing to cite, the comment goes to the founder blank. */
export function draftReply(l: Launch, f: Facts, author: string, body: string, category: CommentCategory): Reply {
  if (category === "low_value") return { status: "ignored", draft: "", fact_refs: [], unknown: null };
  const handle = author && author !== "unknown" ? `${author.replace(/^@/, "")}, ` : "";
  if (category === "praise") return { status: "needs_review", draft: `${handle}thank you. Tell us what you'd want next.`, fact_refs: [], unknown: null };
  const words = keywords(body);
  if (/pric|cost|how much|expensive/i.test(body)) {
    if (f.pricing) return { status: "needs_review", draft: `${handle}${clean(f.pricing)}`, fact_refs: ["pricing"], unknown: null };
    return { status: "needs_founder", draft: "", fact_refs: [], unknown: `Pricing hasn't been provided: "${clip(body, 140)}"` };
  }
  let best: { ref: string; answer: string; score: number } | null = null;
  f.faq.forEach((x, i) => {
    const score = overlap(words, keywords(x.q));
    if (score >= 2 && (!best || score > best.score)) best = { ref: `faq:${i + 1}`, answer: clean(x.a), score };
  });
  if (!best) for (const [ref, text] of [["problem", f.problem], ["proof", f.proof], ["audience", f.audience], ["description", l.description]] as const) {
    const score = text ? overlap(words, keywords(text)) : 0;
    if (score >= 3 && (!best || score > (best as { score: number }).score)) best = { ref, answer: clip(clean(text), 400), score };
  }
  const hit = best as { ref: string; answer: string } | null;
  if (hit) return { status: "needs_review", draft: `${handle}${hit.answer}`, fact_refs: [hit.ref], unknown: null };
  return { status: "needs_founder", draft: "", fact_refs: [], unknown: `No approved fact answers this: "${clip(body, 140)}"` };
}

export function parseComments(raw: string): { author: string; body: string; url: string | null }[] {
  const out: { author: string; body: string; url: string | null }[] = [];
  for (const block of raw.slice(0, 40_000).split(/\n\s*\n/).slice(0, 200)) {
    const lines = block.trim().split("\n").map((x) => x.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const urlLine = lines.find((x) => /^https?:\/\/\S+$/.test(x)) ?? null;
    const text = lines.filter((x) => x !== urlLine).join("\n");
    if (!text) continue;
    const m = /^([^:\n]{1,60}):\s*([\s\S]+)$/.exec(text);
    out.push(m && !/^https?$/i.test(m[1]!) ? { author: m[1]!.trim(), body: m[2]!.trim().slice(0, 2000), url: urlLine } : { author: "unknown", body: text.slice(0, 2000), url: urlLine });
  }
  return out;
}
