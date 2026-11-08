/**
 * Canary regressions for founder privacy on public pages (issue #9, R12).
 *
 * Unique marker strings are planted in everything a founder might keep private: an unlisted
 * launch's company, one-liner, description, kit strategy and agent decisions, its report, and the
 * exact body of an outreach email. Then every unauthenticated page is fetched and no marker may
 * appear. Listed launches stay visible, and email addresses in free text are masked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../server/db.ts";
import { openLocalDb } from "../server/local-db.ts";
import { handleRequest, type ApiRequest } from "../server/routes.ts";

let db: Db & { close(): Promise<void> };
let clock = new Date("2026-11-08T17:00:00Z");
beforeAll(async () => { db = await openLocalDb(); });
afterAll(async () => { await db.close(); });

const ctx = () => ({ db: async () => db, env: { mcpToken: "mcp", adminToken: "admin", vars: {} }, now: () => clock });
const req = (method: string, path: string, o: { body?: unknown; query?: string } = {}): ApiRequest => ({
  method, path, query: new URLSearchParams(o.query ?? ""), headers: { host: "launch.example", "x-forwarded-proto": "https", "user-agent": "Mozilla/5.0 Safari" }, body: o.body ?? null,
});
let rpc = 0;
async function tool(name: string, args: Record<string, unknown>) {
  const r = await handleRequest(req("POST", "/mcp", { body: { jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } } }), { ...ctx(), env: { ...ctx().env } });
  const auth = await handleRequest({ ...req("POST", "/mcp", { body: { jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } } }), headers: { host: "launch.example", "x-forwarded-proto": "https", authorization: "Bearer mcp" } }, ctx());
  void r;
  const result = (auth.json as { result: { content: { text: string }[]; isError?: boolean } }).result;
  if (result.isError) throw new Error(`${name}: ${result.content[0]!.text}`);
  return JSON.parse(result.content[0]!.text);
}
const submit = (fields: Record<string, string>) =>
  handleRequest(req("POST", "/new", { body: { ch_x: "1", ch_linkedin: "1", join_squad: "1", ...fields } }), ctx());
const kit = (company: string, secret: string) => ({
  strategy: `Plan for ${company}: lead with X on Sunday morning. ${secret} is the angle we keep private until launch day.`,
  timing: [{ channel: "x", when: "Sun 7:00 AM PT", why: `Quiet morning; ${secret}` }],
  posts: { x: [`We just launched ${company}. {link}`], linkedin: `Today we're launching ${company} for founders who are tired of launch chores. {link}` },
  boost_text: `${company} just launched. {link}`,
  checklist: ["Post the thread"],
});

const CANARY = {
  company: "Zephyrine Stealthco",
  oneLiner: "canary-oneliner-7f3a",
  description: "canary-description-91bd: our unannounced pivot",
  strategy: "canary-strategy-c4e2",
  decision: "canary-decision-5d18",
  report: "canary-report-a06f",
  emailBody: "canary-email-body-e7c9",
  address: "private.founder@zephyrine.example",
};

describe("public pages never expose private founder data", () => {
  let hidden: { slug: string; token: string; id: string };
  let shown: { id: string };
  let reportId = "";

  it("seeds an unlisted and a listed launch, each with a kit, decisions and a report", async () => {
    const h = await submit({ company: CANARY.company, one_liner: CANARY.oneLiner, description: CANARY.description, url: "https://zephyrine.example", email: CANARY.address });
    const loc = new URL(h.headers!["location"]!, "https://launch.example");
    hidden = { slug: loc.pathname.split("/")[2]!, token: loc.searchParams.get("t")!, id: "" };
    await submit({ company: "Openly Listed", one_liner: "A launch the founder chose to show", description: "We are happy for this to be public.", url: "https://openly.example", email: "team@openly.example", listed: "1" });

    const work = await tool("get_work", { agent: "producer" });
    hidden.id = work.write_kits_for.find((l: { company: string }) => l.company === CANARY.company).id;
    shown = { id: work.write_kits_for.find((l: { company: string }) => l.company === "Openly Listed").id };
    for (const [launchId, company, secret] of [[hidden.id, CANARY.company, CANARY.strategy], [shown.id, "Openly Listed", "public-angle"]] as const) {
      await tool("claim_launch", { id: launchId });
      await tool("save_kit", { id: launchId, kit: kit(company, secret) });
    }
    await tool("log_decision", { agent: "producer", launch_id: hidden.id, decision: "timing", reasoning: `${CANARY.decision}: ${CANARY.company} goes out Sunday` });
    await tool("log_decision", { agent: "producer", launch_id: shown.id, decision: "timing", reasoning: "Openly Listed goes out Sunday morning" });
    await tool("log_decision", { agent: "scout", decision: "outreach", reasoning: `Emailed ${CANARY.address} and hello@other.example about their launch` });
    await tool("log_touch", { channel: "email", kind: "email", target: "founders@tessera.example", content: `Your Launch YC post on Tessera\nHi there,\n${CANARY.emailBody} — we wrote to you about your SOC 2 launch. Contact ${CANARY.address}.` });
    await tool("log_touch", { channel: "email", kind: "email", target: "someone@delta.example", launch_id: hidden.id, content: `About ${CANARY.company}\n${CANARY.emailBody}` });

    // Both launches go out; the unlisted one gets a report.
    await handleRequest(req("POST", `/k/${hidden.slug}/go`, { query: `t=${hidden.token}` }), ctx());
    clock = new Date(clock.getTime() + 3 * 3_600_000);
    await tool("end_run", { agent: "producer", run_token: work.run_token });
    const report = await tool("write_launch_report", {
      id: hidden.id, title: `${CANARY.report}: what happened`,
      body: ["## The launch", `${CANARY.report} ${CANARY.company} launched quietly on X on Sunday morning to a small audience of founders.`, "## What we did", "One X thread at 7 AM Pacific, the Launch now button pressed right after, and a handful of squad boosts from founders in the squad.", "## Results by channel", "Two people clicked through from X.", "## Recommendations", "Grow the squad before the next launch and post on a weekday morning."].join("\n"),
    });
    reportId = new URL(report.report_url).pathname.split("/")[2]!;
  });

  it("keeps every marker off the landing page, /ops and other unauthenticated pages", async () => {
    const pages = ["/", "/ops", "/new", `/r/${reportId}`, `/k/${hidden.slug}`, `/k/${hidden.slug}?t=wrong`];
    for (const path of pages) {
      const [p, q] = path.split("?");
      const page = await handleRequest(req("GET", p!, { query: q }), ctx());
      const html = page.html ?? page.text ?? "";
      for (const [name, marker] of Object.entries(CANARY)) {
        expect(html, `${path} leaks ${name}`).not.toContain(marker);
      }
    }
  });

  it("still shows listed launches and outreach on /ops, with addresses masked and only the subject line", async () => {
    const ops = (await handleRequest(req("GET", "/ops"), ctx())).html!;
    expect(ops).toContain("Openly Listed goes out Sunday morning");
    expect(ops).toContain("Your Launch YC post on Tessera");
    expect(ops).toContain("p***@zephyrine.example");
    expect(ops).toContain("h***@other.example");
    expect(ops).not.toContain("hello@other.example");
  });

  it("serves an unlisted report only to its founder", async () => {
    expect((await handleRequest(req("GET", `/r/${reportId}`), ctx())).status).toBe(404);
    const owner = await handleRequest(req("GET", `/r/${reportId}`, { query: `t=${hidden.token}` }), ctx());
    expect(owner.status).toBe(200);
    expect(owner.html).toContain(CANARY.report);
  });
});
