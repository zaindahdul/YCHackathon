/** Local admission ledger for finite kickoff invocations, not the provider's organization bill. */
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

export class KickoffBudgetError extends Error {}

export interface KickoffEnvelope {
  budgetId: string;
  totalBudgetCents: number;
  taskBudgetCents: number;
  stopAt: number;
  names: string[];
}
export interface KickoffAttempt {
  id: string;
  founder: string;
  idempotencyKey: string;
  reservationCents: number;
}

export class KickoffBudget {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kickoff_budgets (id TEXT PRIMARY KEY, total_cents INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kickoff_attempts (
        id TEXT PRIMARY KEY, budget_id TEXT NOT NULL, founder TEXT NOT NULL,
        status TEXT NOT NULL, reservation_cents INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE, session_id TEXT, created_at TEXT NOT NULL
      );`);
  }
  close() {
    this.db.close();
  }
  reserve(plan: KickoffEnvelope, now = Date.now()): KickoffAttempt[] {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (now >= plan.stopAt)
        throw new KickoffBudgetError(
          "The kickoff admission deadline has passed.",
        );
      const uncertain = this.db
        .prepare(
          "SELECT id FROM kickoff_attempts WHERE status IN ('reserved','creating','uncertain') LIMIT 1",
        )
        .get();
      if (uncertain)
        throw new KickoffBudgetError(
          "An unresolved kickoff attempt exists. Inspect its provider/session receipt; do not retry paid work blindly.",
        );
      const prior = this.db
        .prepare("SELECT total_cents FROM kickoff_budgets WHERE id=?")
        .get(plan.budgetId);
      if (prior && Number(prior.total_cents) !== plan.totalBudgetCents)
        throw new KickoffBudgetError(
          "This budget ID already has a different authorized ceiling; do not silently change an envelope.",
        );
      this.db
        .prepare(
          "INSERT OR IGNORE INTO kickoff_budgets(id,total_cents) VALUES(?,?)",
        )
        .run(plan.budgetId, plan.totalBudgetCents);
      const allocated = Number(
        this.db
          .prepare(
            "SELECT COALESCE(SUM(reservation_cents),0) AS n FROM kickoff_attempts WHERE budget_id=?",
          )
          .get(plan.budgetId)!.n,
      );
      if (
        allocated + plan.names.length * plan.taskBudgetCents >
        plan.totalBudgetCents
      )
        throw new KickoffBudgetError(
          "The local kickoff budget envelope has insufficient unallocated funds.",
        );
      const attempts = plan.names.map((founder) => ({
        id: randomUUID(),
        founder,
        idempotencyKey: randomUUID(),
        reservationCents: plan.taskBudgetCents,
      }));
      for (const attempt of attempts)
        this.db
          .prepare(
            "INSERT INTO kickoff_attempts(id,budget_id,founder,status,reservation_cents,idempotency_key,created_at) VALUES(?,?,?,'reserved',?,?,?)",
          )
          .run(
            attempt.id,
            plan.budgetId,
            attempt.founder,
            attempt.reservationCents,
            attempt.idempotencyKey,
            new Date(now).toISOString(),
          );
      this.db.exec("COMMIT");
      return attempts;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  creating(id: string) {
    const result = this.db
      .prepare(
        "UPDATE kickoff_attempts SET status='creating' WHERE id=? AND status='reserved'",
      )
      .run(id);
    if (result.changes !== 1)
      throw new KickoffBudgetError("Kickoff attempt is not reserved.");
  }
  accepted(id: string, sessionId: string) {
    const result = this.db
      .prepare(
        "UPDATE kickoff_attempts SET status='accepted', session_id=? WHERE id=? AND status='creating'",
      )
      .run(sessionId, id);
    if (result.changes !== 1)
      throw new KickoffBudgetError(
        "Kickoff receipt could not settle its create state.",
      );
  }
  uncertain(id: string) {
    this.db
      .prepare(
        "UPDATE kickoff_attempts SET status='uncertain' WHERE id=? AND status='creating'",
      )
      .run(id);
  }
  releaseUnstarted(attempts: KickoffAttempt[]) {
    const statement = this.db.prepare(
      "UPDATE kickoff_attempts SET status='not_started', reservation_cents=0 WHERE id=? AND status='reserved'",
    );
    for (const attempt of attempts) statement.run(attempt.id);
  }
  attempts() {
    return this.db
      .prepare(
        "SELECT id,budget_id,founder,status,reservation_cents,idempotency_key,session_id,created_at FROM kickoff_attempts ORDER BY rowid",
      )
      .all();
  }
}
