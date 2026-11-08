/**
 * PMF Engine, declared. `naive up` reads this file and provisions it into your Naïve organization:
 *
 *   - the "Scout" persona, with a hello@ inbox on the org's system domain (mail to it wakes the concierge)
 *   - the "pmf" app: the public studio dashboard at /, a page per company at /c/<slug>, every
 *     company's product at /p/<slug>/ with its own small backend, product analytics, and the
 *     agents' MCP tools at /mcp, on its own Postgres database (tables from sql/*.sql)
 *   - the founder agents (one company each, in parallel) and the concierge (crew/crew.ts), with
 *     budgets, deny-by-default tools and disabled staggered cron schedules
 *
 * No schedule is enabled by this declaration. The default also omits automatic inbound-mail
 * activation: STUDIO_ENABLE_INBOX=true requires the explicit live budget/window gates below.
 * Re-applying may change existing resources, including inbox routing; inspect `naive:dry` first.
 * Omitting an existing inbox does not promise the platform removes an earlier routing binding.
 */
import { defineProject } from "@usenaive-sdk/blueprints";
import { crew, IDENTITY } from "./crew/crew.ts";

export function inboxActivation(
  env: Record<string, string | undefined>,
  now = Date.now(),
): boolean {
  if (env["STUDIO_ENABLE_INBOX"] !== "true") return false;
  const budget = Number(env["STUDIO_TOTAL_BUDGET_CENTS"]);
  const deadline = Date.parse(env["STUDIO_STOP_AT"] ?? "");
  if (
    env["STUDIO_LIVE_AUTHORIZED"] !== "true" ||
    !Number.isSafeInteger(budget) ||
    budget <= 0 ||
    !Number.isFinite(deadline) ||
    deadline <= now
  ) {
    throw new Error(
      "Inbox activation requires explicit STUDIO_LIVE_AUTHORIZED, positive STUDIO_TOTAL_BUDGET_CENTS and future STUDIO_STOP_AT. Inbox agent daily caps do not enforce this total/window; supervise and disable routing explicitly.",
    );
  }
  return true;
}

export default defineProject({
  name: "pmf-engine",
  title: "PMF Engine",
  description:
    "An AI venture studio: several founder agents each find a real problem, build and ship a working product, find users, and iterate or pivot on what users actually do.",

  identities: [
    {
      name: IDENTITY,
      description:
        "PMF Engine's studio persona: the inbox it sends from and receives at, and the social accounts it posts as.",
      ...(inboxActivation(process.env)
        ? { inbox: { localpart: "hello", agent: "concierge" } }
        : {}),
    },
  ],

  apps: [
    {
      name: "pmf",
      type: "fullstack",
      description:
        "The studio: public dashboard, every company's product and backend, product analytics, and the agents' MCP tools.",
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
