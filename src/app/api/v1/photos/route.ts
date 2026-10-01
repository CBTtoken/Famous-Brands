import { api } from "@/lib/http";
import { badRequest } from "@/lib/core/errors";
import { uploadPhoto } from "@/lib/services/photos";

const num = (v: FormDataEntryValue | null) => (v == null || v === "" ? null : Number(v));

export const POST = api(async (req, actor) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!form || !(file instanceof Blob)) throw badRequest("No photo arrived. Please take it again.");
  return uploadPhoto(actor, {
    storeId: String(form.get("store_id") ?? ""),
    clientId: String(form.get("client_id") ?? ""),
    bytes: Buffer.from(await file.arrayBuffer()),
    lat: num(form.get("lat")), lng: num(form.get("lng")), accuracyM: num(form.get("accuracy_m")),
    capturedAt: (form.get("captured_at") as string | null) ?? null,
  });
});
