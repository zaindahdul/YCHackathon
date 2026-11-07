/**
 * The whole company loop against a real (in-process) Postgres: the strategist launches, growth
 * logs outreach, a visitor signs up on the landing page, the operator delivers, the strategist
 * kills and pivots. Every step goes through the same routes the deployed app serves.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../server/db.ts";
import { openLocalDb } from "../server/local-db.ts";
import { TOOLS } from "../server/mcp.ts";
import { handleRequest, parseBody, type ApiRequest } from "../server/routes.ts";

let db: Db & { close(): Promise<void> };
let clock = new Date("2026-11-07T22:00:00Z");

beforeAll(async () => {
  db = await openLocalDb();
});
afterAll(async () => {
  await db.close();
});

const ctx = (vars: Record<string, string> = {}) => ({
  db: async () => db,
  env: { mcpToken: "mcp-secret", adminToken: "admin-secret", salt: "test", vars },
  now: () => clock,
});

const request = (method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; query?: string } = {}): ApiRequest => ({
  method,
  path,
  query: new URLSearchParams(opts.query ?? ""),
  headers: { host: "pmf.example", "x-forwarded-proto": "https", "user-agent": "Mozilla/5.0 Safari", ...opts.headers },
  body: opts.body ?? null,
});

let rpcId = 0;
async function tool(name: string, args: Record<string, unknown> = {}, vars?: Record<string, string>) {
  const reply = await handleRequest(
    request("POST", "/mcp", {
      headers: { authorization: "Bearer mcp-secret" },
      body: { jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } },
    }),
    ctx(vars),
  );
  expect(reply.status).toBe(200);
  const result = (reply.json as { result: { content: { text: string }[]; isError?: boolean } }).result;
  const text = result.content[0]!.text;
  return { error: result.isError === true, text, data: result.isError ? null : JSON.parse(text) };
}

const experimentInput = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  hypothesis: "Indie builders who just launched want a fast, free QA pass.",
  audience: "Indie builders posting launches on Show HN this weekend",
  offer: "A free QA teardown of your just-launched app",
  deliverable: "A prioritized list of 5-10 bugs and UX issues with steps to reproduce",
  headline: "Just launched? Get a free QA teardown in 30 minutes",
  subhead: "We test your app like a picky first user and email you what's broken.",
  bullets: ["Bugs with steps to reproduce", "UX friction ranked by impact"],
  cta: "Get my teardown",
  ...extra,
});

describe("MCP endpoint", () => {
  it("refuses callers without the platform's bearer", async () => {
    const reply = await handleRequest(request("POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/list" } }), ctx());
    expect(reply.status).toBe(401);
  });

  it("speaks enough MCP for the platform: initialize, tools/list, notifications", async () => {
    const auth = { authorization: "Bearer mcp-secret" };
    const init = await handleRequest(request("POST", "/mcp", { headers: auth, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } }), ctx());
    expect((init.json as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe("pmf");
    const list = await handleRequest(request("POST", "/mcp", { headers: auth, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } }), ctx());
    expect((list.json as { result: { tools: unknown[] } }).result.tools).toHaveLength(TOOLS.length);
    const note = await handleRequest(request("POST", "/mcp", { headers: auth, body: { jsonrpc: "2.0", method: "notifications/initialized" } }), ctx());
    expect(note.status).toBe(202);
  });
});

describe("the company loop", () => {
  let qa: { id: string; slug: string };

  it("launches an experiment with a live landing page and logs the launch", async () => {
    const created = await tool("create_experiment", experimentInput("Launch-day QA teardown"));
    expect(created.error).toBe(false);
    qa = created.data.experiment;
    expect(created.data.landing_url).toBe(`https://pmf.example/x/${qa.slug}`);
    const decisions = await tool("list_decisions");
    expect(decisions.data[0]).toMatchObject({ decision: "launch", experiment_id: qa.id });
  });

  it("validates what the strategist sends", async () => {
    const bad = await tool("create_experiment", experimentInput("Bad one", { bullets: ["only one"] }));
    expect(bad.error).toBe(true);
    expect(bad.text).toMatch(/bullets/);
    const pivotWithoutReason = await tool("create_experiment", experimentInput("Orphan pivot", { parent_id: qa.id }));
    expect(pivotWithoutReason.text).toMatch(/pivot_reason/);
  });

  it("caps the number of live experiments", async () => {
    await tool("create_experiment", experimentInput("Second"));
    await tool("create_experiment", experimentInput("Third"));
    const fourth = await tool("create_experiment", experimentInput("Fourth"));
    expect(fourth.error).toBe(true);
    expect(fourth.text).toMatch(/already 3 live/);
  });

  it("logs outreach, enforces quotas, and never contacts the same person twice in a week", async () => {
    const vars = { EMAIL_CAP_PER_DAY: "2" };
    const first = await tool("log_touch", { experiment_id: qa.id, channel: "email", kind: "email", target: "Founder@Startup.io", content: "Hi..." }, vars);
    expect(first.error).toBe(false);
    const again = await tool("log_touch", { experiment_id: qa.id, channel: "email", kind: "email", target: "founder@startup.io", content: "Hi again" }, vars);
    expect(again.text).toMatch(/must not be contacted: contacted in the last 7 days/);
    await tool("log_touch", { experiment_id: qa.id, channel: "email", kind: "email", target: "b@two.io", content: "Hi" }, vars);
    const over = await tool("log_touch", { experiment_id: qa.id, channel: "email", kind: "email", target: "c@three.io", content: "Hi" }, vars);
    expect(over.text).toMatch(/quota/);
    const quota = await tool("outreach_quota", { targets: ["founder@startup.io", "new@person.io"] }, vars);
    expect(quota.data.emails_left).toBe(0);
    expect(Object.keys(quota.data.blocked_targets)).toEqual(["founder@startup.io"]);

    const post = await tool("log_touch", { experiment_id: qa.id, channel: "x", kind: "post", content: "Just launched? ...", external_id: "post_123" });
    expect(post.error).toBe(false);
    const metrics = await tool("update_touch_metrics", { external_id: "post_123", impressions: 640, engagements: 12 });
    expect(metrics.data.impressions).toBe(640);
  });

  it("honours opt-outs", async () => {
    await tool("opt_out", { target: "Grumpy@Example.com", reason: "said stop" });
    const blocked = await tool("log_touch", { experiment_id: qa.id, channel: "email", kind: "email", target: "grumpy@example.com", content: "Hi" });
    expect(blocked.text).toMatch(/opted out/);
  });

  it("counts real visitors, not crawlers, and takes a signup from the landing page", async () => {
    const page = await handleRequest(request("GET", `/x/${qa.slug}`, { query: "src=x", headers: { "x-forwarded-for": "1.2.3.4" } }), ctx());
    expect(page.status).toBe(200);
    expect(page.html).toContain("Just launched? Get a free QA teardown in 30 minutes");
    await handleRequest(request("GET", `/x/${qa.slug}`, { headers: { "x-forwarded-for": "1.2.3.4" } }), ctx()); // same visitor, same day
    await handleRequest(request("GET", `/x/${qa.slug}`, { headers: { "user-agent": "Twitterbot/1.0" } }), ctx());

    const missing = await handleRequest(request("POST", `/x/${qa.slug}`, { body: { email: "nope", need: "test my app" } }), ctx());
    expect(missing.status).toBe(422);
    expect(missing.html).toContain("valid email");

    const ok = await handleRequest(
      request("POST", `/x/${qa.slug}`, { body: parseBody("email=Maya%40launch.dev&name=Maya&need=Test+my+habit+app&link=habits.dev&src=x", "application/x-www-form-urlencoded") }),
      ctx(),
    );
    expect(ok.status).toBe(303);
    expect(ok.headers?.["location"]).toBe(`/x/${qa.slug}/thanks`);

    const bot = await handleRequest(request("POST", `/x/${qa.slug}`, { body: { email: "bot@spam.io", need: "buy", website: "http://spam" } }), ctx());
    expect(bot.status).toBe(303);

    const board = await tool("get_scoreboard");
    const row = board.data.experiments.find((e: { id: string }) => e.id === qa.id);
    expect(row.stats).toMatchObject({ views: 1, signups: 1, x_posts: 1, emails: 2, impressions: 640 });
  });

  it("lets exactly one operator claim and deliver a signup", async () => {
    const [signup] = (await tool("list_signups", { status: "new" })).data;
    expect(signup).toMatchObject({ email: "maya@launch.dev", link: "https://habits.dev", source: "x" });
    const claimed = await tool("claim_signup", { id: signup.id });
    expect(claimed.data.experiment.deliverable).toMatch(/bugs/);
    const twice = await tool("claim_signup", { id: signup.id });
    expect(twice.error).toBe(true);
    const delivered = await tool("record_delivery", { signup_id: signup.id, summary: "7 issues found in habits.dev", content: "1. ..." });
    expect(delivered.error).toBe(false);
    const again = await tool("record_delivery", { signup_id: signup.id, summary: "dup", content: "dup" });
    expect(again.error).toBe(true);
  });

  it("files signups that arrive by email, without duplicates", async () => {
    const first = await tool("add_signup", { experiment_id: qa.id, email: "reply@person.io", need: "yes please, here's my app" });
    const dup = await tool("add_signup", { experiment_id: qa.id, email: "Reply@Person.io", need: "again" });
    expect(dup.data.duplicate).toBe(true);
    expect(dup.data.signup.id).toBe(first.data.signup.id);
  });

  it("kills and pivots with the real numbers attached to the decision", async () => {
    clock = new Date(clock.getTime() + 5 * 3_600_000);
    const killed = await tool("set_experiment_status", { id: qa.id, status: "killed", reasoning: "Testing the kill path" });
    expect(killed.data.decision).toMatchObject({ decision: "kill" });
    expect(killed.data.decision.snapshot).toMatchObject({ signups: 2, views: 1 });

    const closed = await handleRequest(request("GET", `/x/${qa.slug}`), ctx());
    expect(closed.status).toBe(410);

    const pivot = await tool("create_experiment", experimentInput("QA teardown for Shopify stores", { parent_id: qa.id, pivot_reason: "Builders did not convert; trying store owners" }));
    expect(pivot.error).toBe(false);
    const decisions = await tool("list_decisions", { limit: 1 });
    expect(decisions.data[0]).toMatchObject({ decision: "pivot", experiment_id: pivot.data.experiment.id });
    expect(decisions.data[0].reasoning).toMatch(/store owners/);
  });

  it("renders the public dashboard with masked emails", async () => {
    await handleRequest(request("POST", "/api/interventions", { headers: { authorization: "Bearer admin-secret" }, body: { description: "Connected the X account" } }), ctx());
    const page = await handleRequest(request("GET", "/"), ctx());
    expect(page.status).toBe(200);
    expect(page.html).toContain("PMF Engine");
    expect(page.html).toContain("QA teardown for Shopify stores");
    expect(page.html).toContain("Connected the X account");
    expect(page.html).toContain("m***@launch.dev");
    expect(page.html).not.toContain("maya@launch.dev");
    expect(page.html).not.toContain("founder@startup.io");
  });

  it("keeps the interventions route private", async () => {
    const reply = await handleRequest(request("POST", "/api/interventions", { body: { description: "x" } }), ctx());
    expect(reply.status).toBe(401);
  });

  it("escapes agent-written copy on landing pages", async () => {
    // Finish one live experiment to free a slot.
    const board = await tool("get_scoreboard");
    const live = board.data.experiments.filter((e: { status: string }) => e.status === "live");
    await tool("set_experiment_status", { id: live[0].id, status: "paused", reasoning: "make room" });
    const evil = await tool("create_experiment", experimentInput("XSS check", { headline: "<script>alert(1)</script>" }));
    const page = await handleRequest(request("GET", `/x/${evil.data.experiment.slug}`), ctx());
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect(page.html).toContain("&lt;script&gt;");
  });
});
