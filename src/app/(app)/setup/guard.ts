import "server-only";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan } from "@/lib/core/authz";
import { redirect } from "next/navigation";

/** Setup screens are admin only. The API checks again on every call. */
export async function setupContext() {
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "org.manage")) redirect("/");
  return { actor, org };
}
