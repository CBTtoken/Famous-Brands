import { api } from "@/lib/http";
import { submitWalk } from "@/lib/services/stock";

export const POST = api<{ walkId: string }>(async (_req, actor, { walkId }) => submitWalk(actor, walkId));
