import { api } from "@/lib/http";
import { revokeApiKey } from "@/lib/services/integration";

export const DELETE = api<{ orgId: string; keyId: string }>(async (_req, actor, { orgId, keyId }) => {
  await revokeApiKey(actor, orgId, keyId);
  return { ok: true };
});
