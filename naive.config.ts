/**
 * PMF Engine, declared. `naive up` reads this file and provisions it into your Naïve organization:
 *
 *   - the "Scout" persona, with a hello@ inbox on the org's system domain (mail to it wakes the concierge)
 *   - the "pmf" app: the public studio dashboard at /, a page per company at /c/<slug>, every
 *     company's product at /p/<slug>/ with its own small backend, product analytics, and the
 *     agents' MCP tools at /mcp, on its own Postgres database (tables from sql/*.sql)
 *   - the founder agents (one company each, in parallel) and the concierge (crew/crew.ts), with
 *     budgets, deny-by-default tools and staggered cron schedules
 *
 * Re-running is safe: every resource is keyed by name. Run `npm run naive:dry` first.
 */
import { defineProject } from "@usenaive-sdk/blueprints";
import { crew, IDENTITY } from "./crew/crew.ts";

export default defineProject({
  name: "pmf-engine",
  title: "PMF Engine",
  description: "An AI venture studio: several founder agents each find a real problem, build and ship a working product, find users, and iterate or pivot on what users actually do.",

  identities: [
    {
      name: IDENTITY,
      description: "PMF Engine's studio persona: the inbox it sends from and receives at, and the social accounts it posts as.",
      inbox: { localpart: "hello", agent: "concierge" },
    },
  ],

  apps: [
    {
      name: "pmf",
      type: "fullstack",
      description: "The studio: public dashboard, every company's product and backend, product analytics, and the agents' MCP tools.",
      deploy_dir: "dist",
      mcp: "/mcp",
      migrations: ["sql/*.sql"],
      required: true,
      env: {
        // Your own bearer for logging human interventions (POST /api/interventions). Any long random string.
        ADMIN_TOKEN: { from_env: "PMF_ADMIN_TOKEN" },
        EMAILS_PER_COMPANY_PER_DAY: "15",
        POSTS_PER_COMPANY_PER_DAY: "6",
        EMAILS_PER_DAY: "45",
        POSTS_PER_DAY: "18",
      },
    },
  ],

  agents: crew,
});
