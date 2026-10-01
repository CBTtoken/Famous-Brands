import { z } from "zod";
import { api, json } from "@/lib/http";
import { createOrganisation, listOrganisations } from "@/lib/services/org";

export const GET = api(async (_req, actor) => ({ organisations: await listOrganisations(actor) }));
export const POST = api(async (req, actor) => {
  const { name } = z.object({ name: z.string() }).parse(await json(req));
  return { id: await createOrganisation(actor, name) };
});
