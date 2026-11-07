/**
 * `npm run kickoff`: opens the studio. Sends every founder its first brief (find a problem,
 * start a company, build, ship, post) as the Scout persona, using the Naïve SDK, so all the
 * companies start in parallel. Run it once, after `naive up` and after the social account is
 * connected. The schedules take over from there.
 *
 *   npm run kickoff                 every founder
 *   npm run kickoff -- founder-2    just one
 */
import { createClient } from "@usenaive-sdk/managed-agents";
import { FOUNDERS, IDENTITY, kickoffFor } from "../crew/crew.ts";

const apiKey = process.env["NAIVE_API_KEY"];
if (!apiKey) {
  console.error("Set NAIVE_API_KEY first (never pass it as an argument).");
  process.exit(1);
}

const only = process.argv.slice(2);
const names = FOUNDERS.map((f) => f.name as string).filter((name) => only.length === 0 || only.includes(name));
const naive = createClient({ apiKey });
const agents = (await naive.agents.list({ limit: 100 })).data as { id: string; name: string }[];

for (const name of names) {
  const agent = agents.find((a) => a.name === name);
  if (!agent) {
    console.error(`No agent named ${name}. Run \`npm run naive:up\` first.`);
    process.exitCode = 1;
    continue;
  }
  const session = await naive.sessions.create({ agent_id: agent.id, message: kickoffFor(name), identity: IDENTITY, budget_micro_usd: 4_000_000 });
  console.log(`${name}: session ${session.id}   (watch: npx naive session stream --session ${session.id})`);
}
