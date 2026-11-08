/**
 * `npm run agent -- <producer|booster|scout>`: runs one of Launchpad's agents now, with the same
 * input and per-run budget as its schedule, instead of waiting for the next timer. Useful right
 * after a founder submits the form (producer), presses Launch now (booster), or to start outreach
 * (scout). Needs NAIVE_API_KEY in the environment (never pass it as an argument).
 */
import { createClient } from "@usenaive-sdk/managed-agents";
import { crew, IDENTITY } from "../crew/crew.ts";

const which = (process.argv[2] ?? "").replace(/^lp-/, "");
const decl = crew.find((a) => a.name === `lp-${which}`);
const schedule = decl?.schedules?.[0];
if (!decl || !schedule) {
  console.error(`Usage: npm run agent -- <${crew.filter((a) => a.schedules?.length).map((a) => a.name.replace(/^lp-/, "")).join("|")}>`);
  process.exit(1);
}
const apiKey = process.env["NAIVE_API_KEY"];
if (!apiKey) {
  console.error("Set NAIVE_API_KEY first. In Git Bash: export NAIVE_API_KEY=$(cat key.txt)");
  process.exit(1);
}

const naive = createClient({ apiKey });
const agents = await naive.agents.list({ limit: 100 });
const agent = (agents.data as { id: string; name: string }[]).find((a) => a.name === decl.name);
if (!agent) {
  console.error(`No agent named ${decl.name} in this organization. Run \`npm run naive:up\` first.`);
  process.exit(1);
}

const session = await naive.sessions.create({ agent_id: agent.id, message: schedule.input, identity: IDENTITY, budget_micro_usd: schedule.budget_micro_usd });
console.log(`Started ${decl.name}: session ${session.id}`);
console.log(`Watch it:  npx naive session stream --session ${session.id}`);
