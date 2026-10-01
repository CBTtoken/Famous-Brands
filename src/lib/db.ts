import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// One pool per server process. In development Next.js reloads modules, so the
// pool is parked on globalThis to avoid leaking connections on every edit.
const globalForPool = globalThis as unknown as { __sosPool?: Pool };

// Created on first use, not at import, so "next build" (which imports every
// route) works without a database. The Docker build stage has none.
function realPool(): Pool {
  globalForPool.__sosPool ??= new Pool({ connectionString: config.databaseUrl, max: config.databasePoolSize });
  return globalForPool.__sosPool;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const p = realPool();
    const v = Reflect.get(p, prop, p);
    return typeof v === "function" ? v.bind(p) : v;
  },
});

export type Db = Pool | PoolClient;

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T | null> {
  const rows = await q<T>(sql, params, db);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
