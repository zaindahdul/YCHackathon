/**
 * `npm run dev`: the whole app on http://localhost:8790 over a local PGlite database in
 * `.data/`, with the same routes the deployed function serves. The MCP endpoint and the
 * interventions route accept the bearer `dev`.
 *
 *   curl -s localhost:8790/mcp -H 'authorization: Bearer dev' -H 'content-type: application/json' \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_scoreboard","arguments":{}}}'
 */
import { createServer } from "node:http";
import { send } from "./entry.ts";
import { openLocalDb } from "./local-db.ts";
import { handleRequest, parseBody } from "./routes.ts";

const port = Number(process.env["PORT"] ?? 8790);
const db = await openLocalDb(process.env["PGLITE_DIR"] ?? ".data/pglite");

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) headers[name] = Array.isArray(value) ? value[0] : value;
  const hostRes = {
    status(code: number) { res.statusCode = code; return hostRes; },
    setHeader(name: string, value: string) { res.setHeader(name, value); },
    end(body?: string) { res.end(body); },
  };
  try {
    const reply = await handleRequest(
      {
        method: (req.method ?? "GET").toUpperCase(),
        path: url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname,
        query: url.searchParams,
        headers,
        body: parseBody(Buffer.concat(chunks), headers["content-type"]),
      },
      { db: async () => db, env: { mcpToken: "dev", adminToken: "dev", salt: "dev", vars: process.env } },
    );
    send(hostRes, reply);
  } catch (error) {
    console.error(error);
    send(hostRes, { status: 500, json: { error: String(error) } });
  }
}).listen(port, () => {
  console.log(`PMF Engine running on http://localhost:${port}  (MCP: POST /mcp with "Authorization: Bearer dev")`);
});
