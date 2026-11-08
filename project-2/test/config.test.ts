import { describe, expect, it } from "vitest";
import { crew, IDENTITY } from "../crew/crew.ts";
import { TOOLS } from "../server/mcp.ts";

describe("naive.config.ts", () => {
  it("loads, with names that cannot collide with the first project", async () => {
    process.env["PMF_ADMIN_TOKEN"] ??= "test";
    const config = (await import("../naive.config.ts")).default as { name: string; apps: { name: string }[]; agents: { name: string }[] };
    expect(config.name).toBe("launchpad");
    expect(config.apps[0]!.name).toBe("launchpad");
    for (const agent of config.agents) expect(agent.name).toMatch(/^lp-/);
  });

  it("gives every agent a budget, the persona and only tools that exist", () => {
    const names = new Set(TOOLS.map((t) => `launchpad.${t.name}`));
    for (const agent of crew) {
      expect(agent.budget.cap_micro_usd).toBeGreaterThan(0);
      expect(agent.identity).toBe(IDENTITY);
      for (const t of Object.keys(agent.tools?.configs ?? {}).filter((t) => t.startsWith("launchpad."))) expect(names.has(t), `${agent.name}: ${t}`).toBe(true);
      const browser = agent.tools?.configs?.["browser"];
      if (browser) expect((browser.config as { ask_actions: string[] }).ask_actions).toEqual(expect.arrayContaining(["signup", "login"]));
    }
  });
});
