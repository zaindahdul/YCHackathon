import { beforeAll, afterAll, expect, it } from "vitest";
import { openLocalDb } from "../server/local-db.ts";
import { Repo } from "../server/repo.ts";
import { callTool, TOOLS } from "../server/mcp.ts";
import { DEFAULT_CAPS } from "../server/rules.ts";
import { readRaw, requestFrom } from "../server/entry.ts";
import { kickoff } from "../scripts/kickoff.ts";
import { KickoffBudget } from "../scripts/kickoff-budget.ts";
let db: Awaited<ReturnType<typeof openLocalDb>>, repo: Repo;
const clock = new Date("2026-11-08T00:00:00Z");
const ctx = () => ({
  repo,
  origin: "https://studio.test",
  caps: DEFAULT_CAPS,
  now: () => clock,
});
const input = (founder: string) => ({
  founder,
  name: "Fenced " + founder,
  problem: "One task",
  audience: "Makers",
  evidence: ["https://example.test/problem"],
  solution: "One useful tool",
});
beforeAll(async () => {
  db = await openLocalDb();
  repo = new Repo(db);
});
afterAll(async () => db.close());
it("requires the current run token on every declared founder mutation and private file read", async () => {
  for (const name of [
    "start_company",
    "publish_product",
    "get_upload_link",
    "get_product_files",
    "set_company_status",
    "log_decision",
    "write_report",
    "log_touch",
    "update_touch_metrics",
  ]) {
    expect(TOOLS.find((t) => t.name === name)?.inputSchema.required).toContain(
      "run_token",
    );
    await expect(callTool(name, input("founder-a"), ctx())).rejects.toThrow(
      /run_token/,
    );
  }
  expect(await repo.activeCompanyOf("founder-a")).toBeNull();
});
it("ended and expired runs cannot publish, read private notes or alter post metrics", async () => {
  const founder = "founder-fenced",
    lease = await repo.takeRun(founder, clock, 28);
  if (!lease.ok) throw Error("lease");
  const created = (await callTool(
    "start_company",
    { ...input(founder), run_token: lease.token },
    ctx(),
  )) as any;
  const c = created.company;
  const touch = await repo.logTouch({
    company_id: c.id,
    channel: "x",
    kind: "post",
    content: "fixture",
    external_id: "fenced-post",
  });
  await repo.endRun(founder, lease.token, clock);
  for (const name of [
    "publish_product",
    "get_product_files",
    "update_touch_metrics",
  ])
    await expect(
      callTool(
        name,
        {
          founder,
          run_token: lease.token,
          company_id: c.id,
          touch_id: touch.id,
          impressions: 100,
          engagements: 10,
        },
        ctx(),
      ),
    ).rejects.toThrow(/run/i);
  const fresh = await repo.takeRun(founder, clock, 28);
  if (!fresh.ok) throw Error("lease");
  await expect(
    callTool(
      "update_touch_metrics",
      {
        founder,
        run_token: fresh.token,
        touch_id: touch.id,
        impressions: 100,
        engagements: 10,
      },
      { ...ctx(), now: () => new Date(clock.getTime() + 29 * 60_000) },
    ),
  ).rejects.toThrow(/run/i);
  expect((await repo.listTouches({ company_id: c.id }))[0]?.impressions).toBe(
    0,
  );
  const other = "founder-unrelated",
    otherLease = await repo.takeRun(other, clock, 28);
  if (!otherLease.ok) throw Error("lease");
  await expect(
    callTool(
      "update_touch_metrics",
      {
        founder: other,
        run_token: otherLease.token,
        touch_id: touch.id,
        impressions: 999,
        engagements: 9,
      },
      ctx(),
    ),
  ).rejects.toThrow(/no such touch/);
});
it("a required report needs every promised section before a status change is admitted", async () => {
  const founder = "founder-report",
    lease = await repo.takeRun(founder, clock, 28);
  if (!lease.ok) throw Error("lease");
  const c = await repo.startCompany(input(founder));
  await expect(
    callTool(
      "set_company_status",
      {
        founder,
        run_token: lease.token,
        company_id: c.id,
        status: "killed",
        reasoning: "A test",
        report_title: "Incomplete report",
        report:
          "## Hypothesis\n" +
          "An observation. ".repeat(40) +
          "\n## Results\nNone\n## Decision and next step\nStop",
      },
      ctx(),
    ),
  ).rejects.toThrow(/missing required sections/);
  expect((await repo.getCompany(c.id))?.status).toBe("building");
  expect(await repo.listDecisions({ company_id: c.id })).toHaveLength(0);
});
it("already-consumed host upload streams preserve the original string or buffer body", async () => {
  const text = 'const actual = "source file";';
  const consumed = {
    headers: { "content-type": "application/octet-stream" },
    method: "PUT",
    url: "/api/upload/up_" + "a".repeat(40) + "/app.js",
    body: Buffer.from(text),
    async *[Symbol.asyncIterator]() {},
  };
  const raw = await readRaw(consumed);
  expect(raw).toBe(text);
  expect(requestFrom(consumed, raw).raw).toBe(text);
  expect(await readRaw({ ...consumed, body: text })).toBe(text);
  await expect(
    readRaw({ ...consumed, body: "x".repeat(500_001) }),
  ).rejects.toThrow(/limit/);
});
it("a paginated provider agent listing releases unstarted reservations and makes no paid call", async () => {
  const ledger = new KickoffBudget(":memory:");
  let paid = 0;
  try {
    await expect(
      kickoff(
        ["founder-1"],
        {
          NAIVE_API_KEY: "offline-key",
          STUDIO_LIVE_AUTHORIZED: "true",
          STUDIO_TOTAL_BUDGET_CENTS: "100",
          STUDIO_TASK_BUDGET_CENTS: "100",
          STUDIO_BUDGET_ID: "pagination-test",
          STUDIO_STOP_AT: "2100-01-01T00:00:00Z",
        },
        {
          ledger,
          client: () => ({
            agents: {
              async list() {
                return {
                  data: [{ id: "agent-one", name: "founder-1" }],
                  has_more: true,
                };
              },
            },
            sessions: {
              async create() {
                paid++;
                return { id: "must-not-create" };
              },
            },
          }),
        },
      ),
    ).rejects.toThrow(/paginated/);
    expect(paid).toBe(0);
    expect(
      ledger
        .attempts()
        .every((a) => a.status === "not_started" && a.reservation_cents === 0),
    ).toBe(true);
  } finally {
    ledger.close();
  }
});

it("a mutation queued behind another transaction rechecks lease expiry after waiting", async () => {
  const founder = "queued-expiry",
    started = new Date(),
    lease = await repo.takeRun(founder, started, 0.001);
  if (!lease.ok) throw Error("lease");
  let release!: () => void, entered!: () => void;
  const inside = new Promise<void>((r) => (entered = r)),
    barrier = new Promise<void>((r) => (release = r));
  const blocker = repo.transaction(async () => {
    entered();
    await barrier;
  });
  await inside;
  let wrote = false;
  const queued = repo.withRun(founder, lease.token, new Date(), async () => {
    wrote = true;
  });
  await new Promise((r) => setTimeout(r, 90));
  release();
  await blocker;
  await expect(queued).rejects.toThrow(/unexpired/);
  expect(wrote).toBe(false);
});
