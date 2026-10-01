import { z } from "zod";
import { api, json } from "@/lib/http";
import { startRun } from "@/lib/services/runs";

export const POST = api(async (req, actor) => {
  const { template_id } = z.object({ template_id: z.string().uuid() }).parse(await json(req));
  return startRun(actor, template_id);
});
