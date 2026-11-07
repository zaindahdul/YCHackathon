/**
 * The deployed app's whole server: one function behind `/api/app`, serving every path (the host's
 * rewrites in `dist/vercel.json`, written by `build.mjs`, send everything here with the original
 * path in `__path`). The database is the Postgres Naïve provisions for a `fullstack` app; the
 * tables come from `sql/*.sql`, applied by `naive up`.
 */
import { connectPg, type Db } from "./db.ts";
import { handleRequest, parseBody, type ApiReply, type ApiRequest } from "./routes.ts";

interface HostRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface HostReply {
  status(code: number): HostReply;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export function requestFrom(req: HostRequest): ApiRequest {
  const url = new URL(req.url ?? "/", "http://app");
  const path = url.searchParams.get("__path") ?? url.pathname;
  url.searchParams.delete("__path");
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  let body: unknown = null;
  try {
    // The host parses JSON and form bodies lazily; reading `req.body` can throw on a malformed one.
    body = parseBody(req.body, headers["content-type"]);
  } catch {
    body = null;
  }
  return {
    method: (req.method ?? "GET").toUpperCase(),
    path: path.length > 1 ? path.replace(/\/+$/, "") : path,
    query: url.searchParams,
    headers,
    body,
  };
}

export function send(res: HostReply, reply: ApiReply): void {
  for (const [name, value] of Object.entries(reply.headers ?? {})) res.setHeader(name, value);
  if (reply.html !== undefined) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(reply.status).end(reply.html);
  }
  if (reply.json !== undefined) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    return res.status(reply.status).end(JSON.stringify(reply.json));
  }
  if (reply.text !== undefined) {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.status(reply.status).end(reply.text);
  }
  return res.status(reply.status).end();
}

export default async function handler(req: HostRequest, res: HostReply): Promise<void> {
  let open: (Db & { end(): Promise<void> }) | null = null;
  try {
    const reply = await handleRequest(requestFrom(req), {
      db: async () => {
        if (open === null) {
          const url = process.env["DATABASE_URL"];
          if (!url) throw new Error("DATABASE_URL is unset: the app database is not provisioned yet");
          open = await connectPg(url);
        }
        return open;
      },
      env: {
        mcpToken: process.env["VETTA_MCP_TOKEN"],
        adminToken: process.env["ADMIN_TOKEN"],
        salt: process.env["VISITOR_SALT"] ?? process.env["VETTA_MCP_TOKEN"] ?? "pmf",
        vars: process.env,
      },
    });
    send(res, reply);
  } catch (error) {
    // The driver's message can name the database host and user: log it, never send it.
    console.error(error);
    send(res, { status: 503, json: { error: "the app is temporarily unavailable" } });
  } finally {
    if (open !== null) await (open as Db & { end(): Promise<void> }).end().catch(() => {});
  }
}
