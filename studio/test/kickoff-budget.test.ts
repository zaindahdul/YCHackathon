import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KickoffBudget } from "../scripts/kickoff-budget.ts";
import {
  kickoff,
  prepareKickoff,
  type KickoffClient,
} from "../scripts/kickoff.ts";
const now = Date.parse("2026-11-07T23:00:00Z");
const env = {
  STUDIO_LIVE_AUTHORIZED: "true",
  NAIVE_API_KEY: "offline-test-key-never-used",
  STUDIO_TOTAL_BUDGET_CENTS: "900",
  STUDIO_TASK_BUDGET_CENTS: "300",
  STUDIO_BUDGET_ID: "authorized-test-envelope",
  STUDIO_STOP_AT: "2026-11-08T00:00:00Z",
};
function fakeClient() {
  const calls: {
    kind: string;
    body?: Record<string, unknown>;
    key?: string;
  }[] = [];
  const client: KickoffClient = {
    agents: {
      async list() {
        calls.push({ kind: "list" });
        return {
          data: [1, 2, 3].map((n) => ({
            id: `agent-${n}`,
            name: `founder-${n}`,
          })),
        };
      },
    },
    sessions: {
      async create(body, options) {
        calls.push({ kind: "create", body, key: options.idempotencyKey });
        return { id: `ses_offline_${calls.length}` };
      },
    },
  };
  return { client, calls };
}

describe("finite kickoff admission", () => {
  it("rejects every missing authority, expired window and invalid selection before constructing a client", async () => {
    const variants = [
      { ...env, STUDIO_LIVE_AUTHORIZED: "false" },
      { ...env, NAIVE_API_KEY: "" },
      { ...env, STUDIO_TOTAL_BUDGET_CENTS: "0" },
      { ...env, STUDIO_TASK_BUDGET_CENTS: "401" },
      { ...env, STUDIO_STOP_AT: "2026-11-07T22:00:00Z" },
      { ...env, STUDIO_BUDGET_ID: "" },
      { ...env, STUDIO_TOTAL_BUDGET_CENTS: "899" },
    ];
    let constructions = 0;
    for (const value of variants)
      await expect(
        kickoff([], value, {
          clock: () => now,
          client() {
            constructions++;
            return fakeClient().client;
          },
        }),
      ).rejects.toThrow();
    for (const args of [
      ["not-a-founder"],
      ["founder-1", "founder-1"],
      ["--run", "founder-1"],
    ])
      await expect(
        kickoff(args, env, {
          clock: () => now,
          client() {
            constructions++;
            return fakeClient().client;
          },
        }),
      ).rejects.toThrow();
    expect(constructions).toBe(0);
  });

  it("reserves all selected caps before a finite set of paid creates and persists exact receipt/idempotency keys", async () => {
    const ledger = new KickoffBudget(":memory:"),
      fake = fakeClient();
    try {
      const results = await kickoff([], env, {
        ledger,
        client: () => fake.client,
        clock: () => now,
      });
      expect(results).toHaveLength(3);
      expect(
        fake.calls
          .filter((call) => call.kind === "create")
          .map((call) => call.body?.budget_micro_usd),
      ).toEqual([3_000_000, 3_000_000, 3_000_000]);
      expect(
        ledger
          .attempts()
          .every(
            (row) =>
              row.status === "accepted" &&
              row.reservation_cents === 300 &&
              String(row.session_id).startsWith("ses_offline_"),
          ),
      ).toBe(true);
      expect(
        fake.calls
          .filter((call) => call.kind === "create")
          .map((call) => call.key),
      ).toEqual(ledger.attempts().map((row) => row.idempotency_key));
      expect(JSON.stringify(ledger.attempts())).not.toContain(
        env.NAIVE_API_KEY,
      );
      const before = fake.calls.length;
      await expect(
        kickoff(["founder-1"], env, {
          ledger,
          client: () => fake.client,
          clock: () => now,
        }),
      ).rejects.toThrow(/insufficient/);
      expect(fake.calls.length).toBe(before); // not even an agent-list read against an exhausted envelope
    } finally {
      ledger.close();
    }
  });

  it("retains an ambiguous create and releases only tasks proven unstarted, blocking blind retries", async () => {
    const ledger = new KickoffBudget(":memory:"),
      fake = fakeClient();
    fake.client.sessions.create = async () => {
      throw new Error("offline simulated network loss");
    };
    try {
      await expect(
        kickoff([], env, {
          ledger,
          client: () => fake.client,
          clock: () => now,
        }),
      ).rejects.toThrow(/uncertain/);
      expect(
        ledger.attempts().map((row) => [row.status, row.reservation_cents]),
      ).toEqual([
        ["uncertain", 300],
        ["not_started", 0],
        ["not_started", 0],
      ]);
      const before = fake.calls.length;
      await expect(
        kickoff([], env, {
          ledger,
          client: () => fake.client,
          clock: () => now,
        }),
      ).rejects.toThrow(/unresolved/);
      expect(fake.calls.length).toBe(before);
    } finally {
      ledger.close();
    }
  });

  it("rejects missing founder deployments before creating any paid session and releases untouched reservations", async () => {
    const ledger = new KickoffBudget(":memory:"),
      fake = fakeClient();
    fake.client.agents.list = async () => ({
      data: [{ id: "one", name: "founder-1" }],
    });
    try {
      await expect(
        kickoff([], env, {
          ledger,
          client: () => fake.client,
          clock: () => now,
        }),
      ).rejects.toThrow(/Exactly one/);
      expect(fake.calls.filter((call) => call.kind === "create")).toHaveLength(
        0,
      );
      expect(
        ledger
          .attempts()
          .every(
            (row) =>
              row.status === "not_started" && row.reservation_cents === 0,
          ),
      ).toBe(true);
    } finally {
      ledger.close();
    }
  });

  it("checks the deadline again between tasks without releasing an accepted attempt", async () => {
    const ledger = new KickoffBudget(":memory:"),
      fake = fakeClient();
    let current = now;
    const create = fake.client.sessions.create;
    fake.client.sessions.create = async (...args) => {
      const result = await create(...args);
      current = Date.parse(env.STUDIO_STOP_AT);
      return result;
    };
    try {
      await expect(
        kickoff([], env, {
          ledger,
          client: () => fake.client,
          clock: () => current,
        }),
      ).rejects.toThrow(/deadline/);
      expect(fake.calls.filter((call) => call.kind === "create")).toHaveLength(
        1,
      );
      expect(
        ledger.attempts().map((row) => [row.status, row.reservation_cents]),
      ).toEqual([
        ["accepted", 300],
        ["not_started", 0],
        ["not_started", 0],
      ]);
    } finally {
      ledger.close();
    }
  });

  it("shares reservations across database connections and preserves them after a process restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-kickoff-")),
      path = join(dir, "budget.sqlite");
    const first = new KickoffBudget(path),
      second = new KickoffBudget(path);
    try {
      const plan = prepareKickoff(
        ["founder-1"],
        { ...env, STUDIO_TOTAL_BUDGET_CENTS: "300" },
        now,
      );
      const [attempt] = first.reserve(plan, now);
      first.creating(attempt!.id);
      first.accepted(attempt!.id, "ses_persisted");
      expect(() => second.reserve(plan, now)).toThrow(/insufficient/);
      expect(second.attempts()[0]).toMatchObject({
        status: "accepted",
        reservation_cents: 300,
        session_id: "ses_persisted",
      });
    } finally {
      first.close();
      second.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
