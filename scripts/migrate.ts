// Applies every file in db/migrations that has not run yet, in name order,
// each in its own transaction. Safe to run on every deploy.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  // Two app containers starting at once must not both migrate.
  await c.query("select pg_advisory_lock(728114)");
  const done = new Set((await c.query("select name from schema_migrations")).rows.map((r) => r.name));
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    try {
      await c.query("begin");
      await c.query(sql);
      await c.query("insert into schema_migrations(name) values ($1)", [f]);
      await c.query("commit");
      console.log(`applied ${f}`);
      applied++;
    } catch (e) {
      await c.query("rollback");
      console.error(`FAILED ${f}`);
      throw e;
    }
  }
  console.log(applied ? `${applied} migration(s) applied` : "database already up to date");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
