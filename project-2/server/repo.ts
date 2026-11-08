/**
 * Every read and write Launchpad makes. The agents' MCP tools, the founder's kit page, the boost
 * pages, the tracked links and the public pages all go through here, so they always agree.
 */
import { randomBytes } from "node:crypto";
import type { Db } from "./db.ts";
import { TRACKED, slugify, type Caps, type Kit } from "./rules.ts";

export type LaunchStatus = "new" | "drafting" | "ready" | "launched" | "reported";

export interface Launch {
  id: string;
  slug: string;
  token: string;
  company: string;
  one_liner: string;
  description: string;
  url: string;
  video_url: string | null;
  batch: string | null;
  email: string;
  x_handle: string | null;
  linkedin_url: string | null;
  channels: string[];
  launch_when: string | null;
  timezone: string | null;
  join_squad: boolean;
  listed: boolean;
  status: LaunchStatus;
  kit: Kit | null;
  claimed_at: Date | null;
  ready_at: Date | null;
  launched_at: Date | null;
  reported_at: Date | null;
  created_at: Date;
}

export interface LaunchStats {
  clicks_by_channel: Record<string, number>;
  clicks_total: number;
  boosts: { total: number; sent: number; shared: number; pending: number };
  boost_clicks: number;
}

export interface PendingBoost {
  boost_id: string;
  code: string;
  booster_email: string;
  booster_company: string;
  launch_id: string;
  company: string;
  one_liner: string;
  url: string;
  video_url: string | null;
  boost_text: string;
}

export interface Decision { id: string; launch_id: string | null; decision: string; reasoning: string; agent: string; created_at: Date }
export interface Report { id: string; launch_id: string; title: string; body: string; snapshot: Record<string, unknown>; agent: string; created_at: Date }
export interface Touch { id: string; launch_id: string | null; channel: string; kind: string; target: string | null; content: string; external_id: string | null; impressions: number; engagements: number; created_at: Date }
export interface RadarItem { id: string; source: string; title: string; url: string; company: string | null; batch: string | null; contact: string | null; seen_at: Date; launched_at: Date | null }

export class RepoError extends Error {}

const id = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const code = () => randomBytes(5).toString("base64url").replace(/[-_]/g, "x").slice(0, 7);
const json = (v: unknown) => JSON.stringify(v ?? null);
const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

export class Repo {
  constructor(private readonly db: Db) {}

  // ---------------------------------------------------------------- launches

  async createLaunch(input: {
    company: string; one_liner: string; description: string; url: string; email: string; video_url?: string | null; batch?: string | null;
    x_handle?: string | null; linkedin_url?: string | null; channels: string[]; launch_when?: string | null; timezone?: string | null; join_squad: boolean; listed: boolean;
  }): Promise<Launch> {
    const base = slugify(input.company);
    const taken = await this.db.query<{ n: number }>("select count(*)::int as n from launches where slug = $1 or slug like $2", [base, `${base}-%`]);
    const n = taken.rows[0]?.n ?? 0;
    const { rows } = await this.db.query<Launch>(
      `insert into launches (id, slug, token, company, one_liner, description, url, video_url, batch, email, x_handle, linkedin_url, channels, launch_when, timezone, join_squad, listed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17) returning *`,
      [id("lch"), n === 0 ? base : `${base}-${n + 1}`, randomBytes(16).toString("hex"), input.company, input.one_liner, input.description, input.url,
        input.video_url ?? null, input.batch ?? null, input.email.toLowerCase(), input.x_handle ?? null, input.linkedin_url ?? null, json(input.channels),
        input.launch_when ?? null, input.timezone ?? null, input.join_squad, input.listed],
    );
    return rows[0]!;
  }

  async getLaunch(launchId: string): Promise<Launch | null> {
    const { rows } = await this.db.query<Launch>("select * from launches where id = $1", [launchId]);
    return rows[0] ?? null;
  }

  async getBySlug(slug: string): Promise<Launch | null> {
    const { rows } = await this.db.query<Launch>("select * from launches where slug = $1", [slug]);
    return rows[0] ?? null;
  }

  async listLaunches(filter: { status?: string; limit?: number } = {}): Promise<Launch[]> {
    const { rows } = await this.db.query<Launch>(
      "select * from launches where ($1::text is null or status = $1) order by created_at asc limit $2",
      [filter.status ?? null, Math.min(Math.max(filter.limit ?? 20, 1), 200)],
    );
    return rows;
  }

  /** Moves a new launch to drafting, atomically; a draft abandoned for 30 minutes is claimable again. */
  async claimLaunch(launchId: string, now: Date): Promise<Launch | null> {
    const { rows } = await this.db.query<Launch>(
      `update launches set status = 'drafting', claimed_at = $2
       where id = $1 and (status = 'new' or (status = 'drafting' and claimed_at < $3)) returning *`,
      [launchId, now, new Date(now.getTime() - 30 * 60_000)],
    );
    return rows[0] ?? null;
  }

  /** Stores the kit and mints the tracked links. A kit can be rewritten until the founder launches. */
  async saveKit(launchId: string, kit: Kit, now: Date): Promise<Launch> {
    const { rows } = await this.db.query<Launch>(
      `update launches set kit = $2::jsonb, status = case when status in ('new','drafting') then 'ready' else status end, ready_at = coalesce(ready_at, $3)
       where id = $1 and status in ('new','drafting','ready') returning *`,
      [launchId, json(kit), now],
    );
    const launch = rows[0];
    if (!launch) throw new RepoError("this launch has already gone out; its kit can no longer change");
    for (const channel of [...TRACKED, "kit" as const]) await this.ensureLink(launch, channel, null);
    return launch;
  }

  /** Squad members a launch would rally right now: the same people markLaunched queues boosts for. */
  private static readonly SQUAD = `l.join_squad and l.id <> $1 and l.email <> $2 and l.status in ('ready','launched','reported')
         and not exists (select 1 from optouts o where o.target = l.email)`;

  async squadFor(launch: Pick<Launch, "id" | "email">): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(`select count(distinct l.email)::int as n from launches l where ${Repo.SQUAD}`, [launch.id, launch.email]);
    return rows[0]?.n ?? 0;
  }

  private async queueBoost(launch: Launch, boosterId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      "insert into boosts (id, launch_id, booster_id, code) values ($1,$2,$3,$4) on conflict do nothing returning id", [id("bst"), launch.id, boosterId, code()],
    );
    if (rows[0]) await this.ensureLink(launch, "boost", rows[0].id);
    return rows.length > 0;
  }

  /**
   * A founder who joins the squad after others have launched still boosts them: once their own
   * kit is ready, they get a boost for every launch that went out in the last 48 hours.
   */
  async joinLateBoosts(member: Launch, now: Date, caps: Caps): Promise<number> {
    if (!member.join_squad || !["ready", "launched", "reported"].includes(member.status)) return 0;
    const { rows } = await this.db.query<Launch>(
      `select l.* from launches l
       where l.status in ('launched','reported') and l.launched_at >= $3 and l.id <> $1 and l.email <> $2
         and not exists (select 1 from optouts o where o.target = $2)
         and not exists (select 1 from boosts b where b.launch_id = l.id and b.booster_id = $1)
         and (select count(*) from boosts b where b.launch_id = l.id) < $4
       order by l.launched_at desc`,
      [member.id, member.email, new Date(now.getTime() - 48 * 3_600_000), caps.boostsPerLaunch],
    );
    let queued = 0;
    for (const launch of rows) if (await this.queueBoost(launch, member.id)) queued++;
    return queued;
  }

  private async ensureLink(launch: Launch, channel: string, boostId: string | null): Promise<string> {
    const existing = await this.db.query<{ code: string }>(
      "select code from links where launch_id = $1 and channel = $2 and ($3::text is null and boost_id is null or boost_id = $3) limit 1",
      [launch.id, channel, boostId],
    );
    if (existing.rows[0]) return existing.rows[0].code;
    const c = code();
    await this.db.query("insert into links (code, launch_id, channel, boost_id, target) values ($1,$2,$3,$4,$5)", [c, launch.id, channel, boostId, launch.url]);
    return c;
  }

  async linksFor(launchId: string): Promise<Record<string, string>> {
    const { rows } = await this.db.query<{ channel: string; code: string }>("select channel, code from links where launch_id = $1 and boost_id is null", [launchId]);
    return Object.fromEntries(rows.map((r) => [r.channel, r.code]));
  }

  /**
   * The founder pressed "Launch now": the launch goes out, and every squad member gets a boost to
   * send (the booster agent emails them). A squad member never boosts their own launch.
   */
  async markLaunched(launchId: string, now: Date, caps: Caps): Promise<{ launch: Launch; boosts: number }> {
    const { rows } = await this.db.query<Launch>(
      "update launches set status = 'launched', launched_at = coalesce(launched_at, $2) where id = $1 and status in ('ready','launched') returning *",
      [launchId, now],
    );
    const launch = rows[0];
    if (!launch) throw new RepoError("this launch is not ready yet");
    // One boost per person (a founder with two launches is asked once), up to the per-launch cap.
    const squad = await this.db.query<{ id: string }>(
      `select distinct on (l.email) l.id from launches l
       where ${Repo.SQUAD}
         and not exists (select 1 from boosts b join launches bm on bm.id = b.booster_id where b.launch_id = $1 and bm.email = l.email)
       order by l.email, l.created_at asc`,
      [launch.id, launch.email],
    );
    const already = await this.db.query<{ n: number }>("select count(*)::int as n from boosts where launch_id = $1", [launch.id]);
    let boosts = 0;
    for (const member of squad.rows.slice(0, Math.max(0, caps.boostsPerLaunch - (already.rows[0]?.n ?? 0)))) if (await this.queueBoost(launch, member.id)) boosts++;
    return { launch, boosts };
  }

  /** Boosts waiting to be emailed, skipping anyone already asked their daily share. */
  async pendingBoosts(limit: number, caps: Caps, now: Date): Promise<PendingBoost[]> {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const { rows } = await this.db.query<PendingBoost>(
      `select b.id as boost_id, b.code, m.email as booster_email, m.company as booster_company, l.id as launch_id, l.company, l.one_liner, l.url, l.video_url,
              coalesce(l.kit->>'boost_text', '') as boost_text
       from boosts b join launches l on l.id = b.launch_id join launches m on m.id = b.booster_id
       where b.status = 'pending'
         and not exists (select 1 from optouts o where o.target = m.email)
         and (select count(*) from boosts s join launches sm on sm.id = s.booster_id where sm.email = m.email and s.sent_at >= $2) < $3
       order by b.created_at asc limit $1`,
      [limit, since, caps.boostsPerBoosterPerDay],
    );
    return rows;
  }

  async markBoostsSent(ids: string[], now: Date): Promise<number> {
    const { rows } = await this.db.query<{ id: string }>("update boosts set status = 'sent', sent_at = $2 where id = any($1::text[]) and status = 'pending' returning id", [ids, now]);
    return rows.length;
  }

  async getBoost(boostCode: string): Promise<{ boost_id: string; status: string; launch: Launch; booster: Launch } | null> {
    const { rows } = await this.db.query<{ boost_id: string; status: string; launch_id: string; booster_id: string }>(
      "select id as boost_id, status, launch_id, booster_id from boosts where code = $1", [boostCode],
    );
    const b = rows[0];
    if (!b) return null;
    const [launch, booster] = await Promise.all([this.getLaunch(b.launch_id), this.getLaunch(b.booster_id)]);
    return launch && booster ? { boost_id: b.boost_id, status: b.status, launch, booster } : null;
  }

  async boostLinkCode(boostId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ code: string }>("select code from links where boost_id = $1 limit 1", [boostId]);
    return rows[0]?.code ?? null;
  }

  async markBoostShared(boostId: string, now: Date): Promise<void> {
    await this.db.query("update boosts set status = 'shared', shared_at = coalesce(shared_at, $2) where id = $1", [boostId, now]);
  }

  /** A squad member passed on this one. A share already made stays counted. */
  async markBoostSkipped(boostId: string): Promise<void> {
    await this.db.query("update boosts set status = 'skipped' where id = $1 and status in ('pending','sent')", [boostId]);
  }

  async launchExists(launchId: string): Promise<boolean> {
    const { rows } = await this.db.query("select 1 from launches where id = $1", [launchId]);
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- tracked links

  /** Records a click (once per visitor per hour) and answers where to send them. */
  async click(linkCode: string, visitor: string | null, ua: string | null, referer: string | null, now: Date): Promise<string | null> {
    const { rows } = await this.db.query<{ launch_id: string; channel: string; target: string; boost_id: string | null }>(
      "select launch_id, channel, target, boost_id from links where code = $1", [linkCode],
    );
    const link = rows[0];
    if (!link) return null;
    if (visitor) {
      await this.db.query(
        "insert into clicks (code, launch_id, channel, visitor, bucket, ua, referer) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing",
        [linkCode, link.launch_id, link.channel, visitor, hourOf(now), ua, referer],
      );
    }
    return link.target;
  }

  async stats(launchId: string): Promise<LaunchStats> {
    const clicks = await this.db.query<{ channel: string; n: number }>(
      "select channel, count(distinct visitor)::int as n from clicks where launch_id = $1 group by channel", [launchId],
    );
    const boosts = await this.db.query<{ status: string; n: number }>("select status, count(*)::int as n from boosts where launch_id = $1 group by status", [launchId]);
    const by = Object.fromEntries(clicks.rows.map((r) => [r.channel, r.n]));
    const b = Object.fromEntries(boosts.rows.map((r) => [r.status, r.n]));
    const total = await this.db.query<{ n: number }>("select count(distinct visitor)::int as n from clicks where launch_id = $1", [launchId]);
    return {
      clicks_by_channel: by,
      clicks_total: total.rows[0]?.n ?? 0,
      boosts: { total: (b["pending"] ?? 0) + (b["sent"] ?? 0) + (b["shared"] ?? 0) + (b["skipped"] ?? 0), sent: (b["sent"] ?? 0) + (b["shared"] ?? 0) + (b["skipped"] ?? 0), shared: b["shared"] ?? 0, pending: b["pending"] ?? 0 },
      boost_clicks: by["boost"] ?? 0,
    };
  }

  /** How much a squad member has given back: boosts shared for others versus boosts received. */
  async reciprocity(launchId: string): Promise<{ given: number; received: number }> {
    const { rows } = await this.db.query<{ given: number; received: number }>(
      `select (select count(*)::int from boosts where booster_id = $1 and status = 'shared') as given,
              (select count(*)::int from boosts where launch_id = $1 and status = 'shared') as received`,
      [launchId],
    );
    return rows[0] ?? { given: 0, received: 0 };
  }

  async overview(): Promise<{ launches: number; launched: number; clicks: number; boosts_sent: number; boosts_shared: number; squad: number }> {
    const { rows } = await this.db.query<{ launches: number; launched: number; clicks: number; boosts_sent: number; boosts_shared: number; squad: number }>(
      `select (select count(*)::int from launches) as launches,
              (select count(*)::int from launches where status in ('launched','reported')) as launched,
              (select count(*)::int from (select distinct launch_id, visitor from clicks) c) as clicks,
              (select count(*)::int from boosts where status in ('sent','shared')) as boosts_sent,
              (select count(*)::int from boosts where status = 'shared') as boosts_shared,
              (select count(distinct email)::int from launches l where join_squad and not exists (select 1 from optouts o where o.target = l.email)) as squad`,
    );
    return rows[0]!;
  }

  // ---------------------------------------------------------------- the radar (launches elsewhere)

  async addRadar(items: { source: string; title: string; url: string; company?: string | null; batch?: string | null; contact?: string | null; launched_at?: string | null }[]): Promise<number> {
    let added = 0;
    for (const item of items) {
      const { rows } = await this.db.query<{ id: string }>(
        `insert into radar (id, source, title, url, company, batch, contact, launched_at) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (url) do nothing returning id`,
        [id("rad"), item.source, item.title, item.url, item.company ?? null, item.batch ?? null, item.contact?.toLowerCase() ?? null, item.launched_at ?? null],
      );
      added += rows.length;
    }
    return added;
  }

  async listRadar(limit = 50): Promise<RadarItem[]> {
    const { rows } = await this.db.query<RadarItem>("select * from radar order by coalesce(launched_at, seen_at) desc limit $1", [limit]);
    return rows;
  }

  // ---------------------------------------------------------------- outreach

  /** Stamped with the same clock the quota and 7-day checks read, so they always agree. */
  async logTouch(input: { launch_id?: string | null; channel: string; kind: string; target?: string | null; content: string; external_id?: string | null }, now: Date): Promise<Touch> {
    const { rows } = await this.db.query<Touch>(
      "insert into touches (id, launch_id, channel, kind, target, content, external_id, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *",
      [id("tch"), input.launch_id ?? null, input.channel, input.kind, input.target?.toLowerCase() ?? null, input.content, input.external_id ?? null, now],
    );
    return rows[0]!;
  }

  async listTouches(limit = 30): Promise<Touch[]> {
    const { rows } = await this.db.query<Touch>("select * from touches order by created_at desc limit $1", [limit]);
    return rows;
  }

  async updateTouchMetrics(externalId: string, impressions: number, engagements: number): Promise<Touch | null> {
    const { rows } = await this.db.query<Touch>("update touches set impressions = $2, engagements = $3 where external_id = $1 returning *", [externalId, impressions, engagements]);
    return rows[0] ?? null;
  }

  async sentLastDay(now: Date): Promise<{ emails: number; posts: number }> {
    const { rows } = await this.db.query<{ channel: string; n: number }>(
      "select channel, count(*)::int as n from touches where created_at >= $1 group by channel", [new Date(now.getTime() - 24 * 3_600_000)],
    );
    const by = Object.fromEntries(rows.map((r) => [r.channel, r.n]));
    return { emails: by["email"] ?? 0, posts: (by["x"] ?? 0) + (by["social"] ?? 0) };
  }

  async blockedTargets(targets: string[], now: Date): Promise<Record<string, string>> {
    const wanted = [...new Set(targets.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (wanted.length === 0) return {};
    const blocked: Record<string, string> = {};
    const contacted = await this.db.query<{ target: string }>(
      "select distinct target from touches where target = any($1::text[]) and created_at >= $2", [wanted, new Date(now.getTime() - 7 * 24 * 3_600_000)],
    );
    for (const r of contacted.rows) blocked[r.target] = "contacted in the last 7 days";
    const customers = await this.db.query<{ email: string }>("select distinct email from launches where email = any($1::text[])", [wanted]);
    for (const r of customers.rows) blocked[r.email] = "already a Launchpad founder";
    const opted = await this.db.query<{ target: string }>("select target from optouts where target = any($1::text[])", [wanted]);
    for (const r of opted.rows) blocked[r.target] = "opted out";
    return blocked;
  }

  async optOut(target: string, reason?: string): Promise<void> {
    await this.db.query("insert into optouts (target, reason) values ($1,$2) on conflict (target) do nothing", [target.trim().toLowerCase(), reason ?? null]);
  }

  // ---------------------------------------------------------------- decisions, reports, feedback, runs

  async logDecision(input: { launch_id?: string | null; decision: string; reasoning: string; agent: string }): Promise<Decision> {
    const { rows } = await this.db.query<Decision>(
      "insert into decisions (id, launch_id, decision, reasoning, agent) values ($1,$2,$3,$4,$5) returning *",
      [id("dec"), input.launch_id ?? null, input.decision, input.reasoning, input.agent],
    );
    return rows[0]!;
  }

  async listDecisions(limit = 40): Promise<Decision[]> {
    const { rows } = await this.db.query<Decision>("select * from decisions order by created_at desc limit $1", [limit]);
    return rows;
  }

  async addReport(input: { launch_id: string; title: string; body: string; snapshot: Record<string, unknown>; agent: string }, now: Date): Promise<Report> {
    const { rows } = await this.db.query<Report>(
      "insert into reports (id, launch_id, title, body, snapshot, agent) values ($1,$2,$3,$4,$5::jsonb,$6) returning *",
      [id("rep"), input.launch_id, input.title, input.body, json(input.snapshot), input.agent],
    );
    await this.db.query("update launches set status = 'reported', reported_at = coalesce(reported_at, $2) where id = $1 and status = 'launched'", [input.launch_id, now]);
    return rows[0]!;
  }

  async getReport(reportId: string): Promise<Report | null> {
    const { rows } = await this.db.query<Report>("select * from reports where id = $1", [reportId]);
    return rows[0] ?? null;
  }

  async listReports(launchId?: string, limit = 50): Promise<Omit<Report, "body">[]> {
    const { rows } = await this.db.query<Omit<Report, "body">>(
      "select id, launch_id, title, snapshot, agent, created_at from reports where ($1::text is null or launch_id = $1) order by created_at desc limit $2",
      [launchId ?? null, limit],
    );
    return rows;
  }

  async addFeedback(launchId: string | null, source: string, text: string, email: string | null): Promise<void> {
    await this.db.query("insert into feedback (id, launch_id, source, email, text) values ($1,$2,$3,$4,$5)", [id("fb"), launchId, source, email?.toLowerCase() ?? null, text]);
  }

  async findLaunchesByEmail(email: string): Promise<Launch[]> {
    const { rows } = await this.db.query<Launch>("select * from launches where email = $1 order by created_at desc", [email.trim().toLowerCase()]);
    return rows;
  }

  async takeRun(agent: string, now: Date, leaseMinutes: number): Promise<{ ok: true; token: string } | { ok: false; started_at: Date }> {
    const token = `run_${randomBytes(6).toString("hex")}`;
    const { rows } = await this.db.query<{ token: string }>(
      `insert into runs (agent, token, started_at, ended_at) values ($1,$2,$3,null)
       on conflict (agent) do update set token = excluded.token, started_at = excluded.started_at, ended_at = null
       where runs.ended_at is not null or runs.started_at < $4 returning token`,
      [agent, token, now, new Date(now.getTime() - leaseMinutes * 60_000)],
    );
    if (rows.length > 0) return { ok: true, token };
    const held = await this.db.query<{ started_at: Date }>("select started_at from runs where agent = $1", [agent]);
    return { ok: false, started_at: held.rows[0]?.started_at ?? now };
  }

  async holdsRun(agent: string, token: string): Promise<boolean> {
    const { rows } = await this.db.query("select 1 from runs where agent = $1 and token = $2 and ended_at is null", [agent, token]);
    return rows.length > 0;
  }

  async endRun(agent: string, token: string, now: Date): Promise<boolean> {
    const { rows } = await this.db.query("update runs set ended_at = $3 where agent = $1 and token = $2 and ended_at is null returning agent", [agent, token, now]);
    return rows.length > 0;
  }

  async logIntervention(description: string): Promise<{ id: string }> {
    const { rows } = await this.db.query<{ id: string }>("insert into interventions (id, description) values ($1,$2) returning id", [id("hum"), description]);
    return rows[0]!;
  }

  async listInterventions(): Promise<{ id: string; description: string; created_at: Date }[]> {
    const { rows } = await this.db.query<{ id: string; description: string; created_at: Date }>("select * from interventions order by created_at desc limit 50");
    return rows;
  }
}
