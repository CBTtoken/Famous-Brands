import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config";
import { one } from "../db";
import type { Actor } from "../core/auth";
import { actorUserId, requireStore } from "../core/authz";
import { badRequest, notFound } from "../core/errors";
import { recordEvent } from "../core/events";
import { photoStore, putVerified } from "../storage";

/** Work out what an upload really is from its first bytes, never from its name. */
export function sniffImage(b: Buffer): { mime: string; ext: string; width: number | null; height: number | null } | null {
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // Walk JPEG segments to the frame header for the size.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: "image/jpeg", ext: "jpg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { mime: "image/jpeg", ext: "jpg", width: null, height: null };
  }
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp", width: null, height: null };
  }
  return null;
}

export type PhotoUpload = {
  storeId: string;
  clientId: string;
  bytes: Buffer;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  capturedAt?: string | null;
};

/**
 * Store a photo and check what actually landed. A retry of the same upload
 * (same clientId, after lost signal) returns the first copy rather than
 * storing it twice.
 */
export async function uploadPhoto(actor: Actor, u: PhotoUpload) {
  const userId = actorUserId(actor);
  const { store } = await requireStore(actor, u.storeId, "stock.report");
  if (!/^[0-9a-f-]{36}$/i.test(u.clientId)) throw badRequest("Photo upload is missing its reference. Please take it again.");
  const prior = await one<{ id: string; uploaded_by: string; store_id: string }>(
    `select id, uploaded_by, store_id from photos where client_id = $1`,
    [u.clientId],
  );
  if (prior) {
    if (prior.uploaded_by !== userId || prior.store_id !== u.storeId) throw badRequest("Photo reference already used.");
    return { id: prior.id, duplicate: true };
  }
  if (!u.bytes.length) throw badRequest("The photo arrived empty. Please take it again.");
  if (u.bytes.length > config.maxPhotoBytes) {
    throw badRequest(`The photo is too large (${Math.round(u.bytes.length / 1024 / 1024)} MB). Please take it again.`);
  }
  const kind = sniffImage(u.bytes);
  if (!kind) throw badRequest("That file is not a photo we can store (JPEG, PNG or WebP only).");
  const sha256 = createHash("sha256").update(u.bytes).digest("hex");
  const now = new Date();
  const key = `${store.org_id}/${store.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${kind.ext}`;
  // Guard the door: the stored bytes must be the bytes sent, by digest.
  await putVerified(key, u.bytes, kind.mime);
  const capturedAt = u.capturedAt && !Number.isNaN(Date.parse(u.capturedAt)) ? u.capturedAt : null;
  const row = await one<{ id: string }>(
    `insert into photos (org_id, store_id, client_id, storage_key, sha256, bytes, mime, width, height, lat, lng, accuracy_m, client_captured_at, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
    [store.org_id, store.id, u.clientId, key, sha256, u.bytes.length, kind.mime, kind.width, kind.height, u.lat ?? null, u.lng ?? null, u.accuracyM ?? null, capturedAt, userId],
  ).catch(async (e) => {
    // The same retry arrived twice at once: the other copy won. Use it.
    if ((e as { code?: string }).code !== "23505") throw e;
    return null;
  });
  if (!row) {
    const won = await one<{ id: string; uploaded_by: string }>(`select id, uploaded_by from photos where client_id = $1`, [u.clientId]);
    if (!won || won.uploaded_by !== userId) throw badRequest("Photo reference already used.");
    return { id: won.id, duplicate: true };
  }
  await recordEvent(actor, store.org_id, "photo.uploaded", "photo", row!.id, { store_id: store.id, bytes: u.bytes.length, sha256 });
  return { id: row!.id, duplicate: false };
}

export async function readPhoto(actor: Actor, photoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) throw notFound("That photo");
  const p = await one<{ store_id: string; storage_key: string; mime: string; sha256: string }>(
    `select store_id, storage_key, mime, sha256 from photos where id = $1`,
    [photoId],
  );
  if (!p) throw notFound("That photo");
  await requireStore(actor, p.store_id, "stock.view");
  return { body: await photoStore().get(p.storage_key), mime: p.mime, etag: p.sha256 };
}
