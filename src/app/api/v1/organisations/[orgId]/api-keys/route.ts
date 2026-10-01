import { z } from "zod";
import { api, json } from "@/lib/http";
import { createApiKey, listApiKeys } from "@/lib/services/integration";

export const GET = api<{ orgId: string }>(async (_req, actor, { orgId }) => ({ keys: await listApiKeys(actor, orgId) }));
export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  const b = z.object({ name: z.string(), role: z.enum(["admin", "area_manager", "shop_manager", "supervisor"]) }).parse(await json(req));
  return createApiKey(actor, orgId, b.name, b.role);
});
