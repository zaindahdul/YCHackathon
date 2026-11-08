/**
 * Preview a proposed denial of studio tools on explicitly selected orchestrator agents.
 * Default: read-only. Mutation requires BOTH --apply and exact --agent IDs.
 * Needs only agent read/update access granted by the organization; no billing permissions.
 * This may affect an organization's shared orchestrator. Review its scope before applying.
 */
import { loadStudioEnv } from "./env.ts";
import { createClient, type VettaClient } from "@usenaive-sdk/managed-agents";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TOOLS } from "../server/mcp.ts";

export class FenceError extends Error {}

type FenceClient = Pick<VettaClient, "agents">;
export function fenceSelection(args: string[]) {
  const apply = args.includes("--apply"),
    ids: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--apply") continue;
    if (
      arg !== "--agent" ||
      !args[index + 1] ||
      args[index + 1]!.startsWith("--")
    )
      throw new FenceError(
        "Usage: fence-ceo [--agent AGENT_ID] [--apply]. Omit --apply for a read-only preview.",
      );
    ids.push(args[++index]!);
  }
  if (apply && ids.length === 0)
    throw new FenceError(
      "--apply requires explicit --agent IDs; refusing to change every organization orchestrator.",
    );
  if (new Set(ids).size !== ids.length)
    throw new FenceError("Select each agent ID once.");
  return { apply, ids };
}

export async function fenceCeo(
  args: string[],
  apiKey: string,
  options: { client?: () => FenceClient } = {},
) {
  const selection = fenceSelection(args);
  if (!apiKey.trim())
    throw new FenceError(
      "NAIVE_API_KEY with agent read access is required for preview; applying also needs agent update permission. Billing permissions are not required.",
    );
  const client =
    options.client?.() ??
    createClient({
      apiKey,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
    });
  let candidates = selection.ids;
  if (candidates.length === 0) {
    const listed = await client.agents.list({ limit: 100 });
    if (listed.has_more)
      throw new FenceError(
        "Agent listing is paginated. Select exact --agent IDs instead of assuming all orchestrators were inspected.",
      );
    candidates = listed.data
      .filter((agent) => agent.metadata?.["role"] === "orchestrator")
      .map((agent) => agent.id);
  }
  const proposals = [];
  // Load and validate every selected target BEFORE any mutation.
  for (const id of candidates) {
    const agent = await client.agents.get(id);
    if (agent.metadata?.["role"] !== "orchestrator")
      throw new FenceError(
        "A selected agent is not marked as an orchestrator; no updates were applied.",
      );
    const tools = structuredClone(agent.tools);
    let changes = 0;
    for (const tool of TOOLS) {
      const name = `pmf.${tool.name}`;
      if (
        tools.configs[name]?.permission === "deny" &&
        tools.configs[name]?.enabled === false
      )
        continue;
      tools.configs[name] = { enabled: false, permission: "deny" };
      changes++;
    }
    proposals.push({
      id: agent.id,
      name: agent.name,
      expectedVersion: agent.current_version,
      tools,
      changes,
    });
  }
  const results = [];
  for (const proposal of proposals) {
    if (selection.apply && proposal.changes > 0)
      await client.agents.update(proposal.id, {
        tools: proposal.tools,
        expected_version: proposal.expectedVersion,
      });
    results.push({
      id: proposal.id,
      name: proposal.name,
      deniedStudioTools: proposal.changes,
      applied: selection.apply && proposal.changes > 0,
    });
  }
  return { mode: selection.apply ? "apply" : "preview", agents: results };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  loadStudioEnv();
  fenceCeo(process.argv.slice(2), process.env["NAIVE_API_KEY"] ?? "")
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      // Provider errors can carry response details; never echo credential-bearing request data.
      console.error(
        error instanceof FenceError
          ? error.message
          : "CEO fencing failed; inspect provider access and selected IDs.",
      );
      process.exitCode = 1;
    });
}
