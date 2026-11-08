/**
 * `npm run fence-ceo`: keeps the organization's built-in CEO orchestrator out of the studio's
 * tools.
 *
 * The platform turns each scheduled founder run into a card on the organization board, and the
 * CEO wakes on every card change. Left alone it calls `pmf.*` as a founder ("if the lock is free I
 * take it and do the scheduled work"), which would put a generalist without the founder's sandbox
 * in charge of a company. This denies the CEO every `pmf.*` tool and changes nothing else about it;
 * undo with `naive agent rollback`. Safe to re-run.
 */
import { createClient } from "@usenaive-sdk/managed-agents";
import { TOOLS } from "../server/mcp.ts";

const apiKey = process.env["NAIVE_API_KEY"];
if (!apiKey) {
  console.error("Set NAIVE_API_KEY first.");
  process.exit(1);
}
const naive = createClient({ apiKey });
const agents = (await naive.agents.list({ limit: 100 })).data as { id: string; name: string; metadata?: Record<string, unknown> }[];
const ceos = agents.filter((a) => a.metadata?.["role"] === "orchestrator");
if (ceos.length === 0) {
  console.log("No orchestrator agent in this organization: nothing to fence.");
  process.exit(0);
}

for (const ceo of ceos) {
  const full = await naive.agents.get(ceo.id);
  const tools = structuredClone(full.tools);
  let added = 0;
  for (const tool of TOOLS) {
    const name = `pmf.${tool.name}`;
    if (tools.configs[name]?.permission === "deny") continue;
    tools.configs[name] = { enabled: false, permission: "deny" };
    added += 1;
  }
  if (added === 0) {
    console.log(`${ceo.name} (${ceo.id}): already fenced.`);
    continue;
  }
  await naive.agents.update(ceo.id, { tools });
  console.log(`${ceo.name} (${ceo.id}): denied ${added} studio tools.`);
}
