import { api, json } from "@/lib/http";
import { createPerson, listPeople } from "@/lib/services/org";

export const GET = api<{ orgId: string }>(async (_req, actor, { orgId }) => ({ people: await listPeople(actor, orgId) }));
export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => ({ id: await createPerson(actor, orgId, await json(req)) }));
