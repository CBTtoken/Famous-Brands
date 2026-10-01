import { api } from "@/lib/http";
import { readPhoto } from "@/lib/services/photos";

export const GET = api<{ photoId: string }>(async (_req, actor, { photoId }) => {
  const p = await readPhoto(actor, photoId);
  return new Response(new Uint8Array(p.body), {
    headers: { "content-type": p.mime, "cache-control": "private, max-age=86400, immutable", etag: `"${p.etag}"` },
  });
});
