/** Local-only studio server. Its development bearer is never exposed on public interfaces. */
import { loadStudioEnv } from "../scripts/env.ts";
import { createServer } from "node:http";
import { send } from "./entry.ts";
import { openLocalDb } from "./local-db.ts";
import { handleRequest, parseBody } from "./routes.ts";

loadStudioEnv();
const port = Number(process.env["PORT"] ?? 8790);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be a valid local port");
const db = await openLocalDb(process.env["PGLITE_DIR"] ?? ".data/pglite");
const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  const hostRes = {
    status(code: number) {
      res.statusCode = code;
      return hostRes;
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
    },
    end(body?: string) {
      res.end(body);
    },
  };
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 1_600_000) {
        send(hostRes, {
          status: 413,
          json: { error: "request body exceeds the allowed size" },
        });
        return;
      }
      chunks.push(buffer);
    }
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(req.headers))
      headers[name] = Array.isArray(value) ? value[0] : value;
    const raw = Buffer.concat(chunks).toString("utf8");
    send(
      hostRes,
      await handleRequest(
        {
          method: (req.method ?? "GET").toUpperCase(),
          path: url.pathname,
          query: url.searchParams,
          headers,
          body: parseBody(raw, headers["content-type"]),
          raw,
        },
        {
          db: async () => db,
          env: {
            mcpToken: process.env["PMF_DEV_TOKEN"] ?? "dev",
            adminToken: process.env["PMF_DEV_TOKEN"] ?? "dev",
            vars: process.env,
          },
        },
      ),
    );
  } catch (error) {
    console.error(error);
    send(hostRes, {
      status: 500,
      json: { error: "the local studio is temporarily unavailable" },
    });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.listen(port, "127.0.0.1", () =>
  console.log(
    `PMF Engine running on http://127.0.0.1:${(server.address() as { port: number }).port} (local MCP bearer configured by PMF_DEV_TOKEN, default dev)`,
  ),
);
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  server.close(() => {
    void db.close();
  });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
