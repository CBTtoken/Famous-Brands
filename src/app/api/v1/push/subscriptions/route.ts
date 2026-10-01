import { z } from "zod";
import { api, json } from "@/lib/http";
import { mySubscriptions, removeSubscription, saveSubscription } from "@/lib/services/push";

const sub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }) });
export const GET = api(async (_req, actor) => ({ devices: await mySubscriptions(actor) }));
export const POST = api(async (req, actor) => {
  await saveSubscription(actor, sub.parse(await json(req)), req.headers.get("user-agent"));
  return { ok: true };
});
export const DELETE = api(async (req, actor) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(await json(req));
  await removeSubscription(actor, endpoint);
  return { ok: true };
});
