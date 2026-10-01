"use client";

import { apiFetch, ApiError, uploadPhoto, type Fix } from "./client";

// Cold rooms and storerooms have no signal. An answer that cannot be sent is
// kept on the phone (IndexedDB, photos included) and sent when the signal
// returns. The phone's capture time travels with it; the server stamps its
// own time on arrival, so nothing can be back-dated.

export type PendingAnswer = {
  key: string; // runId:itemId, so a newer answer for the same task replaces an older one
  runId: string;
  itemId: string;
  storeId: string;
  body: Record<string, unknown>;
  photo?: { blob: Blob; clientId: string; fix: Fix };
  savedAt: string;
};

const DB = "sos-outbox";
const STORE = "answers";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const queueAnswer = (p: PendingAnswer) => withStore("readwrite", (s) => s.put(p));
export const pendingAnswers = () => withStore<PendingAnswer[]>("readonly", (s) => s.getAll() as IDBRequest<PendingAnswer[]>);
const remove = (key: string) => withStore("readwrite", (s) => s.delete(key));

export async function sendAnswer(p: Omit<PendingAnswer, "key" | "savedAt">) {
  const body = { ...p.body };
  if (p.photo) {
    const up = await uploadPhoto(p.storeId, p.photo.blob, p.photo.fix, p.photo.clientId);
    body.photo_id = up.id;
  }
  return apiFetch<{ complete: boolean; is_exception: boolean; reason: string | null; missing: string[]; alerted: boolean }>(
    `/api/v1/runs/${p.runId}/items/${p.itemId}`,
    { method: "PUT", json: body },
  );
}

/**
 * Send everything waiting. Returns what happened to each, so the screen can
 * say exactly that. A rejection from the server (not a lost signal) is kept
 * out of the queue and reported, never silently dropped.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: { key: string; message: string }[]; stillWaiting: number }> {
  let sent = 0, stillWaiting = 0;
  const failed: { key: string; message: string }[] = [];
  let items: PendingAnswer[] = [];
  try {
    items = await pendingAnswers();
  } catch {
    return { sent, failed, stillWaiting };
  }
  for (const p of items.sort((a, b) => a.savedAt.localeCompare(b.savedAt))) {
    try {
      await sendAnswer(p);
      await remove(p.key);
      sent++;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        stillWaiting++;
      } else {
        failed.push({ key: p.key, message: e instanceof Error ? e.message : "Not accepted" });
        await remove(p.key);
      }
    }
  }
  return { sent, failed, stillWaiting };
}
