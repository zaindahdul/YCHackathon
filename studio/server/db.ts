import { AsyncLocalStorage } from "node:async_hooks";
/**
 * The one database interface the app uses. In production it is a `pg.Client` on the app database
 * Naïve provisions for a `fullstack` app (`DATABASE_URL`); locally and in tests it is PGlite, an
 * in-process Postgres, so both run the same SQL.
 */
export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/** A connection is a transaction boundary. Keep unrelated queries out of an open transaction. */
const owners = new AsyncLocalStorage<ReadonlySet<Db>>();
const wrappers = new WeakMap<Db, Db>();
const states = new WeakMap<
  Db,
  { raw: Db; enqueue<T>(fn: () => Promise<T>): Promise<T> }
>();

export function serializedDb(raw: Db): Db {
  if (states.has(raw)) return raw;
  const previous = wrappers.get(raw);
  if (previous) return previous;
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const wrapper: Db = {
    query: <T>(sql: string, params?: unknown[]) =>
      owners.getStore()?.has(wrapper)
        ? raw.query<T>(sql, params)
        : enqueue(() => raw.query<T>(sql, params)),
  };
  wrappers.set(raw, wrapper);
  states.set(wrapper, { raw, enqueue });
  return wrapper;
}

/** Nested repository operations join the existing connection transaction. */
export function transaction<T>(db: Db, work: () => Promise<T>): Promise<T> {
  const wrapper = serializedDb(db);
  if (owners.getStore()?.has(wrapper)) return work();
  const state = states.get(wrapper)!;
  return state.enqueue(() =>
    owners.run(new Set([...(owners.getStore() ?? []), wrapper]), async () => {
      await state.raw.query("BEGIN");
      try {
        const result = await work();
        await state.raw.query("COMMIT");
        return result;
      } catch (error) {
        await state.raw.query("ROLLBACK");
        throw error;
      }
    }),
  );
}

/**
 * The platform hands us `...?sslmode=require`, which node-postgres reads as "verify the chain"
 * unless told to use libpq semantics; the managed pooler's certificate has no root here, so
 * verification would always fail. Same fix as Naïve's own agency blueprint.
 */
export function libpqCompat(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("sslmode"))
    parsed.searchParams.set("uselibpqcompat", "true");
  return parsed.toString();
}

/** One connection per request, never a pool: a serverless instance is frozen between requests. */
export async function connectPg(
  url: string,
): Promise<Db & { end(): Promise<void> }> {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: libpqCompat(url),
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
  });
  await client.connect();
  const db = serializedDb({
    query: async <T>(sql: string, params?: unknown[]) => {
      const result = await client.query(sql, params as unknown[]);
      return { rows: result.rows as T[] };
    },
  });
  return Object.assign(db, { end: () => client.end() });
}
