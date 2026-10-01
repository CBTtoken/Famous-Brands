# S.O.S Shop Operations: production image for Coolify (Dockerfile build pack).
# Multi-stage: dependencies, build, then a small runtime that starts with
# database migrations and runs as a non-root user.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The push public key is read by the browser, so it must be known at build
# time. Set it as a build variable in Coolify as well as a runtime variable.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_LOCAL_DIR=/data/photos
RUN groupadd -r sos && useradd -r -g sos sos && mkdir -p /data/photos && chown -R sos:sos /data
COPY --from=build --chown=sos:sos /app/.next/standalone ./
COPY --from=build --chown=sos:sos /app/.next/static ./.next/static
COPY --from=build --chown=sos:sos /app/public ./public
COPY --from=build --chown=sos:sos /app/db ./db
COPY --from=build --chown=sos:sos /app/scripts/migrate.mjs /app/scripts/bootstrap-admin.mjs ./scripts/
USER sos
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations on every start. The first-admin script also runs every start but
# only acts when BOOTSTRAP_ADMIN_* are set AND the database has no users, so
# the first deploy needs no terminal or SSH access.
CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/bootstrap-admin.mjs && node server.js"]
