// A stand-in for Google's or Apple's push service, for tests. It speaks
// HTTPS, checks the VAPID signature header is present, and decrypts each
// message with the subscription's private key, which proves the payload a
// real phone would receive.
import { execFileSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece");

export type Received = { path: string; authorization: string | undefined; ttl: string | undefined; urgency: string | undefined; payload: unknown };

export async function startFakePushService() {
  const dir = mkdtempSync(join(tmpdir(), "fakepush-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
    "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const subscribers = new Map<string, { ecdh: ReturnType<typeof createECDH>; auth: Buffer }>();
  const received: Received[] = [];
  let failNext = 0;
  const server: Server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (failNext > 0) {
        failNext--;
        res.writeHead(410).end("gone");
        return;
      }
      const id = req.url!.slice(1);
      const sub = subscribers.get(id);
      if (!sub || !String(req.headers.authorization ?? "").startsWith("vapid t=")) {
        res.writeHead(403).end("bad subscriber or missing VAPID");
        return;
      }
      const plain = ece.decrypt(Buffer.concat(chunks), { version: "aes128gcm", privateKey: sub.ecdh, authSecret: sub.auth });
      received.push({ path: req.url!, authorization: req.headers.authorization, ttl: req.headers.ttl as string, urgency: req.headers.urgency as string, payload: JSON.parse(plain.toString()) });
      res.writeHead(201).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    received,
    failNext: (n: number) => { failNext = n; },
    /** A new phone: returns what the browser would hand our server. */
    newSubscription() {
      const id = randomBytes(8).toString("hex");
      const ecdh = createECDH("prime256v1");
      ecdh.generateKeys();
      const auth = randomBytes(16);
      subscribers.set(id, { ecdh, auth });
      return {
        endpoint: `https://localhost:${port}/${id}`,
        keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
      };
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
