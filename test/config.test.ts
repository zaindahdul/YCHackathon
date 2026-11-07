/**
 * The declaration `naive up` will apply, checked before it costs money: it loads, every agent has
 * a budget and the persona, every `pmf.*` tool an agent is given really exists on /mcp, and the
 * founders' schedules don't fire at the same minute.
 */
import { describe, expect, it } from "vitest";
import { TOOLS } from "../server/mcp.ts";
import { crew, FOUNDERS, IDENTITY } from "../crew/crew.ts";

describe("naive.config.ts", () => {
  it("loads through defineProject", async () => {
    process.env["PMF_ADMIN_TOKEN"] ??= "test";
    const config = (await import("../naive.config.ts")).default as { name: string; apps: { name: string; mcp?: string }[]; agents: { name: string }[] };
    expect(config.name).toBe("pmf-engine");
    expect(config.apps[0]).toMatchObject({ name: "pmf", mcp: "/mcp" });
    expect(config.agents.map((a) => a.name)).toEqual([...FOUNDERS.map((f) => f.name), "concierge"]);
  });

  it("gives every agent a budget, the persona, and only tools that exist", () => {
    const names = new Set(TOOLS.map((t) => `pmf.${t.name}`));
    for (const agent of crew) {
      expect(agent.budget.cap_micro_usd).toBeGreaterThan(0);
      expect(agent.identity).toBe(IDENTITY);
      for (const tool of Object.keys(agent.tools?.configs ?? {}).filter((t) => t.startsWith("pmf."))) expect(names.has(tool), `${agent.name}: ${tool}`).toBe(true);
      for (const schedule of agent.schedules ?? []) expect(schedule.identity).toBe(IDENTITY);
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
