import { z } from "zod";
import { api, json } from "@/lib/http";
import { importResearchedSuppliers, importSmallsCatalogue, importStarterChecklists } from "@/lib/services/library";

export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  const { what } = z.object({ what: z.enum(["checklists", "catalogue", "suppliers"]) }).parse(await json(req));
  if (what === "checklists") return importStarterChecklists(actor, orgId);
  if (what === "catalogue") return importSmallsCatalogue(actor, orgId);
  return importResearchedSuppliers(actor, orgId);
});
