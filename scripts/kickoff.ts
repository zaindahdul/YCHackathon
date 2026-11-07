/**
 * `npm run kickoff`: starts the company. Sends the strategist its first brief (launch three
 * experiments and hand them to growth) as the Scout persona, using the Naïve SDK.
 * Run it once, after `naive up` and after X is connected. The schedules take over from there.
 */
import { createClient } from "@usenaive-sdk/managed-agents";
import { IDENTITY, KICKOFF } from "../crew/crew.ts";

const apiKey = process.env["NAIVE_API_KEY"];
if (!apiKey) {
  console.error("Set NAIVE_API_KEY first (never pass it as an argument).");
  process.exit(1);
}

const naive = createClient({ apiKey });
const agents = await naive.agents.list({ limit: 100 });
const strategist = (agents.data as { id: string; name: string }[]).find((agent) => agent.name === "strategist");
if (!strategist) {
  console.error("No agent named strategist in this organization. Run `npm run naive:up` first.");
  process.exit(1);
}

const session = await naive.sessions.create({
  agent_id: strategist.id,
  message: KICKOFF,
  identity: IDENTITY,
  budget_micro_usd: 3_000_000,
});
console.log(`Kicked off: session ${session.id}`);
console.log(`Watch it:   naive session stream --session ${session.id}`);
