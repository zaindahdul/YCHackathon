/**
 * The whole studio against a real (in-process) Postgres: founders start companies in parallel,
 * ship working products, real browsers use them (analytics, signups, feedback, the products'
 * backend), founders read the numbers, kill and pivot. Every step goes through the same routes
 * the deployed app serves.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../server/db.ts";
import { openLocalDb } from "../server/local-db.ts";
import { TOOLS } from "../server/mcp.ts";
import { handleRequest, type ApiRequest } from "../server/routes.ts";

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
  env: { mcpToken: "mcp-secret", adminToken: "admin-secret", vars },
  now: () => clock,
});

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
const request = (method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; query?: string } = {}): ApiRequest => ({
  method,
  path,
  query: new URLSearchParams(opts.query ?? ""),
  headers: { host: "studio.example", "x-forwarded-proto": "https", "user-agent": BROWSER, ...opts.headers },
  body: opts.body ?? null,
});
const get = (path: string, headers?: Record<string, string>) => handleRequest(request("GET", path, { headers }), ctx());

let rpcId = 0;
async function tool(name: string, args: Record<string, unknown> = {}, vars?: Record<string, string>) {
  const reply = await handleRequest(
    request("POST", "/mcp", { headers: { authorization: "Bearer mcp-secret" }, body: { jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } } }),
    ctx(vars),
  );
  expect(reply.status).toBe(200);
  const result = (reply.json as { result: { content: { text: string }[]; isError?: boolean } }).result;
  const text = result.content[0]!.text;
  return { error: result.isError === true, text, data: result.isError ? null : JSON.parse(text) };
}

/** A whole founder run in one call: take the lock, read the company, give the lock back. */
async function mine_(founder: string) {
  const result = await tool("get_my_company", { founder });
  if (result.data?.run_token) await tool("end_run", { founder, run_token: result.data.run_token });
  return result;
}

/** What the tracker sends from a real browser. */
const track = (body: Record<string, unknown>, ua = BROWSER) =>
  handleRequest(request("POST", "/api/t", { headers: { "user-agent": ua, "content-type": "text/plain" }, body }), ctx());
const items = (slug: string, method: string, rest = "", opts: { body?: unknown; user?: string; query?: string } = {}) =>
  handleRequest(request(method, `/p/${slug}/api/items${rest}`, { body: opts.body, query: opts.query, headers: opts.user ? { "x-pmf-user": opts.user } : {} }), ctx());

const company = (founder: string, name: string, extra: Record<string, unknown> = {}) => ({
  founder,
  name,
  problem: "Freelancers lose hours chasing late invoices and never know what to say.",
  audience: "Freelance designers and developers on r/freelance",
  evidence: ["https://www.reddit.com/r/freelance/comments/abc/how_do_you_chase_late_invoices/"],
  solution: "Paste the invoice details and get a polite, firm follow-up email sequence.",
  ...extra,
});

const INDEX = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice Chaser</title></head><body><main><h1>Invoice Chaser</h1><p>Paste an invoice and get three polite, firm follow-up emails.</p></main><script src="app.js"></script></body></html>`;
const STANDUP = `<!doctype html><html><head><title>Standup Bot</title></head><body><h1>Standup Bot</h1><p>Turn yesterday's commits into a two-line standup update you can paste into Slack.</p><p>No signup, nothing to install.</p></body></html>`;

describe("MCP endpoint", () => {
  it("refuses callers without the platform's bearer", async () => {
    const reply = await handleRequest(request("POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/list" } }), ctx());
    expect(reply.status).toBe(401);
  });

  it("speaks enough MCP for the platform", async () => {
    const auth = { authorization: "Bearer mcp-secret" };
    const init = await handleRequest(request("POST", "/mcp", { headers: auth, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } }), ctx());
    expect((init.json as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe("pmf");
    const list = await handleRequest(request("POST", "/mcp", { headers: auth, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } }), ctx());
    expect((list.json as { result: { tools: unknown[] } }).result.tools).toHaveLength(TOOLS.length);
    const note = await handleRequest(request("POST", "/mcp", { headers: auth, body: { jsonrpc: "2.0", method: "notifications/initialized" } }), ctx());
    expect(note.status).toBe(202);
  });
});

describe("the studio", () => {
  let chaser: { id: string; slug: string };
  let other: { id: string; slug: string };

  it("lets several founders start companies in parallel, one each", async () => {
    const empty = await mine_("founder-1");
    expect(empty.data.company).toBeNull();

    const bad = await tool("start_company", company("founder-1", "No evidence", { evidence: ["not a url"] }));
    expect(bad.text).toMatch(/evidence/);

    const a = await tool("start_company", company("founder-1", "Invoice Chaser"));
    expect(a.error).toBe(false);
    chaser = a.data.company;
    expect(a.data.product_url).toBe("https://studio.example/p/invoice-chaser/");

    const twice = await tool("start_company", company("founder-1", "Second company"));
    expect(twice.text).toMatch(/already run Invoice Chaser/);

    const b = await tool("start_company", company("founder-2", "Standup Bot", { problem: "Writing standups is tedious" }));
    other = b.data.company;
    const studio = await tool("get_studio");
    expect(studio.data.companies.map((c: { founder: string }) => c.founder)).toEqual(["founder-1", "founder-2"]);
  });

  it("never lets two runs of the same founder work at once", async () => {
    const first = await tool("get_my_company", { founder: "founder-9" });
    expect(first.data.run_token).toMatch(/^run_/);
    const second = await tool("get_my_company", { founder: "founder-9" });
    expect(second.data.busy).toBe(true);
    const sameRun = await tool("get_my_company", { founder: "founder-9", run_token: first.data.run_token });
    expect(sameRun.data.busy).toBeUndefined();
    expect((await tool("end_run", { founder: "founder-9", run_token: "run_000000000000" })).data.released).toBe(false);
    expect((await tool("end_run", { founder: "founder-9", run_token: first.data.run_token })).data.released).toBe(true);
    const next = await tool("get_my_company", { founder: "founder-9" });
    expect(next.data.run_token).toMatch(/^run_/);
    // A run that never gives the lock back loses it once the lease runs out.
    clock = new Date(clock.getTime() + 29 * 60_000);
    expect((await tool("get_my_company", { founder: "founder-9" })).data.run_token).toMatch(/^run_/);
    clock = new Date(clock.getTime() - 29 * 60_000);
  });

  it("shows a product that is still being built as coming soon", async () => {
    const page = await get(`/p/${chaser.slug}/`);
    expect(page.status).toBe(503);
    expect(page.html).toContain("being built");
  });

  it("only lets a founder ship its own company, and checks the product before writing", async () => {
    const stranger = await tool("publish_product", { founder: "founder-2", company_id: chaser.id, files: [{ path: "index.html", content: INDEX }], note: "hijack" });
    expect(stranger.text).toMatch(/belongs to founder-1/);
    const noIndex = await tool("publish_product", { founder: "founder-1", company_id: chaser.id, files: [{ path: "app.js", content: "1" }], note: "v1" });
    expect(noIndex.text).toMatch(/no index.html/);
    const badPath = await tool("publish_product", { founder: "founder-1", company_id: chaser.id, files: [{ path: "../x.js", content: "1" }], note: "v1" });
    expect(badPath.text).toMatch(/bad path/);
    expect((await tool("get_product_files", { company_id: chaser.id })).data.files).toEqual([]);
  });

  it("ships a working product that goes live with the tracker and disclosure added", async () => {
    const v1 = await tool("publish_product", {
      founder: "founder-1", company_id: chaser.id, note: "First version: paste invoice, get 3 follow-ups",
      files: [
        { path: "index.html", content: INDEX },
        { path: "app.js", content: "document.querySelector('h1').textContent += '!';" },
        { path: "NOTES.md", content: "# Notes\nv1 shipped." },
      ],
    });
    expect(v1.error).toBe(false);
    expect(v1.data.version.version).toBe(1);

    expect((await get(`/p/${chaser.slug}`)).headers?.["location"]).toBe(`/p/${chaser.slug}/`);
    const page = await get(`/p/${chaser.slug}/`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`<script src="/t.js" data-company="${chaser.slug}"></script></head>`);
    expect(page.text).toContain("Built by AI agents");
    const js = await get(`/p/${chaser.slug}/app.js`);
    expect(js.headers?.["content-type"]).toMatch(/javascript/);
    expect((await get(`/p/${chaser.slug}/NOTES.md`)).status).toBe(404);
    expect((await get(`/p/${chaser.slug}/settings`)).text).toContain("Invoice Chaser"); // single-page app fallback
    expect((await get("/t.js")).text).toContain("window.pmf");

    const v2 = await tool("publish_product", { founder: "founder-1", company_id: chaser.id, files: [{ path: "style.css", content: "h1{color:red}" }], note: "Styling" });
    expect(v2.data.version.version).toBe(2);
    const files = await tool("get_product_files", { company_id: chaser.id, paths: ["NOTES.md"] });
    expect(files.data.files[0].content).toContain("v1 shipped");
  });

  it("refuses placeholders and flags a broken live product", async () => {
    const fake = await tool("publish_product", { founder: "founder-1", company_id: chaser.id, files: [{ path: "index.html", content: "PLACEHOLDER" }], note: "oops" });
    expect(fake.text).toMatch(/placeholder/i);
    expect(fake.text).toMatch(/get_upload_link/);
    const stub = await tool("publish_product", { founder: "founder-1", company_id: chaser.id, files: [{ path: "app.js", content: "..." }], note: "oops" });
    expect(stub.text).toMatch(/placeholder/i);
    // A product broken by some other route is still caught: the founder is told to fix it first.
    await db.query("update product_files set content = 'PLACEHOLDER' where company_id = $1 and path = 'app.js'", [chaser.id]);
    const mine = await mine_("founder-1");
    expect(mine.data.product_health.join(" ")).toMatch(/app\.js is a placeholder/);
    expect(mine.data.fix_first).toBeTruthy();
  });

  it("ships big files straight from the sandbox through an upload link", async () => {
    const link = await tool("get_upload_link", { founder: "founder-1", company_id: chaser.id });
    expect(link.data.how).toContain("curl");
    const base = new URL(link.data.upload_url).pathname;
    const big = `const words = ${JSON.stringify("follow up ".repeat(20_000))};\ndocument.title = "Invoice Chaser";`;
    const put = (p: string, raw: string) => handleRequest({ ...request("PUT", `${base}/${p}`, { headers: { "content-type": "application/octet-stream" } }), raw }, ctx());
    expect((await put("app.js", big)).status).toBe(200);
    expect((await put("index.html", INDEX)).status).toBe(200);
    expect((await put("../evil.js", "x")).status).toBe(400);
    expect((await put("style.css", "PLACEHOLDER")).status).toBe(400);
    const staged = await handleRequest(request("GET", base), ctx());
    expect((staged.json as { staged: { path: string }[] }).staged.map((f) => f.path)).toEqual(["app.js", "index.html"]);

    const commit = await handleRequest(request("POST", `${base}/commit`, { body: { note: "Uploaded from the sandbox", replace: false } }), ctx());
    expect(commit.status).toBe(201);
    expect((commit.json as { version: { version: number } }).version.version).toBe(3);
    expect((await get(`/p/${chaser.slug}/app.js`)).text).toContain("follow up follow up");
    expect((await handleRequest(request("POST", `${base}/commit`, { body: { note: "again" } }), ctx())).status).toBe(400); // nothing staged

    const stranger = await tool("get_upload_link", { founder: "founder-2", company_id: chaser.id });
    expect(stranger.text).toMatch(/belongs to founder-1/);
    expect((await handleRequest(request("GET", "/api/upload/up_" + "0".repeat(40)), ctx())).status).toBe(404);
    const health = await mine_("founder-1");
    expect(health.data.product_health).toBeUndefined(); // the upload replaced the broken app.js
  });

  it("runs the real tracker script in a browser-like sandbox: views, uses, signups, the backend", async () => {
    await tool("publish_product", { founder: "founder-2", company_id: other.id, files: [{ path: "index.html", content: STANDUP }], note: "v1" });
    const calls: string[] = [];
    const fetchThroughRoutes = async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
      const parsed = new URL(url, "https://studio.example");
      calls.push(`${init.method ?? "GET"} ${parsed.pathname}`);
      const reply = await handleRequest(
        request(init.method ?? "GET", parsed.pathname, { query: parsed.search.slice(1), headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null }),
        ctx(),
      );
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.json ?? null };
    };
    const store = new Map<string, string>();
    const window: Record<string, unknown> = {};
    const sandbox = {
      window,
      document: { currentScript: { getAttribute: (name: string) => (name === "data-company" ? other.slug : null) } },
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
      location: { pathname: `/p/${other.slug}/`, search: "?ref=x" },
      crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
      URLSearchParams,
      fetch: fetchThroughRoutes,
    };
    const { runInNewContext } = await import("node:vm");
    const { TRACKER_JS } = await import("../server/pages.ts");
    runInNewContext(TRACKER_JS, { ...sandbox, window: Object.assign(window, sandbox) });
    const pmf = window["pmf"] as {
      user: string; track(n: string): Promise<boolean>; signup(e: string): Promise<boolean>;
      db: { add(c: string, d: unknown): Promise<{ id: string }>; list(c: string, o?: { mine?: boolean }): Promise<{ items: unknown[] }> };
    };
    expect(pmf.user).toBe("11111111-2222-4333-8444-555555555555");
    await new Promise((r) => setTimeout(r, 20)); // the page-view beacon
    expect(await pmf.track("standup_generated")).toBe(true);
    expect(await pmf.signup("lead@team.io")).toBe(true);
    const saved = await pmf.db.add("standups", { yesterday: "shipped", today: "tests" });
    expect(saved.id).toMatch(/^itm_/);
    expect((await pmf.db.list("standups", { mine: true })).items).toHaveLength(1);
    expect(calls).toContain("POST /api/t");
    const stats = (await mine_("founder-2")).data.company.stats;
    expect(stats).toMatchObject({ visitors: 1, active_users: 1, signups: 1 });

    // A founder testing its own product with ?qa=1 is never counted, on that page or any later one.
    const before = calls.length;
    const qaStore = new Map<string, string>();
    const qaWindow: Record<string, unknown> = {};
    const qaSandbox = {
      ...sandbox,
      localStorage: { getItem: (k: string) => qaStore.get(k) ?? null, setItem: (k: string, v: string) => void qaStore.set(k, v) },
      location: { pathname: `/p/${other.slug}/`, search: "?qa=1" },
    };
    runInNewContext(TRACKER_JS, { ...qaSandbox, window: Object.assign(qaWindow, qaSandbox) });
    expect(await (qaWindow["pmf"] as { track(n: string): Promise<boolean> }).track("standup_generated")).toBe(true);
    expect(calls.slice(before).filter((c) => c === "POST /api/t")).toHaveLength(0);
    expect(qaStore.get("pmf_qa")).toBe("1");
  });

  it("counts real users: visitors, people who used it, people who came back", async () => {
    await track({ c: chaser.slug, u: "user-aaaa", t: "view", r: "x" });
    await track({ c: chaser.slug, u: "user-aaaa", t: "view" }); // same hour: one visitor
    await track({ c: chaser.slug, u: "user-bbbb", t: "view" });
    await track({ c: chaser.slug, u: "crawler-1", t: "view" }, "Twitterbot/1.0");
    await track({ c: chaser.slug, u: "user-aaaa", t: "use", n: "generated" });
    expect((await track({ c: chaser.slug, u: "user-bbbb", t: "signup", email: "Maya@Studio.dev" })).status).toBe(204);
    await track({ c: chaser.slug, u: "user-bbbb", t: "feedback", text: "Love it, can it do Spanish?" });
    expect((await track({ c: chaser.slug, u: "x", t: "view" })).status).toBe(400);

    clock = new Date(clock.getTime() + 2 * 3_600_000);
    await track({ c: chaser.slug, u: "user-aaaa", t: "view" }); // came back

    const mine = await mine_("founder-1");
    // Both used it (one generated, one signed up); only user-aaaa came back in a later hour.
    expect(mine.data.company.stats).toMatchObject({ visitors: 2, active_users: 2, returning_users: 1, signups: 1, feedback: 1, versions: 3 });
    expect(mine.data.feedback[0].text).toContain("Spanish");
    expect(mine.data.files.map((f: { path: string }) => f.path)).toEqual(["NOTES.md", "app.js", "index.html", "style.css"]);
  });

  it("gives every product a small backend that respects who owns what", async () => {
    const added = await items(chaser.slug, "POST", "", { body: { collection: "plans", data: { client: "Acme", amount: 1200 } }, user: "user-aaaa" });
    expect(added.status).toBe(201);
    const id = (added.json as { id: string }).id;
    await items(chaser.slug, "POST", "", { body: { collection: "plans", data: { client: "Other" } }, user: "user-bbbb" });

    const mine = await items(chaser.slug, "GET", "", { query: "collection=plans&mine=1", user: "user-aaaa" });
    expect((mine.json as { items: unknown[] }).items).toHaveLength(1);
    expect(((await items(chaser.slug, "GET", "", { query: "collection=plans" })).json as { items: unknown[] }).items).toHaveLength(2);

    expect((await items(chaser.slug, "PUT", `/${id}`, { body: { data: { hacked: true } }, user: "user-bbbb" })).status).toBe(404);
    const updated = await items(chaser.slug, "PUT", `/${id}`, { body: { data: { client: "Acme", amount: 1500 } }, user: "user-aaaa" });
    expect((updated.json as { data: { amount: number } }).data.amount).toBe(1500);
    expect((await items(chaser.slug, "GET", `/${id}`)).status).toBe(200);

    const shared = await items(chaser.slug, "POST", "", { body: { collection: "board", data: { note: "hi" }, shared: true } });
    expect((shared.json as { owner: string | null }).owner).toBeNull();
    expect((await items(chaser.slug, "POST", "", { body: { collection: "board", data: { note: "x" } } })).status).toBe(400);
    expect((await items(chaser.slug, "POST", "", { body: { collection: "big", data: "x".repeat(30_000) }, user: "user-aaaa" })).status).toBe(400);

    expect((await items(chaser.slug, "DELETE", `/${id}`, { user: "user-bbbb" })).status).toBe(404);
    expect((await items(chaser.slug, "DELETE", `/${id}`, { user: "user-aaaa" })).status).toBe(200);
  });

  it("shares outreach quotas across the studio and never contacts anyone twice", async () => {
    const vars = { EMAILS_PER_COMPANY_PER_DAY: "2", EMAILS_PER_DAY: "3" };
    const send = (companyId: string, target: string) => tool("log_touch", { company_id: companyId, channel: "email", kind: "email", target, content: "Hi" }, vars);
    expect((await send(chaser.id, "editor@freelance-weekly.com")).error).toBe(false);
    expect((await send(other.id, "Editor@Freelance-Weekly.com")).text).toMatch(/contacted in the last 7 days/);
    await send(chaser.id, "b@two.io");
    expect((await send(chaser.id, "c@three.io")).text).toMatch(/quota/); // company cap
    await send(other.id, "d@four.io");
    expect((await send(other.id, "e@five.io")).text).toMatch(/quota/); // studio-wide cap

    await tool("opt_out", { target: "grumpy@example.com", reason: "said stop" });
    expect((await send(chaser.id, "grumpy@example.com")).text).toMatch(/quota|opted out/);
    const quota = await tool("outreach_quota", { company_id: other.id, targets: ["grumpy@example.com"] });
    expect(quota.data.blocked_targets["grumpy@example.com"]).toBe("opted out");

    const post = await tool("log_touch", { company_id: chaser.id, channel: "x", kind: "post", content: "Chasing invoices? ...", external_id: "post_1" });
    expect(post.error).toBe(false);
    expect((await tool("update_touch_metrics", { external_id: "post_1", impressions: 900, engagements: 14 })).data.impressions).toBe(900);
  });

  it("files what people email in, for the right company", async () => {
    await tool("add_feedback", { company_id: chaser.id, text: "The second email is too pushy", email: "client@agency.io" });
    const signup = await tool("add_signup", { company_id: chaser.id, email: "fan@agency.io" });
    expect(signup.data.duplicate).toBe(false);
    expect((await tool("add_signup", { company_id: chaser.id, email: "FAN@agency.io" })).data.duplicate).toBe(true);
    const feedback = await tool("list_feedback", { company_id: chaser.id });
    expect(feedback.data[0].email).toBe("c***@agency.io");
  });

  it("requires a detailed report to close a test, and publishes it with the studio's numbers", async () => {
    const bare = await tool("log_decision", { founder: "founder-1", company_id: chaser.id, decision: "iterate", reasoning: "Few people used it" });
    expect(bare.text).toMatch(/needs report_title and report/);
    const thin = await tool("log_decision", { founder: "founder-1", company_id: chaser.id, decision: "iterate", reasoning: "x", report_title: "Meh", report: "## Results\nNot great." });
    expect(thin.text).toMatch(/at least 400/);
    const keep = await tool("log_decision", { founder: "founder-1", company_id: chaser.id, decision: "keep", reasoning: "Early signs are fine" });
    expect(keep.data.report).toBeNull();

    const iterated = await tool("log_decision", {
      founder: "founder-1", company_id: chaser.id, decision: "iterate", reasoning: "2 of 2 visitors used it but nobody came back",
      report_title: "v2 tested styling: 2/2 visitors used it, 1 came back",
      report: [
        "## Hypothesis", "Freelancers will use a **one-click** follow-up generator if the first screen shows the result immediately.",
        "## What we built", "- v1: paste invoice, get 3 follow-ups", "- v2: styling", "## How we tested it", "One X post and three emails to newsletter editors.",
        "## Results", "2 visitors, 2 used it, 1 came back. Below the 30-visitor bar, so reach is the open question.",
        "## What users said", "> Love it, can it do Spanish?", "## What we learned", "Language support is the first request.",
        "## Decision and next step", "Iterate: add Spanish and push to r/freelance. <script>alert(1)</script>",
      ].join("\n"),
    });
    expect(iterated.error).toBe(false);
    expect(iterated.data.report.url).toMatch(/^https:\/\/studio\.example\/r\/rep_/);

    const reportPath = new URL(iterated.data.report.url).pathname;
    const page = await get(reportPath);
    expect(page.status).toBe(200);
    expect(page.html).toContain("<h2>Hypothesis</h2>");
    expect(page.html).toContain("<strong>one-click</strong>");
    expect(page.html).toContain("<blockquote>Love it, can it do Spanish?</blockquote>");
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect(page.html).toContain("The studio's numbers when this was written");
    expect(page.html).toContain("Every test up to this point");

    const company = await get(`/c/${chaser.slug}`);
    expect(company.html).toContain("v2 tested styling: 2/2 visitors used it, 1 came back");
    expect(company.html).toContain("<th>Used it</th>");
    expect((await get("/reports")).html).toContain("v2 tested styling");
    expect((await get("/")).html).toContain("Latest reports");
    expect((await get("/r/rep_000000000000")).status).toBe(404);

    const mine = await mine_("founder-1");
    expect(mine.data.reports[0].title).toMatch(/v2 tested styling/);
    expect(mine.data.tests.map((t: { version: number }) => t.version)).toEqual([3, 2, 1]);
  });

  const KILL_REPORT = [
    "## Hypothesis", "Freelancers want automated invoice follow-ups.", "## What we built", "Two versions of a follow-up generator.",
    "## How we tested it", "Posts on X and personal emails to newsletter editors over six hours.", "## Results",
    "Two visitors in total: reach never reached the bar to judge the product, after repeated hook changes.",
    "## What users said", "One asked for Spanish.", "## What we learned", "Emails beat posts, but neither produced traffic for this niche.",
    "## Decision and next step", "Kill and pivot to a late-fee calculator, which people search for directly.",
  ].join("\n");

  it("kills and pivots with the real numbers attached, and takes the old product offline", async () => {
    const noReport = await tool("set_company_status", { founder: "founder-1", company_id: chaser.id, status: "killed", reasoning: "Testing the kill path" });
    expect(noReport.text).toMatch(/needs report_title and report/);
    expect((await get(`/p/${chaser.slug}/`)).status).toBe(200); // a refused kill changes nothing

    const killed = await tool("set_company_status", { founder: "founder-1", company_id: chaser.id, status: "killed", reasoning: "Testing the kill path", report_title: "Invoice Chaser: killed after 2 tests", report: KILL_REPORT });
    expect(killed.data.decision).toMatchObject({ decision: "kill", agent: "founder-1" });
    expect(killed.data.decision.snapshot).toMatchObject({ visitors: 2, active_users: 2 });
    expect(killed.data.report.url).toMatch(/\/r\/rep_/);

    expect((await get(`/p/${chaser.slug}/`)).status).toBe(410);
    expect((await items(chaser.slug, "GET", "", { query: "collection=plans" })).status).toBe(410);
    expect((await tool("publish_product", { founder: "founder-1", company_id: chaser.id, files: [{ path: "index.html", content: INDEX }], note: "zombie" })).text).toMatch(/killed/);

    const past = await mine_("founder-1");
    expect(past.data.company).toBeNull();
    expect(past.data.past_companies[0].status).toBe("killed");
    expect(past.data.lessons[0].body).toContain("late-fee calculator"); // the founder learns from its own reports

    const pivot = await tool("start_company", company("founder-1", "Late Fee Calculator", { parent_id: chaser.id, pivot_reason: "People wanted numbers, not emails" }));
    expect(pivot.error).toBe(false);
    const decisions = await tool("list_decisions", { company_id: pivot.data.company.id });
    expect(decisions.data[0]).toMatchObject({ decision: "pivot" });
    expect(decisions.data[0].reasoning).toMatch(/numbers, not emails/);
  });

  it("renders the public dashboard and company pages without leaking addresses", async () => {
    await handleRequest(request("POST", "/api/interventions", { headers: { authorization: "Bearer admin-secret" }, body: { description: "Connected the X account" } }), ctx());
    const page = await get("/");
    expect(page.status).toBe(200);
    for (const text of ["PMF Engine", "Invoice Chaser", "Late Fee Calculator", "Standup Bot", "Connected the X account", "c***@agency.io"]) expect(page.html).toContain(text);
    for (const leak of ["client@agency.io", "editor@freelance-weekly.com", "maya@studio.dev"]) expect(page.html).not.toContain(leak);

    const detail = await get(`/c/${chaser.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.html).toContain("First version: paste invoice, get 3 follow-ups");
    expect(detail.html).toContain("reddit.com/r/freelance");
    expect((await get("/c/nope")).status).toBe(404);
  });

  it("escapes agent-written text everywhere", async () => {
    await tool("start_company", company("founder-3", "<script>alert(1)</script>"));
    const page = await get("/");
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect(page.html).toContain("&lt;script&gt;");
  });

  it("keeps the operator routes private", async () => {
    expect((await handleRequest(request("POST", "/api/interventions", { body: { description: "x" } }), ctx())).status).toBe(401);
  });
});
