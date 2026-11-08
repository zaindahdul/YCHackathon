/**
 * Launchpad end to end against a real (in-process) Postgres: founders submit launches, the
 * producer writes kits, a founder presses Launch now, the booster asks the squad, squad members
 * boost, clicks are counted per channel, and the producer reports. Same routes as production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../server/db.ts";
import { openLocalDb } from "../server/local-db.ts";
import { TOOLS } from "../server/mcp.ts";
import { handleRequest, type ApiRequest } from "../server/routes.ts";

let db: Db & { close(): Promise<void> };
let clock = new Date("2026-11-08T01:00:00Z");
beforeAll(async () => { db = await openLocalDb(); });
afterAll(async () => { await db.close(); });

const ctx = (vars: Record<string, string> = {}) => ({ db: async () => db, env: { mcpToken: "mcp", adminToken: "admin", vars }, now: () => clock });
const BROWSER = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/604.1";
const req = (method: string, path: string, o: { body?: unknown; headers?: Record<string, string>; query?: string } = {}): ApiRequest => ({
  method, path, query: new URLSearchParams(o.query ?? ""), headers: { host: "launch.example", "x-forwarded-proto": "https", "user-agent": BROWSER, ...o.headers }, body: o.body ?? null,
});
const get = (path: string, query = "", headers: Record<string, string> = {}) => handleRequest(req("GET", path, { query, headers }), ctx());
let rpc = 0;
async function tool(name: string, args: Record<string, unknown> = {}, vars?: Record<string, string>) {
  const r = await handleRequest(req("POST", "/mcp", { headers: { authorization: "Bearer mcp" }, body: { jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } } }), ctx(vars));
  const result = (r.json as { result: { content: { text: string }[]; isError?: boolean } }).result;
  return { error: result.isError === true, text: result.content[0]!.text, data: result.isError ? null : JSON.parse(result.content[0]!.text) };
}
async function submit(fields: Record<string, string>) {
  return handleRequest(req("POST", "/new", { body: { ch_x: "1", ch_linkedin: "1", ch_show_hn: "1", join_squad: "1", listed: "1", ...fields } }), ctx());
}
const kitFor = (company: string) => ({
  strategy: `Launch ${company} on X first thing Sunday, then Show HN once the X thread has some replies. Nothing big from YC is on the radar for Sunday morning.`,
  timing: [{ channel: "x", when: "Sun Nov 8, 7:00 AM PT", why: "Weekend mornings are quiet for launches" }, { channel: "show_hn", when: "Mon Nov 9, 7:30 AM ET", why: "HN is busiest on weekday mornings" }],
  posts: {
    x: [`We just launched ${company}. {link}`, "Here's why we built it."],
    linkedin: `Today we're launching ${company}. It's for founders who want to stop doing launch chores by hand. Try it: {link}`,
    show_hn: { title: `Show HN: ${company}, launch everywhere in one click`, text: "We built this because every launch meant writing six versions of the same post and pinging friends one by one." },
  },
  boost_text: `${company} just launched. Worth a look: {link}`,
  checklist: ["Post the X thread", "Submit Show HN", "Press Launch now"],
});

describe("MCP", () => {
  it("refuses callers without the platform's bearer, and lists its tools", async () => {
    expect((await handleRequest(req("POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/list" } }), ctx())).status).toBe(401);
    const list = await handleRequest(req("POST", "/mcp", { headers: { authorization: "Bearer mcp" }, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } }), ctx());
    expect((list.json as { result: { tools: unknown[] } }).result.tools).toHaveLength(TOOLS.length);
  });
});

describe("a launch, end to end", () => {
  let a: { slug: string; token: string; id: string };
  let b: { slug: string; token: string; id: string };

  it("takes a launch from the form and gives the founder a private kit link", async () => {
    const bad = await submit({ company: "Acme", one_liner: "x", description: "too short", url: "nope", email: "a@acme.dev" });
    expect(bad.status).toBe(422);
    const ok = await submit({ company: "Acme AI", one_liner: "Agents that file your taxes", description: "We launch our public beta this weekend and want maximum reach.", url: "https://acme.dev", email: "Founder@Acme.dev", x_handle: "@acmeai", launch_when: "Sunday morning", timezone: "America/Los_Angeles" });
    expect(ok.status).toBe(303);
    const loc = new URL(ok.headers!["location"]!, "https://launch.example");
    expect(loc.pathname).toBe("/k/acme-ai");
    a = { slug: "acme-ai", token: loc.searchParams.get("t")!, id: "" };
    const page = await get(loc.pathname, loc.search.slice(1));
    expect(page.html).toContain("Writing your launch kit");
    expect((await get(loc.pathname, "t=wrong")).status).toBe(404);
    expect((await get(loc.pathname)).status).toBe(404);
  });

  it("lets the producer claim it once, refuses a bad kit, and publishes a good one", async () => {
    const work = await tool("get_work", { agent: "producer" });
    expect(work.data.write_kits_for).toHaveLength(1);
    a.id = work.data.write_kits_for[0].id;
    expect(work.data.write_kits_for[0].email).toBe("f***@acme.dev");
    expect((await tool("get_work", { agent: "producer" })).data.busy).toBe(true);

    expect((await tool("claim_launch", { id: a.id })).error).toBe(false);
    expect((await tool("claim_launch", { id: a.id })).text).toMatch(/not claimable/);

    const noLink = kitFor("Acme AI");
    noLink.posts.x = ["We launched! No link here."];
    expect((await tool("save_kit", { id: a.id, kit: noLink })).text).toMatch(/\{link\}/);
    const badHn = kitFor("Acme AI");
    badHn.posts.show_hn.title = "Acme AI is here";
    expect((await tool("save_kit", { id: a.id, kit: badHn })).text).toMatch(/Show HN: /);

    const saved = await tool("save_kit", { id: a.id, kit: kitFor("Acme AI") });
    expect(saved.error).toBe(false);
    expect(saved.data.kit_url).toBe(`https://launch.example/k/acme-ai?t=${a.token}`);

    const page = await get("/k/acme-ai", `t=${a.token}`);
    expect(page.html).toContain("Acme AI launch kit");
    expect(page.html).toMatch(/https:\/\/twitter\.com\/intent\/tweet\?text=We%20just%20launched%20Acme%20AI\.%20https%3A%2F%2Flaunch\.example%2Fl%2F/);
    expect(page.html).toContain("news.ycombinator.com/submitlink?u=https%3A%2F%2Facme.dev%2F%3Fref%3Dhn");
    expect(page.html).toContain("Launch now");
    expect(page.html).not.toContain("{link}");
  });

  it("asks the squad to boost when the founder presses Launch now", async () => {
    // A second founder joins: they are in the squad that boosts Acme.
    const second = await submit({ company: "Beta Labs", one_liner: "Payroll for robots", description: "Launching next week, joining the squad now.", url: "https://beta.dev", email: "team@beta.dev" });
    const loc = new URL(second.headers!["location"]!, "https://launch.example");
    b = { slug: "beta-labs", token: loc.searchParams.get("t")!, id: "" };
    const work = await tool("get_work", { agent: "producer", run_token: "x" });
    expect(work.data.busy).toBe(true); // the first producer run still holds the lock
    clock = new Date(clock.getTime() + 13 * 60_000);
    const fresh = await tool("get_work", { agent: "producer" });
    b.id = fresh.data.write_kits_for.find((l: { company: string }) => l.company === "Beta Labs").id;
    await tool("claim_launch", { id: b.id });
    await tool("save_kit", { id: b.id, kit: kitFor("Beta Labs") });

    const go = await handleRequest(req("POST", "/k/acme-ai/go", { query: `t=${a.token}` }), ctx());
    expect(go.status).toBe(303);
    expect((await get("/k/acme-ai", `t=${a.token}`)).html).toContain("You're live");

    const boosts = await tool("get_work", { agent: "booster" });
    expect(boosts.data.boosts).toHaveLength(1);
    const boost = boosts.data.boosts[0];
    expect(boost).toMatchObject({ booster_email: "team@beta.dev", company: "Acme AI" });
    expect(boost.boost_url).toMatch(/^https:\/\/launch\.example\/b\//);
    expect((await tool("mark_boosts_sent", { ids: [boost.boost_id] })).data.marked).toBe(1);

    const code = new URL(boost.boost_url).pathname.split("/")[2]!;
    const page = await get(`/b/${code}`);
    expect(page.html).toContain("Acme AI just launched");
    const share = await get(`/b/${code}/go`, "to=x");
    expect(share.status).toBe(302);
    expect(share.headers!["location"]).toMatch(/^https:\/\/twitter\.com\/intent\/tweet\?text=Acme%20AI%20just%20launched/);
    const stats = await tool("get_launch", { id: a.id });
    expect(stats.data.stats.boosts).toMatchObject({ sent: 1, shared: 1 });
    expect(stats.data.reciprocity).toEqual({ given: 0, received: 1 });
  });

  it("counts people per channel through tracked links, not bots or refreshes", async () => {
    const page = (await get("/k/acme-ai", `t=${a.token}`)).html!;
    const xCode = /launch\.example%2Fl%2F([A-Za-z0-9]+)/.exec(page)![1]!;
    const hit = (ua: string, ip: string) => get(`/l/${xCode}`, "", { "user-agent": ua, "x-forwarded-for": ip });
    const first = await hit(BROWSER, "1.1.1.1");
    expect(first.status).toBe(302);
    expect(first.headers!["location"]).toMatch(/^https:\/\/acme\.dev\/\?lp_ref=[a-f0-9]{24}&lp_ch=/);
    await hit(BROWSER, "1.1.1.1"); // refresh
    await hit(BROWSER, "2.2.2.2");
    await hit("Twitterbot/1.0", "3.3.3.3");
    const boostLink = /launch\.example%2Fl%2F([A-Za-z0-9]+)/.exec((await get(`/b/${(await db.query<{ code: string }>("select code from boosts limit 1")).rows[0]!.code}`)).html!)?.[1];
    if (boostLink) await get(`/l/${boostLink}`, "", { "user-agent": BROWSER, "x-forwarded-for": "4.4.4.4" });
    const stats = await tool("get_launch", { id: a.id });
    expect(stats.data.stats.clicks_by_channel).toMatchObject({ x: 2 });
    expect(stats.data.stats.clicks_total).toBeGreaterThanOrEqual(2);
    expect((await get("/l/nope1234")).status).toBe(404);
  });

  it("caps boosts per person per day and honours leaving the squad", async () => {
    const c = await submit({ company: "Gamma", one_liner: "Search for docs", description: "Launching today, please boost us thanks.", url: "https://gamma.dev", email: "hi@gamma.dev" });
    const gToken = new URL(c.headers!["location"]!, "https://launch.example").searchParams.get("t")!;
    clock = new Date(clock.getTime() + 13 * 60_000);
    const work = await tool("get_work", { agent: "producer" });
    const gId = work.data.write_kits_for.find((l: { company: string }) => l.company === "Gamma").id;
    await tool("claim_launch", { id: gId });
    await tool("save_kit", { id: gId, kit: kitFor("Gamma") });
    await handleRequest(req("POST", "/k/gamma/go", { query: `t=${gToken}` }), ctx());
    clock = new Date(clock.getTime() + 13 * 60_000);
    const pending = await tool("get_work", { agent: "booster" }, { BOOSTS_PER_BOOSTER_PER_DAY: "1" });
    // Beta was already asked once today, so only Acme is asked to boost Gamma.
    expect(pending.data.boosts.map((x: { booster_email: string }) => x.booster_email)).toEqual(["founder@acme.dev"]);
    const code = new URL(pending.data.boosts[0].boost_url).pathname.split("/")[2]!;
    expect((await get(`/b/${code}/stop`)).html).toContain("left the squad");
    clock = new Date(clock.getTime() + 13 * 60_000);
    expect((await tool("get_work", { agent: "booster" })).data.boosts.map((x: { booster_email: string }) => x.booster_email)).not.toContain("founder@acme.dev");
  });

  it("reports after the launch, publicly only when the founder listed it", async () => {
    expect((await tool("write_launch_report", { id: b.id, title: "t", body: "x" })).text).toMatch(/gone out/);
    const short = await tool("write_launch_report", { id: a.id, title: "t", body: "## A\nshort" });
    expect(short.text).toMatch(/400 characters/);
    const body = ["## The launch", "Acme AI launched its public beta on X and Show HN on Sunday morning, aimed at founders who hate doing their own taxes.", "## What we did", "One X thread posted at 7 AM Pacific, a Show HN queued for Monday morning, and one squad boost from a founder in the squad.",
      "## Results by channel", "X brought 2 people; the squad shared it once.", "## What worked and what didn't", "X worked; Show HN is unmeasured.",
      "## Recommendations", "Launch on a weekday and grow the squad first. <script>alert(1)</script>"].join("\n");
    const rep = await tool("write_launch_report", { id: a.id, title: "X drove 2 of 2 clicks; 1 boost shared", body });
    expect(rep.error).toBe(false);
    const page = await get(new URL(rep.data.report_url).pathname);
    expect(page.status).toBe(200);
    expect(page.html).toContain("<h2>Results by channel</h2>");
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect((await tool("get_launch", { id: a.id })).data.status).toBe("reported");
  });

  it("lets the scout record the radar and respects quotas and customers", async () => {
    clock = new Date(clock.getTime() + 13 * 60_000);
    const work = await tool("get_work", { agent: "scout" });
    expect(work.data.signup_url).toBe("https://launch.example/new");
    expect((await tool("add_radar", { items: [{ source: "launch_yc", title: "Delta: CRM for vets", url: "https://www.ycombinator.com/launches/abc", batch: "F25", contact: "founders@delta.vet" }] })).data.added).toBe(1);
    const q = await tool("outreach_quota", { targets: ["founder@acme.dev", "founders@delta.vet"] });
    expect(q.data.blocked_targets["founder@acme.dev"]).toBeTruthy();
    expect(q.data.blocked_targets["founders@delta.vet"]).toBeUndefined();
    expect((await tool("log_touch", { channel: "email", kind: "email", target: "founders@delta.vet", content: "Hi" }, { EMAILS_PER_DAY: "1" })).error).toBe(false);
    expect((await tool("log_touch", { channel: "email", kind: "email", target: "other@zeta.dev", content: "Hi" }, { EMAILS_PER_DAY: "1" })).text).toMatch(/quota/);
    expect((await tool("log_touch", { channel: "email", kind: "email", target: "founders@delta.vet", content: "Again" })).text).toMatch(/7 days/);
  });

  it("renders the public pages without leaking emails or kit tokens", async () => {
    await tool("log_decision", { agent: "producer", launch_id: a.id, decision: "timing", reasoning: "Sunday morning is quiet <b>" });
    const home = await get("/");
    expect(home.html).toContain("Launch everywhere");
    expect(home.html).toContain("Acme AI");
    expect(home.html).toContain("not affiliated with Y Combinator");
    const ops = await get("/ops");
    for (const leak of [a.token, b.token, "founder@acme.dev", "founders@delta.vet"]) {
      expect(home.html).not.toContain(leak);
      expect(ops.html).not.toContain(leak);
    }
    expect(ops.html).toContain("f***@delta.vet");
    expect(ops.html).toContain("Sunday morning is quiet &lt;b&gt;");
  });
});
