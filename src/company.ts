import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import type { AgentAdapter, AgentResult, AgentTask } from "./adapters/naive.js";
import { Store } from "./store.js";
import { reviewPortfolio, admitExpansion } from "./portfolio.js";
import { fulfillArtifact } from "./fulfillment.js";
import type { Job, Lead, Policy } from "./domain.js";
export interface CompanyOptions {
  adapter: (job: Job) => AgentAdapter;
  assetsDirectory?: string;
  outputDirectory?: string;
  clock?: () => number;
}
function safeSource(value: unknown, domains: string[]): value is string {
  try {
    if (typeof value !== "string") return false;
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      domains.includes(u.hostname)
    );
  } catch {
    return false;
  }
}
/** Reserve bounded exploration slots without starving customer work. At one slot, customers win. */
export function selectCycleJobs(jobs: Job[], policy: Policy): Job[] {
  const customers = jobs.filter((j) => j.kind === "fulfill");
  const explore = jobs
    .filter((j) => j.kind !== "fulfill")
    .sort(
      (a, b) =>
        (a.kind === "strategy" ? 0 : 1) - (b.kind === "strategy" ? 0 : 1),
    );
  const cap = policy.maxTasksPerCycle;
  const explorationSlots =
    customers.length && cap === 1
      ? 0
      : Math.min(
          explore.length,
          Math.ceil(cap * policy.explorationShare),
          customers.length ? cap - 1 : cap,
        );
  const selected = [
    ...customers.slice(0, cap - explorationSlots),
    ...explore.slice(0, explorationSlots),
  ];
  const ids = new Set(selected.map((j) => j.id));
  return [
    ...selected,
    ...[...customers, ...explore].filter((j) => !ids.has(j.id)),
  ].slice(0, cap);
}
export class Company {
  constructor(
    readonly store: Store,
    readonly options: CompanyOptions,
  ) {}
  private logBlock(job: Job, reason: string) {
    job.status = "blocked";
    job.reason = reason;
    this.store.saveJob(job);
    this.store.event("job_blocked", { jobId: job.id, reason });
  }
  private guards(job: Job): string | null {
    const p = this.store.policy();
    if (job.mode !== p.mode)
      return "Execution mode changed; reconcile or enqueue a new job";
    if (p.mode === "live" && !p.liveAuthorized)
      return "Live execution awaits explicit owner authorization";
    if (Date.now() >= Date.parse(p.stopAt))
      return "Company execution deadline reached";
    if (
      job.kind === "scout" &&
      p.mode === "live" &&
      (!p.allowedSourceDomains.length || !p.allowedTools.includes("web_search"))
    )
      return "Scouting needs configured public source domains and a permitted search tool";
    if (job.kind === "fulfill") {
      if (
        !p.enabledFulfillmentTypes.includes(
          this.store.experiment(job.experimentId).fulfillmentType,
        )
      )
        return "Fulfillment capability is not connected and enabled";
      if (!job.leadId) return "Fulfillment needs a specific customer request";
      const lead = this.store.lead(job.leadId);
      if (lead.mode !== job.mode)
        return "Customer request belongs to another execution mode";
      if (!lead.consent) return "Customer has not opted in to this job";
      if (!lead.assetRights)
        return "Asset/target authorization has not been confirmed";
      const approved = this.store
        .signals(job.experimentId)
        .some(
          (s) =>
            s.orderId === job.id &&
            s.scopeHash === job.scopeHash &&
            s.type === "approval" &&
            s.mode === p.mode &&
            s.verified,
        );
      if (!approved) return "Exact scope approval is missing";
    }
    return null;
  }
  private task(job: Job): AgentTask {
    const e = this.store.experiment(job.experimentId),
      lead = job.leadId ? this.store.lead(job.leadId) : null;
    const instructions: Record<Job["kind"], string> = {
      scout:
        "Research a small number of actual public requests relevant to this offer. Only use configured source domains. Return output.leads as objects {name,request,sourceUrl,contact}. These are unqualified prospects, not customers or permission to contact. Cite source URLs. Do not send or publish anything.",
      fulfill:
        "Prepare the specific approved customer job. For video, return approvedFacts and layout guidance for deterministic rendering of supplied authorized assets. For microtool, select exactly csv-dedupe, json-formatter or utm-builder in output.template if it satisfies the acceptance examples; otherwise report blocked. For QA, require actual tool evidence and a recorded execution receipt; do not invent bugs or evidence. A proposal is not a delivered artifact.",
      strategy:
        "Review actual customer evidence and costs. Propose at most one child experiment in output.experiment and cite output.evidenceIds (signal IDs). Use the same exact experiment schema, existing fulfillment types, permitted channels and uncommitted budget only. No new permissions or controller code. If evidence is insufficient, explain and propose nothing.",
    };
    return {
      kind: job.kind,
      instructions: instructions[job.kind],
      context: {
        experiment: e,
        lead,
        input: job.input,
        policy: this.store.policy(),
        signals: this.store.signals(e.id),
        metrics: this.store.metrics(e.id, job.mode),
      },
      maxCostCents: job.reservationCents,
    };
  }
  private consumeScout(job: Job, result: AgentResult) {
    const proposals = result.output.leads;
    if (!Array.isArray(proposals)) return;
    for (const raw of proposals.slice(0, 5)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      if (
        !safeSource(r.sourceUrl, this.store.policy().allowedSourceDomains) ||
        typeof r.name !== "string" ||
        typeof r.request !== "string"
      )
        continue;
      const customerId = createHash("sha256")
        .update(r.sourceUrl)
        .digest("hex")
        .slice(0, 20);
      if (
        this.store
          .leads()
          .some(
            (l) =>
              l.customerId === customerId &&
              l.experimentId === job.experimentId,
          )
      )
        continue;
      this.store.addLead({
        experimentId: job.experimentId,
        customerId,
        name: r.name,
        request: r.request,
        sourceUrl: r.sourceUrl,
        contact: typeof r.contact === "string" ? r.contact : "",
        channel: "public_research",
        consent: false,
        assetRights: false,
      });
    }
  }
  private draftFor(lead: Lead, artifacts: unknown) {
    const p = this.store.policy();
    const allowed = lead.consent && p.allowedChannels.includes(lead.channel);
    this.store.addOutbox({
      experimentId: lead.experimentId,
      leadId: lead.id,
      channel: lead.channel,
      to: lead.contact,
      subject: `Your ${this.store.experiment(lead.experimentId).name} job`,
      body: `Your approved job has a generated artifact ready for review. ${JSON.stringify(artifacts)}\nPlease review the exact version. Generation is not yet customer acceptance or verified delivery.`,
      status: allowed ? "draft" : "blocked",
      reason: allowed
        ? "Transport requires separate configured send policy"
        : "Channel or customer permission missing",
    });
  }
  async finalize(job: Job) {
    if (job.costCents === null || job.reservationCents > 0)
      throw new Error("Reconcile provider cost before finalizing");
    if (job.status !== "completed" && job.recoveryValidated !== true)
      throw new Error(
        "Provider output was not a validated normal completion; inspect instead of finalizing",
      );
    if (!job.output) throw new Error("No recorded proposal to finalize");
    const reason = this.guards(job);
    if (reason) throw new Error(reason);
    const proposal: AgentResult = {
      status: "completed",
      summary: job.summary ?? "Recovered proposal",
      output: job.output,
      artifacts: [],
      costCents: job.costCents,
      costKnown: true,
    };
    if (job.kind === "fulfill") {
      const result = await fulfillArtifact(
        this.store.experiment(job.experimentId).fulfillmentType,
        job.input,
        proposal,
        {
          assetsDirectory: resolve(
            this.options.assetsDirectory ?? "data/assets",
          ),
          outputDirectory: resolve(
            this.options.outputDirectory ?? "data/artifacts",
            job.id,
          ),
          deadlineAt: Date.parse(this.store.policy().stopAt),
        },
      );
      job.status = result.status;
      job.summary = result.summary;
      job.reason = result.status === "completed" ? null : result.summary;
      job.output = { ...job.output, fulfillment: result };
      if (result.status === "completed" && job.leadId)
        this.draftFor(this.store.lead(job.leadId), result.artifacts);
    } else if (job.kind === "scout") {
      this.consumeScout(job, proposal);
      job.status = "completed";
      job.reason = null;
    } else {
      if (job.output.experiment)
        admitExpansion(
          this.store,
          job.experimentId,
          job.output.experiment,
          job.output.evidenceIds,
        );
      job.status = "completed";
      job.reason = null;
    }
    this.store.saveJob(job);
    this.store.event("operator_finalize_existing_output", {
      jobId: job.id,
      status: job.status,
    });
  }
  async execute(job: Job) {
    const reason = this.guards(job);
    if (reason) {
      this.logBlock(job, reason);
      return;
    }
    let reserved: Job;
    try {
      reserved = this.store.reserve(
        job.id,
        this.store.policy().perTaskBudgetCents,
      );
    } catch (error) {
      this.logBlock(
        job,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    try {
      const result = await this.options
        .adapter(reserved)
        .run(this.task(reserved));
      reserved.recoveryValidated = false;
      reserved.output = {
        ...result.output,
        _workerResultStatus: result.status,
        _recoveryResultValid: false,
      };
      reserved.summary = result.summary;
      reserved.externalSessionId =
        result.externalSessionId ?? reserved.externalSessionId;
      reserved.status = result.status;
      reserved.reason = result.reason ?? null;
      const overBudget =
        result.costKnown && result.costCents > reserved.reservationCents;
      if (overBudget) {
        reserved.status = "blocked";
        reserved.reason =
          "Provider cost exceeded reservation; further execution paused";
        this.store.setPolicy({ ...this.store.policy(), liveAuthorized: false });
      }
      if (
        result.costKnown &&
        !overBudget &&
        reserved.kind === "scout" &&
        result.status === "completed"
      )
        this.consumeScout(reserved, result);
      if (
        result.costKnown &&
        !overBudget &&
        reserved.kind === "strategy" &&
        result.status === "completed" &&
        result.output.experiment
      ) {
        try {
          admitExpansion(
            this.store,
            reserved.experimentId,
            result.output.experiment,
            result.output.evidenceIds,
          );
        } catch (error) {
          reserved.status = "blocked";
          reserved.reason = `Expansion refused: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      if (
        result.costKnown &&
        !overBudget &&
        reserved.kind === "fulfill" &&
        result.status !== "failed"
      ) {
        const output = await fulfillArtifact(
          this.store.experiment(reserved.experimentId).fulfillmentType,
          reserved.input,
          result,
          {
            assetsDirectory: resolve(
              this.options.assetsDirectory ?? "data/assets",
            ),
            outputDirectory: resolve(
              this.options.outputDirectory ?? "data/artifacts",
              reserved.id,
            ),
            deadlineAt: Date.parse(this.store.policy().stopAt),
          },
        );
        reserved.status = output.status;
        reserved.summary = output.summary;
        reserved.output = { ...result.output, fulfillment: output };
        reserved.reason = output.status === "completed" ? null : output.summary;
        if (output.status === "completed" && reserved.leadId)
          this.draftFor(this.store.lead(reserved.leadId), output.artifacts);
      }
      this.store.settle(reserved, result.costKnown ? result.costCents : null);
      this.store.event("job_finished", {
        jobId: reserved.id,
        status: reserved.status,
        mode: reserved.mode,
        costCents: reserved.costCents,
        reason: reserved.reason,
      });
    } catch (error) {
      reserved.status = "blocked";
      reserved.reason = `Execution interrupted: ${error instanceof Error ? error.message : String(error)}. Reconcile cost before retry.`;
      this.store.settle(reserved, null);
      this.store.event("execution_uncertain", {
        jobId: reserved.id,
        reason: reserved.reason,
      });
    }
  }
  async cycle() {
    const owner = randomUUID(),
      p = this.store.policy();
    if (!this.store.lease(owner))
      throw new Error("Another company worker owns the execution lease");
    const heartbeat = setInterval(() => this.store.renew(owner), 30_000);
    heartbeat.unref();
    try {
      for (const job of this.store.jobs().filter((j) => j.status === "running"))
        this.logBlock(
          job,
          "Previous worker stopped mid-execution; reservation retained, reconcile provider result/cost before retry",
        );
      if (this.store.ledger(p.mode).unresolvedJobs > 0) {
        this.store.event("cycle_blocked", {
          reason: "Unreconciled prior cost/session",
        });
        return;
      }
      reviewPortfolio(this.store, this.options.clock?.() ?? Date.now());
      if ((this.options.clock?.() ?? Date.now()) >= Date.parse(p.stopAt))
        return;
      for (const lead of this.store
        .leads()
        .filter((l) => l.mode === p.mode && l.consent && l.assetRights)) {
        if (
          !this.store
            .jobs()
            .some((j) => j.leadId === lead.id && j.kind === "fulfill")
        )
          this.store.enqueue(
            lead.experimentId,
            "fulfill",
            lead.jobInput ?? {},
            `${p.mode}:request:${lead.id}`,
            lead.id,
          );
      }
      for (const job of this.store
        .jobs()
        .filter(
          (j) =>
            j.status === "blocked" &&
            j.reservationCents === 0 &&
            j.reason === "Exact scope approval is missing",
        )) {
        if (!this.guards(job)) {
          job.status = "pending";
          job.reason = null;
          this.store.saveJob(job);
        }
      }
      const bucket = Math.floor(
        (this.options.clock?.() ?? Date.now()) / (15 * 60_000),
      );
      for (const e of this.store
        .experiments()
        .filter((e) => e.status === "active")) {
        const hasCustomerJob = this.store
          .jobs()
          .some(
            (j) =>
              j.experimentId === e.id &&
              j.kind === "fulfill" &&
              ["pending", "running"].includes(j.status),
          );
        if (!hasCustomerJob)
          this.store.enqueue(
            e.id,
            "scout",
            {},
            `${p.mode}:${e.id}:scout:${bucket}`,
          );
        const evidence = this.store
          .signals(e.id)
          .filter(
            (s) =>
              s.mode === p.mode &&
              s.verified &&
              this.store.isIndependent(s) &&
              ["reply", "rejection", "repeat_order"].includes(s.type),
          );
        if (new Set(evidence.map((s) => s.customerId)).size >= 2) {
          const hash = createHash("sha256")
            .update(
              evidence
                .map((s) => s.id)
                .sort()
                .join(":"),
            )
            .digest("hex")
            .slice(0, 16);
          this.store.enqueue(
            e.id,
            "strategy",
            {},
            `${p.mode}:${e.id}:strategy:${hash}`,
          );
        }
      }
      const pending = this.store
        .jobs()
        .filter(
          (j) =>
            j.status === "pending" &&
            j.mode === p.mode &&
            (j.kind === "fulfill" ||
              this.store.experiment(j.experimentId).status === "active"),
        );
      for (const job of selectCycleJobs(pending, p)) {
        if (this.store.ledger(p.mode).unresolvedJobs > 0) break;
        await this.execute(job);
      }
      this.store.event("cycle_completed", {
        mode: p.mode,
        jobs: pending.slice(0, p.maxTasksPerCycle).length,
      });
    } finally {
      clearInterval(heartbeat);
      this.store.release(owner);
    }
  }
  status() {
    const mode = this.store.policy().mode;
    return {
      mode,
      liveAuthorized: this.store.policy().liveAuthorized,
      ledger: this.store.ledger(mode),
      experiments: this.store
        .experiments()
        .map((e) => ({ ...e, metrics: this.store.metrics(e.id, mode) })),
      jobs: this.store.jobs(),
      outbox: this.store.outbox(),
      decisions: this.store.decisions(),
      note:
        mode === "simulation"
          ? "SIMULATION: no actual customers, payments or provider calls"
          : "Live mode: see exact job and integration evidence; configuration is not proof of a live business",
    };
  }
}
