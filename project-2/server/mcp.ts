/**
 * The `/mcp` endpoint: Launchpad's tools, as the agents see them (`launchpad.<tool>`).
 * JSON-RPC over POST (initialize, tools/list, tools/call), implemented by hand as in Naïve's own
 * agency blueprint. The platform does not say which agent is calling, so tools that hold a run
 * lock take `agent`.
 */
import { CHANNEL_NAMES, CHANNELS, KitError, capsFromEnv, isEmail, maskEmail, validateKit, type Caps, type Kit } from "./rules.ts";
import { RepoError, type Launch, type Repo } from "./repo.ts";

export interface McpContext { repo: Repo; origin: string; caps: Caps; now?: () => Date }

const str = (description: string) => ({ type: "string", description }) as const;
const int = (description: string) => ({ type: "integer", minimum: 0, description }) as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required }) as const;
const AGENT = { type: "string", enum: ["producer", "booster", "scout"], description: "Your agent name" } as const;

export const RUN_LEASE_MINUTES = 12;
export const REPORT_GUIDE =
  "Markdown, at least 400 characters, with ## sections: The launch (what, when, which channels), What we did (timing calls, the copy angles, boosts sent), Results by channel (the studio's click counts per channel and boosts shared, quoted exactly), What worked and what didn't, Recommendations for their next launch. Honest: never round a zero up.";

export const KIT_GUIDE = `The kit is one JSON object:
{ "strategy": markdown, 80-4000 chars: the plan and why (what is launching this week that competes for attention, the angle, the order of channels),
  "timing": [{ "channel": one of ${CHANNELS.join("|")}, "when": a concrete time with timezone, e.g. "Sun Nov 8, 6:30 AM PT", "why": the reason }],
  "posts": {
    "x": [thread of 1-8 posts, each <= 280 chars; put {link} where the tracked link goes],
    "linkedin": "80-3000 chars, with {link}",
    "show_hn": { "title": "Show HN: ... (<= 80)", "text": "80-2000 chars, plain, technical, no hype" },
    "product_hunt": { "tagline": "<= 60", "description": "<= 260", "first_comment": "the maker's first comment, 80-1500" },
    "launch_yc": { "title": "<= 90", "body": "200-5000 chars in the Launch YC style (problem, solution, ask), with {link}" },
    "email": { "subject": "<= 120", "body": "a note the founder sends to friends, investors and customers, with {link}" } },
  "boost_text": "<= 240 chars, the post squad members share, written in their voice, with {link}",
  "checklist": ["up to 15 concrete steps for launch day"] }
Write only the channels the founder chose. The studio swaps {link} for a tracked link per channel.`;

export const TOOLS = [
  {
    name: "get_work",
    description: "Start every run here. Takes your run lock and returns your queue and run_token (pass it to end_run when you finish). If it answers busy, another run of yours is working: stop at once. producer: new launches to write kits for, launched ones due a report, and the launch radar. booster: boosts to email. scout: the radar, recent outreach and today's quota.",
    inputSchema: obj({ agent: AGENT, run_token: str("This run's token, if it already has one") }, ["agent"]),
  },
  { name: "end_run", description: "Release your run lock as the last thing you do.", inputSchema: obj({ agent: AGENT, run_token: str("From get_work") }, ["agent", "run_token"]) },
  {
    name: "claim_launch",
    description: "Claim a new launch before writing its kit, so no other run writes it twice. Returns everything the founder told us.",
    inputSchema: obj({ id: str("Launch id (lch_...)") }, ["id"]),
  },
  {
    name: "save_kit",
    description: `Save the launch kit for a claimed launch. It goes live on the founder's private kit page at once, with one-click share buttons and tracked links. ${KIT_GUIDE} Refused with the reason if a field is missing or too long: fix it and save again.`,
    inputSchema: obj({ id: str("Launch id"), kit: { type: "object", description: "The kit object described above" } }, ["id", "kit"]),
  },
  {
    name: "get_launch",
    description: "One launch: what the founder told us, its kit, its status, click counts per channel, boosts sent and shared, and its kit page URL.",
    inputSchema: obj({ id: str("Launch id") }, ["id"]),
  },
  {
    name: "write_launch_report",
    description: `After a launch has been out for a while, write the founder a detailed report of what happened. ${REPORT_GUIDE} The studio attaches its own numbers and publishes the report on the founder's kit page.`,
    inputSchema: obj({ id: str("Launch id"), title: str("A specific headline, e.g. 'X drove 41 of 63 clicks; the squad shared it 9 times'"), body: str(REPORT_GUIDE) }, ["id", "title", "body"]),
  },
  {
    name: "mark_boosts_sent",
    description: "Record the boosts you just emailed, by boost_id.",
    inputSchema: obj({ ids: { type: "array", items: { type: "string" }, maxItems: 50, description: "boost_id values" } }, ["ids"]),
  },
  {
    name: "add_radar",
    description: "Record launches you found elsewhere (Launch YC, Product Hunt, Show HN, X): they show what competes for attention on a given day, and their founders are people Launchpad can help.",
    inputSchema: obj({
      items: {
        type: "array", maxItems: 50,
        items: obj({ source: str("launch_yc | product_hunt | show_hn | x | other"), title: str("What launched"), url: str("Its URL"), company: str("Company"), batch: str("YC batch, if known"), contact: str("A public business email, if listed"), launched_at: str("ISO time, if known") }, ["source", "title", "url"]),
      },
    }, ["items"]),
  },
  {
    name: "outreach_quota",
    description: "How many emails and posts the studio may still send in the rolling 24 hours, and which of the given addresses must not be contacted (contacted in the last 7 days, already a customer, or opted out). Call it before every batch.",
    inputSchema: obj({ targets: { type: "array", items: { type: "string" }, maxItems: 50, description: "Addresses you plan to email" } }),
  },
  {
    name: "log_touch",
    description: "Record one outreach action right after it happens: an email (target = the address) or a post (external_id = the id social.post returned). Refused over quota or for a blocked address.",
    inputSchema: obj({ channel: str("email | x | social"), kind: str("email | post | reply"), content: str("The exact text sent"), target: str("Recipient address"), external_id: str("Post id"), launch_id: str("The launch it promoted, if any") }, ["channel", "kind", "content"]),
  },
  {
    name: "update_touch_metrics",
    description: "Store a post's latest numbers from social.status.",
    inputSchema: obj({ external_id: str("Post id"), impressions: int("Impressions"), engagements: int("Engagements") }, ["external_id", "impressions", "engagements"]),
  },
  {
    name: "log_decision",
    description: "Record a decision and why: a timing call, a copy angle, who to reach and why. Shown on the public ops page.",
    inputSchema: obj({ agent: str("Your agent name"), launch_id: str("The launch it is about, if any"), decision: str("A short label, e.g. timing, angle, outreach, skip"), reasoning: str("Why") }, ["agent", "decision", "reasoning"]),
  },
  {
    name: "find_launch",
    description: "Find a founder's launches by their email address (for the inbox): status, kit page link, stats.",
    inputSchema: obj({ email: str("The founder's address") }, ["email"]),
  },
  {
    name: "add_feedback",
    description: "File what a founder or squad member said, faithfully.",
    inputSchema: obj({ text: str("What they said"), email: str("Their address"), launch_id: str("Launch id, if known") }, ["text"]),
  },
  {
    name: "opt_out",
    description: "Someone asked not to be contacted again (or to leave the boost squad). Nobody contacts them after this.",
    inputSchema: obj({ target: str("Their address"), reason: str("What they said") }, ["target"]),
  },
] as const;

export class ToolError extends Error {}

const need = (args: Record<string, unknown>, key: string, max = 4000): string => {
  const v = args[key];
  if (typeof v !== "string" || v.trim() === "") throw new ToolError(`${key} is required`);
  if (v.length > max) throw new ToolError(`${key} is too long (max ${max})`);
  return v.trim();
};
const opt = (args: Record<string, unknown>, key: string, max = 4000): string | undefined => {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ToolError(`${key} must be a string`);
  if (v.length > max) throw new ToolError(`${key} is too long (max ${max})`);
  return v.trim();
};

export const kitUrl = (origin: string, l: Launch) => `${origin}/k/${l.slug}?t=${l.token}`;

/** A one-line record of a kit for the public log: the plan's first sentence and every timing call. */
export function kitSummary(kit: Kit): string {
  const plain = kit.strategy.replace(/[*_`#>]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  const first = (/^.*?[.!?](?=\s|$)/.exec(plain)?.[0] ?? plain).slice(0, 300);
  const timing = kit.timing.map((t) => `${CHANNEL_NAMES[t.channel]} ${t.when}`).join(" · ");
  return `${first} Timing: ${timing}.`;
}
export const boostUrl = (origin: string, code: string) => `${origin}/b/${code}`;

const brief = (origin: string, l: Launch) => ({
  id: l.id, company: l.company, one_liner: l.one_liner, url: l.url, status: l.status, channels: l.channels, launch_when: l.launch_when,
  timezone: l.timezone, created_at: l.created_at, launched_at: l.launched_at, email: maskEmail(l.email), kit_url: kitUrl(origin, l),
});

export async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext): Promise<unknown> {
  const { repo, origin } = ctx;
  const now = () => ctx.now?.() ?? new Date();
  const launchOf = async (key = "id") => {
    const l = await repo.getLaunch(need(args, key, 64));
    if (!l) throw new ToolError("no such launch");
    return l;
  };

  switch (name) {
    case "get_work": {
      const agent = need(args, "agent", 20);
      if (!["producer", "booster", "scout"].includes(agent)) throw new ToolError("agent must be producer, booster or scout");
      const given = opt(args, "run_token", 64);
      let runToken = given;
      if (!given || !(await repo.holdsRun(agent, given, now(), RUN_LEASE_MINUTES))) {
        const lease = await repo.takeRun(agent, now(), RUN_LEASE_MINUTES);
        if (!lease.ok) return { busy: true, message: `Another ${agent} run started ${Math.round((now().getTime() - new Date(lease.started_at).getTime()) / 60_000)} min ago and is still working. Stop now.` };
        runToken = lease.token;
      }
      if (agent === "producer") {
        const fresh = [...(await repo.listLaunches({ status: "new", limit: 10 })), ...(await repo.listLaunches({ status: "drafting", limit: 10 }))];
        const launched = await repo.listLaunches({ status: "launched", limit: 50 });
        const due = launched.filter((l) => l.launched_at && now().getTime() - new Date(l.launched_at).getTime() >= 2 * 3_600_000);
        return {
          now: now().toISOString(), run_token: runToken,
          write_kits_for: fresh.map((l) => brief(origin, l)),
          report_on: due.map((l) => brief(origin, l)),
          radar: (await repo.listRadar(30)).map(({ contact: _c, ...r }) => r),
          next: fresh.length ? "Claim each launch, research, save_kit, then email the founder their kit_url." : due.length ? "Write a report for each launch in report_on, then email the founder." : "Nothing to do: end_run and stop.",
        };
      }
      if (agent === "booster") {
        const boosts = await repo.pendingBoosts(20, ctx.caps, now());
        return {
          now: now().toISOString(), run_token: runToken,
          boosts: boosts.map((b) => ({ ...b, boost_url: boostUrl(origin, b.code) })),
          next: boosts.length ? "Email each squad member one short note with their boost_url, then mark_boosts_sent." : "Nothing to send: end_run and stop.",
        };
      }
      const sent = await repo.sentLastDay(now());
      return {
        now: now().toISOString(), run_token: runToken,
        studio: await repo.overview(),
        quota: { emails_left: Math.max(0, ctx.caps.emailsPerDay - sent.emails), posts_left: Math.max(0, ctx.caps.postsPerDay - sent.posts) },
        radar: await repo.listRadar(40),
        recent_outreach: (await repo.listTouches(30)).map((t) => ({ channel: t.channel, target: t.target, content: t.content.slice(0, 200), created_at: t.created_at })),
        signup_url: `${origin}/new`,
      };
    }

    case "end_run": return { released: await repo.endRun(need(args, "agent", 20), need(args, "run_token", 64), now()) };

    case "claim_launch": {
      const l = await repo.claimLaunch(need(args, "id", 64), now());
      if (!l) throw new ToolError("not claimable: it is already being written or done");
      return { ...brief(origin, l), description: l.description, video_url: l.video_url, batch: l.batch, x_handle: l.x_handle, linkedin_url: l.linkedin_url, join_squad: l.join_squad, kit_guide: KIT_GUIDE };
    }

    case "save_kit": {
      const l = await launchOf();
      try {
        const kit = validateKit(args["kit"], l.channels);
        const saved = await repo.saveKit(l.id, kit, now());
        await repo.logDecision({ launch_id: l.id, decision: "kit", reasoning: kitSummary(kit), agent: "producer" });
        return { kit_url: kitUrl(origin, saved), email_founder: `Email ${l.email} their kit_url now: what is in it, the first step, and that the Launch now button rallies the boost squad.`, founder_email: l.email };
      } catch (error) {
        if (error instanceof KitError || error instanceof RepoError) throw new ToolError(error.message);
        throw error;
      }
    }

    case "get_launch": {
      const l = await launchOf();
      return { ...brief(origin, l), description: l.description, kit: l.kit, stats: await repo.stats(l.id), reciprocity: await repo.reciprocity(l.id), reports: await repo.listReports(l.id) };
    }

    case "write_launch_report": {
      const l = await launchOf();
      if (l.status !== "launched" && l.status !== "reported") throw new ToolError("only a launch that has gone out can be reported on");
      const body = need(args, "body", 20_000);
      if (body.length < 400 || (body.match(/^##\s+\S/gm) ?? []).length < 3) throw new ToolError(`the report needs at least 400 characters and ## sections. ${REPORT_GUIDE}`);
      const report = await repo.addReport({ launch_id: l.id, title: need(args, "title", 160), body, snapshot: { ...(await repo.stats(l.id)), launched_at: l.launched_at }, agent: "producer" }, now());
      return { report_url: `${origin}/r/${report.id}`, kit_url: kitUrl(origin, l), founder_email: l.email };
    }

    case "mark_boosts_sent": {
      const ids = args["ids"];
      if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) throw new ToolError("ids must be a list of boost ids");
      return { marked: await repo.markBoostsSent(ids as string[], now()) };
    }

    case "add_radar": {
      const items = args["items"];
      if (!Array.isArray(items) || items.length === 0) throw new ToolError("items must be a non-empty list");
      const clean = (items as Record<string, unknown>[]).map((i) => {
        const url = typeof i["url"] === "string" ? i["url"].trim() : "";
        if (!/^https?:\/\//.test(url) || typeof i["title"] !== "string" || typeof i["source"] !== "string") throw new ToolError("each item needs source, title and an http(s) url");
        const contact = typeof i["contact"] === "string" && isEmail(i["contact"]) ? i["contact"] : null;
        return { source: i["source"].slice(0, 30), title: i["title"].slice(0, 200), url: url.slice(0, 500), company: typeof i["company"] === "string" ? i["company"].slice(0, 120) : null, batch: typeof i["batch"] === "string" ? i["batch"].slice(0, 10) : null, contact, launched_at: typeof i["launched_at"] === "string" && !Number.isNaN(Date.parse(i["launched_at"])) ? i["launched_at"] : null };
      });
      return { added: await repo.addRadar(clean) };
    }

    case "outreach_quota": {
      const targets = Array.isArray(args["targets"]) ? (args["targets"] as unknown[]).filter((t): t is string => typeof t === "string") : [];
      const sent = await repo.sentLastDay(now());
      return { emails_left: Math.max(0, ctx.caps.emailsPerDay - sent.emails), posts_left: Math.max(0, ctx.caps.postsPerDay - sent.posts), blocked_targets: await repo.blockedTargets(targets, now()) };
    }

    case "log_touch": {
      const channel = need(args, "channel", 20);
      if (!["email", "x", "social"].includes(channel)) throw new ToolError("channel must be email, x or social");
      const target = opt(args, "target", 254);
      if (channel === "email" && !target) throw new ToolError("an email needs target");
      const sent = await repo.sentLastDay(now());
      if (channel === "email" && sent.emails >= ctx.caps.emailsPerDay) throw new ToolError("the email quota for the last 24h is used up");
      if (channel !== "email" && sent.posts >= ctx.caps.postsPerDay) throw new ToolError("the post quota for the last 24h is used up");
      if (target) {
        const blocked = (await repo.blockedTargets([target], now()))[target.toLowerCase()];
        if (blocked) throw new ToolError(`${target} must not be contacted: ${blocked}`);
      }
      return await repo.logTouch({ channel, kind: need(args, "kind", 20), content: need(args, "content", 6000), target: target ?? null, external_id: opt(args, "external_id", 200) ?? null, launch_id: opt(args, "launch_id", 64) ?? null });
    }

    case "update_touch_metrics": {
      const t = await repo.updateTouchMetrics(need(args, "external_id", 200), Number(args["impressions"]) || 0, Number(args["engagements"]) || 0);
      if (!t) throw new ToolError("no such post");
      return t;
    }

    case "log_decision":
      return await repo.logDecision({ launch_id: opt(args, "launch_id", 64) ?? null, decision: need(args, "decision", 40), reasoning: need(args, "reasoning", 2000), agent: need(args, "agent", 20) });

    case "find_launch": {
      const email = need(args, "email", 254);
      const found = await repo.findLaunchesByEmail(email);
      return Promise.all(found.map(async (l) => ({ ...brief(origin, l), stats: await repo.stats(l.id) })));
    }

    case "add_feedback": {
      const email = opt(args, "email", 254);
      await repo.addFeedback(opt(args, "launch_id", 64) ?? null, "email", need(args, "text", 4000), email && isEmail(email) ? email : null);
      return { filed: true };
    }

    case "opt_out": {
      const target = need(args, "target", 254);
      await repo.optOut(target, opt(args, "reason", 500));
      return { target: target.toLowerCase(), opted_out: true };
    }

    default:
      throw new ToolError(`unknown tool: ${name}`);
  }
}

interface JsonRpcRequest { jsonrpc?: string; id?: number | string | null; method?: unknown; params?: Record<string, unknown> }
const rpcResult = (id: JsonRpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: JsonRpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMcp(message: unknown, ctx: McpContext): Promise<object | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return rpcError(null, -32600, "invalid request");
  const msg = message as JsonRpcRequest;
  if (typeof msg.method !== "string") return rpcError(msg.id, -32600, "invalid request");
  if (msg.method.startsWith("notifications/")) return null;
  switch (msg.method) {
    case "initialize": return rpcResult(msg.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "launchpad", version: "0.1.0" } });
    case "ping": return rpcResult(msg.id, {});
    case "tools/list": return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args } = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      try {
        return rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(await callTool(name ?? "", args ?? {}, ctx)) }] });
      } catch (error) {
        if (error instanceof ToolError) return rpcResult(msg.id, { content: [{ type: "text", text: error.message }], isError: true });
        throw error;
      }
    }
    default: return rpcError(msg.id, -32601, "method not found");
  }
}

export { capsFromEnv };
