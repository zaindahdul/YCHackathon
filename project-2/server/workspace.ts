/** All reads and writes for a founder's private workspace, and the view its pages render. */
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.ts";
import { PRODUCER_LOCAL, adviseWave, buildCommunities, buildDemo, buildKit, buildWavePlan, categorize, draftOutreach, draftReply, followupFor, missingFacts, parseComments, roleOutreach, withFacts } from "./producer.ts";
import { Repo, type Launch } from "./repo.ts";
import { TABS, type Attribution, type ChannelFunnel, type CommentCategory, type CommentInsights, type Commitment, type Community, type DemoPlan, type Facts, type LaunchComment, type NetworkMatch, type Outreach, type Tab, type WaveCheck, type WavePlan, type WorkspaceView } from "./workspace-types.ts";

const id = (p: string) => `${p}_${randomBytes(6).toString("hex")}`;
const j = (v: unknown) => JSON.stringify(v ?? null);
const RETURN_DAYS = 14;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

interface Row { facts: unknown; missing: string[]; producer: string | null; communities: Community[]; demo: DemoPlan | null; wave_plan: WavePlan[]; trial_accepted_at: Date | null; hours_saved: string | number | null }

export class Workspace {
  private readonly repo: Repo;
  constructor(private readonly db: Db) { this.repo = new Repo(db); }

  private async row(launchId: string): Promise<Row | null> {
    const { rows } = await this.db.query<Row>("select * from workspaces where launch_id = $1", [launchId]);
    return rows[0] ?? null;
  }

  async facts(launchId: string): Promise<Facts> { return withFacts((await this.row(launchId))?.facts); }

  /** Saves facts and re-derives what depends on them. A kit the founder may have edited is left alone. */
  async saveFacts(l: Launch, facts: Facts): Promise<void> {
    await this.db.query(
      `insert into workspaces (launch_id, facts, missing, communities, demo) values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)
       on conflict (launch_id) do update set facts = excluded.facts, missing = excluded.missing, communities = excluded.communities, demo = excluded.demo, updated_at = now()`,
      [l.id, j(facts), j(missingFacts(facts)), j(buildCommunities(l, facts)), j(buildDemo(l, facts))],
    );
  }

  /** Writes the kit once. Safe under double-clicks and retries; a failed run is released for another try. */
  async produce(launch: Launch, now: Date): Promise<{ produced: boolean; launch: Launch }> {
    if (launch.kit) return { produced: false, launch };
    const claimed = await this.repo.claimLaunch(launch.id, now);
    if (!claimed) return { produced: false, launch };
    try {
      const facts = await this.facts(launch.id);
      const kit = buildKit(claimed, facts, now);
      await this.db.query(
        `insert into workspaces (launch_id, facts, missing, producer, communities, demo, wave_plan) values ($1,$2::jsonb,$3::jsonb,$4,$5::jsonb,$6::jsonb,$7::jsonb)
         on conflict (launch_id) do update set missing = excluded.missing, producer = excluded.producer, communities = excluded.communities, demo = excluded.demo, wave_plan = excluded.wave_plan, updated_at = now()`,
        [launch.id, j(facts), j(missingFacts(facts)), PRODUCER_LOCAL, j(buildCommunities(claimed, facts)), j(buildDemo(claimed, facts)), j(buildWavePlan(claimed, now))],
      );
      for (const o of roleOutreach(claimed, facts)) {
        await this.db.query("insert into outreach (id, launch_id, name, contact, why, draft) values ($1,$2,$3,'',$4,$5) on conflict (launch_id, name, contact) do nothing", [id("out"), launch.id, o.name, o.why, o.draft]);
      }
      const saved = await this.repo.saveKit(launch.id, kit, now);
      await this.repo.logDecision({ launch_id: launch.id, decision: "kit", reasoning: "A kit was written from the founder's intake by the local template producer.", agent: "local-template" });
      return { produced: true, launch: saved };
    } catch (error) {
      await this.db.query("update launches set status = 'new', claimed_at = null where id = $1 and status = 'drafting'", [launch.id]);
      throw error;
    }
  }

  // ---------------------------------------------------------------- outreach

  private optedOut = async (contact: string) => contact !== "" && (await this.db.query("select 1 from optouts where target = $1", [contact.trim().toLowerCase()])).rows.length > 0;

  async addOutreach(l: Launch, name: string, contact: string, why: string): Promise<string> {
    if (!name || !why) return "Add a name and why they're relevant.";
    if (await this.optedOut(contact)) return "This person has opted out, so no draft was created.";
    const { rows } = await this.db.query("insert into outreach (id, launch_id, name, contact, why, draft) values ($1,$2,$3,$4,$5,$6) on conflict (launch_id, name, contact) do nothing returning id",
      [id("out"), l.id, name.slice(0, 120), contact.slice(0, 254), why.slice(0, 600), draftOutreach(l, await this.facts(l.id), name, why)]);
    return rows.length ? "Draft added for review." : "You already have a draft for this person.";
  }

  async updateOutreach(launchId: string, outId: string, action: string, draft: string, now: Date): Promise<string> {
    const { rows } = await this.db.query<Outreach>("select * from outreach where id = $1 and launch_id = $2", [outId, launchId]);
    const o = rows[0];
    if (!o) return "That draft no longer exists.";
    const set = (status: string, extra = "") => this.db.query(`update outreach set status = $3, updated_at = now()${extra} where id = $1 and launch_id = $2`, [outId, launchId, status]);
    if (action === "opt_out") {
      if (o.contact) await this.repo.optOut(o.contact, "marked by the founder in outreach");
      await set("opted_out");
      return "Marked as opted out. No more drafts for this person.";
    }
    if (o.status === "opted_out" || (await this.optedOut(o.contact))) return "This person opted out, so this draft is locked.";
    if (action === "save") {
      if (!draft.trim()) return "A draft can't be empty.";
      await this.db.query("update outreach set draft = $3, status = 'draft', approved_at = null, updated_at = now() where id = $1 and launch_id = $2 and status <> 'sent_manual'", [outId, launchId, draft.slice(0, 4000)]);
      return "Saved. Approve it again before sending.";
    }
    if (action === "approve") {
      if (o.status === "sent_manual") return "This one has already been sent.";
      await this.db.query("update outreach set status = 'approved', approved_at = $3, draft = coalesce($4, draft), updated_at = now() where id = $1 and launch_id = $2", [outId, launchId, now, draft.trim() ? draft.slice(0, 4000) : null]);
      return "Approved. Launchpad never sends this for you. Send it yourself, then mark it sent.";
    }
    if (action === "sent") {
      if (o.status !== "approved") return "Approve this draft before marking it sent.";
      if (!o.contact) return "This is a suggested role, not a person. Add a real recipient first.";
      await this.db.query("update outreach set status = 'sent_manual', sent_at = $3, updated_at = now() where id = $1 and launch_id = $2 and status = 'approved'", [outId, launchId, now]);
      return "Recorded as sent by you.";
    }
    return "Unknown action.";
  }

  // ---------------------------------------------------------------- comments

  async importComments(l: Launch, platform: string, raw: string): Promise<string> {
    const parsed = parseComments(raw);
    if (parsed.length === 0) return "Paste at least one comment, like: name: their comment";
    const facts = await this.facts(l.id);
    let added = 0;
    for (const c of parsed) {
      const hash = createHash("sha256").update(`${platform}|${c.author.toLowerCase()}|${c.body.replace(/\s+/g, " ").trim().toLowerCase()}`).digest("hex");
      const category = categorize(c.body);
      const reply = draftReply(l, facts, c.author, c.body, category);
      const { rows } = await this.db.query(
        `insert into launch_comments (id, launch_id, hash, platform, author, url, body, category, status, draft, fact_refs, unknown)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) on conflict (launch_id, hash) do nothing returning id`,
        [id("cmt"), l.id, hash, platform, c.author, c.url, c.body, category, reply.status, reply.draft, j(reply.fact_refs), reply.unknown],
      );
      added += rows.length;
    }
    const dupes = parsed.length - added;
    return `Imported ${added} comment${added === 1 ? "" : "s"} by hand${dupes ? `, skipped ${dupes} duplicate${dupes === 1 ? "" : "s"}` : ""}.`;
  }

  async updateComment(launchId: string, commentId: string, action: string, draft: string): Promise<string> {
    const { rows } = await this.db.query<LaunchComment>("select * from launch_comments where id = $1 and launch_id = $2", [commentId, launchId]);
    const c = rows[0];
    if (!c) return "That comment no longer exists.";
    const write = (status: string, text = c.draft, unknown = c.unknown) => this.db.query("update launch_comments set status = $3, draft = $4, unknown = $5 where id = $1 and launch_id = $2", [commentId, launchId, status, text, unknown]);
    switch (action) {
      case "save":
        if (!draft.trim()) return "A reply can't be empty.";
        await write("needs_review", draft.slice(0, 2000), null);
        return "Reply saved.";
      case "approve": {
        const text = draft.trim() || c.draft;
        if (!text.trim()) return "Write a reply before approving it.";
        await write("approved", text.slice(0, 2000), null);
        return "Approved. Post it yourself, then mark it posted.";
      }
      case "posted":
        if (c.status !== "approved") return "Approve this reply before marking it posted.";
        await write("posted_manual");
        return "Recorded as posted by you.";
      case "ignore": await write("ignored"); return "Ignored.";
      case "escalate": await write("needs_founder", c.draft, c.unknown ?? `Needs your answer: "${c.body.slice(0, 140)}"`); return "Marked as needing your answer.";
      default: return "Unknown action.";
    }
  }

  private insights(comments: LaunchComment[]): CommentInsights {
    const by_category: Record<CommentCategory, number> = { question: 0, buying_intent: 0, objection: 0, support: 0, praise: 0, low_value: 0 };
    for (const c of comments) by_category[c.category]++;
    return {
      total: comments.length, by_category,
      unanswered: comments.filter((c) => ["needs_review", "needs_founder", "approved"].includes(c.status)).length,
      top_questions: comments.filter((c) => c.category === "question").slice(0, 8).map((c) => ({ text: c.body, comment_id: c.id })),
      objections: comments.filter((c) => c.category === "objection").slice(0, 8).map((c) => ({ text: c.body, comment_id: c.id })),
      interested: comments.filter((c) => c.category === "buying_intent").slice(0, 8).map((c) => ({ author: c.author, comment_id: c.id })),
    };
  }

  // ---------------------------------------------------------------- numbers and attribution

  async addWaveCheck(launchId: string, channel: string, minutes: number, impressions: number, likes: number, replies: number): Promise<void> {
    await this.db.query("insert into wave_checks (id, launch_id, channel, minutes_since_post, impressions, likes, replies) values ($1,$2,$3,$4,$5,$6,$7)", [id("wav"), launchId, channel, minutes, impressions, likes, replies]);
  }

  /** One event per visitor, per event type, per UTC day. Repeat reloads don't inflate anything. */
  async recordEvent(launchId: string, visitor: string, event: string, qa: boolean, now: Date): Promise<void> {
    await this.db.query("insert into product_events (id, launch_id, visitor, event, qa, day, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict (launch_id, visitor, event, day) do nothing", [id("evt"), launchId, visitor, event, qa, dayOf(now), now]);
  }

  async attribution(l: Launch, origin: string): Promise<Attribution> {
    const clicks = (await this.db.query<{ channel: string; visitor: string }>("select channel, visitor from clicks where launch_id = $1 order by created_at asc, id asc", [l.id])).rows;
    const events = (await this.db.query<{ visitor: string; event: string; qa: boolean; day: string }>("select visitor, event, qa, day from product_events where launch_id = $1 order by day asc", [l.id])).rows;
    const firstTouch = new Map<string, string>();
    const funnel = new Map<string, ChannelFunnel>();
    const slot = (channel: string) => { if (!funnel.has(channel)) funnel.set(channel, { channel, clicks: 0, visitors: 0, activated: 0, returned: 0 }); return funnel.get(channel)!; };
    for (const c of clicks) { if (!firstTouch.has(c.visitor)) firstTouch.set(c.visitor, c.channel); slot(c.channel).clicks++; }
    const live = events.filter((e) => !e.qa);
    const channelOf = (v: string) => firstTouch.get(v) ?? "unattributed";
    const visited = new Set(live.filter((e) => e.event === "visit").map((e) => e.visitor));
    const activeDays = new Map<string, string[]>();
    for (const e of live) if (e.event === "activate") activeDays.set(e.visitor, [...(activeDays.get(e.visitor) ?? []), e.day]);
    let returned = 0;
    for (const v of visited) slot(channelOf(v)).visitors++;
    for (const [v, days] of activeDays) {
      const s = slot(channelOf(v));
      s.activated++;
      if (days.slice(1).some((d) => { const gap = daysBetween(days[0]!, d); return gap > 0 && gap <= RETURN_DAYS; })) { s.returned++; returned++; }
    }
    return {
      rules: `Credit goes to the first tracked link a visitor clicked. Visits and activations are counted once per visitor per day, and QA traffic is excluded. A return means activating again on a later calendar day within ${RETURN_DAYS} days. Show HN and Product Hunt use your real URL, so they appear as unattributed. Visitors are estimated from a hashed browser and network signature, not identified people.`,
      funnel: [...funnel.values()].sort((a, b) => b.activated - a.activated || b.clicks - a.clicks),
      totals: { clicks: clicks.length, visitors: visited.size, activated: activeDays.size, returned, qa_excluded: events.filter((e) => e.qa).length },
      return_window_days: RETURN_DAYS,
      snippet: `<script src="${origin}/t.js" data-launch="${l.slug}" async></script>\n<!-- Call window.launchpad.activate() when someone completes your core action. -->`,
    };
  }

  // ---------------------------------------------------------------- deal, network, commitments

  async acceptTrial(launchId: string, now: Date): Promise<void> {
    await this.db.query("insert into workspaces (launch_id, trial_accepted_at) values ($1,$2) on conflict (launch_id) do update set trial_accepted_at = coalesce(workspaces.trial_accepted_at, excluded.trial_accepted_at)", [launchId, now]);
  }
  async setHours(launchId: string, hours: number): Promise<void> {
    await this.db.query("insert into workspaces (launch_id, hours_saved) values ($1,$2) on conflict (launch_id) do update set hours_saved = excluded.hours_saved", [launchId, hours]);
  }

  /** Only founders who joined the squad and listed their launch can appear here. */
  async matches(l: Launch, ask: string): Promise<NetworkMatch[]> {
    const words = new Set((ask.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !["need", "help", "with", "find", "want", "someone", "founders", "looking", "from", "that", "have", "about"].includes(w)));
    if (words.size === 0) return [];
    const { rows } = await this.db.query<Launch>(
      `select l.* from launches l where l.join_squad and l.listed and l.id <> $1 and l.email <> $2 and l.status in ('ready','launched','reported')
       and not exists (select 1 from optouts o where o.target = l.email) order by l.created_at desc limit 200`, [l.id, l.email]);
    return rows.map((o) => {
      const theirs = new Set(`${o.one_liner} ${o.description}`.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []);
      const hits = [...words].filter((w) => theirs.has(w));
      return { company: o.company, one_liner: o.one_liner, url: o.url, score: hits.length, why: `Their launch mentions ${hits.slice(0, 4).map((h) => `"${h}"`).join(", ")}, which overlaps what you asked for. This is a keyword match on what they published.`, ask: `Saw ${o.company} on Launchpad. We're working on: ${ask.slice(0, 200)}. Have you dealt with this? Would love 10 minutes on what you learned.` };
    }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }

  async addCommitment(launchId: string, person: string, context: string, promise: string, due: string): Promise<string> {
    if (!person || !promise) return "Add who it's for and what you promised.";
    await this.db.query("insert into commitments (id, launch_id, person, context, promise, due, followup) values ($1,$2,$3,$4,$5,$6,$7)", [id("cmm"), launchId, person.slice(0, 120), context.slice(0, 400), promise.slice(0, 600), due.slice(0, 60) || null, followupFor(person, context, promise)]);
    return "Saved. A follow-up draft is ready.";
  }
  async setCommitment(launchId: string, cid: string, status: "open" | "done"): Promise<void> {
    await this.db.query("update commitments set status = $3 where id = $1 and launch_id = $2", [cid, launchId, status]);
  }

  // ---------------------------------------------------------------- the view

  async view(l: Launch, opts: { tab: string | null; origin: string; notice: string | null; ask: string }): Promise<WorkspaceView> {
    const tab: Tab = (TABS as readonly string[]).includes(opts.tab ?? "") ? (opts.tab as Tab) : "kit";
    const row = await this.row(l.id);
    const facts = withFacts(row?.facts);
    const [outreach, comments, checks, commitments, links, stats, overview, reports, attribution, matches] = await Promise.all([
      this.db.query<Outreach>("select * from outreach where launch_id = $1 order by created_at asc", [l.id]),
      this.db.query<LaunchComment>("select * from launch_comments where launch_id = $1 order by created_at asc", [l.id]),
      this.db.query<WaveCheck>("select * from wave_checks where launch_id = $1 order by created_at asc", [l.id]),
      this.db.query<Commitment>("select * from commitments where launch_id = $1 order by status desc, created_at desc", [l.id]),
      this.repo.linksFor(l.id), this.repo.stats(l.id), this.repo.overview(), this.repo.listReports(l.id),
      this.attribution(l, opts.origin), this.matches(l, opts.ask),
    ]);
    return {
      launch: l, tab, origin: opts.origin, token: l.token, notice: opts.notice,
      facts, missing: row?.missing ?? missingFacts(facts), producer: row?.producer ?? null, is_sample: l.company.toLowerCase().includes("(sample)"),
      links, stats, squad: Math.max(0, overview.squad - (l.join_squad ? 1 : 0)), reports,
      communities: row?.communities ?? [], demo: row?.demo ?? null, wave_plan: row?.wave_plan ?? [],
      outreach: outreach.rows, comments: comments.rows, insights: this.insights(comments.rows),
      checks: checks.rows, advice: adviseWave(checks.rows, facts), attribution,
      deal: {
        price_usd: 299, paid: false, trial_accepted_at: row?.trial_accepted_at ?? null, hours_saved: row?.hours_saved == null ? null : Number(row.hours_saved),
        deliverables: ["A launch kit for every channel", "Community shortlist with reasons and rules", "A demo cut you can post", "Reviewed outreach drafts", "A reply desk for launch comments", "Attribution through to real product use"],
      },
      ask: opts.ask, matches: matches, commitments: commitments.rows,
    };
  }
}
