/**
 * The declaration `naive up` will apply, checked before it costs money: it loads, every agent has
 * a budget and the persona, every `pmf.*` tool an agent is given really exists on /mcp, and the
 * founders' schedules don't fire at the same minute.
 */
import { describe, expect, it } from "vitest";
import { TOOLS } from "../server/mcp.ts";
import type { VettaClient } from "@usenaive-sdk/managed-agents";
import { fenceCeo } from "../scripts/fence-ceo.ts";
import { intervene, interventionRequest } from "../scripts/intervene.ts";
import { crew, FOUNDERS, IDENTITY } from "../crew/crew.ts";

describe("naive.config.ts", () => {
  it("loads through defineProject", async () => {
    process.env["PMF_ADMIN_TOKEN"] ??= "test";
    const config = (await import("../naive.config.ts")).default as {
      name: string;
      apps: { name: string; mcp?: string }[];
      agents: { name: string }[];
    };
    expect(config.name).toBe("pmf-engine");
    expect(config.apps[0]).toMatchObject({ name: "pmf", mcp: "/mcp" });
    expect(config.agents.map((a) => a.name)).toEqual([
      ...FOUNDERS.map((f) => f.name),
      "concierge",
    ]);
  });

  it("gives every agent a budget, the persona, and only tools that exist", () => {
    const names = new Set(TOOLS.map((t) => `pmf.${t.name}`));
    for (const agent of crew) {
      expect(agent.budget.cap_micro_usd).toBeGreaterThan(0);
      expect(agent.identity).toBe(IDENTITY);
      for (const tool of Object.keys(agent.tools?.configs ?? {}).filter((t) =>
        t.startsWith("pmf."),
      ))
        expect(names.has(tool), `${agent.name}: ${tool}`).toBe(true);
      for (const schedule of agent.schedules ?? [])
        expect(schedule.identity).toBe(IDENTITY);
    }
  });

  it("staggers the founders so they never run at the same minute", () => {
    const minutes = FOUNDERS.flatMap((f) => f.minutes.split(","));
    expect(new Set(minutes).size).toBe(minutes.length);
  });

  it("lets only founders build and ship, and gives the concierge no shell", () => {
    for (const agent of crew) {
      const tools = Object.keys(agent.tools?.configs ?? {});
      const builds = tools.includes("pmf.publish_product");
      expect(builds).toBe(agent.name.startsWith("founder-"));
      if (agent.name === "concierge") expect(tools).not.toContain("bash");
    }
  });
});

describe("explicit activation and external authority", () => {
  it("keeps deployment schedules disabled and raw sending/data execution behind approval", () => {
    for (const agent of crew) {
      for (const schedule of agent.schedules ?? [])
        expect(schedule.enabled).toBe(false);
      for (const name of ["email.send", "social.post", "data_run"]) {
        if (agent.tools?.configs[name])
          expect(agent.tools.configs[name]).toMatchObject({
            enabled: true,
            permission: "ask",
          });
      }
      expect(agent.system).not.toContain("no human staff");
      expect(agent.system).toContain("human owners/operators");
    }
    for (const agent of crew.filter((agent) =>
      agent.name.startsWith("founder-"),
    )) {
      expect(agent.system).toContain("run_token");
      expect(agent.system).toContain("separate from the analytics visitor ID");
    }
  });

  it("does not bind an automatic inbox by default and refuses incomplete inbox activation", async () => {
    const { inboxActivation, default: config } = await import(
      "../naive.config.ts"
    );
    expect(config.identities?.[0]?.inbox).toBeUndefined();
    expect(inboxActivation({})).toBe(false);
    expect(() => inboxActivation({ STUDIO_ENABLE_INBOX: "true" })).toThrow(
      /explicit/,
    );
    expect(
      inboxActivation({
        STUDIO_ENABLE_INBOX: "true",
        STUDIO_LIVE_AUTHORIZED: "true",
        STUDIO_TOTAL_BUDGET_CENTS: "100",
        STUDIO_STOP_AT: "2100-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("previews CEO fencing without updating and applies only explicit orchestrator IDs", async () => {
    const updates: unknown[] = [];
    const orchestrator = {
      id: "agent-ceo",
      name: "Organization CEO",
      metadata: { role: "orchestrator" },
      current_version: 4,
      tools: {
        default_config: { permission: "ask" },
        configs: { untouched: { enabled: true, permission: "allow" } },
      },
    };
    const client = {
      agents: {
        async list() {
          return { data: [orchestrator], has_more: false };
        },
        async get(id: string) {
          return {
            ...orchestrator,
            id,
            metadata: id === "unrelated" ? {} : orchestrator.metadata,
          };
        },
        async update(id: string, body: unknown) {
          updates.push({ id, body });
        },
      },
    } as unknown as Pick<VettaClient, "agents">;
    const preview = await fenceCeo([], "offline-key", { client: () => client });
    expect(preview.mode).toBe("preview");
    expect(updates).toHaveLength(0);
    await expect(
      fenceCeo(["--apply"], "offline-key", {
        client() {
          throw new Error("must not construct");
        },
      }),
    ).rejects.toThrow(/explicit/);
    await expect(
      fenceCeo(
        ["--agent", "agent-ceo", "--agent", "unrelated", "--apply"],
        "offline-key",
        { client: () => client },
      ),
    ).rejects.toThrow(/not marked/);
    expect(updates).toHaveLength(0);
    const applied = await fenceCeo(
      ["--agent", "agent-ceo", "--apply"],
      "offline-key",
      { client: () => client },
    );
    expect(applied.mode).toBe("apply");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "agent-ceo",
      body: {
        expected_version: 4,
        tools: {
          configs: {
            untouched: { enabled: true, permission: "allow" },
            "pmf.get_studio": { enabled: false, permission: "deny" },
          },
        },
      },
    });
  });

  it("does not transmit the owner token to nonlocal HTTP or redirecting endpoints", async () => {
    expect(() =>
      interventionRequest(["Actual repair"], {
        PMF_APP_URL: "http://external.example",
        PMF_ADMIN_TOKEN: "private-token",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      interventionRequest(["Actual repair"], {
        PMF_APP_URL: "https://user:password@example.test",
        PMF_ADMIN_TOKEN: "private-token",
      }),
    ).toThrow(/embedded/);
    let calls = 0;
    await expect(
      intervene(
        ["Actual repair"],
        {
          PMF_APP_URL: "http://external.example",
          PMF_ADMIN_TOKEN: "private-token",
        },
        async () => {
          calls++;
          return new Response();
        },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    const status = await intervene(
      ["Actual repair"],
      {
        PMF_APP_URL: "https://studio.example",
        PMF_ADMIN_TOKEN: "private-token",
      },
      async (url, init) => {
        calls++;
        expect(String(url)).toBe("https://studio.example/api/interventions");
        expect(init?.redirect).toBe("error");
        return new Response("{}", { status: 201 });
      },
    );
    expect(status).toBe(201);
  });
});
