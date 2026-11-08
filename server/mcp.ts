/**
 * The `/mcp` endpoint: the studio's tools, as the agents see them.
 *
 * The app is declared with `mcp: "/mcp"` in naive.config.ts, so every agent in the project is
 * offered these as `pmf.<tool>` on each turn, under its own allow/ask/deny policy. MCP's
 * streamable-HTTP transport is JSON-RPC over POST; the subset agents use (initialize, tools/list,
 * tools/call) is implemented by hand, as in Naïve's own agency blueprint, with no SDK dependency.
 *
 * The platform does not say which agent is calling, so the mutating tools take `founder` and
 * refuse to touch a company that founder does not own.
 */
import { DEFAULT_THRESHOLDS, cleanPath, isEmail, maskEmail, placeholderReason, productHealth, type Caps } from "./rules.ts";
import {
  CHANNELS, DECISION_KINDS, LIMITS, RepoError, TOUCH_KINDS, type Channel, type Company, type DecisionKind,
  type Repo, type ScoredCompany, type TouchKind,
} from "./repo.ts";

export interface McpContext {
  repo: Repo;
  origin: string;
  caps: Caps;
  now?: () => Date;
}

const str = (description: string) => ({ type: "string", description }) as const;
const int = (description: string) => ({ type: "integer", minimum: 0, description }) as const;
const strings = (description: string, maxItems = 10) => ({ type: "array", items: { type: "string" }, maxItems, description }) as const;
const oneOf = (values: readonly string[], description: string) => ({ type: "string", enum: values, description }) as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required }) as const;
const FOUNDER = str("Your agent name, e.g. founder-1");

/** What every report must cover. It is published on the company's page for the operator and judges. */
export const REPORT_GUIDE =
  "Markdown, at least 400 characters, with these ## sections: Hypothesis (what you believed and how this version tested it), What we built (the versions and what changed), How we tested it (where you posted and emailed, how many times, which hooks), Results (the studio's numbers against the verdict thresholds: visitors, people who used it, who came back, signups), What users said (feedback, quoted), What we learned, Decision and next step. Be specific and honest; the studio attaches its own numbers to the report.";
const REPORT_FIELDS = {
  report_title: str("A specific headline for the report, e.g. 'v2 tested a one-click template: 3/41 visitors used it'"),
  report: str(`The detailed report. ${REPORT_GUIDE}`),
};
/** How long a run lock lasts if a run never gives it back (a crash, a budget stop). */
export const RUN_LEASE_MINUTES = 28; // just under the 30-minute schedule, so a lost lock never skips a run

/** Decisions that close a test, and so need a report. */
const NEEDS_REPORT: readonly string[] = ["iterate", "scale", "kill"];

export const TOOLS = [
  {
    name: "get_my_company",
    description:
      "Start every run here. Your one running company with its product URL, numbers (visitors, people who used it, people who came back, signups, outreach), the rule-based verdict and reason, every test's own numbers, recent decisions and reports, user feedback, product files, and today's outreach quota. If you have no running company, returns your past companies and your latest reports, so you can learn from them. The first call of a run takes your run lock and returns run_token: pass it on every later call to this tool, and to end_run when you finish. If it answers busy, another run of yours is still working: stop immediately and do nothing else.",
    inputSchema: obj({ founder: FOUNDER, run_token: str("The run_token this run got from its first call, if any") }, ["founder"]),
  },
  {
    name: "end_run",
    description: "Release your run lock as the last thing you do in a run, so your next run can start.",
    inputSchema: obj({ founder: FOUNDER, run_token: str("The run_token from get_my_company") }, ["founder", "run_token"]),
  },
  {
    name: "get_studio",
    description: "Every company in the studio, all founders: what each is building, its numbers and verdict. Use it to avoid duplicating another founder and to learn what is working.",
    inputSchema: obj({}),
  },
  {
    name: "start_company",
    description:
      "Start a new company around one real problem you found. You can run one company at a time: kill your current one first (set_company_status). For a pivot, give parent_id and pivot_reason. Then build the product and ship it with publish_product.",
    inputSchema: obj(
      {
        founder: FOUNDER,
        name: str("The product's name: short, memorable, says what it does"),
        problem: str("The pain, in the words of the people who have it"),
        audience: str("Exactly who has it and where they can be reached"),
        evidence: strings("1 to 5 URLs of real posts or threads where people describe this problem", 5),
        solution: str("What the product does about it, in one or two sentences"),
        parent_id: str("For a pivot: the id of the company this replaces"),
        pivot_reason: str("For a pivot: what the parent's numbers and feedback showed, and what you changed"),
        thresholds: { type: "object", description: `Optional overrides of the judging thresholds: ${Object.keys(DEFAULT_THRESHOLDS).join(", ")}` },
      },
      ["founder", "name", "problem", "audience", "evidence", "solution"],
    ),
  },
  {
    name: "publish_product",
    description: `Ship a version of your product. It is served at <product_url>/<path>, with the studio's tracker added to every HTML page (window.pmf). The first ship takes the company live. With replace true, the files given become the whole product (index.html required); otherwise they are added or overwritten and the rest kept. Text files only (html, css, js, json, svg, md, txt). Limits: ${LIMITS.files} files, ${LIMITS.fileBytes} bytes per file, ${LIMITS.productBytes} bytes in all. NOTES.md is kept for you and never served: use it to remember what you built and why.`,
    inputSchema: obj(
      {
        founder: FOUNDER,
        company_id: str("Your company's id"),
        files: { type: "array", maxItems: LIMITS.files, items: obj({ path: str("Relative path, e.g. index.html or app.js"), content: str("The file's full content") }, ["path", "content"]) },
        note: str("What changed in this version, in one line (shown on the public dashboard)"),
        replace: { type: "boolean", description: "Replace every file (default false: add or overwrite only these)" },
      },
      ["founder", "company_id", "files", "note"],
    ),
  },
  {
    name: "get_upload_link",
    description: `The best way to ship a real product: returns a short-lived upload URL for your company. From your workspace, curl each file to it, then curl /commit to ship them as one version. The files never pass through this conversation, so there is no size pressure and no need to paste code. The answer includes the exact commands.`,
    inputSchema: obj({ founder: FOUNDER, company_id: str("Your company's id") }, ["founder", "company_id"]),
  },
  {
    name: "get_product_files",
    description: "Read your product's current files (all of them, or the paths given), so you can change them. You have no memory between runs: read NOTES.md first.",
    inputSchema: obj({ company_id: str("Company id"), paths: strings("Only these paths", LIMITS.files) }, ["company_id"]),
  },
  {
    name: "set_company_status",
    description: "Kill your company (its product goes offline) or crown it a winner. Give the reasoning and, for killed or winner, a detailed report of the whole company (report_title + report); both are published with the studio's numbers attached. After a kill, start a new company.",
    inputSchema: obj(
      { founder: FOUNDER, company_id: str("Company id"), status: oneOf(["killed", "winner", "live"], "New status"), reasoning: str("Why, in one or two sentences citing the numbers"), ...REPORT_FIELDS },
      ["founder", "company_id", "status", "reasoning"],
    ),
  },
  {
    name: "log_decision",
    description: "Record a decision about your company and why. Its current numbers are attached automatically, so cite them honestly. iterate, scale and kill close a test, so they need a detailed report (report_title + report), published on the company's page.",
    inputSchema: obj({ founder: FOUNDER, company_id: str("Company id"), decision: oneOf(DECISION_KINDS, "The decision"), reasoning: str("Why, citing the numbers"), ...REPORT_FIELDS }, ["founder", "decision", "reasoning"]),
  },
  {
    name: "write_report",
    description: "Publish a detailed report on your company's page at any other time, for example a checkpoint after a big push. Use it whenever you learned something worth keeping.",
    inputSchema: obj({ founder: FOUNDER, company_id: str("Company id"), title: str("A specific headline"), body: str(REPORT_GUIDE) }, ["founder", "company_id", "title", "body"]),
  },
  {
    name: "list_decisions",
    description: "Recent decisions, newest first, for one company or the whole studio.",
    inputSchema: obj({ company_id: str("Company id"), limit: int("How many (default 20)") }),
  },
  {
    name: "list_feedback",
    description: "What users said about a product, from its feedback box or by email, newest first. Email addresses are masked.",
    inputSchema: obj({ company_id: str("Company id"), limit: int("How many (default 20)") }, ["company_id"]),
  },
  {
    name: "outreach_quota",
    description: "How many posts and emails your company may still send in the rolling 24 hours (per company and across the studio), and, when targets are given, which must not be contacted (contacted by any company in the last 7 days, or opted out). Call it before every batch of outreach.",
    inputSchema: obj({ company_id: str("Company id"), targets: strings("Email addresses or handles you plan to contact", 50) }, ["company_id"]),
  },
  {
    name: "log_touch",
    description: "Record one outreach action right after it happens: a social post (external_id = the id social.post returned) or an email (target = the address). Refused when a quota is used up or the target must not be contacted.",
    inputSchema: obj(
      {
        company_id: str("Company id"),
        channel: oneOf(CHANNELS, "x, email, social (another network) or other"),
        kind: oneOf(TOUCH_KINDS, "post, email, reply or dm"),
        content: str("The exact text that went out"),
        target: str("The recipient address or handle (required for email)"),
        external_id: str("The platform's id for the post or message"),
        url: str("A public URL for the post, if known"),
      },
      ["company_id", "channel", "kind", "content"],
    ),
  },
  {
    name: "update_touch_metrics",
    description: "Store the latest numbers for a post (from social.status): impressions and engagements (likes + replies + reposts + clicks).",
    inputSchema: obj({ touch_id: str("Touch id (tch_…)"), external_id: str("Or the platform's post id"), impressions: int("Impressions so far"), engagements: int("Engagements so far") }, ["impressions", "engagements"]),
  },
  {
    name: "list_touches",
    description: "Recent outreach, newest first, for one company or the studio. Read it before posting so you never repeat yourself.",
    inputSchema: obj({ company_id: str("Company id"), channel: oneOf(CHANNELS, "Channel filter"), limit: int("How many (default 30)") }),
  },
  {
    name: "add_feedback",
    description: "File what a user said about a product (for example in an email), so its founder sees it.",
    inputSchema: obj({ company_id: str("Company id"), text: str("What they said, faithfully"), email: str("Their address, if they wrote in"), source: str("Where it came from (default email)") }, ["company_id", "text"]),
  },
  {
    name: "add_signup",
    description: "File someone who asked to use or hear about a product (for example by replying to outreach).",
    inputSchema: obj({ company_id: str("Company id"), email: str("Their address"), source: str("Where it came from (default email)") }, ["company_id", "email"]),
  },
  {
    name: "opt_out",
    description: "Record that someone asked not to be contacted again. No company will contact them after this.",
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
const founderOf = (args: Record<string, unknown>): string => {
  const founder = need(args, "founder", 32).toLowerCase();
  if (!/^[a-z0-9-]{1,32}$/.test(founder)) throw new ToolError("founder must be your agent name, e.g. founder-1");
  return founder;
};

export const productUrl = (origin: string, slug: string) => `${origin}/p/${slug}/`;

/** How long an upload link works. */
export const UPLOAD_MINUTES = 60;

/**
 * Ships a set of files as a new version, from either path (the publish_product tool or an
 * upload link's commit). Checks every file before anything is written.
 */
export async function shipProduct(repo: Repo, company: Company, files: { path: unknown; content: unknown }[], note: string, replace: boolean, founder: string) {
  if (company.status === "killed") throw new ToolError("this company is killed; start a new one");
  if (files.length === 0 || files.length > LIMITS.files) throw new ToolError(`ship 1 to ${LIMITS.files} files`);
  const clean: { path: string; content: string }[] = [];
  for (const file of files) {
    const cleaned = typeof file.path === "string" ? cleanPath(file.path) : null;
    if (!cleaned) throw new ToolError(`bad path ${JSON.stringify(file.path)}: relative, letters/digits/._-/ only, and one of .html .css .js .mjs .json .svg .md .txt .webmanifest .xml`);
    if (typeof file.content !== "string") throw new ToolError(`${cleaned}: content must be a string`);
    const fake = placeholderReason(cleaned, file.content);
    if (fake) throw new ToolError(`${fake}. Send the file's real, complete contents. For big files use pmf.get_upload_link and curl them from your workspace.`);
    clean.push({ path: cleaned, content: file.content });
  }
  try {
    const version = await repo.publish(company.id, clean, note, replace);
    await repo.logDecision({ company_id: company.id, decision: "ship", reasoning: `v${version.version}: ${version.note}`, agent: founder });
    return version;
  } catch (error) {
    if (error instanceof RepoError) throw new ToolError(error.message);
    throw error;
  }
}

/** The numbers a decision is attached to: what the studio counted, not what an agent remembers. */
const snapshotOf = (row: ScoredCompany | undefined) =>
  row ? { status: row.status, ...row.stats, verdict: row.judgement.verdict, verdict_reason: row.judgement.reason } : {};

const view = (origin: string, c: ScoredCompany) => ({
  id: c.id, slug: c.slug, founder: c.founder, name: c.name, status: c.status, problem: c.problem, audience: c.audience,
  solution: c.solution, evidence: c.evidence, parent_id: c.parent_id, product_url: productUrl(origin, c.slug), test_url: `${productUrl(origin, c.slug)}?qa=1`,
  stats: c.stats, verdict: c.judgement.verdict, verdict_reason: c.judgement.reason,
  created_at: c.created_at, launched_at: c.launched_at, ended_at: c.ended_at,
});

async function quota(ctx: McpContext, companyId: string, targets: string[] = []) {
  const now = ctx.now?.() ?? new Date();
  const sent = await ctx.repo.sentLastDay(companyId, now);
  const { caps } = ctx;
  return {
    posts_left: Math.max(0, Math.min(caps.postsPerCompany - sent.company.posts, caps.postsTotal - sent.total.posts)),
    emails_left: Math.max(0, Math.min(caps.emailsPerCompany - sent.company.emails, caps.emailsTotal - sent.total.emails)),
    sent_last_24h: sent,
    blocked_targets: await ctx.repo.blockedTargets(targets, now),
  };
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext): Promise<unknown> {
  const { repo, origin } = ctx;
  const now = () => ctx.now?.() ?? new Date();
  const scored = async (id: string) => (await repo.scoreboard(now())).find((c) => c.id === id);
  const owned = async (founder: string, companyId: string): Promise<Company> => {
    const company = await repo.getCompany(companyId);
    if (!company) throw new ToolError("no such company");
    if (company.founder !== founder) throw new ToolError(`that company belongs to ${company.founder}, not ${founder}`);
    return company;
  };
  const existing = async (companyId: string): Promise<Company> => {
    const company = await repo.getCompany(companyId);
    if (!company) throw new ToolError("no such company");
    return company;
  };
  const masked = <T extends { email: string | null }>(rows: T[]) => rows.map((r) => ({ ...r, email: r.email ? maskEmail(r.email) : null }));

  /** A report's title and body from the call, checked before anything is written. */
  const reportArgs = (titleKey: string, bodyKey: string, required: boolean): { title: string; body: string } | null => {
    const title = opt(args, titleKey, 160);
    const body = opt(args, bodyKey, 20_000);
    if (!title && !body) {
      if (required) throw new ToolError(`this decision closes a test, so it needs ${titleKey} and ${bodyKey}. ${REPORT_GUIDE}`);
      return null;
    }
    if (!title || !body) throw new ToolError(`give both ${titleKey} and ${bodyKey}`);
    if (body.length < 400) throw new ToolError(`the report is ${body.length} characters; write at least 400. ${REPORT_GUIDE}`);
    if ((body.match(/^##\s+\S/gm) ?? []).length < 3) throw new ToolError(`structure the report with ## sections. ${REPORT_GUIDE}`);
    return { title, body };
  };
  /** The studio's own numbers, attached to every report so a reader never depends on the agent's account. */
  const reportSnapshot = async (companyId: string) => {
    const touches = await repo.listTouches({ company_id: companyId, limit: 200 });
    const byChannel: Record<string, number> = {};
    for (const t of touches) byChannel[t.channel] = (byChannel[t.channel] ?? 0) + 1;
    return {
      ...snapshotOf(await scored(companyId)),
      outreach_by_channel: byChannel,
      tests: (await repo.versionResults(companyId)).map((v) => ({
        version: v.version, note: v.note, shipped_at: v.created_at, ended_at: v.ended_at,
        visitors: v.visitors, active_users: v.active_users, signups: v.signups, touches: v.touches,
      })),
    };
  };

  switch (name) {
    case "end_run": {
      const founder = founderOf(args);
      return { released: await repo.endRun(founder, need(args, "run_token", 64), now()) };
    }

    case "get_my_company": {
      const founder = founderOf(args);
      const given = opt(args, "run_token", 64);
      let runToken: string;
      if (given && (await repo.holdsRun(founder, given))) {
        runToken = given;
      } else {
        const lease = await repo.takeRun(founder, now(), RUN_LEASE_MINUTES);
        if (!lease.ok) {
          const minutes = Math.max(0, Math.round((now().getTime() - new Date(lease.started_at).getTime()) / 60_000));
          return {
            busy: true,
            message: `Another run of yours started ${minutes} min ago and is still working on your company. Stop now and do nothing else; your next scheduled run will pick up. (If this run already got a run_token earlier, call again with it.)`,
          };
        }
        runToken = lease.token;
      }
      const active = await repo.activeCompanyOf(founder);
      const board = await repo.scoreboard(now());
      if (!active) {
        return {
          now: now().toISOString(),
          run_token: runToken,
          company: null,
          past_companies: board.filter((c) => c.founder === founder).map((c) => ({ ...view(origin, c), pivot_reason: c.pivot_reason })),
          lessons: (await repo.reportsByFounder(founder, 3)).map((r) => ({ title: r.title, kind: r.kind, body: r.body })),
          other_founders: board.filter((c) => c.founder !== founder && (c.status === "live" || c.status === "building")).map((c) => ({ founder: c.founder, name: c.name, problem: c.problem })),
        };
      }
      const row = board.find((c) => c.id === active.id)!;
      const health = active.status === "live" ? productHealth(await repo.readFiles(active.id)) : [];
      return {
        now: now().toISOString(),
        run_token: runToken,
        ...(health.length ? { product_health: health, fix_first: "Your live product is broken. Fix it before anything else this run." } : {}),
        company: view(origin, row),
        quota: await quota(ctx, active.id),
        tests: await repo.versionResults(active.id),
        recent_decisions: await repo.listDecisions({ company_id: active.id, limit: 10 }),
        reports: await repo.listReports({ company_id: active.id, limit: 10 }),
        feedback: masked(await repo.listFeedback(active.id, 15)),
        files: await repo.listFiles(active.id),
      };
    }

    case "get_studio": {
      const board = await repo.scoreboard(now());
      return { now: now().toISOString(), companies: board.map((c) => view(origin, c)) };
    }

    case "start_company": {
      const founder = founderOf(args);
      const running = await repo.activeCompanyOf(founder);
      if (running) throw new ToolError(`you already run ${running.name} (${running.id}); kill it with set_company_status first`);
      const evidence = args["evidence"];
      if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 5 || evidence.some((e) => typeof e !== "string" || !/^https?:\/\/\S+$/.test(e) || e.length > 500)) {
        throw new ToolError("evidence must be 1 to 5 http(s) URLs of real posts or threads describing the problem");
      }
      const parentId = opt(args, "parent_id", 64);
      const pivotReason = opt(args, "pivot_reason", 2000);
      if (parentId !== undefined) {
        await owned(founder, parentId);
        if (pivotReason === undefined) throw new ToolError("a pivot needs pivot_reason: what the parent showed and what you changed");
      }
      const thresholds = args["thresholds"];
      const company = await repo.startCompany({
        founder,
        name: need(args, "name", 60),
        problem: need(args, "problem", 1000),
        audience: need(args, "audience", 500),
        evidence: evidence as string[],
        solution: need(args, "solution", 1000),
        parent_id: parentId ?? null,
        pivot_reason: pivotReason ?? null,
        thresholds: typeof thresholds === "object" && thresholds !== null && !Array.isArray(thresholds) ? (thresholds as Record<string, number>) : {},
      });
      await repo.logDecision({
        company_id: company.id,
        decision: parentId ? "pivot" : "launch",
        reasoning: parentId ? `Pivot from ${parentId}: ${pivotReason}` : `${company.problem} → ${company.solution}`,
        snapshot: parentId ? snapshotOf(await scored(parentId)) : {},
        agent: founder,
      });
      return { company, product_url: productUrl(origin, company.slug), test_url: `${productUrl(origin, company.slug)}?qa=1`, next: "Build the product and ship it with publish_product (include index.html and NOTES.md)." };
    }

    case "publish_product": {
      const founder = founderOf(args);
      const company = await owned(founder, need(args, "company_id", 64));
      const files = args["files"];
      if (!Array.isArray(files) || files.some((f) => typeof f !== "object" || f === null)) throw new ToolError(`files must be 1 to ${LIMITS.files} {path, content} objects`);
      const version = await shipProduct(repo, company, files as { path: unknown; content: unknown }[], need(args, "note", 200), args["replace"] === true, founder);
      return { version, product_url: productUrl(origin, company.slug), test_url: `${productUrl(origin, company.slug)}?qa=1`, check: "Open the test_url (never the product_url) in the browser and use it like a new user before you move on." };
    }

    case "get_upload_link": {
      const founder = founderOf(args);
      const company = await owned(founder, need(args, "company_id", 64));
      if (company.status === "killed") throw new ToolError("this company is killed; start a new one");
      const { token, expires_at } = await repo.createUpload(company.id, founder, now(), UPLOAD_MINUTES);
      const url = `${origin}/api/upload/${token}`;
      return {
        upload_url: url,
        expires_at,
        how: [
          `Stage each file from your workspace (repeat per file; the path after the token is where it is served):`,
          `  curl -sf -X PUT -H 'content-type: application/octet-stream' --data-binary @index.html ${url}/index.html`,
          `Then ship everything staged as one version (replace=1 makes the staged files the whole product):`,
          `  curl -sf -X POST ${url}/commit -H 'content-type: application/json' -d '{"note":"what changed","replace":true}'`,
          `GET ${url} lists what is staged. The link works for ${UPLOAD_MINUTES} minutes and only for this company.`,
        ].join("\n"),
      };
    }

    case "get_product_files": {
      const company = await existing(need(args, "company_id", 64));
      const paths = args["paths"];
      if (paths !== undefined && (!Array.isArray(paths) || paths.some((p) => typeof p !== "string"))) throw new ToolError("paths must be a list of strings");
      return { company_id: company.id, files: await repo.readFiles(company.id, paths as string[] | undefined) };
    }

    case "set_company_status": {
      const founder = founderOf(args);
      const company = await owned(founder, need(args, "company_id", 64));
      const status = member(args, "status", ["killed", "winner", "live"] as const, true);
      const reasoning = need(args, "reasoning", 2000);
      if (status === "live" && company.status === "killed") throw new ToolError("a killed company stays dead; start a new one");
      const report = reportArgs("report_title", "report", status !== "live");
      const snapshot = await reportSnapshot(company.id);
      const updated = await repo.setStatus(company.id, status);
      const kind: DecisionKind = status === "killed" ? "kill" : status === "winner" ? "scale" : "keep";
      const decision = await repo.logDecision({ company_id: company.id, decision: kind, reasoning: `[${company.status} → ${status}] ${reasoning}`, snapshot, agent: founder });
      const written = report && (await repo.addReport({ company_id: company.id, kind: status === "killed" ? "kill" : "winner", title: report.title, body: report.body, snapshot, agent: founder }));
      return { company: updated, decision, report: written ? { id: written.id, url: `${origin}/r/${written.id}` } : null };
    }

    case "log_decision": {
      const founder = founderOf(args);
      const companyId = opt(args, "company_id", 64);
      if (companyId) await owned(founder, companyId);
      const decision = member<DecisionKind>(args, "decision", DECISION_KINDS, true);
      const closesTest = NEEDS_REPORT.includes(decision);
      if (closesTest && !companyId) throw new ToolError(`a ${decision} decision is about a company: give company_id`);
      if (decision === "iterate" && companyId) {
        const verdict = (await scored(companyId))?.judgement.verdict;
        if (verdict === "too_early" || verdict === "building" || verdict === "stalled") {
          throw new ToolError(`the verdict is ${verdict}: there is not enough data to close a test yet. Log keep (no report needed) and push distribution, or write_report if you learned something worth recording.`);
        }
      }
      const report = reportArgs("report_title", "report", closesTest);
      const snapshot = companyId ? await reportSnapshot(companyId) : {};
      const logged = await repo.logDecision({ company_id: companyId ?? null, decision, reasoning: need(args, "reasoning", 2000), snapshot, agent: founder });
      const written = report && companyId && (await repo.addReport({ company_id: companyId, kind: decision, title: report.title, body: report.body, snapshot, agent: founder }));
      return { decision: logged, report: written ? { id: written.id, url: `${origin}/r/${written.id}` } : null };
    }

    case "write_report": {
      const founder = founderOf(args);
      const company = await owned(founder, need(args, "company_id", 64));
      const report = reportArgs("title", "body", true)!;
      const written = await repo.addReport({ company_id: company.id, kind: "checkpoint", title: report.title, body: report.body, snapshot: await reportSnapshot(company.id), agent: founder });
      return { id: written.id, url: `${origin}/r/${written.id}` };
    }

    case "list_decisions":
      return await repo.listDecisions({ company_id: opt(args, "company_id", 64), limit: optInt(args, "limit") ?? 20 });

    case "list_feedback": {
      const company = await existing(need(args, "company_id", 64));
      return masked(await repo.listFeedback(company.id, Math.min(optInt(args, "limit") ?? 20, 100)));
    }

    case "outreach_quota": {
      const company = await existing(need(args, "company_id", 64));
      const targets = args["targets"];
      if (targets !== undefined && (!Array.isArray(targets) || targets.some((t) => typeof t !== "string"))) throw new ToolError("targets must be a list of strings");
      return await quota(ctx, company.id, (targets as string[] | undefined) ?? []);
    }

    case "log_touch": {
      const company = await existing(need(args, "company_id", 64));
      if (company.status === "killed") throw new ToolError("this company is killed; it does no more outreach");
      const channel = member<Channel>(args, "channel", CHANNELS, true);
      const kind = member<TouchKind>(args, "kind", TOUCH_KINDS, true);
      const target = opt(args, "target", 254);
      if (channel === "email" && target === undefined) throw new ToolError("an email touch needs target: the recipient address");
      const q = await quota(ctx, company.id, target ? [target] : []);
      const isPost = channel === "x" || channel === "social";
      if (isPost && q.posts_left === 0) throw new ToolError("the post quota for the last 24h is used up; stop posting");
      if (channel === "email" && q.emails_left === 0) throw new ToolError("the email quota for the last 24h is used up; stop emailing");
      if (target && q.blocked_targets[target.toLowerCase()]) throw new ToolError(`${target} must not be contacted: ${q.blocked_targets[target.toLowerCase()]}`);
      const touch = await repo.logTouch({
        company_id: company.id, channel, kind, content: need(args, "content", 6000), target: target ?? null,
        external_id: opt(args, "external_id", 200) ?? null, url: opt(args, "url", 500) ?? null,
      });
      return { touch, quota_after: { posts_left: q.posts_left - (isPost ? 1 : 0), emails_left: q.emails_left - (channel === "email" ? 1 : 0) } };
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
      return await repo.listTouches({ company_id: opt(args, "company_id", 64), channel: member<Channel>(args, "channel", CHANNELS), limit: optInt(args, "limit") });

    case "add_feedback": {
      const company = await existing(need(args, "company_id", 64));
      const email = opt(args, "email", 254);
      if (email && !isEmail(email)) throw new ToolError("email is not an email address");
      return await repo.addFeedback(company.id, opt(args, "source", 40) ?? "email", need(args, "text", 4000), email ?? null);
    }

    case "add_signup": {
      const company = await existing(need(args, "company_id", 64));
      const email = need(args, "email", 254);
      if (!isEmail(email)) throw new ToolError("email is not an email address");
      return { company_id: company.id, ...(await repo.addSignup(company.id, email, null, opt(args, "source", 40) ?? "email")) };
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
      return rpcResult(msg.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "pmf", version: "0.2.0" } });
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
