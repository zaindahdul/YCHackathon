/**
 * PMF Engine, declared. `naive up` reads this file and provisions it into your Naïve organization:
 *
 *   - the "Scout" persona, with a hello@ inbox on the org's system domain (mail to it wakes the operator)
 *   - the "pmf" app: public dashboard at /, a landing page per experiment at /x/<slug>, and the
 *     agents' MCP tools at /mcp, on its own Postgres database (tables from sql/*.sql)
 *   - three agents (crew/crew.ts) with budgets, deny-by-default tools and cron schedules
 *
 * Re-running is safe: every resource is keyed by name. Run `npm run naive:dry` first.
 */
import { defineProject } from "@usenaive-sdk/blueprints";
import { crew, IDENTITY } from "./crew/crew.ts";

export default defineProject({
  name: "pmf-engine",
  title: "PMF Engine",
  description: "An autonomous company that finds its own product-market fit: it launches offers, does outreach, delivers to signups, and kills or pivots what is not working.",

  identities: [
    {
      name: IDENTITY,
      description: "PMF Engine's company persona: the inbox it sends from and receives at, and the X account it posts as.",
      inbox: { localpart: "hello", agent: "operator" },
    },
  ],

  apps: [
    {
      name: "pmf",
      type: "fullstack",
      description: "Public dashboard of every experiment and decision, one landing page per experiment, and the agents' MCP tools.",
      deploy_dir: "dist",
      mcp: "/mcp",
      migrations: ["sql/*.sql"],
      required: true,
      env: {
        // Your own bearer for logging human interventions (POST /api/interventions). Any long random string.
        ADMIN_TOKEN: { from_env: "PMF_ADMIN_TOKEN" },
        EMAIL_CAP_PER_DAY: "40",
        X_POST_CAP_PER_DAY: "16",
        MAX_LIVE_EXPERIMENTS: "3",
      },
    },
  ],

  agents: crew,
});
