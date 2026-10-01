# INFRASTRUCTURE

Read this before touching hosting, DNS or deployment. Written 1 October 2026, before the first deployment.

## Where it runs

**Temporary home: the HelpLift Xneelo Cloud VM, as a completely separate Coolify project.** Same direction as every new build in the portfolio (Xneelo Cloud + Coolify, not Vercel or hosted Supabase). Nothing is deployed yet: the steps below need Dewald, or a Coolify API token, to carry out.

- Server: Xneelo Cloud VM `154.65.106.166`, Ubuntu 24.04, 8 CPU, 16 GB, Coolify. Dashboard `https://coolify.digitalflyer.co.za`. See HelpLift's `INFRASTRUCTURE.md`.
- The same box runs HelpLift production **and HelpLift's self-hosted Supabase with real data**. Everything below is designed so this app cannot touch either.

## This VM is shared: read HelpLift's rules first

HelpLift's own `INFRASTRUCTURE.md` has a section **"This VM is shared"** that governs every app put on this box. Its rules, as Dewald passed them on (1 October 2026):

- Do not touch anything of HelpLift's: its Coolify project, applications, Supabase services, volumes, env vars or Traefik config.
- Use our **own Coolify Project** and our **own subdomain**.
- Do not share HelpLift's Supabase. This app has its own PostgreSQL resource.
- **Check capacity** (CPU, memory, disk) before deploying, and set resource limits.
- **No untargeted Docker commands** on the server (no `docker system prune`, no `docker restart $(docker ps -q)`, nothing that is not aimed at one of our own containers by name).
- Access: Dewald issues a Coolify API token; a session that needs SSH generates its own keypair and gives Dewald only the public key.

Note: on 1 October 2026 that section existed only in the local copy of HelpLift on Dewald's machine, not on GitHub. It should be committed and pushed so every session can read it.

### How this app gets deployed: the Coolify API, no SSH

The Claude Code cloud session that built this app cannot reach the server over SSH, and does not need to. Everything is done through Coolify's API at `https://coolify.digitalflyer.co.za/api/v1`, the same way HelpLift was deployed (env vars by `PATCH /applications/{uuid}/envs/bulk`, deploy by `POST /deploy`):

1. Read-only first: list servers and existing resources, and check the server's free CPU, memory and disk. Stop and report if there is not clear headroom.
2. Create the project, the PostgreSQL resource and the application, set limits, env vars, domain and volume, deploy.
3. Verify `/api/health` on the new domain.
4. Never call an endpoint that touches a resource outside the "SOS Famous Brands" project.

Needed from Dewald: a Coolify API token (Keys & Tokens, scoped as narrowly as Coolify allows), Coolify's GitHub App given access to `CBTtoken/Famous-Brands`, the DNS record below, and `coolify.digitalflyer.co.za` added to the build environment's allowed network hosts.

## Isolation from HelpLift, the rules

1. **Its own Coolify Project** ("SOS Famous Brands"), not inside the HelpLift project. Own environment variables, own deploy history.
2. **Its own PostgreSQL resource** (Coolify, Databases, PostgreSQL 16). Not HelpLift's Supabase Postgres, not a second database inside it. Own container, own volume, own password. Not exposed publicly ("Make it publicly available" stays off); the app reaches it on Coolify's internal network.
3. **Hard resource limits** on both containers (Configuration, Resource Limits; the default is unlimited, so this is mandatory):
   - App: 1 CPU, max memory 768 MB.
   - Database: 1 CPU, max memory 512 MB.
   That caps this POC at roughly a sixth of the box, whatever happens.
4. **Its own volume for photos**, mounted at `/data` in the app container. Never a path inside HelpLift's volumes.
5. **Its own domain.** Traefik routes by host name, so a separate domain cannot collide with `www.helplift.co.za` or `staging.helplift.co.za`.
6. **No change to HelpLift** of any kind: no shared env vars, no shared network aliases, no edits to its Coolify application, no Traefik config by hand.

## The temporary address

Camera, location and push alerts all need **HTTPS**. Coolify's free `sslip.io` addresses do not get a Let's Encrypt certificate (Coolify's own docs), so they cannot be used for this app.

**Recommended:** one A record in Xneelo's DNS dashboard (where every DigitalFlyer domain lives, Cloudflare is not involved):

```
sos-poc.digitalflyer.co.za   A   154.65.106.166
```

Coolify then issues the certificate itself, the same way `coolify.digitalflyer.co.za` was done. "Hidden" is handled by the app: every page needs a sign-in, `robots.txt` disallows everything, and every response carries `X-Robots-Tag: noindex`. Any name works; it only has to be decided.

## Deploying, step by step (first time)

1. Coolify, Projects, **New Project** "SOS Famous Brands".
2. In it, **New Resource, PostgreSQL 16**. Set Resource Limits (above). Under Backups, add a daily schedule; when an S3 target exists, add it there too.
3. **New Resource, Application**, from the GitHub repo `CBTtoken/Famous-Brands`, build pack **Dockerfile**, port `3000`. Branch `main` once the work is merged; until then, `claude/confident-heisenberg-c70ifu`.
4. Domain: `https://sos-poc.digitalflyer.co.za` (after the DNS record exists).
5. Storage: add a **persistent volume** mounted at `/data`.
6. Environment variables (generate push keys with `npm run vapid` on any machine):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Postgres resource's internal URL |
   | `APP_URL` | `https://sos-poc.digitalflyer.co.za` |
   | `APP_TIME_ZONE` | `Africa/Johannesburg` |
   | `STORAGE_DRIVER` | `local` |
   | `STORAGE_LOCAL_DIR` | `/data/photos` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `npm run vapid`, **also tick "Build variable"** |
   | `VAPID_PRIVATE_KEY` | from `npm run vapid` |
   | `VAPID_SUBJECT` | `mailto:info@digitalflyer.co.za` |
   | `CRON_SECRET` | a long random string |
   | `TRUST_PROXY` | `true` (the app sits behind Coolify's Traefik) |
   | `PROXY_HOPS` | `1` (only Traefik in front; if a CDN is ever added in front, this must change) |
   | `SECURE_COOKIES` | leave unset (on in production) |
   | `BOOTSTRAP_ADMIN_NAME` / `_EMAIL` / `_PASSWORD` / `BOOTSTRAP_ORG_NAME` | first run only, remove afterwards |

7. Resource Limits on the app (above). Deploy.
8. The container runs the database migrations on every start, then the first-admin script. That script only acts when the `BOOTSTRAP_*` variables are set and the database has no users, so the first deploy creates the platform admin by itself, with no terminal or SSH. Remove the `BOOTSTRAP_*` variables after the first successful start.
9. Check `https://sos-poc.digitalflyer.co.za/api/health`. It tests the real things: a database round trip, a photo write and read back, and that push keys are set. All three must say `ok`.
10. **Scheduled task** in Coolify on the app, every 5 minutes, retrying any alert that did not go out first time:
    `node -e "fetch('http://127.0.0.1:3000/api/v1/notifications/process',{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"`

## Moving it later

Designed as a lift-and-shift: nothing about the address or the box is in the code.

1. On the new host: same Dockerfile, same variables, new `APP_URL`.
2. `pg_dump` the Postgres resource and restore it (same Postgres major version).
3. Copy the `/data/photos` volume (or switch to `STORAGE_DRIVER=s3` and upload the folder to the bucket with the same keys).
4. Point the DNS record at the new box. Push subscriptions keep working as long as the VAPID keys and the domain stay the same; a new domain means each person turns alerts on again under Settings.
5. Delete the Coolify project on the HelpLift box. HelpLift is untouched throughout.

## Photo storage at volume

The POC stores photos on the app's volume. A phone photo is shrunk on the phone to about 250 KB before upload, so 10 photos a day across 100 shops is about 90 GB a year. Before a wide rollout, move to an S3-compatible bucket (`STORAGE_DRIVER=s3`). Xneelo has no object storage product that we could find; South African options include Z1 Storage. Cloudflare R2 is cheap but stores data outside South Africa, which matters under POPIA for staff photos and locations.

## Not set up yet

- The deployment itself (needs Dewald or a Coolify API token, and the DNS record).
- Off-box backups of the database and photos.
- Email: there is none. Alerts are push only for now.
