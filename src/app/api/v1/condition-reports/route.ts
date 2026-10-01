import { api, json } from "@/lib/http";
import { reportCondition } from "@/lib/services/stock";

export const POST = api(async (req, actor) => reportCondition(actor, await json(req)));
