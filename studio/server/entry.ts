/**
 * The deployed app's whole server: one function behind `/api/app`, serving every path (the host's
 * rewrites in `dist/vercel.json`, written by `build.mjs`, send everything here with the original
 * path in `__path`). The database is the Postgres Naïve provisions for a `fullstack` app; the
 * tables come from `sql/*.sql`, applied by `naive up`.
 */
import { connectPg, type Db } from "./db.ts";
import {
  handleRequest,
  parseBody,
  type ApiReply,
  type ApiRequest,
} from "./routes.ts";

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

export function requestFrom(req: HostRequest, raw?: string): ApiRequest {
  const url = new URL(req.url ?? "/", "http://app");
  const path = url.searchParams.get("__path") ?? url.pathname;
  url.searchParams.delete("__path");
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers))
    headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  let body: unknown = null;
  if (raw !== undefined) {
    body = parseBody(raw, headers["content-type"]);
  } else {
    try {
      // The host parses JSON and form bodies lazily; reading `req.body` can throw on a malformed one.
      body = parseBody(req.body, headers["content-type"]);
    } catch {
      body = null;
    }
  }
  return {
    method: (req.method ?? "GET").toUpperCase(),
    path: path || "/",
    query: url.searchParams,
    headers,
    body,
    ...(raw !== undefined ? { raw } : {}),
  };
}

/** A file upload's bytes, read straight off the stream before the host's body parser touches it. */
class BodyLimitError extends Error {}
export async function readRaw(req: HostRequest): Promise<string | undefined> {
  const limit = 500_000;
  const fallback = () => {
    const value = req.body;
    const text =
      typeof value === "string"
        ? value
        : value instanceof Uint8Array
          ? Buffer.from(value).toString("utf8")
          : undefined;
    if (text !== undefined && Buffer.byteLength(text, "utf8") > limit)
      throw new BodyLimitError("Upload body exceeds the bounded request limit");
    return text;
  };
  const stream = req as unknown as AsyncIterable<Uint8Array>;
  if (typeof stream[Symbol.asyncIterator] !== "function") return fallback();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit)
      throw new BodyLimitError("Upload body exceeds the bounded request limit");
    chunks.push(buffer);
  }
  return bytes ? Buffer.concat(chunks).toString("utf8") : fallback();
}

export function send(res: HostReply, reply: ApiReply): void {
  const headers = { ...(reply.headers ?? {}) };
  const has = (name: string) =>
    Object.keys(headers).some((h) => h.toLowerCase() === name);
  let body: string | undefined;
  if (reply.html !== undefined) {
    if (!has("content-type"))
      headers["content-type"] = "text/html; charset=utf-8";
    body = reply.html;
  } else if (reply.json !== undefined) {
    if (!has("content-type"))
      headers["content-type"] = "application/json; charset=utf-8";
    body = JSON.stringify(reply.json);
  } else if (reply.text !== undefined) {
    if (!has("content-type"))
      headers["content-type"] = "text/plain; charset=utf-8";
    body = reply.text;
  }
  for (const [name, value] of Object.entries(headers))
    res.setHeader(name, value);
  res.status(reply.status).end(body);
}

export default async function handler(
  req: HostRequest,
  res: HostReply,
): Promise<void> {
  let open: (Db & { end(): Promise<void> }) | null = null;
  let pending: Promise<Db & { end(): Promise<void> }> | null = null;
  try {
    const raw =
      (req.method ?? "").toUpperCase() === "PUT"
        ? await readRaw(req)
        : undefined;
    const reply = await handleRequest(requestFrom(req, raw), {
      db: async () => {
        if (open === null) {
          const url = process.env["DATABASE_URL"];
          if (!url)
            throw new Error(
              "DATABASE_URL is unset: the app database is not provisioned yet",
            );
          pending ??= connectPg(url);
          open = await pending;
        }
        return open;
      },
      env: {
        mcpToken: process.env["VETTA_MCP_TOKEN"],
        adminToken: process.env["ADMIN_TOKEN"],
        vars: process.env,
      },
    });
    send(res, reply);
  } catch (error) {
    // The driver's message can name the database host and user: log it, never send it.
    if (error instanceof BodyLimitError) {
      send(res, {
        status: 413,
        json: { error: "Request body exceeds the allowed limit" },
      });
      return;
    }
    console.error(error);
    send(res, {
      status: 503,
      json: { error: "the studio is temporarily unavailable" },
    });
  } finally {
    if (open !== null)
      await (open as Db & { end(): Promise<void> }).end().catch(() => {});
  }
}
