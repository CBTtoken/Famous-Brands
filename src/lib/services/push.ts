import "server-only";
import webpush from "web-push";
import { config } from "../config";
import { one, q } from "../db";
import type { Actor } from "../core/auth";
import { actorUserId } from "../core/authz";
import { badRequest } from "../core/errors";
import { tierLabel, type Tier } from "../core/tiers";

let configured = false;
function ensureVapid() {
  if (configured) return true;
  if (!config.vapid.publicKey || !config.vapid.privateKey) return false;
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  configured = true;
  return true;
}

export function pushConfigured() {
  return !!(config.vapid.publicKey && config.vapid.privateKey);
}

export async function saveSubscription(
  actor: Actor,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
) {
  const userId = actorUserId(actor);
  if (!/^https:\/\//.test(sub.endpoint)) throw badRequest("That push address is not valid.");
  await q(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, disabled_at = null`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 300) ?? null],
  );
}

export async function removeSubscription(actor: Actor, endpoint: string) {
  await q(`delete from push_subscriptions where endpoint = $1 and user_id = $2`, [endpoint, actorUserId(actor)]);
}

export async function mySubscriptions(actor: Actor) {
  return q<{ id: string; user_agent: string | null; created_at: Date; last_success_at: Date | null; last_failure_at: Date | null; disabled_at: Date | null }>(
    `select id, user_agent, created_at, last_success_at, last_failure_at, disabled_at from push_subscriptions
     where user_id = $1 order by created_at desc`,
    [actorUserId(actor)],
  );
}

type QueueRow = {
  id: string; user_id: string; channel: string; attempts: number;
  title: string; body: string; tier: Tier | null; link: string | null; store_name: string | null; alert_id: string;
};

/**
 * Send every queued notification. Each device attempt is written to
 * push_deliveries with the push service's own status code. A notification is
 * only marked "sent" when at least one device accepted it. A person with no
 * device registered is marked "no_device", never "sent".
 */
export async function processNotificationQueue(limit = 50) {
  // Claim rows by marking them "sending" in the same statement, so a second
  // sender running at the same moment cannot pick them up. A claim left by a
  // crashed sender is released after two minutes.
  const rows = await q<QueueRow>(
    `update notifications n set attempts = n.attempts + 1, status = 'sending', claimed_at = now()
     from (select id from notifications
           where attempts < 5 and (status = 'queued' or (status = 'sending' and claimed_at < now() - interval '2 minutes'))
           order by created_at limit $1 for update skip locked) pick,
          alerts a left join stores s on s.id = a.store_id
     where n.id = pick.id and a.id = n.alert_id
     returning n.id, n.user_id, n.channel, n.attempts, a.title, a.body, a.tier, a.link, s.name as store_name, a.id as alert_id`,
    [limit],
  );
  const summary = { picked: rows.length, sent: 0, noDevice: 0, failed: 0, inApp: 0 };
  for (const n of rows) {
    if (n.channel === "in_app") {
      await q(`update notifications set status = 'sent', sent_at = now() where id = $1`, [n.id]);
      summary.inApp++;
      continue;
    }
    const subs = await q<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      `select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1 and disabled_at is null`,
      [n.user_id],
    );
    if (!subs.length) {
      await q(`update notifications set status = 'no_device', last_error = 'No phone has turned on alerts for this person' where id = $1`, [n.id]);
      summary.noDevice++;
      continue;
    }
    if (!ensureVapid()) {
      await q(`update notifications set status = 'failed', last_error = 'Push keys are not configured on the server' where id = $1`, [n.id]);
      summary.failed++;
      continue;
    }
    const payload = JSON.stringify({
      title: `${n.tier ? tierLabel[n.tier] + ": " : ""}${n.title}`,
      body: n.store_name ? `${n.store_name}. ${n.body}` : n.body,
      url: n.link ?? "/alerts",
      tag: n.alert_id,
    });
    let anyOk = false;
    let lastErr: string | null = null;
    for (const s of subs) {
      try {
        const res = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 24,
          urgency: n.tier === "critical" || n.tier === "urgent" ? "high" : "normal",
        });
        anyOk = true;
        await q(`insert into push_deliveries (notification_id, subscription_id, ok, status_code) values ($1,$2,true,$3)`, [n.id, s.id, res.statusCode]);
        await q(`update push_subscriptions set last_success_at = now() where id = $1`, [s.id]);
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        lastErr = `${err.statusCode ?? ""} ${err.body || err.message || "send failed"}`.trim().slice(0, 500);
        await q(`insert into push_deliveries (notification_id, subscription_id, ok, status_code, error) values ($1,$2,false,$3,$4)`, [n.id, s.id, err.statusCode ?? null, lastErr]);
        // 404 and 410 mean the phone has unsubscribed or the browser data was cleared.
        const gone = err.statusCode === 404 || err.statusCode === 410;
        await q(`update push_subscriptions set last_failure_at = now()${gone ? ", disabled_at = now()" : ""} where id = $1`, [s.id]);
      }
    }
    if (anyOk) {
      await q(`update notifications set status = 'sent', sent_at = now(), last_error = null where id = $1`, [n.id]);
      summary.sent++;
    } else {
      // Leave it queued for a retry until five attempts, then mark it failed.
      const final = n.attempts >= 5;
      await q(`update notifications set status = $2, last_error = $3 where id = $1`, [n.id, final ? "failed" : "queued", lastErr]);
      summary.failed++;
    }
  }
  return summary;
}

/** A test push to the person's own devices, reporting exactly what each device said. */
export async function sendTestPush(actor: Actor) {
  const userId = actorUserId(actor);
  if (!ensureVapid()) throw badRequest("Alerts are not set up on the server yet (push keys missing).");
  const subs = await q<{ id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null }>(
    `select id, endpoint, p256dh, auth, user_agent from push_subscriptions where user_id = $1 and disabled_at is null`,
    [userId],
  );
  const results: { device: string; ok: boolean; statusCode: number | null; error?: string }[] = [];
  for (const s of subs) {
    try {
      const res = await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "Test alert", body: "Alerts are working on this phone.", url: "/settings" }),
        { TTL: 300 },
      );
      results.push({ device: s.user_agent ?? "Unknown device", ok: true, statusCode: res.statusCode });
      await q(`update push_subscriptions set last_success_at = now() where id = $1`, [s.id]);
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      results.push({ device: s.user_agent ?? "Unknown device", ok: false, statusCode: err.statusCode ?? null, error: err.message });
      await q(`update push_subscriptions set last_failure_at = now() where id = $1`, [s.id]);
    }
  }
  return results;
}

export async function unreadCount(actor: Actor) {
  if (actor.kind !== "user") return 0;
  const r = await one<{ n: number }>(
    `select count(*)::int as n from notifications n join alerts a on a.id = n.alert_id
     where n.user_id = $1 and a.acknowledged_at is null`,
    [actor.userId],
  );
  return r?.n ?? 0;
}
