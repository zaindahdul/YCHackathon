/**
 * Launchpad, declared. `naive up` provisions it into the Naïve organization:
 *
 *   - the "Launchpad" persona with a launch@ inbox on the org's system domain (mail wakes the concierge)
 *   - the "launchpad" app: landing page, launch form, founders' kit pages, boost pages, tracked
 *     links, the public ops log and the agents' MCP tools, on its own Postgres (sql/*.sql)
 *   - four agents (crew/crew.ts) with budgets, deny-by-default tools and schedules
 *
 * Separate from the first project (pmf-engine): different names, its own app and agents.
 */
import { defineProject } from "@usenaive-sdk/blueprints";
import { crew, IDENTITY } from "./crew/crew.ts";

export default defineProject({
  name: "launchpad",
  title: "Launchpad",
  description: "One-click launches for YC founders: agents plan the timing for every channel, write every post, rally a real opt-in boost squad and report the results.",
  identities: [
    {
      name: IDENTITY,
      description: "Launchpad's persona: the inbox it writes from and receives at, and the social account it posts as.",
      inbox: { localpart: "launch", agent: "lp-concierge" },
    },
  ],
  apps: [
    {
      name: "launchpad",
      type: "fullstack",
      description: "Launchpad: the launch form, founders' kits, boost pages, tracked links, the ops log and the agents' tools.",
      deploy_dir: "dist",
      mcp: "/mcp",
      migrations: ["sql/*.sql"],
      required: true,
      env: {
        ADMIN_TOKEN: { from_env: "PMF_ADMIN_TOKEN" },
        EMAILS_PER_DAY: "40",
        POSTS_PER_DAY: "12",
        BOOSTS_PER_BOOSTER_PER_DAY: "3",
        BOOSTS_PER_LAUNCH: "40",
      },
    },
  ],
  agents: crew,
});
