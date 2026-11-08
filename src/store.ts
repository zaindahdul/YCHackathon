import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  DEFAULT_POLICY,
  validateExperiment,
  validatePolicy,
  assertCents,
  type Experiment,
  type Job,
  type Lead,
  type Mode,
  type Policy,
  type Signal,
  type SignalType,
  type Metrics,
  type Decision,
  type Outbox,
} from "./domain.js";
const now = () => new Date().toISOString();
export class Store {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id), customer_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id), idempotency_key TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS signals (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id), external_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
    if (!this.db.prepare("SELECT 1 FROM config WHERE key=?").get("policy"))
      this.setPolicy(DEFAULT_POLICY);
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  event(kind: string, data: unknown) {
    this.db
      .prepare("INSERT INTO events(kind,data,created_at) VALUES(?,?,?)")
      .run(kind, JSON.stringify(data), now());
  }
  events() {
    return this.db
      .prepare("SELECT * FROM events ORDER BY id")
      .all()
      .map((r) => ({
        id: Number(r.id),
        kind: String(r.kind),
        data: JSON.parse(String(r.data)) as Record<string, unknown>,
        createdAt: String(r.created_at),
      }));
  }
  policy(): Policy {
    return JSON.parse(
      String(
        this.db.prepare("SELECT value FROM config WHERE key=?").get("policy")!
          .value,
      ),
    );
  }
  setPolicy(p: Policy) {
    validatePolicy(p);
    const previous = this.db
      .prepare("SELECT value FROM config WHERE key=?")
      .get("policy");
    if (
      previous &&
      JSON.parse(String(previous.value)).mode !== p.mode &&
      (this.jobs().length ||
        this.signals().length ||
        this.decisions().length ||
        this.leads().length)
    )
      throw new Error(
        "Execution modes require separate databases once data exists",
      );
    this.db
      .prepare(
        "INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run("policy", JSON.stringify(p));
    this.event("policy_changed", p);
  }
  seed(values: unknown[]) {
    for (const value of values) {
      const e = validateExperiment(value);
      this.db
        .prepare("INSERT OR IGNORE INTO experiments(id,data) VALUES(?,?)")
        .run(e.id, JSON.stringify(e));
    }
  }
  experiments(): Experiment[] {
    return this.db
      .prepare("SELECT data FROM experiments ORDER BY id")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  experiment(id: string): Experiment {
    const row = this.db
      .prepare("SELECT data FROM experiments WHERE id=?")
      .get(id);
    if (!row) throw new Error(`Unknown experiment: ${id}`);
    return JSON.parse(String(row.data));
  }
  saveExperiment(e: Experiment) {
    validateExperiment(e);
    this.db
      .prepare(
        "INSERT INTO experiments(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(e.id, JSON.stringify(e));
  }
  addLead(input: Omit<Lead, "id" | "createdAt" | "mode">): Lead {
    this.experiment(input.experimentId);
    for (const key of [
      "customerId",
      "name",
      "request",
      "sourceUrl",
      "channel",
    ] as const)
      if (typeof input[key] !== "string" || !input[key].trim())
        throw new Error(`Lead ${key} required`);
    if (input.independent && !input.qualificationEvidence?.trim())
      throw new Error("Independent customer requires qualification evidence");
    if (
      typeof input.contact !== "string" ||
      typeof input.consent !== "boolean" ||
      typeof input.assetRights !== "boolean"
    )
      throw new Error("Invalid lead consent/contact");
    const lead = {
      ...input,
      mode: this.policy().mode,
      id: randomUUID(),
      createdAt: now(),
    };
    this.db
      .prepare(
        "INSERT INTO leads(id,experiment_id,customer_id,data) VALUES(?,?,?,?)",
      )
      .run(lead.id, lead.experimentId, lead.customerId, JSON.stringify(lead));
    this.event("lead_received", {
      leadId: lead.id,
      experimentId: lead.experimentId,
      channel: lead.channel,
      consent: lead.consent,
    });
    return lead;
  }
  qualifyLead(id: string, evidence: string) {
    if (!evidence.trim())
      throw new Error("Customer qualification evidence required");
    const lead = this.lead(id);
    lead.independent = true;
    lead.qualificationEvidence = evidence;
    this.db
      .prepare("UPDATE leads SET data=? WHERE id=?")
      .run(JSON.stringify(lead), id);
    this.event("operator_customer_qualification", { leadId: id, evidence });
    return lead;
  }
  leads(): Lead[] {
    return this.db
      .prepare("SELECT data FROM leads ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  lead(id: string): Lead {
    const r = this.db.prepare("SELECT data FROM leads WHERE id=?").get(id);
    if (!r) throw new Error("Unknown lead");
    return JSON.parse(String(r.data));
  }
  addSignal(input: Omit<Signal, "id" | "createdAt">): Signal {
    return this.transaction(() => this.insertSignal(input));
  }
  private insertSignal(input: Omit<Signal, "id" | "createdAt">): Signal {
    this.experiment(input.experimentId);
    if (
      ![
        "qualified_lead",
        "reply",
        "approval",
        "payment",
        "delivery",
        "repeat_order",
        "refund",
        "rejection",
      ].includes(input.type)
    )
      throw new Error("Unknown signal type");
    if (
      !["live", "simulation"].includes(input.mode) ||
      !input.evidence?.trim() ||
      !input.customerId?.trim() ||
      !input.externalId?.trim() ||
      typeof input.independent !== "boolean" ||
      typeof input.verified !== "boolean"
    )
      throw new Error(
        "Signal needs mode, customer, independent flag and evidence/external reference",
      );
    assertCents(input.amountCents, "amountCents");
    if (input.mode !== this.policy().mode)
      throw new Error("Signal mode differs from database execution mode");
    if (["approval", "payment", "delivery", "refund"].includes(input.type)) {
      if (!input.orderId || !input.scopeHash)
        throw new Error("Commercial signal requires an orderId and scopeHash");
      const job = this.job(input.orderId),
        lead = job.leadId ? this.lead(job.leadId) : null;
      if (
        job.kind !== "fulfill" ||
        job.experimentId !== input.experimentId ||
        job.mode !== input.mode ||
        job.scopeHash !== input.scopeHash ||
        !lead ||
        lead.customerId !== input.customerId
      )
        throw new Error(
          "Signal does not match the exact order scope and customer",
        );
      if (input.type === "payment" && input.amountCents !== job.priceCents)
        throw new Error("Payment amount differs from agreed order price");
    }
    const existing = this.db
      .prepare("SELECT data FROM signals WHERE external_id=?")
      .get(input.externalId);
    if (existing) {
      const signal = JSON.parse(String(existing.data)) as Signal;
      if (
        Object.entries(input).some(
          ([key, value]) =>
            JSON.stringify(signal[key as keyof Signal]) !==
            JSON.stringify(value),
        )
      )
        throw new Error("External event ID reused with different data");
      return signal;
    }
    if (input.type === "refund") {
      const signals = this.signals(input.experimentId).filter(
        (s) =>
          s.mode === input.mode && s.orderId === input.orderId && s.verified,
      );
      const paid = signals
        .filter((s) => s.type === "payment")
        .reduce((a, s) => a + s.amountCents, 0);
      const refunded = signals
        .filter((s) => s.type === "refund")
        .reduce((a, s) => a + s.amountCents, 0);
      if (input.amountCents > paid - refunded)
        throw new Error("Refund exceeds recorded payments");
    }
    const s: Signal = { ...input, id: randomUUID(), createdAt: now() };
    this.db
      .prepare(
        "INSERT INTO signals(id,experiment_id,external_id,data) VALUES(?,?,?,?)",
      )
      .run(s.id, s.experimentId, s.externalId, JSON.stringify(s));
    this.event("signal_recorded", s);
    return s;
  }
  signals(experimentId?: string): Signal[] {
    const rows = experimentId
      ? this.db
          .prepare("SELECT data FROM signals WHERE experiment_id=?")
          .all(experimentId)
      : this.db.prepare("SELECT data FROM signals").all();
    return rows.map((r) => JSON.parse(String(r.data)));
  }
  enqueue(
    experimentId: string,
    kind: Job["kind"],
    input: Record<string, unknown>,
    key: string,
    leadId: string | null = null,
  ): Job {
    this.experiment(experimentId);
    if (leadId && this.lead(leadId).experimentId !== experimentId)
      throw new Error("Lead belongs to another experiment");
    const contract = {
      experimentId,
      kind,
      leadId,
      input,
      priceCents: this.experiment(experimentId).priceCents,
      currency: "USD",
      offer: this.experiment(experimentId).offer,
    };
    const stable = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(stable)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, stable(x)]),
            )
          : v;
    const scopeHash = createHash("sha256")
      .update(JSON.stringify(stable(contract)))
      .digest("hex");
    const prior = this.db
      .prepare("SELECT data FROM jobs WHERE idempotency_key=?")
      .get(key);
    if (prior) {
      const job = JSON.parse(String(prior.data)) as Job;
      if (job.scopeHash !== scopeHash)
        throw new Error(
          "Idempotency key reused with a different order contract",
        );
      return job;
    }
    if (!["scout", "fulfill", "strategy"].includes(kind))
      throw new Error("Invalid job kind");
    const job: Job = {
      id: randomUUID(),
      experimentId,
      kind,
      leadId,
      status: "pending",
      mode: this.policy().mode,
      input,
      output: null,
      summary: null,
      reason: null,
      reservationCents: 0,
      costCents: null,
      externalSessionId: null,
      idempotencyKey: key,
      scopeHash,
      priceCents: contract.priceCents,
      currency: "USD",
      offer: contract.offer,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db
      .prepare(
        "INSERT INTO jobs(id,experiment_id,idempotency_key,data) VALUES(?,?,?,?)",
      )
      .run(job.id, experimentId, key, JSON.stringify(job));
    this.event("job_queued", { jobId: job.id, kind, mode: job.mode });
    return job;
  }
  jobs(): Job[] {
    return this.db
      .prepare("SELECT data FROM jobs ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  job(id: string): Job {
    const row = this.db.prepare("SELECT data FROM jobs WHERE id=?").get(id);
    if (!row) throw new Error("Unknown order/job");
    return JSON.parse(String(row.data));
  }
  saveJob(job: Job) {
    const original = this.job(job.id);
    if (
      original.experimentId !== job.experimentId ||
      original.kind !== job.kind ||
      original.currency !== job.currency ||
      original.idempotencyKey !== job.idempotencyKey ||
      original.scopeHash !== job.scopeHash ||
      JSON.stringify(original.input) !== JSON.stringify(job.input) ||
      original.priceCents !== job.priceCents ||
      original.offer !== job.offer ||
      original.leadId !== job.leadId ||
      original.mode !== job.mode
    )
      throw new Error("Order contract is immutable; create a revision");
    job.updatedAt = now();
    this.db
      .prepare("UPDATE jobs SET data=? WHERE id=?")
      .run(JSON.stringify(job), job.id);
  }
  retryUnstarted(jobId: string) {
    return this.transaction(() => {
      const job = this.job(jobId);
      const provider = job.output?._naive as
        | Record<string, unknown>
        | undefined;
      const receipt = this.events().some(
        (e) =>
          ["provider_agent_created", "provider_session_created"].includes(
            e.kind,
          ) && e.data.jobId === job.id,
      );
      if (
        job.status !== "blocked" ||
        job.reservationCents !== 0 ||
        (job.costCents !== null && job.costCents !== 0) ||
        job.externalSessionId ||
        provider?.agentId ||
        receipt
      )
        throw new Error(
          "Only a blocked zero-cost job with no provider attempt can be requeued; reconcile existing attempts",
        );
      job.status = "pending";
      job.reason = null;
      job.costCents = null;
      job.output = null;
      job.summary = null;
      job.recoveryValidated = false;
      this.saveJob(job);
      this.event("operator_retry_unstarted", { jobId });
      return job;
    });
  }
  ledger(mode: Mode) {
    const jobs = this.jobs().filter((j) => j.mode === mode);
    return {
      spentCents: jobs.reduce((a, j) => a + (j.costCents ?? 0), 0),
      reservedCents: jobs.reduce((a, j) => a + j.reservationCents, 0),
      unresolvedJobs: jobs.filter(
        (j) =>
          j.status !== "pending" &&
          j.costCents === null &&
          j.reservationCents > 0,
      ).length,
    };
  }
  reserve(jobId: string, amount: number) {
    assertCents(amount, "reservation", false);
    return this.transaction(() => {
      const job = this.jobs().find((j) => j.id === jobId);
      if (!job || job.status !== "pending")
        throw new Error("Job is not pending");
      const p = this.policy();
      const ledger = this.ledger(job.mode);
      const experiment = this.experiment(job.experimentId);
      if (job.mode !== p.mode)
        throw new Error("Job mode differs from current policy");
      if (p.mode === "live" && (!p.liveAuthorized || p.totalBudgetCents === 0))
        throw new Error("Live execution is not authorized and funded");
      const expJobs = this.jobs().filter(
        (j) => j.mode === job.mode && j.experimentId === job.experimentId,
      );
      const used = expJobs.reduce(
        (a, j) => a + (j.costCents ?? 0) + j.reservationCents,
        0,
      );
      if (
        amount > p.perTaskBudgetCents ||
        ledger.spentCents + ledger.reservedCents + amount >
          p.totalBudgetCents ||
        used + amount > experiment.budgetCents
      )
        throw new Error("Budget exhausted or task/experiment cap exceeded");
      job.status = "running";
      job.reservationCents = amount;
      this.saveJob(job);
      this.event("budget_reserved", {
        jobId,
        amountCents: amount,
        mode: job.mode,
      });
      return job;
    });
  }
  settle(job: Job, costCents: number | null) {
    if (costCents !== null) assertCents(costCents, "actual cost");
    if (costCents !== null && costCents > job.reservationCents)
      this.event("budget_overrun", {
        jobId: job.id,
        reserved: job.reservationCents,
        actual: costCents,
      });
    job.costCents = costCents;
    if (costCents !== null) job.reservationCents = 0;
    else {
      job.status = "blocked";
      job.reason = "Cost unknown: reservation retained pending reconciliation";
    }
    this.saveJob(job);
  }
  isIndependent(s: Signal) {
    if (s.independent) return true; // Explicit operator/provider receipt assertion; public intake cannot set this.
    const order = s.orderId ? this.job(s.orderId) : null;
    return this.leads().some(
      (l) =>
        l.mode === s.mode &&
        l.customerId === s.customerId &&
        l.experimentId === s.experimentId &&
        (!order || order.leadId === l.id) &&
        l.independent &&
        Boolean(l.qualificationEvidence),
    );
  }
  metrics(experimentId: string, mode: Mode): Metrics {
    const ss = this.signals(experimentId).filter(
      (s) => s.mode === mode && this.isIndependent(s) && s.verified,
    );
    const customers = (type: SignalType) =>
      new Set(ss.filter((s) => s.type === type).map((s) => s.customerId));
    const paidOrders = new Map<
      string,
      { customerId: string; paid: number; refunded: number; delivered: boolean }
    >();
    for (const s of ss.filter((s) => s.orderId)) {
      const o = paidOrders.get(s.orderId!) ?? {
        customerId: s.customerId,
        paid: 0,
        refunded: 0,
        delivered: false,
      };
      if (s.type === "payment") o.paid += s.amountCents;
      if (s.type === "refund") o.refunded += s.amountCents;
      if (s.type === "delivery") o.delivered = true;
      paidOrders.set(s.orderId!, o);
    }
    const netPaid = [...paidOrders.values()].filter(
      (o) => o.paid - o.refunded > 0,
    );
    const revenueCents = ss
        .filter((s) => s.type === "payment")
        .reduce((a, s) => a + s.amountCents, 0),
      refundCents = ss
        .filter((s) => s.type === "refund")
        .reduce((a, s) => a + s.amountCents, 0);
    const costCents = this.jobs()
      .filter((j) => j.experimentId === experimentId && j.mode === mode)
      .reduce((a, j) => a + (j.costCents ?? 0), 0);
    return {
      qualifiedLeads: customers("qualified_lead").size,
      replies: customers("reply").size,
      approvals: customers("approval").size,
      payments: new Set(netPaid.map((o) => o.customerId)).size,
      completedOrders: netPaid.filter((o) => o.delivered).length,
      repeatOrders: customers("repeat_order").size,
      revenueCents,
      refundCents,
      costCents,
      contributionCents: revenueCents - refundCents - costCents,
    };
  }
  decision(d: Omit<Decision, "id" | "createdAt">) {
    const full = { ...d, id: randomUUID(), createdAt: now() };
    this.db
      .prepare("INSERT INTO decisions(id,experiment_id,data) VALUES(?,?,?)")
      .run(full.id, full.experimentId, JSON.stringify(full));
    this.event("portfolio_decision", full);
    return full;
  }
  decisions(): Decision[] {
    return this.db
      .prepare("SELECT data FROM decisions ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  addOutbox(o: Omit<Outbox, "id" | "createdAt">) {
    const existing = this.outbox().find(
      (x) => x.leadId === o.leadId && x.subject === o.subject,
    );
    if (existing) return existing;
    const full = { ...o, id: randomUUID(), createdAt: now() };
    this.db
      .prepare("INSERT INTO outbox(id,lead_id,data) VALUES(?,?,?)")
      .run(full.id, full.leadId, JSON.stringify(full));
    return full;
  }
  outbox(): Outbox[] {
    return this.db
      .prepare("SELECT data FROM outbox ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  lease(owner: string, ms = 300_000) {
    return this.transaction(() => {
      const current = this.db
        .prepare("SELECT * FROM leases WHERE name=?")
        .get("company");
      if (current && Number(current.expires_at) > Date.now()) return false;
      this.db
        .prepare(
          "INSERT INTO leases(name,owner,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at",
        )
        .run("company", owner, Date.now() + ms);
      return true;
    });
  }
  renew(owner: string, ms = 300_000) {
    this.db
      .prepare("UPDATE leases SET expires_at=? WHERE name=? AND owner=?")
      .run(Date.now() + ms, "company", owner);
  }
  release(owner: string) {
    this.db
      .prepare("DELETE FROM leases WHERE name=? AND owner=?")
      .run("company", owner);
  }
}
