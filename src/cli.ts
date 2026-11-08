#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Store } from "./store.js";
import { Company } from "./company.js";
import { NaiveAdapter, type AgentResult } from "./adapters/naive.js";
import { FixtureAdapter } from "./adapters/fixture.js";
import { DEFAULT_POLICY, type Job } from "./domain.js";
import { reconcileJob } from "./reconcile.js";
import { createCompanyServer } from "./server.js";
if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2),
  command = args.shift() ?? "help";
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const fromFile = (name = "file") => {
  const file = option(name);
  if (!file) throw new Error(`--${name} FILE is required`);
  return JSON.parse(readFileSync(file, "utf8"));
};
const show = (value: unknown) => console.log(JSON.stringify(value, null, 2));
function help() {
  console.log(`Naïve Company — one operator, multiple PMF experiments
  npm run company -- init [--db data/company.sqlite]
  npm run company -- status
  npm run company -- policy --file config/policy.local.json
  npm run company -- lead --file request.json
  npm run company -- signal --file evidence.json
  npm run company -- qualify --lead ID --evidence 'independent customer confirmation'
  npm run company -- reconcile --job ID
  npm run company -- finalize --job ID
  npm run company -- retry --job ID
  npm run company -- enqueue --file job.json
  npm run company -- cycle
  npm run company -- run --cycles 4 --interval-seconds 900
  npm run company -- serve [--port 3000] [--host 127.0.0.1]
  npm run company -- doctor
  npm run demo [--db data/demo.sqlite]
Live execution requires explicit configured policy, nonzero budget and NAIVE_API_KEY.
Default policy: simulation, zero budget, no external messages or paid calls.
The server exposes a JSON customer order API and a separate authenticated operator API.`);
}
async function main() {
  if (command === "help" || command === "--help") {
    help();
    return;
  }
  const db = resolve(
    option(
      "db",
      command === "demo" ? "data/demo.sqlite" : "data/company.sqlite",
    )!,
  );
  const store = new Store(db);
  const makeCompany = () =>
    new Company(store, {
      adapter: (job: Job) =>
        store.policy().mode === "simulation"
          ? new FixtureAdapter()
          : new NaiveAdapter({
              apiKey: process.env.NAIVE_API_KEY ?? "",
              model: process.env.NAIVE_MODEL,
              allowedTools: store.policy().allowedTools,
              timeoutMs: Math.max(
                100,
                Math.min(
                  120000,
                  Date.parse(store.policy().stopAt) - Date.now() - 5000,
                ),
              ),
              onAgentCreated: async (receipt) => {
                store.event("provider_agent_created", {
                  jobId: job.id,
                  ...receipt,
                });
              },
              onSessionCreated: async (receipt) => {
                job.externalSessionId = receipt.sessionId;
                store.saveJob(job);
                store.event("provider_session_created", {
                  jobId: job.id,
                  ...receipt,
                });
              },
            }),
      assetsDirectory: resolve("data/assets"),
      outputDirectory: resolve("data/artifacts"),
    });
  try {
    if (command === "init") {
      store.seed(
        JSON.parse(
          readFileSync(resolve("config/experiments.seed.json"), "utf8"),
        ),
      );
      show({
        db,
        experiments: store.experiments().length,
        policy: store.policy(),
      });
    } else if (command === "status") show(makeCompany().status());
    else if (command === "policy") {
      store.setPolicy({ ...DEFAULT_POLICY, ...fromFile() });
      show(store.policy());
    } else if (command === "qualify")
      show(store.qualifyLead(option("lead") ?? "", option("evidence") ?? ""));
    else if (command === "reconcile") {
      await reconcileJob(
        store,
        option("job") ?? "",
        process.env.NAIVE_API_KEY ?? "",
      );
      show(store.job(option("job") ?? ""));
    } else if (command === "retry")
      show(store.retryUnstarted(option("job") ?? ""));
    else if (command === "finalize") {
      await makeCompany().finalize(store.job(option("job") ?? ""));
      show(store.job(option("job") ?? ""));
    } else if (command === "lead") show(store.addLead(fromFile()));
    else if (command === "signal") {
      const value = fromFile();
      if (
        value.mode === "live" &&
        ["payment", "refund", "delivery"].includes(value.type)
      )
        value.verified = false;
      const s = store.addSignal(value);
      store.event("operator_evidence_intervention", {
        signalId: s.id,
        verified: s.verified,
      });
      show(s);
    } else if (command === "enqueue") {
      const value = fromFile();
      show(
        store.enqueue(
          value.experimentId,
          value.kind,
          value.input ?? {},
          value.idempotencyKey ?? randomUUID(),
          value.leadId ?? null,
        ),
      );
    } else if (command === "cycle") {
      await makeCompany().cycle();
      show(makeCompany().status());
    } else if (command === "run") {
      const cycles = Number(option("cycles", "4")),
        interval = Number(option("interval-seconds", "900"));
      if (
        !Number.isSafeInteger(cycles) ||
        cycles < 1 ||
        cycles > 100 ||
        !Number.isSafeInteger(interval) ||
        interval < 1 ||
        interval > 3600
      )
        throw new Error("cycles must be 1..100 and interval-seconds 1..3600");
      for (let i = 0; i < cycles; i++) {
        if (Date.now() >= Date.parse(store.policy().stopAt)) break;
        await makeCompany().cycle();
        console.log(`Cycle ${i + 1}/${cycles}: ${store.policy().mode}`);
        if (i < cycles - 1)
          await sleep(
            Math.min(
              interval * 1000,
              Math.max(0, Date.parse(store.policy().stopAt) - Date.now()),
            ),
          );
      }
      show(makeCompany().status());
    } else if (command === "doctor") {
      show({
        node: process.version,
        mode: store.policy().mode,
        liveAuthorized: store.policy().liveAuthorized,
        budgetCents: store.policy().totalBudgetCents,
        naiveKeyConfigured: Boolean(process.env.NAIVE_API_KEY),
        model: process.env.NAIVE_MODEL ?? "vetta/auto",
        allowedTools: store.policy().allowedTools,
        allowedChannels: store.policy().allowedChannels,
        unreconciled: store.ledger(store.policy().mode).unresolvedJobs,
        note: "Configuration is not a live provider test. No keys or secret values are printed.",
      });
    } else if (command === "serve") {
      const port = Number(option("port", "3000"));
      if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
        throw new Error("Invalid port");
      const server = createCompanyServer(
        store,
        makeCompany(),
        process.env.COMPANY_API_TOKEN ?? "",
        {
          customerSecret: process.env.COMPANY_CUSTOMER_SECRET ?? "",
          stripeSecretKey: process.env.STRIPE_SECRET_KEY,
          stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          publicBaseUrl: process.env.COMPANY_PUBLIC_URL,
          artifactsDirectory: resolve("data/artifacts"),
          assetsDirectory: resolve("data/assets"),
        },
      );
      await new Promise<void>((accept, reject) => {
        server.once("error", reject);
        server.listen(port, option("host", "127.0.0.1"), accept);
      });
      console.log(
        `Company JSON API listening on ${option("host", "127.0.0.1")}:${(server.address() as { port: number }).port}`,
      );
      await new Promise<void>((accept) => {
        let stopping = false;
        const stop = () => {
          if (stopping) return;
          stopping = true;
          server.close(() => accept());
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
    } else if (command === "demo") {
      if (store.policy().mode === "live" || store.jobs().length)
        throw new Error(
          "Demo needs a fresh dedicated simulation database; use --db another path",
        );
      store.seed(
        JSON.parse(
          readFileSync(resolve("config/experiments.seed.json"), "utf8"),
        ),
      );
      store.setPolicy({
        ...DEFAULT_POLICY,
        totalBudgetCents: 5000,
        stopAt: new Date(Date.now() + 3600_000).toISOString(),
        allowedChannels: ["owned_intake"],
      });
      console.log("SIMULATION ONLY — fixtures, not customers or revenue");
      await makeCompany().cycle();
      await makeCompany().cycle();
      const id = "request-microtools";
      const e = store.experiment(id);
      e.status = "active";
      e.budgetCents = 750;
      store.saveExperiment(e);
      const lead = store.addLead({
        experimentId: id,
        customerId: "fixture-customer",
        name: "Simulation fixture",
        request: "Pretty print JSON",
        sourceUrl: "fixture://demo",
        contact: "fixture@example.test",
        channel: "owned_intake",
        consent: true,
        assetRights: true,
      });
      const job = store.enqueue(
        id,
        "fulfill",
        {
          acceptanceExamples: [
            { input: '{"hello":1}', expected: '{\n  "hello": 1\n}' },
          ],
        },
        "demo:microtool",
        lead.id,
      );
      store.addSignal({
        experimentId: id,
        type: "approval",
        customerId: lead.customerId,
        evidence: "fixture scope approval",
        amountCents: 0,
        independent: false,
        verified: true,
        mode: "simulation",
        externalId: "fixture-approval",
        orderId: job.id,
        scopeHash: job.scopeHash,
      });
      const fixture: AgentResult = {
        status: "completed",
        summary: "Fixture selects a supported template",
        output: { template: "json-formatter" },
        artifacts: [],
        costCents: 0,
        costKnown: true,
      };
      const demoCompany = new Company(store, {
        adapter: () => new FixtureAdapter([fixture]),
      });
      await demoCompany.execute(job);
      show({
        ...demoCompany.status(),
        simulationNotice:
          "The generated offline HTML artifact is real. The customer/approval/agent response is a labeled fixture; no sale, outreach or live SDK run occurred.",
      });
    } else throw new Error(`Unknown command: ${command}`);
  } finally {
    store.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
