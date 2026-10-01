// Every setting comes from the environment. Nothing that differs between the
// temporary home and the permanent one is written into the code.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  databasePoolSize: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  // Public address of the app, used in links inside notifications.
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Store time zone. Every "today" and "this week" is worked out here.
  timeZone: process.env.APP_TIME_ZONE ?? "Africa/Johannesburg",
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  // When true, cookies are only sent over HTTPS. Must be true in production.
  secureCookies: process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production",
  // Trust X-Forwarded-For from the reverse proxy (Traefik on Coolify).
  trustProxy: process.env.TRUST_PROXY !== "false",
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
    localDir: process.env.STORAGE_LOCAL_DIR ?? "./.data/photos",
    s3Bucket: process.env.S3_BUCKET ?? "",
    s3Region: process.env.S3_REGION ?? "auto",
    s3Endpoint: process.env.S3_ENDPOINT,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  maxPhotoBytes: Number(process.env.MAX_PHOTO_BYTES ?? 8 * 1024 * 1024),
  vapid: {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:info@digitalflyer.co.za",
  },
  // Shared secret for the scheduled queue processor endpoint.
  cronSecret: process.env.CRON_SECRET ?? "",
};
