import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openLocalDb } from "../server/local-db.ts";
import { Repo, RepoError } from "../server/repo.ts";
import type { Db } from "../server/db.ts";
import { DEFAULT_CAPS } from "../server/rules.ts";
let db: Db & { close(): Promise<void> };
let repo: Repo;
let serial = 0;
const clock = new Date("2026-11-08T00:00:00Z");
const html =
  "<!doctype html><html><head><title>Working utility</title></head><body><h1>Useful tool</h1><label>Input<textarea></textarea></label><button>Format</button><output>Actual content</output></body></html>";
const input = (
  founder = `test-founder-${++serial}`,
  name = `Company ${serial}`,
) => ({
  founder,
  name,
  problem: "A concrete task",
  audience: "Makers",
  evidence: ["https://example.com/request"],
  solution: "A small useful tool",
});
beforeAll(async () => {
  db = await openLocalDb();
  repo = new Repo(db);
});
afterAll(async () => {
  await db.close();
});
describe("studio durable integrity boundaries", () => {
  it("admits only one active company concurrently and a winner still holds its slot", async () => {
    const args = input();
    const result = await Promise.allSettled([
      repo.startCompany(args),
      new Repo(db).startCompany({ ...args, name: "Simultaneous company" }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const c = await repo.activeCompanyOf(args.founder);
    expect(c).not.toBeNull();
    await repo.setStatus(c!.id, "winner");
    expect((await repo.activeCompanyOf(args.founder))?.status).toBe("winner");
    await expect(
      repo.startCompany({ ...args, name: "Must not start" }),
    ).rejects.toThrow(/already run/);
    await repo.setStatus(c!.id, "killed");
    expect(
      (await repo.startCompany({ ...args, name: "After killed" })).founder,
    ).toBe(args.founder);
  });
  it("same-name creation across founders does not lose either request", async () => {
    const results = await Promise.all([
      repo.startCompany(input(undefined, "Identical name")),
      new Repo(db).startCompany(input(undefined, "Identical name")),
    ]);
    expect(new Set(results.map((c) => c.slug)).size).toBe(2);
  });
  it("publication rolls back changed files on version failure and concurrent versions stay unique", async () => {
    const c = await repo.startCompany(input());
    await repo.publish(
      c.id,
      [{ path: "index.html", content: html }],
      "Original",
      true,
    );
    const failing = new Repo({
      query: async <T>(sql: string, args?: unknown[]) => {
        if (/insert into product_versions/.test(sql))
          throw new Error("simulated version persistence failure");
        return db.query<T>(sql, args);
      },
    });
    await expect(
      failing.publish(
        c.id,
        [{ path: "index.html", content: html + "changed" }],
        "Never committed",
        true,
      ),
    ).rejects.toThrow(/simulated/);
    expect(await repo.readFile(c.id, "index.html")).toBe(html);
    expect(await repo.listVersions(c.id)).toHaveLength(1);
    const versions = await Promise.all([
      repo.publish(c.id, [{ path: "a.js", content: "const a=1;" }], "A", false),
      new Repo(db).publish(
        c.id,
        [{ path: "b.js", content: "const b=1;" }],
        "B",
        false,
      ),
    ]);
    expect(versions.map((v) => v.version).sort()).toEqual([2, 3]);
    expect((await repo.listFiles(c.id)).map((f) => f.path)).toEqual([
      "a.js",
      "b.js",
      "index.html",
    ]);
  });
  it("a staged upload commits once and cannot outlive its founder lease", async () => {
    const args = input(),
      c = await repo.startCompany(args),
      run = await repo.takeRun(args.founder, clock, 28);
    if (!run.ok) throw new Error("lease");
    const link = await repo.createUpload(
      c.id,
      args.founder,
      clock,
      20,
      run.token,
    );
    await repo.stageFile(link.token, "index.html", html, clock);
    const commit = () =>
      repo.commitUpload(link.token, clock, (_c, files) =>
        repo.publish(c.id, files, "One upload", true),
      );
    const results = await Promise.allSettled([commit(), commit()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await repo.listVersions(c.id)).toHaveLength(1);
    expect(await repo.getUpload(link.token, clock)).toBeNull();
    const next = await repo.createUpload(
        c.id,
        args.founder,
        clock,
        40,
        run.token,
      ),
      later = new Date(clock.getTime() + 29 * 60_000);
    expect(await repo.holdsRun(args.founder, run.token, later)).toBe(false);
    await expect(
      repo.stageFile(next.token, "index.html", html, later),
    ).rejects.toThrow(/run_token/);
    await expect(
      repo.withRun(args.founder, run.token, later, async () => true),
    ).rejects.toThrow(/run_token/);
  });
  it("failed upload publication retains its staged snapshot for safe retry", async () => {
    const args = input(),
      c = await repo.startCompany(args),
      run = await repo.takeRun(args.founder, clock, 28);
    if (!run.ok) throw new Error("lease");
    const link = await repo.createUpload(
      c.id,
      args.founder,
      clock,
      20,
      run.token,
    );
    await repo.stageFile(link.token, "index.html", html, clock);
    await expect(
      repo.commitUpload(link.token, clock, async () => {
        await repo.publish(
          c.id,
          [{ path: "index.html", content: html }],
          "rolled back",
          true,
        );
        throw new Error("report persistence failed");
      }),
    ).rejects.toThrow(/report persistence/);
    expect(await repo.listVersions(c.id)).toHaveLength(0);
    expect(await repo.stagedFiles(link.token)).toHaveLength(1);
    expect(await repo.getUpload(link.token, clock)).not.toBeNull();
  });
  it("private items stay unreadable and shared items require their creator for mutation", async () => {
    const c = await repo.startCompany(input()),
      privateItem = await repo.addItem(
        c.id,
        "notes",
        "cap-a",
        { secret: "mine" },
        false,
      ),
      shared = await repo.addItem(
        c.id,
        "notes",
        "cap-a",
        { public: "readable" },
        true,
      );
    expect(await repo.getItem(c.id, privateItem.id)).toBeNull();
    expect(await repo.getItem(c.id, privateItem.id, "cap-b")).toBeNull();
    expect((await repo.getItem(c.id, privateItem.id, "cap-a"))?.data).toEqual({
      secret: "mine",
    });
    expect(
      (await repo.listItems(c.id, "notes", null, 20)).map((i) => i.id),
    ).toEqual([shared.id]);
    expect(
      await repo.updateItem(c.id, shared.id, null, { hacked: true }),
    ).toBeNull();
    expect(await repo.deleteItem(c.id, shared.id, "cap-b")).toBe(false);
    expect(
      (await repo.updateItem(c.id, shared.id, "cap-a", { public: "new" }))
        ?.data,
    ).toEqual({ public: "new" });
  });
  it("outreach receipt admission serializes the global cap and deduplicates provider IDs", async () => {
    const c = await repo.startCompany(input()),
      caps = { ...DEFAULT_CAPS, emailsTotal: 1, emailsPerCompany: 1 },
      touch = {
        company_id: c.id,
        channel: "email" as const,
        kind: "email" as const,
        content: "Approved receipt",
        target: "one@example.test",
        external_id: "message-unique",
      };
    const results = await Promise.allSettled([
      repo.logTouchWithinCaps(touch, caps, clock),
      new Repo(db).logTouchWithinCaps(
        { ...touch, target: "two@example.test", external_id: "other-message" },
        caps,
        clock,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const receipt = (
        results.find(
          (r) => r.status === "fulfilled",
        ) as PromiseFulfilledResult<any>
      ).value,
      replay = {
        ...touch,
        target: receipt.target,
        external_id: receipt.external_id,
      };
    expect((await repo.logTouchWithinCaps(replay, caps, clock)).id).toBe(
      receipt.id,
    );
    await expect(
      repo.logTouchWithinCaps(
        { ...replay, content: "Changed replay" },
        caps,
        clock,
      ),
    ).rejects.toThrow(/reused/);
    await repo.optOut("stop@example.test");
    await expect(
      repo.logTouchWithinCaps(
        { ...touch, external_id: "third", target: "stop@example.test" },
        { ...caps, emailsTotal: 50, emailsPerCompany: 50 },
        clock,
      ),
    ).rejects.toThrow(/opted out/);
  });
  it("post metrics cannot cross founder ownership or update ambiguous provider references", async () => {
    const c = await repo.startCompany(input());
    const t = await repo.logTouch({
      company_id: c.id,
      channel: "x",
      kind: "post",
      content: "Actual fixture post",
      external_id: "same-social-id",
    });
    expect(
      await repo.updateTouchMetrics({ id: t.id }, 99, 1, "different-founder"),
    ).toBeNull();
    expect(
      (await repo.updateTouchMetrics({ id: t.id }, 7, 1, c.founder))
        ?.impressions,
    ).toBe(7);
    expect(
      await repo.updateTouchMetrics(
        { id: t.id, external_id: "does-not-match" },
        100,
        1,
        c.founder,
      ),
    ).toBeNull();
    await repo.logTouch({
      company_id: c.id,
      channel: "social",
      kind: "post",
      content: "Another platform",
      external_id: "same-social-id",
    });
    await expect(
      repo.updateTouchMetrics(
        { external_id: "same-social-id" },
        100,
        1,
        c.founder,
      ),
    ).rejects.toThrow(/ambiguous/);
  });

  it("concurrent canonical-email signups remain one signup", async () => {
    const c = await repo.startCompany(input()),
      responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          repo.addSignup(
            c.id,
            i % 2 ? " SAME@EXAMPLE.TEST " : "same@example.test",
            null,
            "product",
          ),
        ),
      );
    expect(responses.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(
      (await repo.scoreboard()).find((row) => row.id === c.id)?.stats.signups,
    ).toBe(1);
  });
  it("returning users require core actions in distinct hours instead of background views", async () => {
    const c = await repo.startCompany(input());
    await repo.publish(
      c.id,
      [{ path: "index.html", content: html }],
      "Live",
      true,
    );
    await repo.recordEvent(c.id, "reader", "view", "", null, clock);
    const later = new Date(clock.getTime() + 2 * 3_600_000);
    await repo.recordEvent(c.id, "reader", "view", "", null, later);
    expect(
      (await repo.scoreboard(later)).find((row) => row.id === c.id)?.stats
        .returning_users,
    ).toBe(0);
    await repo.recordEvent(c.id, "reader", "use", "task", null, clock);
    await repo.recordEvent(c.id, "reader", "use", "task", null, later);
    expect(
      (await repo.scoreboard(later)).find((row) => row.id === c.id)?.stats
        .returning_users,
    ).toBe(1);
  });
  it("unrelated reads cannot observe an open transaction on the shared connection", async () => {
    const c = await repo.startCompany(input());
    let enter!: () => void, finish!: () => void;
    const entered = new Promise<void>((r) => (enter = r)),
      barrier = new Promise<void>((r) => (finish = r));
    const write = repo.transaction(async () => {
      await db.query("update companies set name='Uncommitted' where id=$1", [
        c.id,
      ]);
      enter();
      await barrier;
      throw new RepoError("rollback");
    });
    await entered;
    let readFinished = false;
    const reading = new Repo(db).getCompany(c.id).then((row) => {
      readFinished = true;
      return row;
    });
    await Promise.resolve();
    expect(readFinished).toBe(false);
    finish();
    await expect(write).rejects.toThrow(/rollback/);
    expect((await reading)?.name).toBe(c.name);
  });
});
