/**
 * The `/mcp` endpoint: the company's tools, as the agents see them.
 *
 * The app is declared with `mcp: "/mcp"` in naive.config.ts, so every agent in the project is
 * offered these as `pmf.<tool>` on each turn, under its own allow/ask/deny policy. MCP's
 * streamable-HTTP transport is JSON-RPC over POST; the subset agents use (initialize, tools/list,
 * tools/call) is implemented by hand, as in Naïve's own agency blueprint, with no SDK dependency.
 */
import type { Caps } from "./rules.ts";
import { DEFAULT_THRESHOLDS } from "./rules.ts";
import {
  CHANNELS, DECISION_KINDS, EXPERIMENT_STATUSES, TOUCH_KINDS, type Channel, type DecisionKind,
  type ExperimentStatus, type Repo, type ScoredExperiment, type TouchKind,
} from "./repo.ts";

export interface McpContext {
  repo: Repo;
  origin: string;
  caps: Caps;
  maxLive: number;
  now?: () => Date;
}

const str = (description: string) => ({ type: "string", description }) as const;
const int = (description: string) => ({ type: "integer", minimum: 0, description }) as const;
const strings = (description: string, maxItems = 10) => ({ type: "array", items: { type: "string" }, maxItems, description }) as const;
const oneOf = (values: readonly string[], description: string) => ({ type: "string", enum: values, description }) as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required }) as const;

export const TOOLS = [
  {
    name: "get_scoreboard",
    description:
      "The company's whole state in one read: the current time, today's outreach quota, and every experiment with its landing page URL, its numbers (age, outreach, impressions, landing visitors, signups, deliveries) and the rule-based verdict (too_early | no_reach | keep | scale | kill) with the reason. Read this first, every run.",
    inputSchema: obj({}),
  },
  {
    name: "create_experiment",
    description:
      "Launch a new experiment: one offer for one audience, with its own live landing page that collects signups. Logged as a launch (or a pivot, when parent_id is given). At most a few experiments may be live at once; kill or pause one first if this is refused. The deliverable must be something an agent can produce and email within 30 minutes.",
    inputSchema: obj(
      {
        name: str("Short internal name, e.g. 'Launch-day QA teardown'"),
        hypothesis: str("What you believe and how this experiment tests it, in one or two sentences"),
        audience: str("Exactly who this is for and where they can be reached this weekend"),
        offer: str("The free offer, in one sentence"),
        deliverable: str("Exactly what the operator will produce and email to each signup, and roughly how long it is"),
        headline: str("Landing page headline (under 70 characters)"),
        subhead: str("Landing page subheadline (one or two sentences)"),
        bullets: strings("2 to 5 short lines on what they get", 5),
        cta: str("Button label, e.g. 'Get my free teardown'"),
        ask_label: str("Label for the form field where they describe what they need, e.g. 'Paste your app's link and tell us what it does'"),
        channels: { type: "array", items: { type: "string", enum: ["x", "email"] }, description: "Where growth should promote it" },
        parent_id: str("For a pivot: the id of the experiment this replaces"),
        pivot_reason: str("For a pivot: what the parent's numbers showed and what one thing you changed"),
        thresholds: {
          type: "object",
          description: `Optional overrides of the judging thresholds: ${Object.keys(DEFAULT_THRESHOLDS).join(", ")}`,
        },
      },
      ["name", "hypothesis", "audience", "offer", "deliverable", "headline", "subhead", "bullets", "cta"],
    ),
  },
  {
    name: "set_experiment_status",
    description:
      "Change an experiment's status: live, paused, killed or winner. A killed or paused experiment's landing page stops taking signups. Always give the reasoning; it is logged as a decision with the numbers attached.",
    inputSchema: obj({ id: str("Experiment id (exp_…)"), status: oneOf(EXPERIMENT_STATUSES, "New status"), reasoning: str("Why, citing the numbers") }, ["id", "status", "reasoning"]),
  },
  {
    name: "log_decision",
    description:
      "Record a decision (keep, scale, kill, pivot, note) and the reasoning behind it. The experiment's current numbers are attached automatically, so cite them honestly.",
    inputSchema: obj(
      { experiment_id: str("Experiment id, if the decision is about one"), decision: oneOf(DECISION_KINDS, "The decision"), reasoning: str("Why, citing the numbers") },
      ["decision", "reasoning"],
    ),
  },
  {
    name: "list_decisions",
    description: "The most recent decisions, newest first. You have no memory between runs, so read these to know what was already decided and why.",
    inputSchema: obj({ limit: int("How many (default 20)") }),
  },
  {
    name: "outreach_quota",
    description:
      "How many X posts and emails the company may still send in the rolling 24 hours, and, when targets are given, which of them must not be contacted (contacted in the last 7 days, or opted out). Call this before every batch of outreach.",
    inputSchema: obj({ targets: strings("Email addresses or handles you plan to contact", 50) }),
  },
  {
    name: "log_touch",
    description:
      "Record one outreach action right after it happens: an X post (give external_id = the id social.post returned) or an email (give target = the address). Refused when the channel's daily quota is used up or the target must not be contacted.",
    inputSchema: obj(
      {
        experiment_id: str("Experiment id"),
        channel: oneOf(CHANNELS, "x, email or other"),
        kind: oneOf(TOUCH_KINDS, "post, email, reply or dm"),
        content: str("The exact text that went out"),
        target: str("The recipient address or handle (required for email)"),
        external_id: str("The platform's id for the post or message"),
        url: str("A public URL for the post, if known"),
      },
      ["experiment_id", "channel", "kind", "content"],
    ),
  },
  {
    name: "update_touch_metrics",
    description: "Store the latest numbers for a post (from social.status): impressions and engagements (likes + replies + reposts + clicks).",
    inputSchema: obj({ touch_id: str("Touch id (tch_…)"), external_id: str("Or the platform's post id"), impressions: int("Impressions so far"), engagements: int("Engagements so far") }, ["impressions", "engagements"]),
  },
  {
    name: "list_touches",
    description: "Recent outreach, newest first, optionally for one experiment or channel. Read before posting so you never repeat yourself.",
    inputSchema: obj({ experiment_id: str("Experiment id"), channel: oneOf(CHANNELS, "Channel filter"), limit: int("How many (default 30)") }),
  },
  {
    name: "list_signups",
    description: "Signups, oldest first, optionally filtered by status (new, working, delivered, failed) or experiment.",
    inputSchema: obj({ status: oneOf(["new", "working", "delivered", "failed"], "Status filter"), experiment_id: str("Experiment id"), limit: int("How many (default 20)") }),
  },
  {
    name: "add_signup",
    description: "File a signup that arrived another way, such as an email reply saying yes. Use the experiment the person responded to.",
    inputSchema: obj(
      { experiment_id: str("Experiment id"), email: str("Their email address"), need: str("What they asked for, in their words"), name: str("Their name, if given"), link: str("Their site or app link, if given"), source: str("Where it came from, e.g. email") },
      ["experiment_id", "email", "need"],
    ),
  },
  {
    name: "claim_signup",
    description: "Claim a new signup before working on it, so no one else delivers it twice. Returns the signup and its experiment's offer and deliverable, or refuses if it is already taken.",
    inputSchema: obj({ id: str("Signup id (sgn_…)") }, ["id"]),
  },
  {
    name: "record_delivery",
    description: "Record that you emailed the deliverable to a claimed signup: a one-line summary plus the full content you sent.",
    inputSchema: obj({ signup_id: str("Signup id"), summary: str("One line on what you delivered"), content: str("The full deliverable as sent") }, ["signup_id", "summary", "content"]),
  },
  {
    name: "fail_signup",
    description: "Mark a signup you could not deliver, with the reason. Email the person an honest note first.",
    inputSchema: obj({ signup_id: str("Signup id"), reason: str("Why it could not be delivered") }, ["signup_id", "reason"]),
  },
  {
    name: "opt_out",
    description: "Record that someone asked not to be contacted again. Outreach will never contact them after this.",
    inputSchema: obj({ target: str("Their email address or handle"), reason: str("What they said") }, ["target"]),
  },
] as const;

export class ToolError extends Error {}

const need = (args: Record<string, unknown>, key: string, max = 4000): string => {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") throw new ToolError(`${key} is required`);
  if (value.length > max) throw new ToolError(`${key} is too long (max ${max} characters)`);
  return value.trim();
};
const opt = (args: Record<string, unknown>, key: string, max = 4000): string | undefined => {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ToolError(`${key} must be a string`);
  if (value.length > max) throw new ToolError(`${key} is too long (max ${max} characters)`);
  return value.trim();
};
const optInt = (args: Record<string, unknown>, key: string): number | undefined => {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new ToolError(`${key} must be a non-negative integer`);
  return value;
};
function member<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[], required: true): T;
function member<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[], required?: false): T | undefined;
function member<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[], required = false): T | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ToolError(`${key} is required (one of ${allowed.join(", ")})`);
    return undefined;
  }
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new ToolError(`${key} must be one of ${allowed.join(", ")}`);
  return value as T;
}

const landingUrl = (origin: string, slug: string) => `${origin}/x/${slug}`;

/** The numbers a decision is attached to: what the app counted, not what an agent remembers. */
const snapshotOf = (row: ScoredExperiment | undefined) =>
  row ? { status: row.status, ...row.stats, verdict: row.judgement.verdict, verdict_reason: row.judgement.reason } : {};

async function quota(ctx: McpContext, targets: string[] = []) {
  const now = ctx.now?.() ?? new Date();
  const sent = await ctx.repo.sentLastDay(now);
  return {
    x_posts_left: Math.max(0, ctx.caps.xPostsPerDay - sent.x),
    emails_left: Math.max(0, ctx.caps.emailsPerDay - sent.email),
    sent_last_24h: sent,
    blocked_targets: await ctx.repo.blockedTargets(targets, now),
  };
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext): Promise<unknown> {
  const { repo, origin } = ctx;
  const now = () => ctx.now?.() ?? new Date();
  const scored = async (id: string) => (await repo.scoreboard(now())).find((e) => e.id === id);

  switch (name) {
    case "get_scoreboard": {
      const board = await repo.scoreboard(now());
      return {
        now: now().toISOString(),
        max_live_experiments: ctx.maxLive,
        quota: await quota(ctx),
        experiments: board.map((e) => ({
          id: e.id, name: e.name, status: e.status, audience: e.audience, offer: e.offer, deliverable: e.deliverable,
          hypothesis: e.hypothesis, headline: e.headline, channels: e.channels, parent_id: e.parent_id,
          landing_url: landingUrl(origin, e.slug), stats: e.stats,
          verdict: e.judgement.verdict, verdict_reason: e.judgement.reason,
        })),
      };
    }

    case "create_experiment": {
      if ((await repo.countLive()) >= ctx.maxLive) {
        throw new ToolError(`already ${ctx.maxLive} live experiments; kill, pause or crown one with set_experiment_status first`);
      }
      const bullets = args["bullets"];
      if (!Array.isArray(bullets) || bullets.length < 2 || bullets.length > 5 || bullets.some((b) => typeof b !== "string" || b.trim() === "" || b.length > 200)) {
        throw new ToolError("bullets must be 2 to 5 non-empty strings of at most 200 characters");
      }
      const channels = args["channels"];
      if (channels !== undefined && (!Array.isArray(channels) || channels.some((c) => c !== "x" && c !== "email"))) {
        throw new ToolError("channels must be a list of x and/or email");
      }
      const parentId = opt(args, "parent_id", 64);
      const pivotReason = opt(args, "pivot_reason", 2000);
      if (parentId !== undefined) {
        if (!(await repo.getExperiment(parentId))) throw new ToolError("parent_id names no experiment");
        if (pivotReason === undefined) throw new ToolError("a pivot needs pivot_reason: what the parent's numbers showed and what you changed");
      }
      const thresholds = args["thresholds"];
      const experiment = await repo.createExperiment({
        name: need(args, "name", 80),
        hypothesis: need(args, "hypothesis", 1000),
        audience: need(args, "audience", 500),
        offer: need(args, "offer", 500),
        deliverable: need(args, "deliverable", 1000),
        headline: need(args, "headline", 90),
        subhead: need(args, "subhead", 300),
        bullets: (bullets as string[]).map((b) => b.trim()),
        cta: need(args, "cta", 40),
        ask_label: opt(args, "ask_label", 160),
        channels: channels as string[] | undefined,
        parent_id: parentId ?? null,
        pivot_reason: pivotReason ?? null,
        thresholds: typeof thresholds === "object" && thresholds !== null && !Array.isArray(thresholds) ? (thresholds as Record<string, number>) : {},
      });
      await repo.logDecision({
        experiment_id: experiment.id,
        decision: parentId ? "pivot" : "launch",
        reasoning: parentId ? `Pivot from ${parentId}: ${pivotReason}` : experiment.hypothesis,
        snapshot: parentId ? snapshotOf(await scored(parentId)) : {},
      });
      return { experiment, landing_url: landingUrl(origin, experiment.slug) };
    }

    case "set_experiment_status": {
      const id = need(args, "id", 64);
      const status = member<ExperimentStatus>(args, "status", EXPERIMENT_STATUSES, true);
      const reasoning = need(args, "reasoning", 2000);
      const before = await scored(id);
      if (!before) throw new ToolError("no such experiment");
      if (status === "live" && before.status !== "live" && (await repo.countLive()) >= ctx.maxLive) {
        throw new ToolError(`already ${ctx.maxLive} live experiments`);
      }
      const experiment = await repo.setStatus(id, status);
      const kind: DecisionKind = status === "killed" ? "kill" : status === "winner" ? "scale" : status === "live" ? "keep" : "note";
      const decision = await repo.logDecision({ experiment_id: id, decision: kind, reasoning: `[${before.status} → ${status}] ${reasoning}`, snapshot: snapshotOf(before) });
      return { experiment, decision };
    }

    case "log_decision": {
      const experimentId = opt(args, "experiment_id", 64);
      const row = experimentId ? await scored(experimentId) : undefined;
      if (experimentId && !row) throw new ToolError("no such experiment");
      return await repo.logDecision({
        experiment_id: experimentId ?? null,
        decision: member<DecisionKind>(args, "decision", DECISION_KINDS, true),
        reasoning: need(args, "reasoning", 2000),
        snapshot: snapshotOf(row),
      });
    }

    case "list_decisions":
      return await repo.listDecisions(Math.min(optInt(args, "limit") ?? 20, 100));

    case "outreach_quota": {
      const targets = args["targets"];
      if (targets !== undefined && (!Array.isArray(targets) || targets.some((t) => typeof t !== "string"))) throw new ToolError("targets must be a list of strings");
      return await quota(ctx, (targets as string[] | undefined) ?? []);
    }

    case "log_touch": {
      const experimentId = need(args, "experiment_id", 64);
      if (!(await repo.getExperiment(experimentId))) throw new ToolError("no such experiment");
      const channel = member<Channel>(args, "channel", CHANNELS, true);
      const kind = member<TouchKind>(args, "kind", TOUCH_KINDS, true);
      const target = opt(args, "target", 254);
      if (channel === "email" && target === undefined) throw new ToolError("an email touch needs target: the recipient address");
      const q = await quota(ctx, target ? [target] : []);
      if (channel === "x" && q.x_posts_left === 0) throw new ToolError("X post quota for the last 24h is used up; stop posting");
      if (channel === "email" && q.emails_left === 0) throw new ToolError("email quota for the last 24h is used up; stop emailing");
      if (target && q.blocked_targets[target.toLowerCase()]) {
        throw new ToolError(`${target} must not be contacted: ${q.blocked_targets[target.toLowerCase()]}`);
      }
      const touch = await repo.logTouch({
        experiment_id: experimentId, channel, kind, content: need(args, "content", 6000), target: target ?? null,
        external_id: opt(args, "external_id", 200) ?? null, url: opt(args, "url", 500) ?? null,
      });
      return { touch, quota_after: { x_posts_left: q.x_posts_left - (channel === "x" ? 1 : 0), emails_left: q.emails_left - (channel === "email" ? 1 : 0) } };
    }

    case "update_touch_metrics": {
      const id = opt(args, "touch_id", 64);
      const externalId = opt(args, "external_id", 200);
      if (!id && !externalId) throw new ToolError("give touch_id or external_id");
      const touch = await repo.updateTouchMetrics({ id, external_id: externalId }, optInt(args, "impressions") ?? 0, optInt(args, "engagements") ?? 0);
      if (!touch) throw new ToolError("no such touch");
      return touch;
    }

    case "list_touches":
      return await repo.listTouches({
        experiment_id: opt(args, "experiment_id", 64),
        channel: member<Channel>(args, "channel", CHANNELS),
        limit: optInt(args, "limit"),
      });

    case "list_signups":
      return await repo.listSignups({
        status: member(args, "status", ["new", "working", "delivered", "failed"] as const),
        experiment_id: opt(args, "experiment_id", 64),
        limit: optInt(args, "limit"),
      });

    case "add_signup": {
      const experimentId = need(args, "experiment_id", 64);
      if (!(await repo.getExperiment(experimentId))) throw new ToolError("no such experiment");
      const email = need(args, "email", 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError("email is not an email address");
      return await repo.addSignup({
        experiment_id: experimentId, email, need: need(args, "need", 4000),
        name: opt(args, "name", 120) ?? null, link: opt(args, "link", 500) ?? null, source: opt(args, "source", 40) ?? "email",
      });
    }

    case "claim_signup": {
      const signup = await repo.claimSignup(need(args, "id", 64));
      if (!signup) throw new ToolError("not claimable: it does not exist, or it is already being worked on or delivered");
      const experiment = await repo.getExperiment(signup.experiment_id);
      return {
        signup,
        experiment: experiment && { id: experiment.id, name: experiment.name, offer: experiment.offer, deliverable: experiment.deliverable, audience: experiment.audience, landing_url: landingUrl(origin, experiment.slug) },
      };
    }

    case "record_delivery": {
      const delivery = await repo.recordDelivery(need(args, "signup_id", 64), need(args, "summary", 300), need(args, "content", 20_000));
      if (!delivery) throw new ToolError("no such signup, or it was already delivered");
      return delivery;
    }

    case "fail_signup": {
      const signupId = need(args, "signup_id", 64);
      const reason = need(args, "reason", 1000);
      const signup = await repo.failSignup(signupId);
      if (!signup) throw new ToolError("no such signup");
      await repo.logDecision({ experiment_id: signup.experiment_id, decision: "note", reasoning: `Could not deliver ${signupId}: ${reason}`, agent: "operator" });
      return signup;
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

/** One JSON-RPC message in, one answer out; null for a notification (answered 202, no body). */
export async function handleMcp(message: unknown, ctx: McpContext): Promise<object | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return rpcError(null, -32600, "invalid request");
  const msg = message as JsonRpcRequest;
  if (typeof msg.method !== "string") return rpcError(msg.id, -32600, "invalid request");
  if (msg.method.startsWith("notifications/")) return null;
  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "pmf", version: "0.1.0" } });
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args } = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      try {
        const result = await callTool(name ?? "", args ?? {}, ctx);
        return rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (error) {
        if (error instanceof ToolError) return rpcResult(msg.id, { content: [{ type: "text", text: error.message }], isError: true });
        throw error;
      }
    }
    default:
      return rpcError(msg.id, -32601, "method not found");
  }
}
