/**
 * Regressions for what a full browser walk of Launchpad and the live ops log turned up: the squad
 * count, late joiners, link scanners on boost pages, bad launch ids from agents, and the scout
 * burning runs once its quota is gone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../server/db.ts";
import { openLocalDb } from "../server/local-db.ts";
import { kitSummary } from "../server/mcp.ts";
import { handleRequest, type ApiRequest } from "../server/routes.ts";
import type { Kit } from "../server/rules.ts";

let db: Db & { close(): Promise<void> };
let clock = new Date("2026-11-09T16:00:00Z");
beforeAll(async () => { db = await openLocalDb(); });
afterAll(async () => { await db.close(); });

const BROWSER = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/604.1";
const ctx = (vars: Record<string, string> = {}) => ({ db: async () => db, env: { mcpToken: "mcp", adminToken: "admin", vars }, now: () => clock });
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
const kit = (company: string): Kit => ({
  strategy: `## The plan\n\nLaunch ${company} on X first thing Monday, then LinkedIn an hour later. Nothing big from YC is on the radar that morning.`,
  timing: [{ channel: "x", when: "Mon Nov 9, 7:00 AM PT", why: "Quiet morning" }],
  posts: { x: [`We just launched ${company}. {link}`] },
  boost_text: `${company} just launched. Worth a look: {link}`,
  checklist: ["Post the X thread", "Press Launch now"],
});

/** A founder fills the form, and the producer writes their kit. */
async function founder(company: string, email: string): Promise<{ id: string; slug: string; token: string }> {
  const r = await handleRequest(req("POST", "/new", { body: { company, one_liner: "A thing for founders", description: "We launch this week and want reach on X.", url: `https://${company.toLowerCase()}.dev`, email, ch_x: "1", join_squad: "1", listed: "1" } }), ctx());
  const loc = new URL(r.headers!["location"]!, "https://launch.example");
  const slug = loc.pathname.split("/")[2]!;
  const { rows } = await db.query<{ id: string }>("select id from launches where slug = $1", [slug]);
  return { id: rows[0]!.id, slug, token: loc.searchParams.get("t")! };
}
async function writeKit(id: string, company: string) {
  expect((await tool("claim_launch", { id })).error).toBe(false);
  expect((await tool("save_kit", { id, kit: kit(company) })).error).toBe(false);
}
const launch = (l: { slug: string; token: string }) => handleRequest(req("POST", `/k/${l.slug}/go`, { query: `t=${l.token}` }), ctx());
const kitPage = async (l: { slug: string; token: string }) => (await get(`/k/${l.slug}`, `t=${l.token}`)).html!;
const boostsFor = async (email: string) => (await tool("get_work", { agent: "booster", run_token: "none" })).data?.boosts?.filter((b: { booster_email: string }) => b.booster_email === email) ?? [];

describe("the squad", () => {
  let a: { id: string; slug: string; token: string };

  it("counts only founders Launch now would actually ask", async () => {
    a = await founder("Alpha", "a@alpha.dev");
    await writeKit(a.id, "Alpha");
    const b = await founder("Bravo", "b@bravo.dev"); // in the squad, but no kit yet
    expect(await kitPage(a)).toContain("Nobody else is in the squad yet");
    await writeKit(b.id, "Bravo");
    expect(await kitPage(a)).toContain("1 founder in the squad");
    await tool("opt_out", { target: "b@bravo.dev" });
    expect(await kitPage(a)).toContain("Nobody else is in the squad yet");
  });

  it("asks founders who join after a launch, as the kit page promises", async () => {
    expect((await launch(a)).status).toBe(303);
    expect(await kitPage(a)).toContain("Founders who join in the next 48 hours");
    const c = await founder("Charlie", "c@charlie.dev");
    await writeKit(c.id, "Charlie");
    const asked = await boostsFor("c@charlie.dev");
    expect(asked.map((x: { company: string }) => x.company)).toEqual(["Alpha"]);
    expect(await kitPage(a)).toContain("1 squad founder is being asked to share it now");
  });

  it("doesn't ask late joiners about launches older than 48 hours", async () => {
    clock = new Date(clock.getTime() + 49 * 3_600_000);
    const d = await founder("Delta", "d@delta.dev");
    await writeKit(d.id, "Delta");
    expect(await boostsFor("d@delta.dev")).toEqual([]);
  });
});

describe("boost pages and link scanners", () => {
  let code = "";
  beforeAll(async () => {
    const { rows } = await db.query<{ code: string }>("select b.code from boosts b join launches m on m.id = b.booster_id where m.email = 'c@charlie.dev'");
    code = rows[0]!.code;
  });
  const status = async () => (await db.query<{ status: string }>("select status from boosts where code = $1", [code])).rows[0]!.status;
  const optedOut = async () => (await db.query("select 1 from optouts where target = 'c@charlie.dev'")).rows.length > 0;

  it("ignores a scanner opening the share and skip links", async () => {
    const scanner = { "user-agent": "Mozilla/5.0 (compatible; Barracuda Sentinel)" };
    expect((await get(`/b/${code}/go`, "to=x", scanner)).status).toBe(302);
    await get(`/b/${code}/skip`, "", scanner);
    expect(await status()).toBe("pending");
  });

  it("only leaves the squad on a deliberate POST", async () => {
    const confirm = await get(`/b/${code}/stop`);
    expect(confirm.html).toContain("Leave the boost squad?");
    expect(confirm.html).toContain(`action="/b/${code}/stop"`);
    expect(await optedOut()).toBe(false);
    expect((await handleRequest(req("POST", `/b/${code}/stop`), ctx())).html).toContain("left the squad");
    expect(await optedOut()).toBe(true);
  });

  it("records a person's skip", async () => {
    await get(`/b/${code}/skip`);
    expect(await status()).toBe("skipped");
  });
});

describe("agent tools", () => {
  it("refuses a made-up launch_id instead of failing with a 503", async () => {
    const bad = { launch_id: "rad_123456789abc" };
    const touch = await tool("log_touch", { channel: "email", kind: "email", target: "x@yankee.dev", content: "Hi", ...bad });
    expect(touch.error).toBe(true);
    expect(touch.text).toMatch(/no launch has id rad_123456789abc/);
    expect((await tool("log_decision", { agent: "scout", decision: "outreach", reasoning: "r", ...bad })).text).toMatch(/leave launch_id out/);
    expect((await tool("add_feedback", { text: "nice", ...bad })).error).toBe(true);
    expect((await tool("log_touch", { channel: "email", kind: "email", target: "x@yankee.dev", content: "Hi" })).error).toBe(false);
  });

  it("tells the scout to stop once the email quota is used up", async () => {
    const work = await tool("get_work", { agent: "scout" }, { EMAILS_PER_DAY: "1" });
    expect(work.data.quota.emails_left).toBe(0);
    expect(work.data.next).toMatch(/used up.*end_run now, without logging a decision/);
    await tool("end_run", { agent: "scout", run_token: work.data.run_token });
    const fresh = await tool("get_work", { agent: "scout" });
    expect(fresh.data.next).toMatch(/Up to 8 emails/);
  });

  it("summarises a kit for the public log without its Markdown headings", () => {
    expect(kitSummary(kit("Echo"))).toMatch(/^Launch Echo on X first thing Monday/);
  });
});

describe("public pages", () => {
  it("says 1 human step-in, not 1 human step-ins", async () => {
    await handleRequest(req("POST", "/api/interventions", { headers: { authorization: "Bearer admin" }, body: { description: "Connected X by hand" } }), ctx());
    expect((await get("/ops")).html).toContain("human step-in</span>");
  });

  it("serves an icon inline, so browsers don't request a missing favicon", async () => {
    expect((await get("/")).html).toContain('rel="icon" href="data:image/svg+xml');
  });

  it("makes the launch-day checklist something you can tick off", async () => {
    const { rows } = await db.query<{ slug: string; token: string }>("select slug, token from launches where kit is not null limit 1");
    const html = await kitPage(rows[0]!);
    expect(html).toContain('<input type="checkbox" data-step="0">');
    expect(html).toContain("lp-todo-");
  });
});
