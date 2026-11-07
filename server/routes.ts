/**
 * The app's whole route table, independent of where it runs: the deployed function
 * (`server/entry.ts`), the local dev server (`server/dev.ts`) and the tests all call
 * `handleRequest` with the same request shape.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.ts";
import { handleMcp } from "./mcp.ts";
import { renderClosed, renderDashboard, renderLanding, renderNotFound, renderThanks } from "./pages.ts";
import { Repo, visitorKey } from "./repo.ts";
import { capsFromEnv, isBot, isEmail } from "./rules.ts";

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  /** The body, parsed: a form's fields or a JSON value. Null when there was none or it did not parse. */
  body: unknown;
}

export interface ApiReply {
  status: number;
  headers?: Record<string, string>;
  html?: string;
  json?: unknown;
  text?: string;
}

export interface Env {
  /** The bearer the platform mints for `/mcp` (VETTA_MCP_TOKEN). */
  mcpToken?: string;
  /** The operator's own bearer, for logging interventions (ADMIN_TOKEN). */
  adminToken?: string;
  /** Salts the anonymous visitor hash. */
  salt: string;
  vars: Record<string, string | undefined>;
}

export interface Context {
  db: () => Promise<Db>;
  env: Env;
  now?: () => Date;
}

/** Turns whatever the host handed over (a parsed object, a string, a Buffer) into one parsed value. */
export function parseBody(raw: unknown, contentType: string | undefined): unknown {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object" && !(raw instanceof Uint8Array)) return raw;
  const text = typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf8");
  if (text === "") return null;
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    return type.includes("json") ? null : Object.fromEntries(new URLSearchParams(text));
  }
}

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

const bearer = (header: string | undefined) => /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1] ?? null;

function hasBearer(req: ApiRequest, ...secrets: (string | undefined)[]): boolean {
  const token = bearer(req.headers["authorization"]);
  if (!token) return false;
  return secrets.some((secret) => secret !== undefined && secret !== "" && sameSecret(secret, token));
}

export function originOf(req: ApiRequest): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

const html = (status: number, body: string): ApiReply => ({ status, html: body, headers: { "cache-control": "no-store" } });
const json = (status: number, body: unknown): ApiReply => ({ status, json: body });
const field = (body: unknown, key: string): string => {
  if (typeof body !== "object" || body === null) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
};

const SOURCE = /^[a-z0-9_-]{1,24}$/i;

export async function handleRequest(req: ApiRequest, ctx: Context): Promise<ApiReply> {
  const now = ctx.now ?? (() => new Date());
  const repo = async () => new Repo(await ctx.db());
  const { method, path } = req;

  if (path === "/health") return { status: 200, text: "ok" };

  // ---------------------------------------------------------------- agents' tools
  if (path === "/mcp") {
    if (method !== "POST") return { status: 405, headers: { allow: "POST" }, text: "MCP streamable HTTP: POST only" };
    if (!hasBearer(req, ctx.env.mcpToken, ctx.env.adminToken)) return json(401, { error: "unauthorized" });
    const caps = capsFromEnv(ctx.env.vars);
    const maxLive = Number(ctx.env.vars["MAX_LIVE_EXPERIMENTS"]) || 3;
    const mcp = { repo: await repo(), origin: originOf(req), caps, maxLive, now };
    if (Array.isArray(req.body)) {
      const answers = (await Promise.all(req.body.map((m) => handleMcp(m, mcp)))).filter((a) => a !== null);
      return answers.length === 0 ? { status: 202 } : json(200, answers);
    }
    const answer = await handleMcp(req.body, mcp);
    return answer === null ? { status: 202 } : json(200, answer);
  }

  // ---------------------------------------------------------------- operator
  if (path === "/api/interventions") {
    if (!hasBearer(req, ctx.env.adminToken)) return json(401, { error: "unauthorized" });
    const r = await repo();
    if (method === "GET") return json(200, await r.listInterventions());
    if (method !== "POST") return json(405, { error: "GET or POST" });
    const description = field(req.body, "description");
    if (description === "" || description.length > 1000) return json(400, { error: "description is required (at most 1000 characters)" });
    return json(201, await r.logIntervention(description));
  }

  if (path === "/api/state" && method === "GET") {
    const r = await repo();
    const board = await r.scoreboard(now());
    return json(200, {
      now: now().toISOString(),
      experiments: board.map(({ thresholds: _t, ...e }) => e),
      decisions: await r.listDecisions(50),
      interventions: await r.listInterventions(),
    });
  }

  // ---------------------------------------------------------------- public pages
  if (path === "/" && method === "GET") {
    const r = await repo();
    const [experiments, decisions, touches, deliveries, interventions] = await Promise.all([
      r.scoreboard(now()), r.listDecisions(40), r.listTouches({ limit: 15 }), r.listDeliveries(15), r.listInterventions(),
    ]);
    const signupsTotal = experiments.reduce((n, e) => n + e.stats.signups, 0);
    return html(200, renderDashboard({ now: now(), experiments, decisions, touches, deliveries, interventions, signupsTotal }));
  }

  const landing = /^\/x\/([a-z0-9-]{1,64})(\/thanks)?$/.exec(path);
  if (landing) {
    const r = await repo();
    const experiment = await r.getExperimentBySlug(landing[1]!);
    if (!experiment) return html(404, renderNotFound());
    const open = experiment.status === "live" || experiment.status === "winner";

    if (landing[2]) {
      return html(200, renderThanks(experiment));
    }

    if (method === "GET") {
      if (!open) return html(410, renderClosed(experiment));
      const sourceParam = req.query.get("src") ?? "";
      const source = SOURCE.test(sourceParam) ? sourceParam.toLowerCase() : null;
      const ua = req.headers["user-agent"];
      if (!isBot(ua)) {
        const ip = (req.headers["x-forwarded-for"] ?? req.headers["x-real-ip"] ?? "").split(",")[0]!.trim();
        await r.recordView(experiment.id, visitorKey(ip, ua ?? "", ctx.env.salt), source);
      }
      return html(200, renderLanding(experiment, { source }));
    }

    if (method === "POST") {
      if (!open) return html(410, renderClosed(experiment));
      // A filled honeypot is a bot. Answer as if it worked so it learns nothing.
      if (field(req.body, "website") !== "") return { status: 303, headers: { location: `/x/${experiment.slug}/thanks` } };
      const values = {
        email: field(req.body, "email").toLowerCase(),
        name: field(req.body, "name").slice(0, 120),
        need: field(req.body, "need").slice(0, 4000),
        link: field(req.body, "link").slice(0, 500),
      };
      const sourceField = field(req.body, "src");
      const source = SOURCE.test(sourceField) ? sourceField.toLowerCase() : "direct";
      const again = (error: string) => html(422, renderLanding(experiment, { source, error, values }));
      if (!isEmail(values.email)) return again("Please enter a valid email address so we can send it to you.");
      if (values.need.length < 3) return again("Tell us a little about what you need so we can do it well.");
      if (values.link && !/^https?:\/\//i.test(values.link)) values.link = `https://${values.link}`;
      await r.addSignup({ experiment_id: experiment.id, email: values.email, name: values.name || null, need: values.need, link: values.link || null, source });
      // No address in the redirect: a query string ends up in logs and browser history.
      return { status: 303, headers: { location: `/x/${experiment.slug}/thanks` } };
    }
    return html(405, renderNotFound());
  }

  return html(404, renderNotFound());
}
