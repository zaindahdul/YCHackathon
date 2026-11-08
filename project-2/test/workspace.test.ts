import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../server/db.ts";
import { openLocalDb } from "../server/local-db.ts";
import { categorize, draftReply, emptyFacts } from "../server/producer.ts";
import { Repo } from "../server/repo.ts";
import { handleRequest, parseBody, type ApiRequest } from "../server/routes.ts";
import { Workspace } from "../server/workspace.ts";
import type { Launch } from "../server/repo.ts";

let db: Db & { close(): Promise<void> };
let clock = new Date("2026-11-08T17:00:00Z");
beforeAll(async () => { db = await openLocalDb(); });
afterAll(async () => { await db.close(); });

const BROWSER = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/604.1";
const ctx = (vars: Record<string, string> = { LAUNCHPAD_LOCAL_PRODUCER: "1" }) => ({ db: async () => db, env: { mcpToken: "mcp", adminToken: "admin", vars }, now: () => clock });
const call = (method: string, path: string, o: { body?: unknown; query?: string; ua?: string; vars?: Record<string, string> } = {}) => {
  const r: ApiRequest = { method, path, query: new URLSearchParams(o.query ?? ""), headers: { host: "launch.example", "x-forwarded-proto": "https", "user-agent": o.ua ?? BROWSER, "x-forwarded-for": "10.0.0.9" }, body: o.body ?? null };
  return handleRequest(r, ctx(o.vars));
};
const intake = { company: "Tracely", one_liner: "Incident timelines for devops teams", description: "Tracely turns monitoring alerts and deploy logs into an incident timeline for on-call engineers.", url: "https://tracely.example", email: "f@tracely.example", ch_x: "1", ch_linkedin: "1", ch_show_hn: "1", ch_product_hunt: "1", ch_launch_yc: "1", ch_email: "1", listed: "1", join_squad: "1", timezone: "America/Los_Angeles", audience: "on-call engineers", pricing: "$49 per seat per month", b2b: "1", faq: "Q: Does it integrate with Datadog alerts?\nA: Yes, Datadog alerts arrive by webhook." };

async function open(fields: Record<string, string> = {}) {
  const made = await call("POST", "/new", { body: { ...intake, ...fields } });
  const loc = new URL(made.headers!["location"]!, "https://launch.example");
  const path = loc.pathname, t = loc.searchParams.get("t")!;
  const post = (sub: string, body: unknown = {}) => call("POST", `${path}/${sub}`, { body, query: `t=${t}` });
  const launch = async () => (await new Repo(db).getBySlug(path.split("/")[2]!)) as Launch;
  const view = async (tab = "kit") => new Workspace(db).view(await launch(), { tab, origin: "https://launch.example", notice: null, ask: "" });
  return { path, t, post, launch, view };
}

describe("intake and producer", () => {
  it("rejects bad intake without creating a kit", async () => {
    expect((await call("POST", "/new", { body: { ...intake, url: "not a url" } })).status).toBe(422);
    expect((await call("POST", "/new", { body: { ...intake, description: "short" } })).status).toBe(422);
  });

  it("writes one valid kit from the founder's words and reports what's missing", async () => {
    const w = await open();
    await w.post("produce");
    const first = await w.launch();
    expect(first.status).toBe("ready");
    expect(first.kit!.posts.x!.every((p) => p.length <= 280)).toBe(true);
    await w.post("produce");
    expect((await w.launch()).ready_at).toEqual(first.ready_at);
    const v = await w.view();
    expect(v.producer).toBe("local-template");
    expect(v.outreach).toHaveLength(2);
    expect(v.missing.some((m) => /prove/.test(m))).toBe(true);
    expect(v.communities.some((c) => c.name === "r/devops")).toBe(true);
    expect(v.communities.every((c) => c.url.startsWith("https://") && c.rules.includes("Read the current rules"))).toBe(true);
    expect(JSON.stringify(first.kit)).not.toMatch(/customers love|trusted by/i);
  });

  it("does not run the local producer unless enabled", async () => {
    const w = await open({ company: "NoProducer" });
    expect((await call("POST", `${w.path}/produce`, { query: `t=${w.t}`, vars: {} })).status).toBe(503);
    expect((await w.launch()).kit).toBeNull();
  });

  it("releases a failed run so it can be retried", async () => {
    const w = await open({ company: "Retry" });
    const l = await w.launch();
    await db.query(`update workspaces set facts = '{"faq":5}'::jsonb where launch_id = $1`, [l.id]);
    await expect(new Workspace(db).produce(l, clock)).rejects.toThrow();
    expect((await w.launch()).status).toBe("new");
    await db.query(`update workspaces set facts = '{}'::jsonb where launch_id = $1`, [l.id]);
    expect((await new Workspace(db).produce(l, clock)).produced).toBe(true);
    expect((await w.launch()).status).toBe("ready");
  });

  it("re-validates founder edits against channel limits", async () => {
    const w = await open({ company: "Editor" });
    await w.post("produce");
    const r = await w.post("edit", { channel: "x", part: "0", text: `${"x".repeat(300)} {link}` });
    expect(decodeURIComponent(r.headers!["location"]!)).toMatch(/limit is 280/);
    await w.post("edit", { channel: "x", part: "0", text: "Our own words {link}" });
    expect((await w.launch()).kit!.posts.x![0]).toBe("Our own words {link}");
  });
});

describe("private access", () => {
  it("404s a wrong token on every route", async () => {
    const w = await open({ company: "Private" });
    for (const q of ["", "t=wrong"]) {
      expect((await call("GET", w.path, { query: q })).status).toBe(404);
      expect((await call("POST", `${w.path}/go`, { query: q })).status).toBe(404);
      expect((await call("POST", `${w.path}/comments`, { query: q, body: { raw: "a: b" } })).status).toBe(404);
    }
  });

  it("does not launch from a page view and a repeat launch changes nothing", async () => {
    const w = await open({ company: "Launcher" });
    await w.post("produce");
    await call("GET", w.path, { query: `t=${w.t}` });
    await call("GET", `${w.path}/go`, { query: `t=${w.t}` });
    expect((await w.launch()).status).toBe("ready");
    await w.post("go");
    const first = await w.launch();
    const boosts = async () => (await db.query<{ n: number }>("select count(*)::int as n from boosts where launch_id = $1", [first.id])).rows[0]!.n;
    const n = await boosts();
    const second = await w.post("go");
    expect(decodeURIComponent(second.headers!["location"]!)).toMatch(/already live/);
    expect(await boosts()).toBe(n);
    expect((await w.launch()).launched_at).toEqual(first.launched_at);
  });

  it("keeps unlisted narrative and email bodies off /ops", async () => {
    const w = await open({ company: "SecretCo", listed: "" });
    const l = await w.launch();
    const r = new Repo(db);
    await r.logDecision({ launch_id: l.id, decision: "timing", reasoning: "SECRET-STRATEGY", agent: "producer" });
    await r.logTouch({ channel: "email", kind: "email", target: "x@y.dev", content: "SECRET-EMAIL-BODY" });
    const ops = await call("GET", "/ops");
    expect(ops.html).not.toContain("SECRET-STRATEGY");
    expect(ops.html).not.toContain("SECRET-EMAIL-BODY");
    expect(ops.html).not.toContain("SecretCo");
  });
});

describe("outreach", () => {
  it("requires approval and a real recipient, and honors opt-out", async () => {
    const w = await open({ company: "Reach" });
    await w.post("produce");
    await w.post("outreach", { name: "Dana Kim", contact: "dana@ops.example", why: "Wrote about on-call fatigue" });
    await w.post("outreach", { name: "Dana Kim", contact: "dana@ops.example", why: "Double click" });
    const rows = (await w.view()).outreach.filter((o) => o.name === "Dana Kim");
    expect(rows).toHaveLength(1);
    const o = rows[0]!;
    await w.post(`outreach/${o.id}`, { action: "sent" });
    expect((await w.view()).outreach.find((x) => x.id === o.id)!.status).toBe("draft");
    await w.post(`outreach/${o.id}`, { action: "approve" });
    await w.post(`outreach/${o.id}`, { action: "sent" });
    expect((await w.view()).outreach.find((x) => x.id === o.id)!.status).toBe("sent_manual");

    const role = (await w.view()).outreach.find((x) => x.contact === "")!;
    await w.post(`outreach/${role.id}`, { action: "approve" });
    await w.post(`outreach/${role.id}`, { action: "sent" });
    expect((await w.view()).outreach.find((x) => x.id === role.id)!.status).toBe("approved");

    await w.post(`outreach/${o.id}`, { action: "opt_out" });
    const blocked = await w.post("outreach", { name: "Dana Again", contact: "DANA@ops.example", why: "x" });
    expect(decodeURIComponent(blocked.headers!["location"]!)).toMatch(/opted out/);
  });
});

describe("comments", () => {
  it("dedupes retries, cites facts, and escalates what it can't answer", async () => {
    const w = await open({ company: "Replies" });
    await w.post("produce");
    const raw = "ann: Does it integrate with Datadog alerts?\nhttps://x.com/ann/status/1\n\nbob: Do you have SOC 2?\n\ncat: How much does it cost?\n\ndee: first";
    await w.post("comments", { platform: "x", raw });
    const again = await w.post("comments", { platform: "x", raw });
    expect(decodeURIComponent(again.headers!["location"]!)).toMatch(/Imported 0 comments by hand, skipped 4/);
    const { comments, insights } = await w.view("replies");
    expect(comments).toHaveLength(4);
    const by = (a: string) => comments.find((c) => c.author === a)!;
    expect(by("ann").fact_refs).toEqual(["faq:1"]);
    expect(by("ann").draft).toContain("webhook");
    expect(by("ann").url).toBe("https://x.com/ann/status/1");
    expect(by("bob").status).toBe("needs_founder");
    expect(by("bob").draft).toBe("");
    expect(by("bob").unknown).toContain("SOC 2");
    expect(by("cat").fact_refs).toEqual(["pricing"]);
    expect(by("dee").status).toBe("ignored");
    expect(insights.total).toBe(4);
    expect(insights.interested.map((i) => i.author)).toContain("cat");

    await w.post(`comments/${by("bob").id}`, { action: "posted" });
    expect((await w.view("replies")).comments.find((c) => c.author === "bob")!.status).toBe("needs_founder");
    await w.post(`comments/${by("bob").id}`, { action: "approve" });
    expect((await w.view("replies")).comments.find((c) => c.author === "bob")!.status).toBe("needs_founder");
  });

  it("never fills in pricing it wasn't given", () => {
    const r = draftReply({ description: "x" } as Launch, emptyFacts(), "a", "What's the price?", categorize("What's the price?"));
    expect(r).toMatchObject({ status: "needs_founder", draft: "", fact_refs: [] });
  });
});

describe("attribution and numbers", () => {
  it("credits real clicks, dedupes, excludes QA and needs an observed return", async () => {
    const w = await open({ company: "Attrib" });
    await w.post("produce");
    const v0 = await w.view();
    const click = await call("GET", `/l/${v0.links["x"]}`);
    const ref = new URL(click.headers!["location"]!).searchParams.get("lp_ref")!;
    const slug = w.path.split("/")[2]!;
    const ev = (event: string, extra: object = {}, ua = BROWSER) => call("POST", "/e", { body: { launch: slug, ref, event, ...extra }, ua });
    expect(parseBody(JSON.stringify({ launch: slug, ref, event: "visit", ch: "x" }), "text/plain")).toMatchObject({ ref, ch: "x" });
    await ev("visit"); await ev("visit"); await ev("activate"); await ev("activate");
    await call("POST", "/e", { body: { launch: slug, ref: "qa-visitor-1", event: "activate", qa: true } });
    await call("POST", "/e", { body: { launch: slug, ref: "bot-visitor-1", event: "visit" }, ua: "curl/8.0" });
    let a = (await w.view("results")).attribution;
    expect(a.funnel.find((f) => f.channel === "x")).toMatchObject({ visitors: 1, activated: 1, returned: 0 });
    expect(a.totals).toMatchObject({ activated: 1, returned: 0, qa_excluded: 2 });

    const start = clock;
    clock = new Date(start.getTime() + 3 * 86_400_000);
    await ev("activate");
    a = (await w.view("results")).attribution;
    expect(a.totals.returned).toBe(1);
    clock = start;
    expect((await call("POST", "/e", { body: { launch: slug, ref, event: "purchase" } })).status).toBe(400);
  });

  it("reads wave numbers against a stated rule", async () => {
    const w = await open({ company: "Wave" });
    await w.post("produce");
    expect((await w.view("results")).advice[0]!.verdict).toBe("no_data");
    await w.post("wave", { channel: "x", minutes: "60", impressions: "90", likes: "2", replies: "1" });
    const low = (await w.view("results")).advice[0]!;
    expect(low.verdict).toBe("behind");
    expect(low.action).toMatch(/squad/);
    expect(decodeURIComponent((await w.post("wave", { channel: "x", minutes: "x", impressions: "1", likes: "1", replies: "1" })).headers!["location"]!)).toMatch(/whole numbers/);
  });

  it("records a trial without ever claiming payment", async () => {
    const w = await open({ company: "Deal" });
    await w.post("deal", { action: "accept_trial" });
    await w.post("deal", { hours: "11.5" });
    const { deal } = await w.view("results");
    expect(deal).toMatchObject({ price_usd: 299, hours_saved: 11.5, paid: false });
    expect(deal.trial_accepted_at).not.toBeNull();
  });
});

describe("network and follow-through", () => {
  it("matches only opted-in, listed founders and explains why", async () => {
    const yes = await open({ company: "PaymentsCo", one_liner: "Stripe reconciliation for marketplaces", email: "a@pay.example" });
    await yes.post("produce");
    const hidden = await open({ company: "HiddenCo", one_liner: "Stripe reconciliation for marketplaces", email: "b@pay.example", listed: "" });
    await hidden.post("produce");
    const me = await open({ company: "Asker", email: "c@ask.example" });
    const m = await new Workspace(db).matches(await me.launch(), "need help with stripe reconciliation");
    expect(m.map((x) => x.company)).toContain("PaymentsCo");
    expect(m.map((x) => x.company)).not.toContain("HiddenCo");
    expect(m[0]!.why).toContain("stripe");
    expect(JSON.stringify(m)).not.toContain("a@pay.example");
  });

  it("tracks a promise and drafts the follow-up", async () => {
    const w = await open({ company: "Follow" });
    await w.post("commit", { person: "Priya Shah", context: "our Tuesday call", promise: "send the SOC 2 timeline", due: "Friday" });
    const c = (await w.view("follow")).commitments[0]!;
    expect(c.followup).toContain("send the SOC 2 timeline");
    await w.post(`commit/${c.id}`, { action: "done" });
    expect((await w.view("follow")).commitments[0]!.status).toBe("done");
  });
});
