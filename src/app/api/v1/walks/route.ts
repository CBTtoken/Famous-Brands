import { api } from "@/lib/http";
import { startWalk } from "@/lib/services/stock";

export const POST = api(async (_req, actor) => startWalk(actor));
