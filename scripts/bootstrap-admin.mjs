// Creates the first platform admin, once, from environment variables. Refuses
// to run if any user exists, so it can never overwrite a real account.
//   BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD
//   BOOTSTRAP_ORG_NAME (optional): also creates the first shop group, with
//   this admin as its admin.
import pg from "pg";
const { Client } = pg;
import { hash } from "@node-rs/argon2";

async function main() {
  const { DATABASE_URL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ORG_NAME } = process.env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!BOOTSTRAP_ADMIN_NAME || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    // Runs on every container start; with no bootstrap settings it does nothing.
    console.log("Bootstrap: no BOOTSTRAP_ADMIN_* settings, nothing to do.");
    return;
  }
  if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) throw new Error("Use a bootstrap password of at least 12 characters");
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  const { rows } = await c.query("select count(*)::int as n from users");
  if (rows[0].n > 0) {
    console.log(`Not run: ${rows[0].n} user(s) already exist.`);
    await c.end();
    return;
  }
  const u = await c.query(
    `insert into users (full_name, email, password_hash, is_platform_admin, must_change_password) values ($1,$2,$3,true,true) returning id`,
    [BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL.toLowerCase(), await hash(BOOTSTRAP_ADMIN_PASSWORD)],
  );
  console.log(`Platform admin created: ${BOOTSTRAP_ADMIN_EMAIL}. They must change the password on first sign-in.`);
  if (BOOTSTRAP_ORG_NAME) {
    const o = await c.query(`insert into organisations (name) values ($1) returning id`, [BOOTSTRAP_ORG_NAME]);
    await c.query(`insert into memberships (org_id, user_id, role) values ($1,$2,'admin')`, [o.rows[0].id, u.rows[0].id]);
    console.log(`Shop group created: ${BOOTSTRAP_ORG_NAME}`);
  }
  await c.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
