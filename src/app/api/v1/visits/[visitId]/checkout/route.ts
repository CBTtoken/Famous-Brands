import { api, clientIp, json } from "@/lib/http";
import { checkOut } from "@/lib/services/visits";

export const POST = api<{ visitId: string }>(async (req, actor, { visitId }) => checkOut(actor, visitId, await json(req), clientIp(req.headers)));
