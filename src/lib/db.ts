import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// One pool per server process. In development Next.js reloads modules, so the
// pool is parked on globalThis to avoid leaking connections on every edit.
const globalForPool = globalThis as unknown as { __sosPool?: Pool };

export const pool =
  globalForPool.__sosPool ??
  new Pool({ connectionString: config.databaseUrl, max: config.databasePoolSize });
if (process.env.NODE_ENV !== "production") globalForPool.__sosPool = pool;

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
