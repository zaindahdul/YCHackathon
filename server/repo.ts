/**
 * Every read and write the studio makes. The MCP tools (what the agents call), the products'
 * own backend and analytics, and the public dashboard all go through here, so they always agree.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.ts";
import { judge, slugify, withDefaults, type Judgement, type Thresholds } from "./rules.ts";

export type CompanyStatus = "building" | "live" | "killed" | "winner";
export const COMPANY_STATUSES: readonly CompanyStatus[] = ["building", "live", "killed", "winner"];
export const DECISION_KINDS = ["launch", "ship", "iterate", "keep", "kill", "pivot", "scale", "note"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const CHANNELS = ["x", "email", "social", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const TOUCH_KINDS = ["post", "email", "reply", "dm"] as const;
export type TouchKind = (typeof TOUCH_KINDS)[number];
export const EVENT_TYPES = ["view", "use"] as const;

export interface Company {
  id: string;
  slug: string;
  founder: string;
  name: string;
  problem: string;
  audience: string;
  evidence: string[];
  solution: string;
  status: CompanyStatus;
  parent_id: string | null;
  pivot_reason: string | null;
  thresholds: Partial<Thresholds>;
  created_at: Date;
  launched_at: Date | null;
  ended_at: Date | null;
}

export interface CompanyStatsRow {
  hours_live: number;
  versions: number;
  touches: number;
  posts: number;
  emails: number;
  impressions: number;
  engagements: number;
  visitors: number;
  active_users: number;
  returning_users: number;
  signups: number;
  feedback: number;
}

export interface ScoredCompany extends Company {
  stats: CompanyStatsRow;
  judgement: Judgement;
}

export interface Touch {
  id: string;
  company_id: string;
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
  company_id: string | null;
  decision: DecisionKind;
  reasoning: string;
  snapshot: Record<string, unknown>;
  agent: string;
  created_at: Date;
}

export interface Version {
  id: string;
  company_id: string;
  version: number;
  note: string;
  file_count: number;
  bytes: number;
  created_at: Date;
}

export interface Feedback {
  id: string;
  company_id: string;
  source: string;
  email: string | null;
  text: string;
  created_at: Date;
}

export interface Item {
  id: string;
  collection: string;
  owner: string | null;
  data: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface Intervention {
  id: string;
  description: string;
  created_at: Date;
}

export interface Report {
  id: string;
  company_id: string;
  kind: string;
  title: string;
  body: string;
  snapshot: Record<string, unknown>;
  agent: string;
  created_at: Date;
}

/** One shipped version seen as a test: the numbers from when it shipped until the next one (or now). */
export interface VersionResult extends Version {
  ended_at: Date | null;
  visitors: number;
  active_users: number;
  signups: number;
  touches: number;
}

/** What a product may hold, so one runaway agent cannot fill the database. */
export const LIMITS = { files: 40, fileBytes: 400_000, productBytes: 1_500_000, items: 5_000, itemBytes: 20_000 };

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const json = (value: unknown) => JSON.stringify(value ?? null);
const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

export class RepoError extends Error {}

export class Repo {
  constructor(private readonly db: Db) {}

  // ---------------------------------------------------------------- companies

  async startCompany(input: {
    founder: string; name: string; problem: string; audience: string; evidence: string[]; solution: string;
    parent_id?: string | null; pivot_reason?: string | null; thresholds?: Partial<Thresholds>;
  }): Promise<Company> {
    const base = slugify(input.name);
    const taken = await this.db.query<{ n: number }>("select count(*)::int as n from companies where slug = $1 or slug like $2", [base, `${base}-%`]);
    const n = taken.rows[0]?.n ?? 0;
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const { rows } = await this.db.query<Company>(
      `insert into companies (id, slug, founder, name, problem, audience, evidence, solution, parent_id, pivot_reason, thresholds)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb) returning *`,
      [newId("co"), slug, input.founder, input.name, input.problem, input.audience, json(input.evidence), input.solution,
        input.parent_id ?? null, input.pivot_reason ?? null, json(input.thresholds ?? {})],
    );
    return rows[0]!;
  }

  async getCompany(id: string): Promise<Company | null> {
    const { rows } = await this.db.query<Company>("select * from companies where id = $1", [id]);
    return rows[0] ?? null;
  }

  async getCompanyBySlug(slug: string): Promise<Company | null> {
    const { rows } = await this.db.query<Company>("select * from companies where slug = $1", [slug]);
    return rows[0] ?? null;
  }

  /** The founder's one running company (building or live), if any. */
  async activeCompanyOf(founder: string): Promise<Company | null> {
    const { rows } = await this.db.query<Company>(
      "select * from companies where founder = $1 and status in ('building','live') order by created_at desc limit 1",
      [founder],
    );
    return rows[0] ?? null;
  }

  async setStatus(id: string, status: CompanyStatus): Promise<Company | null> {
    const ended = status === "killed" || status === "winner";
    const { rows } = await this.db.query<Company>(
      `update companies set status = $2, ended_at = case when $3::boolean then coalesce(ended_at, now()) else null end
       where id = $1 returning *`,
      [id, status, ended],
    );
    return rows[0] ?? null;
  }

  async scoreboard(now = new Date()): Promise<ScoredCompany[]> {
    const { rows } = await this.db.query<Company & Omit<CompanyStatsRow, "hours_live">>(
      `select c.*,
         (select count(*)::int from product_versions v where v.company_id = c.id) as versions,
         (select count(*)::int from touches t where t.company_id = c.id) as touches,
         (select count(*)::int from touches t where t.company_id = c.id and t.channel in ('x','social')) as posts,
         (select count(*)::int from touches t where t.company_id = c.id and t.channel = 'email') as emails,
         (select coalesce(sum(t.impressions),0)::int from touches t where t.company_id = c.id) as impressions,
         (select coalesce(sum(t.engagements),0)::int from touches t where t.company_id = c.id) as engagements,
         (select count(distinct e.uid)::int from events e where e.company_id = c.id and e.type = 'view') as visitors,
         (select count(distinct e.uid)::int from events e where e.company_id = c.id and e.type = 'use') as active_users,
         (select count(*)::int from (select e.uid from events e where e.company_id = c.id
             group by e.uid having count(distinct e.bucket) >= 2) r) as returning_users,
         (select count(*)::int from signups s where s.company_id = c.id) as signups,
         (select count(*)::int from feedback f where f.company_id = c.id) as feedback
       from companies c order by c.created_at asc`,
    );
    return rows.map((row) => {
      const { versions, touches, posts, emails, impressions, engagements, visitors, active_users, returning_users, signups, feedback, ...company } = row;
      const end = company.ended_at ? new Date(company.ended_at) : now;
      const since = (d: Date | null) => (d ? Math.max(0, (end.getTime() - new Date(d).getTime()) / 3_600_000) : 0);
      const hoursLive = since(company.launched_at);
      const stats: CompanyStatsRow = {
        hours_live: Math.round(hoursLive * 10) / 10, versions, touches, posts, emails, impressions, engagements,
        visitors, active_users, returning_users, signups, feedback,
      };
      const judgement = judge(
        { status: company.status, hoursSinceCreated: since(company.created_at), hoursLive, touches, visitors, activeUsers: active_users, returningUsers: returning_users, signups },
        withDefaults(company.thresholds),
      );
      return { ...company, stats, judgement };
    });
  }

  // ---------------------------------------------------------------- the product

  /**
   * Ships a version. `replace` swaps the whole file set (it must include index.html); otherwise the
   * given files are added or overwritten and the rest kept. The first ship takes the company live.
   */
  async publish(companyId: string, files: { path: string; content: string }[], note: string, replace: boolean): Promise<Version> {
    // Check the result before writing anything, so a refused ship leaves the live product as it was.
    const after = new Map<string, number>(replace ? [] : (await this.listFiles(companyId)).map((f) => [f.path, f.bytes]));
    for (const file of files) {
      const bytes = Buffer.byteLength(file.content, "utf8");
      if (bytes > LIMITS.fileBytes) throw new RepoError(`${file.path} is ${bytes} bytes; the limit per file is ${LIMITS.fileBytes}`);
      after.set(file.path, bytes);
    }
    const total = [...after.values()].reduce((n, b) => n + b, 0);
    if (!after.has("index.html")) throw new RepoError("the product has no index.html");
    if (after.size > LIMITS.files) throw new RepoError(`the product would have ${after.size} files; the limit is ${LIMITS.files}`);
    if (total > LIMITS.productBytes) throw new RepoError(`the product would be ${total} bytes; the limit is ${LIMITS.productBytes}`);

    if (replace) await this.db.query("delete from product_files where company_id = $1", [companyId]);
    for (const file of files) {
      await this.db.query(
        `insert into product_files (company_id, path, content) values ($1,$2,$3)
         on conflict (company_id, path) do update set content = excluded.content, updated_at = now()`,
        [companyId, file.path, file.content],
      );
    }
    const t = { n: after.size, bytes: total };
    const { rows } = await this.db.query<Version>(
      `insert into product_versions (id, company_id, version, note, file_count, bytes)
       values ($1, $2, (select coalesce(max(version),0)+1 from product_versions where company_id = $2), $3, $4, $5)
       returning *`,
      [newId("ver"), companyId, note, t.n, t.bytes],
    );
    await this.db.query("update companies set status = 'live', launched_at = coalesce(launched_at, now()) where id = $1 and status = 'building'", [companyId]);
    return rows[0]!;
  }

  async listFiles(companyId: string): Promise<{ path: string; bytes: number; updated_at: Date }[]> {
    const { rows } = await this.db.query<{ path: string; bytes: number; updated_at: Date }>(
      "select path, octet_length(content)::int as bytes, updated_at from product_files where company_id = $1 order by path",
      [companyId],
    );
    return rows;
  }

  async readFiles(companyId: string, paths?: string[]): Promise<{ path: string; content: string }[]> {
    const { rows } = await this.db.query<{ path: string; content: string }>(
      `select path, content from product_files where company_id = $1 and ($2::text[] is null or path = any($2::text[])) order by path`,
      [companyId, paths && paths.length > 0 ? paths : null],
    );
    return rows;
  }

  async readFile(companyId: string, path: string): Promise<string | null> {
    const { rows } = await this.db.query<{ content: string }>("select content from product_files where company_id = $1 and path = $2", [companyId, path]);
    return rows[0]?.content ?? null;
  }

  async listVersions(companyId?: string, limit = 30): Promise<Version[]> {
    const { rows } = await this.db.query<Version>(
      "select * from product_versions where ($1::text is null or company_id = $1) order by created_at desc limit $2",
      [companyId ?? null, limit],
    );
    return rows;
  }

  /** Every version as a test, with what happened while it was the live one. Newest first. */
  async versionResults(companyId: string): Promise<VersionResult[]> {
    const { rows } = await this.db.query<VersionResult>(
      `with v as (
         select pv.*, lead(pv.created_at) over (order by pv.version) as next_at
         from product_versions pv where pv.company_id = $1
       ), w as (
         select v.*, coalesce(v.next_at, c.ended_at) as ended_at, coalesce(v.next_at, c.ended_at, now()) as until
         from v join companies c on c.id = v.company_id
       )
       select w.id, w.company_id, w.version, w.note, w.file_count, w.bytes, w.created_at, w.ended_at,
         (select count(distinct e.uid)::int from events e where e.company_id = $1 and e.type = 'view' and e.created_at >= w.created_at and e.created_at < w.until) as visitors,
         (select count(distinct e.uid)::int from events e where e.company_id = $1 and e.type = 'use' and e.created_at >= w.created_at and e.created_at < w.until) as active_users,
         (select count(*)::int from signups s where s.company_id = $1 and s.created_at >= w.created_at and s.created_at < w.until) as signups,
         (select count(*)::int from touches t where t.company_id = $1 and t.created_at >= w.created_at and t.created_at < w.until) as touches
       from w order by w.version desc`,
      [companyId],
    );
    return rows;
  }

  // ---------------------------------------------------------------- upload links

  async createUpload(companyId: string, founder: string, now: Date, minutes: number): Promise<{ token: string; expires_at: Date }> {
    const token = `up_${randomBytes(20).toString("hex")}`;
    const expires = new Date(now.getTime() + minutes * 60_000);
    await this.db.query("insert into uploads (token, company_id, founder, created_at, expires_at) values ($1,$2,$3,$4,$5)", [token, companyId, founder, now, expires]);
    return { token, expires_at: expires };
  }

  async getUpload(token: string, now: Date): Promise<{ token: string; company_id: string; founder: string } | null> {
    const { rows } = await this.db.query<{ token: string; company_id: string; founder: string }>(
      "select token, company_id, founder from uploads where token = $1 and expires_at > $2",
      [token, now],
    );
    return rows[0] ?? null;
  }

  async stageFile(token: string, path: string, content: string): Promise<void> {
    await this.db.query(
      "insert into upload_files (token, path, content) values ($1,$2,$3) on conflict (token, path) do update set content = excluded.content",
      [token, path, content],
    );
  }

  async stagedFiles(token: string): Promise<{ path: string; content: string }[]> {
    const { rows } = await this.db.query<{ path: string; content: string }>("select path, content from upload_files where token = $1 order by path", [token]);
    return rows;
  }

  async clearStaged(token: string): Promise<void> {
    await this.db.query("delete from upload_files where token = $1", [token]);
  }

  // ---------------------------------------------------------------- run leases

  /**
   * Takes the founder's lease unless another run took it less than `leaseMinutes` ago and has not
   * given it back. Atomic: of two runs starting at once, exactly one gets it.
   */
  async takeRun(founder: string, now: Date, leaseMinutes: number): Promise<{ ok: true; token: string } | { ok: false; started_at: Date }> {
    const staleBefore = new Date(now.getTime() - leaseMinutes * 60_000);
    const token = `run_${randomBytes(6).toString("hex")}`;
    const { rows } = await this.db.query<{ token: string }>(
      `insert into runs (founder, token, started_at, ended_at) values ($1, $2, $3, null)
       on conflict (founder) do update set token = excluded.token, started_at = excluded.started_at, ended_at = null
       where runs.ended_at is not null or runs.started_at < $4
       returning token`,
      [founder, token, now, staleBefore],
    );
    if (rows.length > 0) return { ok: true, token };
    const held = await this.db.query<{ started_at: Date }>("select started_at from runs where founder = $1", [founder]);
    return { ok: false, started_at: held.rows[0]?.started_at ?? now };
  }

  /** True when `token` is the founder's current, unreleased lease. */
  async holdsRun(founder: string, token: string): Promise<boolean> {
    const { rows } = await this.db.query<{ ok: boolean }>("select true as ok from runs where founder = $1 and token = $2 and ended_at is null", [founder, token]);
    return rows.length > 0;
  }

  async endRun(founder: string, token: string, now: Date): Promise<boolean> {
    const { rows } = await this.db.query<{ founder: string }>(
      "update runs set ended_at = $3 where founder = $1 and token = $2 and ended_at is null returning founder",
      [founder, token, now],
    );
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- reports

  async addReport(input: { company_id: string; kind: string; title: string; body: string; snapshot: Record<string, unknown>; agent: string }): Promise<Report> {
    const { rows } = await this.db.query<Report>(
      "insert into reports (id, company_id, kind, title, body, snapshot, agent) values ($1,$2,$3,$4,$5,$6::jsonb,$7) returning *",
      [newId("rep"), input.company_id, input.kind, input.title, input.body, json(input.snapshot), input.agent],
    );
    return rows[0]!;
  }

  async getReport(id: string): Promise<Report | null> {
    const { rows } = await this.db.query<Report>("select * from reports where id = $1", [id]);
    return rows[0] ?? null;
  }

  /** A founder's latest reports across all its companies, in full: what it learned before. */
  async reportsByFounder(founder: string, limit = 3): Promise<Report[]> {
    const { rows } = await this.db.query<Report>(
      "select r.* from reports r join companies c on c.id = r.company_id where c.founder = $1 order by r.created_at desc limit $2",
      [founder, limit],
    );
    return rows;
  }

  async listReports(filter: { company_id?: string; limit?: number } = {}): Promise<Omit<Report, "body">[]> {
    const { rows } = await this.db.query<Omit<Report, "body">>(
      `select id, company_id, kind, title, snapshot, agent, created_at from reports
       where ($1::text is null or company_id = $1) order by created_at desc limit $2`,
      [filter.company_id ?? null, Math.min(Math.max(filter.limit ?? 30, 1), 200)],
    );
    return rows;
  }

  // ---------------------------------------------------------------- the products' backend

  async listItems(companyId: string, collection: string, owner: string | null, limit: number): Promise<Item[]> {
    const { rows } = await this.db.query<Item>(
      `select id, collection, owner, data, created_at, updated_at from items
       where company_id = $1 and collection = $2 and ($3::text is null or owner = $3)
       order by created_at desc limit $4`,
      [companyId, collection, owner, limit],
    );
    return rows;
  }

  async getItem(companyId: string, id: string): Promise<Item | null> {
    const { rows } = await this.db.query<Item>("select id, collection, owner, data, created_at, updated_at from items where company_id = $1 and id = $2", [companyId, id]);
    return rows[0] ?? null;
  }

  async addItem(companyId: string, collection: string, owner: string | null, data: unknown): Promise<Item> {
    const count = await this.db.query<{ n: number }>("select count(*)::int as n from items where company_id = $1", [companyId]);
    if ((count.rows[0]?.n ?? 0) >= LIMITS.items) throw new RepoError("this product's storage is full");
    const { rows } = await this.db.query<Item>(
      "insert into items (id, company_id, collection, owner, data) values ($1,$2,$3,$4,$5::jsonb) returning id, collection, owner, data, created_at, updated_at",
      [newId("itm"), companyId, collection, owner, json(data)],
    );
    return rows[0]!;
  }

  /** Only the item's owner may change it; an item with no owner is shared and anyone may. */
  async updateItem(companyId: string, id: string, user: string | null, data: unknown): Promise<Item | null> {
    const { rows } = await this.db.query<Item>(
      `update items set data = $4::jsonb, updated_at = now()
       where company_id = $1 and id = $2 and (owner is null or owner = $3)
       returning id, collection, owner, data, created_at, updated_at`,
      [companyId, id, user, json(data)],
    );
    return rows[0] ?? null;
  }

  async deleteItem(companyId: string, id: string, user: string | null): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      "delete from items where company_id = $1 and id = $2 and (owner is null or owner = $3) returning id",
      [companyId, id, user],
    );
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- analytics, signups, feedback

  async recordEvent(companyId: string, uid: string, type: "view" | "use", name: string, path: string | null, now = new Date(), source: string | null = null): Promise<void> {
    await this.db.query(
      "insert into events (company_id, uid, type, name, bucket, path, source) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing",
      [companyId, uid, type, name, hourOf(now), path, source],
    );
  }

  async addSignup(companyId: string, email: string, uid: string | null, source: string): Promise<{ duplicate: boolean }> {
    const { rows } = await this.db.query<{ id: string }>(
      "insert into signups (id, company_id, email, uid, source) values ($1,$2,$3,$4,$5) on conflict (company_id, email) do nothing returning id",
      [newId("sgn"), companyId, email.trim().toLowerCase(), uid, source],
    );
    return { duplicate: rows.length === 0 };
  }

  async addFeedback(companyId: string, source: string, text: string, email: string | null): Promise<Feedback> {
    const { rows } = await this.db.query<Feedback>(
      "insert into feedback (id, company_id, source, email, text) values ($1,$2,$3,$4,$5) returning *",
      [newId("fb"), companyId, source, email?.toLowerCase() ?? null, text],
    );
    return rows[0]!;
  }

  async listFeedback(companyId?: string, limit = 30): Promise<Feedback[]> {
    const { rows } = await this.db.query<Feedback>(
      "select * from feedback where ($1::text is null or company_id = $1) order by created_at desc limit $2",
      [companyId ?? null, limit],
    );
    return rows;
  }

  // ---------------------------------------------------------------- outreach

  async logTouch(input: {
    company_id: string; channel: Channel; kind: TouchKind; content: string;
    target?: string | null; external_id?: string | null; url?: string | null;
  }): Promise<Touch> {
    const { rows } = await this.db.query<Touch>(
      `insert into touches (id, company_id, channel, kind, target, content, external_id, url)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [newId("tch"), input.company_id, input.channel, input.kind, input.target?.toLowerCase() ?? null, input.content, input.external_id ?? null, input.url ?? null],
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

  async listTouches(filter: { company_id?: string; channel?: string; limit?: number } = {}): Promise<Touch[]> {
    const { rows } = await this.db.query<Touch>(
      `select * from touches
       where ($1::text is null or company_id = $1) and ($2::text is null or channel = $2)
       order by created_at desc limit $3`,
      [filter.company_id ?? null, filter.channel ?? null, Math.min(Math.max(filter.limit ?? 30, 1), 200)],
    );
    return rows;
  }

  /** Sends in the last 24 hours: for one company and across the studio. */
  async sentLastDay(companyId: string | null, now = new Date()): Promise<{ company: { posts: number; emails: number }; total: { posts: number; emails: number } }> {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const { rows } = await this.db.query<{ mine: boolean; channel: string; n: number }>(
      `select (company_id = $2) as mine, channel, count(*)::int as n from touches
       where created_at >= $1 group by 1, 2`,
      [since, companyId ?? ""],
    );
    const sum = (pred: (r: { mine: boolean; channel: string }) => boolean) => rows.filter(pred).reduce((n, r) => n + r.n, 0);
    const isPost = (c: string) => c === "x" || c === "social";
    return {
      company: { posts: sum((r) => r.mine && isPost(r.channel)), emails: sum((r) => r.mine && r.channel === "email") },
      total: { posts: sum((r) => isPost(r.channel)), emails: sum((r) => r.channel === "email") },
    };
  }

  /** Which of these addresses or handles were contacted by any company in the last 7 days, or opted out. */
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
    await this.db.query("insert into optouts (target, reason) values ($1, $2) on conflict (target) do nothing", [target.trim().toLowerCase(), reason ?? null]);
  }

  // ---------------------------------------------------------------- decisions & interventions

  async logDecision(input: { company_id?: string | null; decision: DecisionKind; reasoning: string; snapshot?: Record<string, unknown>; agent: string }): Promise<Decision> {
    const { rows } = await this.db.query<Decision>(
      "insert into decisions (id, company_id, decision, reasoning, snapshot, agent) values ($1,$2,$3,$4,$5::jsonb,$6) returning *",
      [newId("dec"), input.company_id ?? null, input.decision, input.reasoning, json(input.snapshot ?? {}), input.agent],
    );
    return rows[0]!;
  }

  async listDecisions(filter: { company_id?: string; limit?: number } = {}): Promise<Decision[]> {
    const { rows } = await this.db.query<Decision>(
      "select * from decisions where ($1::text is null or company_id = $1) order by created_at desc limit $2",
      [filter.company_id ?? null, Math.min(Math.max(filter.limit ?? 30, 1), 200)],
    );
    return rows;
  }

  async logIntervention(description: string): Promise<Intervention> {
    const { rows } = await this.db.query<Intervention>("insert into interventions (id, description) values ($1, $2) returning *", [newId("hum"), description]);
    return rows[0]!;
  }

  async listInterventions(limit = 50): Promise<Intervention[]> {
    const { rows } = await this.db.query<Intervention>("select * from interventions order by created_at desc limit $1", [limit]);
    return rows;
  }
}

/** A stable, anonymous key for a browser without its own id: hashed with a salt, never stored raw. */
export function visitorKey(ip: string, userAgent: string, salt: string): string {
  return createHash("sha256").update(`${salt}|${ip}|${userAgent}`).digest("hex").slice(0, 24);
}
