/**
 * The declaration `naive up` will apply, checked before it costs money: it loads, every agent has
 * a budget and an identity, and every `pmf.*` tool an agent is given really exists on /mcp.
 */
import { describe, expect, it } from "vitest";
import { TOOLS } from "../server/mcp.ts";
import { crew, IDENTITY } from "../crew/crew.ts";

describe("naive.config.ts", () => {
  it("loads through defineProject", async () => {
    process.env["PMF_ADMIN_TOKEN"] ??= "test";
    const config = (await import("../naive.config.ts")).default as { name: string; apps: { name: string; mcp?: string }[] };
    expect(config.name).toBe("pmf-engine");
    expect(config.apps[0]).toMatchObject({ name: "pmf", mcp: "/mcp" });
  });

  it("gives every agent a budget, the persona, and only tools that exist", () => {
    const names = new Set(TOOLS.map((t) => `pmf.${t.name}`));
    for (const agent of crew) {
      expect(agent.budget.cap_micro_usd).toBeGreaterThan(0);
      expect(agent.identity).toBe(IDENTITY);
      const configured = Object.keys(agent.tools?.configs ?? {});
      for (const tool of configured.filter((t) => t.startsWith("pmf."))) expect(names.has(tool), `${agent.name}: ${tool}`).toBe(true);
      for (const schedule of agent.schedules ?? []) expect(schedule.identity).toBe(IDENTITY);
    }
  });

  it("lets only the strategist launch or kill experiments", () => {
    for (const agent of crew) {
      const configured = Object.keys(agent.tools?.configs ?? {});
      const steers = configured.includes("pmf.create_experiment") || configured.includes("pmf.set_experiment_status");
      expect(steers).toBe(agent.name === "strategist");
    }
  });
});
