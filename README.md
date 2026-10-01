# S.O.S, Shop Operational Status

Proof of concept for Famous Brands franchise shops: supervision checklists, shop condition and stock, and the S.O.S roll-up. By Digital Flyer.

Start with `CLAUDE.md`, then `WHERE-WE-ARE.md`.

## Run it locally

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL, then: npm run vapid >> .env.local
npm run db:migrate
BOOTSTRAP_ADMIN_NAME="Your Name" BOOTSTRAP_ADMIN_EMAIL=you@example.co.za \
  BOOTSTRAP_ADMIN_PASSWORD="a-long-password" BOOTSTRAP_ORG_NAME="First group" npm run db:bootstrap
npm run dev
```

## Check it

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

`npm test` needs PostgreSQL with a database called `sos_test` (it resets it).

## Deploy

Docker image for Coolify on Xneelo Cloud. See `INFRASTRUCTURE.md`.
