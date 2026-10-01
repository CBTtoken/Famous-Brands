import { api } from "@/lib/http";
import { sendTestPush } from "@/lib/services/push";

export const POST = api(async (_req, actor) => ({ results: await sendTestPush(actor) }));
