import { api, clientIp, json } from "@/lib/http";
import { activeVisit, checkIn } from "@/lib/services/visits";

export const GET = api(async (_req, actor) => ({ visit: await activeVisit(actor) }));
export const POST = api(async (req, actor) => checkIn(actor, await json(req), clientIp(req.headers)));
