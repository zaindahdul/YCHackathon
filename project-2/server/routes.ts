/**
 * Launchpad's route table, shared by the deployed function, the dev server and the tests.
 *
 *   /                  landing page            /new           the launch form
 *   /k/<slug>?t=…      the founder's kit        /k/<slug>/go   Launch now: rally the squad
 *   /b/<code>          a squad member's one-tap boost page (and /go, /skip, /stop)
 *   /l/<code>          tracked short link → the founder's URL
 *   /ops               the public record of what the agents do      /r/<id>  a launch report
 *   /mcp               the agents' tools (platform bearer only)
 *   /api/interventions log a human step-in (admin bearer only)
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.ts";
import { capsFromEnv, handleMcp } from "./mcp.ts";
import { renderBoost, renderHome, renderKit, renderMessage, renderNew, renderOps, renderReport } from "./pages.ts";
import { Repo, RepoError, type Decision, type Launch, type RadarItem, type Report, type Touch } from "./repo.ts";
import { CHANNELS, isBot, isEmail, isUrl, maskEmail, share, visitorKey, withLink } from "./rules.ts";

// ---------------------------------------------------------------- what public pages may see

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Free text written by agents or people can name an address; public pages show it masked. */
export const redact = (text: string): string => text.replace(EMAIL_IN_TEXT, (address) => maskEmail(address));
const firstLine = (text: string): string => (text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "").trim().slice(0, 160);

/**
 * A launch as an unauthenticated page may see it. Listed launches keep what the founder chose to
 * show (name, one-liner, link); an unlisted one keeps only its status and times. Contact details,
 * the kit and the private token never leave the server on a public page.
 */
export function publicLaunch(l: Launch): Launch {
  const base = { ...l, token: "", email: "", x_handle: null, linkedin_url: null, kit: null };
  return l.listed ? base : { ...base, company: "Unlisted launch", one_liner: "", description: "", url: "", video_url: null, batch: null, launch_when: null, timezone: null };
}

/**
 * Everything /ops receives, filtered before rendering so the page code cannot leak what it never
 * gets: nothing tied to an unlisted launch, outreach as its subject line only (the exact email body
 * stays private), and every address in free text masked.
 */
export function publicOps(d: { launches: Launch[]; decisions: Decision[]; touches: Touch[]; radar: RadarItem[]; reports: Omit<Report, "body">[]; interventions: { id: string; description: string; created_at: Date }[] }) {
  const listed = new Set(d.launches.filter((l) => l.listed).map((l) => l.id));
  const visible = (launchId: string | null) => launchId === null || listed.has(launchId);
  return {
    launches: d.launches.map(publicLaunch),
    decisions: d.decisions.filter((x) => visible(x.launch_id)).slice(0, 50).map((x) => ({ ...x, reasoning: redact(x.reasoning) })),
    touches: d.touches.filter((t) => visible(t.launch_id)).slice(0, 20).map((t) => ({ ...t, target: t.target ? maskEmail(t.target) : null, content: redact(firstLine(t.content)) })),
    radar: d.radar.map((x) => ({ ...x, contact: null })),
    reports: d.reports.filter((x) => listed.has(x.launch_id)).map((x) => ({ ...x, title: redact(x.title), listed: true })),
    interventions: d.interventions.map((x) => ({ ...x, description: redact(x.description) })),
  };
}

export interface ApiRequest { method: string; path: string; query: URLSearchParams; headers: Record<string, string | undefined>; body: unknown; raw?: string }
export interface ApiReply { status: number; headers?: Record<string, string>; html?: string; json?: unknown; text?: string }
export interface Env { mcpToken?: string; adminToken?: string; vars: Record<string, string | undefined> }
export interface Context { db: () => Promise<Db>; env: Env; now?: () => Date }

export function parseBody(raw: unknown, contentType: string | undefined): unknown {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object" && !(raw instanceof Uint8Array)) return raw;
  const text = typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf8");
  if (text === "") return null;
  if ((contentType ?? "").toLowerCase().includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  try { return JSON.parse(text); } catch { return null; }
}

const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const bearer = (h: string | undefined) => /^Bearer\s+(\S+)$/i.exec(h ?? "")?.[1] ?? null;
const hasBearer = (req: ApiRequest, ...secrets: (string | undefined)[]) => {
  const t = bearer(req.headers["authorization"]);
  return t !== null && secrets.some((s) => s && same(s, t));
};

export function originOf(req: ApiRequest): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

const html = (status: number, body: string): ApiReply => ({ status, html: body, headers: { "cache-control": "no-store" } });
const json = (status: number, body: unknown): ApiReply => ({ status, json: body, headers: { "cache-control": "no-store" } });
const redirect = (location: string, status = 303): ApiReply => ({ status, headers: { location, "cache-control": "no-store" } });
const field = (body: unknown, key: string): string => {
  const v = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v.trim() : "";
};

export async function handleRequest(req: ApiRequest, ctx: Context): Promise<ApiReply> {
  const now = ctx.now ?? (() => new Date());
  const repo = async () => new Repo(await ctx.db());
  const { method } = req;
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
  const origin = originOf(req);
  const caps = capsFromEnv(ctx.env.vars);

  if (path === "/health") return { status: 200, text: "ok" };

  if (path === "/mcp") {
    if (method !== "POST") return { status: 405, headers: { allow: "POST" }, text: "MCP streamable HTTP: POST only" };
    if (!hasBearer(req, ctx.env.mcpToken, ctx.env.adminToken)) return json(401, { error: "unauthorized" });
    const mcp = { repo: await repo(), origin, caps, now };
    if (Array.isArray(req.body)) {
      const answers = (await Promise.all(req.body.map((m) => handleMcp(m, mcp)))).filter((a) => a !== null);
      return answers.length ? json(200, answers) : { status: 202 };
    }
    const answer = await handleMcp(req.body, mcp);
    return answer === null ? { status: 202 } : json(200, answer);
  }

  if (path === "/api/interventions") {
    if (!hasBearer(req, ctx.env.adminToken)) return json(401, { error: "unauthorized" });
    const description = field(req.body, "description");
    if (method !== "POST" || !description || description.length > 1000) return json(400, { error: "POST {description}" });
    return json(201, await (await repo()).logIntervention(description));
  }

  // ---------------------------------------------------------------- public pages
  if (path === "/" && method === "GET") {
    const r = await repo();
    return html(200, renderHome({ overview: await r.overview(), launches: (await r.listLaunches({ limit: 200 })).map(publicLaunch) }));
  }

  if (path === "/ops" && method === "GET") {
    const r = await repo();
    const [launches, decisions, touches, radar, reports, interventions] = await Promise.all([
      r.listLaunches({ limit: 200 }), r.listDecisions(80), r.listTouches(40), r.listRadar(20), r.listReports(), r.listInterventions(),
    ]);
    return html(200, renderOps({ overview: await r.overview(), now: now(), ...publicOps({ launches, decisions, touches, radar, reports, interventions }) }));
  }

  // ---------------------------------------------------------------- the launch form
  if (path === "/new") {
    if (method === "GET") return html(200, renderNew());
    if (method !== "POST") return html(405, renderMessage("Not allowed", "Use the form."));
    if (field(req.body, "website")) return redirect("/"); // honeypot
    const v: Record<string, string> = { _posted: "1" };
    for (const k of ["company", "one_liner", "description", "url", "video_url", "launch_when", "batch", "email", "x_handle", "timezone", "join_squad", "listed", ...CHANNELS.map((c) => `ch_${c}`)]) v[k] = field(req.body, k);
    const again = (e: string) => html(422, renderNew(e, v));
    if (!v["company"] || !v["one_liner"] || v["description"]!.length < 20) return again("Tell us the company, a one-liner and a few sentences about the launch.");
    if (!isUrl(v["url"]!)) return again("The launch link must be a full URL starting with https://");
    if (v["video_url"] && !isUrl(v["video_url"])) return again("The video link must be a full URL.");
    if (!isEmail(v["email"]!)) return again("We need a valid email to send your kit.");
    const channels = CHANNELS.filter((c) => v[`ch_${c}`]);
    if (channels.length === 0) return again("Pick at least one channel.");
    const x = v["x_handle"]!.replace(/^@/, "");
    const launch = await (await repo()).createLaunch({
      company: v["company"]!.slice(0, 80), one_liner: v["one_liner"]!.slice(0, 160), description: v["description"]!.slice(0, 3000), url: v["url"]!,
      video_url: v["video_url"] || null, launch_when: v["launch_when"]?.slice(0, 120) || null, batch: v["batch"]?.slice(0, 10) || null,
      email: v["email"]!, x_handle: /^[A-Za-z0-9_]{1,15}$/.test(x) ? x : null, channels, timezone: v["timezone"]?.slice(0, 60) || null,
      join_squad: v["join_squad"] === "1", listed: v["listed"] === "1",
    });
    return redirect(`/k/${launch.slug}?t=${launch.token}`);
  }

  // ---------------------------------------------------------------- the founder's kit
  const kit = /^\/k\/([a-z0-9-]{1,64})(\/go)?$/.exec(path);
  if (kit) {
    const r = await repo();
    const l = await r.getBySlug(kit[1]!);
    const token = req.query.get("t") ?? "";
    if (!l || !token || !same(token, l.token)) return html(404, renderMessage("Not found", "This kit link is not valid. Check the link in your email."));
    if (kit[2]) {
      if (method !== "POST") return redirect(`/k/${l.slug}?t=${l.token}`);
      try {
        const { boosts } = await r.markLaunched(l.id, now(), caps);
        await r.logDecision({ launch_id: l.id, decision: "launch", reasoning: `The founder pressed Launch now; ${boosts} squad ${boosts === 1 ? "boost" : "boosts"} queued.`, agent: "app" });
      } catch (error) {
        if (error instanceof RepoError) return html(409, renderMessage("Not yet", error.message));
        throw error;
      }
      return redirect(`/k/${l.slug}?t=${l.token}`);
    }
    const squad = (await r.overview()).squad - (l.join_squad ? 1 : 0);
    return html(200, renderKit(l, { links: await r.linksFor(l.id), origin, stats: await r.stats(l.id), squad: Math.max(0, squad), reports: await r.listReports(l.id), reciprocity: await r.reciprocity(l.id) }));
  }

  // ---------------------------------------------------------------- boost pages
  const boost = /^\/b\/([A-Za-z0-9]{4,12})(\/(go|skip|stop))?$/.exec(path);
  if (boost && method === "GET") {
    const r = await repo();
    const b = await r.getBoost(boost[1]!);
    if (!b) return html(404, renderMessage("Not found", "This boost link is not valid."));
    const linkCode = await r.boostLinkCode(b.boost_id);
    const link = linkCode ? `${origin}/l/${linkCode}` : b.launch.url;
    const text = withLink(b.launch.kit?.boost_text || `${b.launch.company}: ${b.launch.one_liner} {link}`, link);
    const action = boost[3];
    if (action === "go") {
      await r.markBoostShared(b.boost_id, now());
      return redirect(req.query.get("to") === "linkedin" ? share.linkedin(text) : share.x(text), 302);
    }
    if (action === "skip") return html(200, renderMessage("No problem", "We won't count this one. You'll still get the next launch."));
    if (action === "stop") {
      await r.optOut(b.booster.email, "left the boost squad from a boost page");
      return html(200, renderMessage("You've left the squad", "You won't get boost requests anymore. Your own launches still work."));
    }
    return html(200, renderBoost({ company: b.launch.company, one_liner: b.launch.one_liner, url: b.launch.url, video_url: b.launch.video_url, booster: b.booster.company, code: boost[1]!, status: b.status, boostText: text }));
  }

  // ---------------------------------------------------------------- tracked links
  const short = /^\/l\/([A-Za-z0-9]{4,12})$/.exec(path);
  if (short && method === "GET") {
    const r = await repo();
    const ua = req.headers["user-agent"];
    const ip = (req.headers["x-forwarded-for"] ?? req.headers["x-real-ip"] ?? "").split(",")[0]!.trim();
    const visitor = isBot(ua) ? null : visitorKey(ip, ua ?? "", ctx.env.vars["VETTA_MCP_TOKEN"] ?? "launchpad");
    const target = await r.click(short[1]!, visitor, ua?.slice(0, 200) ?? null, req.headers["referer"]?.slice(0, 300) ?? null, now());
    return target ? redirect(target, 302) : html(404, renderMessage("Not found", "This link does not exist."));
  }

  // ---------------------------------------------------------------- reports
  const rep = /^\/r\/(rep_[a-f0-9]{12})$/.exec(path);
  if (rep && method === "GET") {
    const r = await repo();
    const report = await r.getReport(rep[1]!);
    const l = report && (await r.getLaunch(report.launch_id));
    if (!report || !l) return html(404, renderMessage("Not found", "No such report."));
    const token = req.query.get("t") ?? "";
    const owner = token !== "" && same(token, l.token);
    if (!l.listed && !owner) return html(404, renderMessage("Not found", "No such report."));
    // A listed launch's report is public, so addresses in it are masked for everyone but its founder.
    const shown = owner ? report : { ...report, title: redact(report.title), body: redact(report.body) };
    return html(200, renderReport(shown, l.listed || owner ? l.company : "A launch", owner || l.listed ? await r.stats(l.id) : null));
  }

  return html(404, renderMessage("Not found", "Nothing lives at this address."));
}
