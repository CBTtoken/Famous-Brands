import { z } from "zod";
import { api, json } from "@/lib/http";
import { createDemoGroup } from "@/lib/services/demo";

export const POST = api(async (req, actor) => {
  const { password } = z.object({ password: z.string() }).parse(await json(req));
  return createDemoGroup(actor, password);
});
