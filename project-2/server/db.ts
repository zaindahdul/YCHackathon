/**
 * The one database interface the app uses. In production it is a `pg.Client` on the app database
 * Naïve provisions for a `fullstack` app (`DATABASE_URL`); locally and in tests it is PGlite, an
 * in-process Postgres, so both run the same SQL.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * The platform hands us `...?sslmode=require`, which node-postgres reads as "verify the chain"
 * unless told to use libpq semantics; the managed pooler's certificate has no root here, so
 * verification would always fail. Same fix as Naïve's own agency blueprint.
 */
export function libpqCompat(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("sslmode")) parsed.searchParams.set("uselibpqcompat", "true");
  return parsed.toString();
}

/** One connection per request, never a pool: a serverless instance is frozen between requests. */
export async function connectPg(url: string): Promise<Db & { end(): Promise<void> }> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: libpqCompat(url), connectionTimeoutMillis: 5_000, statement_timeout: 8_000 });
  await client.connect();
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const result = await client.query(sql, params as unknown[]);
      return { rows: result.rows as T[] };
    },
    end: () => client.end(),
  };
}
