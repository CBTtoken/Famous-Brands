import { api } from "@/lib/http";
import { getWalk } from "@/lib/services/stock";

export const GET = api<{ walkId: string }>(async (_req, actor, { walkId }) => getWalk(actor, walkId));
