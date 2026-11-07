/**
 * Every read and write the company makes. The MCP tools (what the agents call), the public pages
 * and the dashboard all go through here, so they always agree.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.ts";
import { judge, slugify, withDefaults, type Judgement, type Thresholds } from "./rules.ts";

export type ExperimentStatus = "live" | "paused" | "killed" | "winner";
export const EXPERIMENT_STATUSES: readonly ExperimentStatus[] = ["live", "paused", "killed", "winner"];
export type DecisionKind = "launch" | "keep" | "kill" | "pivot" | "scale" | "note";
export const DECISION_KINDS: readonly DecisionKind[] = ["launch", "keep", "kill", "pivot", "scale", "note"];
export type Channel = "x" | "email" | "other";
export const CHANNELS: readonly Channel[] = ["x", "email", "other"];
export const TOUCH_KINDS = ["post", "email", "reply", "dm"] as const;
export type TouchKind = (typeof TOUCH_KINDS)[number];

export interface Experiment {
  id: string;
  slug: string;
  name: string;
  hypothesis: string;
  audience: string;
  offer: string;
  deliverable: string;
  headline: string;
  subhead: string;
  bullets: string[];
  cta: string;
  ask_label: string;
  channels: string[];
  status: ExperimentStatus;
  parent_id: string | null;
  pivot_reason: string | null;
  thresholds: Partial<Thresholds>;
  created_at: Date;
  ended_at: Date | null;
}

export interface ScoredExperiment extends Experiment {
  stats: {
    age_hours: number;
    touches: number;
    x_posts: number;
    emails: number;
    impressions: number;
    engagements: number;
    views: number;
    signups: number;
    delivered: number;
  };
  judgement: Judgement;
}

export interface Signup {
  id: string;
  experiment_id: string;
  email: string;
  name: string | null;
  need: string;
  link: string | null;
  source: string | null;
  status: "new" | "working" | "delivered" | "failed";
  created_at: Date;
  claimed_at: Date | null;
  delivered_at: Date | null;
}

export interface Touch {
  id: string;
  experiment_id: string;
  channel: Channel;
  kind: TouchKind;
  target: string | null;
  content: string;
  external_id: string | null;
  url: string | null;
  impressions: number;
  engagements: number;
  created_at: Date;
}

export interface Decision {
  id: string;
  experiment_id: string | null;
  decision: DecisionKind;
  reasoning: string;
  snapshot: Record<string, unknown>;
  agent: string;
  created_at: Date;
}

export interface Intervention {
  id: string;
  description: string;
  created_at: Date;
}

export interface Delivery {
  id: string;
  signup_id: string;
  summary: string;
  content: string | null;
  created_at: Date;
}

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const json = (value: unknown) => JSON.stringify(value ?? null);

export class Repo {
  constructor(private readonly db: Db) {}

  // ---------------------------------------------------------------- experiments

  async createExperiment(input: {
    name: string;
    hypothesis: string;
    audience: string;
    offer: string;
    deliverable: string;
    headline: string;
    subhead: string;
    bullets: string[];
    cta: string;
    ask_label?: string;
    channels?: string[];
    parent_id?: string | null;
    pivot_reason?: string | null;
    thresholds?: Partial<Thresholds>;
  }): Promise<Experiment> {
    const base = slugify(input.name);
    const taken = await this.db.query<{ slug: string }>("select slug from experiments where slug = $1 or slug like $2", [base, `${base}-%`]);
    const slug = taken.rows.length === 0 ? base : `${base}-${taken.rows.length + 1}`;
    const { rows } = await this.db.query<Experiment>(
      `insert into experiments
         (id, slug, name, hypothesis, audience, offer, deliverable, headline, subhead, bullets, cta, ask_label, channels, parent_id, pivot_reason, thresholds)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16::jsonb)
       returning *`,
      [
        newId("exp"), slug, input.name, input.hypothesis, input.audience, input.offer, input.deliverable,
        input.headline, input.subhead, json(input.bullets), input.cta,
        input.ask_label ?? "What do you need help with?", json(input.channels ?? ["x", "email"]),
        input.parent_id ?? null, input.pivot_reason ?? null, json(input.thresholds ?? {}),
      ],
    );
    return rows[0]!;
  }

  async getExperiment(id: string): Promise<Experiment | null> {
    const { rows } = await this.db.query<Experiment>("select * from experiments where id = $1", [id]);
    return rows[0] ?? null;
  }

  async getExperimentBySlug(slug: string): Promise<Experiment | null> {
    const { rows } = await this.db.query<Experiment>("select * from experiments where slug = $1", [slug]);
    return rows[0] ?? null;
  }

  async countLive(): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>("select count(*)::int as n from experiments where status = 'live'");
    return rows[0]?.n ?? 0;
  }

  async setStatus(id: string, status: ExperimentStatus): Promise<Experiment | null> {
    const ended = status === "killed" || status === "winner";
    const { rows } = await this.db.query<Experiment>(
      `update experiments set status = $2, ended_at = case when $3::boolean then coalesce(ended_at, now()) else null end
       where id = $1 returning *`,
      [id, status, ended],
    );
    return rows[0] ?? null;
  }

  async scoreboard(now = new Date()): Promise<ScoredExperiment[]> {
    const { rows } = await this.db.query<Experiment & {
      touches: number; x_posts: number; emails: number; impressions: number; engagements: number;
      views: number; signups: number; delivered: number;
    }>(
      `select e.*,
         (select count(*)::int from touches t where t.experiment_id = e.id) as touches,
         (select count(*)::int from touches t where t.experiment_id = e.id and t.channel = 'x') as x_posts,
         (select count(*)::int from touches t where t.experiment_id = e.id and t.channel = 'email') as emails,
         (select coalesce(sum(t.impressions), 0)::int from touches t where t.experiment_id = e.id) as impressions,
         (select coalesce(sum(t.engagements), 0)::int from touches t where t.experiment_id = e.id) as engagements,
         (select count(*)::int from views v where v.experiment_id = e.id) as views,
         (select count(*)::int from signups s where s.experiment_id = e.id) as signups,
         (select count(*)::int from signups s where s.experiment_id = e.id and s.status = 'delivered') as delivered
       from experiments e
       order by e.created_at asc`,
    );
    return rows.map((row) => {
      const { touches, x_posts, emails, impressions, engagements, views, signups, delivered, ...experiment } = row;
      const end = experiment.ended_at ? new Date(experiment.ended_at) : now;
      const ageHours = Math.max(0, (end.getTime() - new Date(experiment.created_at).getTime()) / 3_600_000);
      const stats = { age_hours: Math.round(ageHours * 10) / 10, touches, x_posts, emails, impressions, engagements, views, signups, delivered };
      return {
        ...experiment,
        stats,
        judgement: judge({ ageHours, touches, views, signups, impressions }, withDefaults(experiment.thresholds)),
      };
    });
  }

  // ---------------------------------------------------------------- outreach

  async logTouch(input: {
    experiment_id: string; channel: Channel; kind: TouchKind; content: string;
    target?: string | null; external_id?: string | null; url?: string | null;
  }): Promise<Touch> {
    const { rows } = await this.db.query<Touch>(
      `insert into touches (id, experiment_id, channel, kind, target, content, external_id, url)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [newId("tch"), input.experiment_id, input.channel, input.kind, input.target?.toLowerCase() ?? null, input.content, input.external_id ?? null, input.url ?? null],
    );
    return rows[0]!;
  }

  async updateTouchMetrics(ref: { id?: string; external_id?: string }, impressions: number, engagements: number): Promise<Touch | null> {
    const { rows } = await this.db.query<Touch>(
      `update touches set impressions = $3, engagements = $4
       where ($1::text is not null and id = $1) or ($2::text is not null and external_id = $2)
       returning *`,
      [ref.id ?? null, ref.external_id ?? null, impressions, engagements],
    );
    return rows[0] ?? null;
  }

  async listTouches(filter: { experiment_id?: string; channel?: string; limit?: number } = {}): Promise<Touch[]> {
    const { rows } = await this.db.query<Touch>(
      `select * from touches
       where ($1::text is null or experiment_id = $1) and ($2::text is null or channel = $2)
       order by created_at desc limit $3`,
      [filter.experiment_id ?? null, filter.channel ?? null, Math.min(Math.max(filter.limit ?? 30, 1), 200)],
    );
    return rows;
  }

  /** Sends in the last 24 hours, by channel. */
  async sentLastDay(now = new Date()): Promise<{ x: number; email: number }> {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const { rows } = await this.db.query<{ channel: string; n: number }>(
      "select channel, count(*)::int as n from touches where created_at >= $1 group by channel",
      [since],
    );
    const by = Object.fromEntries(rows.map((r) => [r.channel, r.n]));
    return { x: by["x"] ?? 0, email: by["email"] ?? 0 };
  }

  /** Which of these addresses or handles were contacted in the last 7 days, or opted out. */
  async blockedTargets(targets: string[], now = new Date()): Promise<Record<string, string>> {
    const wanted = [...new Set(targets.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (wanted.length === 0) return {};
    const since = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const blocked: Record<string, string> = {};
    const contacted = await this.db.query<{ target: string }>(
      "select distinct target from touches where target = any($1::text[]) and created_at >= $2",
      [wanted, since],
    );
    for (const row of contacted.rows) blocked[row.target] = "contacted in the last 7 days";
    const opted = await this.db.query<{ target: string }>("select target from optouts where target = any($1::text[])", [wanted]);
    for (const row of opted.rows) blocked[row.target] = "opted out";
    return blocked;
  }

  async optOut(target: string, reason?: string): Promise<void> {
    await this.db.query(
      "insert into optouts (target, reason) values ($1, $2) on conflict (target) do nothing",
      [target.trim().toLowerCase(), reason ?? null],
    );
  }

  // ---------------------------------------------------------------- landing pages & signups

  async recordView(experimentId: string, visitor: string, source: string | null): Promise<void> {
    await this.db.query(
      "insert into views (experiment_id, visitor, source) values ($1, $2, $3) on conflict do nothing",
      [experimentId, visitor, source],
    );
  }

  /** A second signup from the same address for the same offer returns the first one. */
  async addSignup(input: {
    experiment_id: string; email: string; need: string; name?: string | null; link?: string | null; source?: string | null;
  }): Promise<{ signup: Signup; duplicate: boolean }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.query<Signup>("select * from signups where experiment_id = $1 and email = $2", [input.experiment_id, email]);
    if (existing.rows[0]) return { signup: existing.rows[0], duplicate: true };
    const { rows } = await this.db.query<Signup>(
      `insert into signups (id, experiment_id, email, name, need, link, source)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [newId("sgn"), input.experiment_id, email, input.name ?? null, input.need, input.link ?? null, input.source ?? null],
    );
    return { signup: rows[0]!, duplicate: false };
  }

  async listSignups(filter: { status?: string; experiment_id?: string; limit?: number } = {}): Promise<Signup[]> {
    const { rows } = await this.db.query<Signup>(
      `select * from signups
       where ($1::text is null or status = $1) and ($2::text is null or experiment_id = $2)
       order by created_at asc limit $3`,
      [filter.status ?? null, filter.experiment_id ?? null, Math.min(Math.max(filter.limit ?? 20, 1), 200)],
    );
    return rows;
  }

  /**
   * Moves a new signup to `working`, atomically, so two operator sessions running at once never
   * deliver the same order twice. A signup stuck in `working` for over an hour is claimable again.
   */
  async claimSignup(id: string): Promise<Signup | null> {
    const { rows } = await this.db.query<Signup>(
      `update signups set status = 'working', claimed_at = now()
       where id = $1 and (status = 'new' or (status = 'working' and claimed_at < now() - interval '1 hour'))
       returning *`,
      [id],
    );
    return rows[0] ?? null;
  }

  async recordDelivery(signupId: string, summary: string, content: string | null): Promise<Delivery | null> {
    const updated = await this.db.query<Signup>(
      "update signups set status = 'delivered', delivered_at = now() where id = $1 and status <> 'delivered' returning *",
      [signupId],
    );
    if (!updated.rows[0]) return null;
    const { rows } = await this.db.query<Delivery>(
      "insert into deliveries (id, signup_id, summary, content) values ($1,$2,$3,$4) returning *",
      [newId("dlv"), signupId, summary, content],
    );
    return rows[0]!;
  }

  async failSignup(signupId: string): Promise<Signup | null> {
    const { rows } = await this.db.query<Signup>("update signups set status = 'failed' where id = $1 returning *", [signupId]);
    return rows[0] ?? null;
  }

  async listDeliveries(limit = 20): Promise<(Delivery & { experiment_id: string; email: string })[]> {
    const { rows } = await this.db.query<Delivery & { experiment_id: string; email: string }>(
      `select d.*, s.experiment_id, s.email from deliveries d join signups s on s.id = d.signup_id
       order by d.created_at desc limit $1`,
      [limit],
    );
    return rows;
  }

  // ---------------------------------------------------------------- decisions & interventions

  async logDecision(input: {
    experiment_id?: string | null; decision: DecisionKind; reasoning: string; snapshot?: Record<string, unknown>; agent?: string;
  }): Promise<Decision> {
    const { rows } = await this.db.query<Decision>(
      `insert into decisions (id, experiment_id, decision, reasoning, snapshot, agent)
       values ($1,$2,$3,$4,$5::jsonb,$6) returning *`,
      [newId("dec"), input.experiment_id ?? null, input.decision, input.reasoning, json(input.snapshot ?? {}), input.agent ?? "strategist"],
    );
    return rows[0]!;
  }

  async listDecisions(limit = 30): Promise<Decision[]> {
    const { rows } = await this.db.query<Decision>("select * from decisions order by created_at desc limit $1", [limit]);
    return rows;
  }

  async logIntervention(description: string): Promise<Intervention> {
    const { rows } = await this.db.query<Intervention>(
      "insert into interventions (id, description) values ($1, $2) returning *",
      [newId("hum"), description],
    );
    return rows[0]!;
  }

  async listInterventions(limit = 50): Promise<Intervention[]> {
    const { rows } = await this.db.query<Intervention>("select * from interventions order by created_at desc limit $1", [limit]);
    return rows;
  }
}

/** A stable, anonymous visitor key: the address and browser hashed with a salt, never stored raw. */
export function visitorKey(ip: string, userAgent: string, salt: string): string {
  return createHash("sha256").update(`${salt}|${ip}|${userAgent}`).digest("hex").slice(0, 24);
}
