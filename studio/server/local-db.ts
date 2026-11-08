/**
 * PGlite (Postgres compiled to WebAssembly) for local runs and tests, with the same migrations
 * `naive up` applies in production. Never bundled into the deployed function.
 */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { serializedDb, type Db } from "./db.ts";

const SQL_DIR = fileURLToPath(new URL("../sql/", import.meta.url));

export async function openLocalDb(
  dataDir?: string,
): Promise<Db & { close(): Promise<void> }> {
  // PGlite creates only the last directory of the path, so a fresh clone needs the parents made.
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await pg.query<{ name: string }>("select name from _migrations")).rows.map(
      (r) => r.name,
    ),
  );
  for (const file of readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (applied.has(file)) continue;
    await pg.exec(readFileSync(join(SQL_DIR, file), "utf8"));
    await pg.query("insert into _migrations (name) values ($1)", [file]);
  }
  const db = serializedDb({
    query: async <T>(sql: string, params?: unknown[]) => {
      const result = await pg.query<T>(sql, params as unknown[]);
      return { rows: result.rows };
    },
  });
  return Object.assign(db, { close: () => pg.close() });
}
