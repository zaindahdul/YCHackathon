/**
 * Start a finite, explicitly funded set of founder sessions. Default crons remain disabled.
 * This admits work before STUDIO_STOP_AT; it does not promise instantaneous remote cancellation.
 * Each accepted session retains its full cap in the local ledger: accepted is not billed/finished.
 */
import { createClient } from "@usenaive-sdk/managed-agents";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FOUNDERS, IDENTITY, kickoffFor } from "../crew/crew.ts";
import {
  KickoffBudget,
  KickoffBudgetError,
  type KickoffEnvelope,
} from "./kickoff-budget.ts";

export class KickoffError extends Error {}

export function prepareKickoff(
  args: string[],
  env: Record<string, string | undefined>,
  now = Date.now(),
): KickoffEnvelope {
  const allowed = FOUNDERS.map((f) => f.name as string);
  if (args.some((name) => !allowed.includes(name)))
    throw new KickoffError(
      "Unknown founder selection. Use founder-1, founder-2 or founder-3 only.",
    );
  if (new Set(args).size !== args.length)
    throw new KickoffError("A founder may be selected only once per kickoff.");
  if (env["STUDIO_LIVE_AUTHORIZED"] !== "true")
    throw new KickoffError(
      "Set STUDIO_LIVE_AUTHORIZED=true only after the owner authorizes this live invocation.",
    );
  if (!env["NAIVE_API_KEY"]?.trim())
    throw new KickoffError(
      "NAIVE_API_KEY is required; never pass it as a CLI argument.",
    );
  const totalBudgetCents = Number(env["STUDIO_TOTAL_BUDGET_CENTS"]),
    taskBudgetCents = Number(env["STUDIO_TASK_BUDGET_CENTS"]);
  if (
    !Number.isSafeInteger(totalBudgetCents) ||
    totalBudgetCents < 1 ||
    !Number.isSafeInteger(taskBudgetCents) ||
    taskBudgetCents < 1 ||
    taskBudgetCents > 400
  )
    throw new KickoffError(
      "Specify positive integer STUDIO_TOTAL_BUDGET_CENTS and STUDIO_TASK_BUDGET_CENTS (task cap at most 400 cents).",
    );
  const stopAt = Date.parse(env["STUDIO_STOP_AT"] ?? "");
  if (!Number.isFinite(stopAt) || stopAt <= now)
    throw new KickoffError(
      "STUDIO_STOP_AT must be a future ISO admission deadline.",
    );
  const budgetId = env["STUDIO_BUDGET_ID"] ?? "";
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(budgetId))
    throw new KickoffError(
      "STUDIO_BUDGET_ID must identify this owner-authorized local envelope (3–80 letters/digits/_/-).",
    );
  const names = args.length ? args : allowed;
  if (names.length * taskBudgetCents > totalBudgetCents)
    throw new KickoffError(
      "Selected founder tasks exceed the authorized local budget envelope.",
    );
  return { names, totalBudgetCents, taskBudgetCents, stopAt, budgetId };
}

export interface KickoffClient {
  agents: {
    list(query: {
      limit: number;
    }): Promise<{ data: { id: string; name: string }[]; has_more?: boolean }>;
  };
  sessions: {
    create(
      body: {
        agent_id: string;
        message: string;
        identity: string;
        budget_micro_usd: number;
        metadata: Record<string, unknown>;
      },
      options: { idempotencyKey: string },
    ): Promise<{ id: string }>;
  };
}

export async function executeKickoff(
  plan: KickoffEnvelope,
  client: KickoffClient,
  ledger: KickoffBudget,
  clock = Date.now,
) {
  if (clock() >= plan.stopAt)
    throw new KickoffError("The kickoff admission deadline has passed.");
  const attempts = ledger.reserve(plan, clock());
  const results: {
    founder: string;
    sessionId: string;
    maxCostCents: number;
  }[] = [];
  try {
    const listed = await client.agents.list({ limit: 100 });
    if (listed.has_more)
      throw new KickoffError(
        "Agent listing is paginated; resolve the complete founder set before paid kickoff.",
      );
    const agents = listed.data;
    const targets = plan.names.map((name) => {
      const matches = agents.filter((agent) => agent.name === name);
      if (matches.length !== 1)
        throw new KickoffError(
          `Exactly one configured agent named ${name} is required before any paid kickoff.`,
        );
      return matches[0]!;
    });
    for (let index = 0; index < attempts.length; index++) {
      const attempt = attempts[index]!,
        target = targets[index]!;
      if (clock() >= plan.stopAt)
        throw new KickoffError(
          "The kickoff admission deadline has passed; remaining tasks were not started.",
        );
      // Durable creating state is written BEFORE the paid create. An ambiguous create stays reserved.
      ledger.creating(attempt.id);
      try {
        const session = await client.sessions.create(
          {
            agent_id: target.id,
            identity: IDENTITY,
            budget_micro_usd: attempt.reservationCents * 10_000,
            message: `${kickoffFor(target.name)}\nAuthorized session cap: ${attempt.reservationCents} cents. Admission cutoff: ${new Date(plan.stopAt).toISOString()}. Complete or stop within this window; do not start recurring schedules.`,
            metadata: {
              studio_budget_id: plan.budgetId,
              kickoff_attempt_id: attempt.id,
              client_task_key: attempt.idempotencyKey,
            },
          },
          { idempotencyKey: attempt.idempotencyKey },
        );
        if (typeof session.id !== "string" || !session.id.trim())
          throw new KickoffError("Provider returned no valid session receipt.");
        ledger.accepted(attempt.id, session.id);
        results.push({
          founder: target.name,
          sessionId: session.id,
          maxCostCents: attempt.reservationCents,
        });
      } catch {
        ledger.uncertain(attempt.id);
        throw new KickoffError(
          "Session creation or receipt persistence is uncertain. Its reservation is retained. Inspect the local ledger and provider before any retry.",
        );
      }
    }
    return results;
  } finally {
    ledger.releaseUnstarted(attempts);
  }
}

export async function kickoff(
  args: string[],
  env: Record<string, string | undefined>,
  options: {
    client?: () => KickoffClient;
    ledger?: KickoffBudget;
    clock?: () => number;
  } = {},
) {
  const clock = options.clock ?? Date.now;
  const plan = prepareKickoff(args, env, clock()); // No client construction or request before preflight.
  const ledger =
    options.ledger ??
    new KickoffBudget(resolve(".local/studio-kickoff.sqlite"));
  try {
    const client =
      options.client?.() ??
      createClient({
        apiKey: env["NAIVE_API_KEY"]!,
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
              : AbortSignal.timeout(15_000),
          }),
      });
    return await executeKickoff(plan, client, ledger, clock);
  } finally {
    if (!options.ledger) ledger.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  kickoff(process.argv.slice(2), process.env)
    .then((results) => {
      for (const result of results)
        console.log(
          `${result.founder}: session ${result.sessionId}; reserved cap ${result.maxCostCents} cents. Creation is not completion or metered billing.`,
        );
      console.log(
        "Local ledger: .local/studio-kickoff.sqlite. No schedule was enabled. Full caps remain allocated; this ledger excludes existing schedules and other machines.",
      );
    })
    .catch((error) => {
      console.error(
        error instanceof KickoffError || error instanceof KickoffBudgetError
          ? error.message
          : "Kickoff failed before a confirmed result; inspect the local ledger/provider without exposing credentials.",
      );
      process.exitCode = 1;
    });
}
