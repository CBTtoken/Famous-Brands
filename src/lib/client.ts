"use client";

// Browser side: one way to call the API, with the server's own plain message
// on failure, and a small outbox for when there is no signal.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "offline", "No signal. This was not sent yet.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "error", body?.error?.message ?? "Something went wrong. Please try again.", body?.error?.details);
  }
  return body as T;
}

export type Fix = { lat: number; lng: number; accuracy_m: number } | null;

/** The phone's location, or null if it is off, refused, or slow. Never blocks for more than the timeout. */
export function getFix(timeoutMs = 8000): Promise<Fix> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

/**
 * Shrink a camera photo before sending: about 1600 px on the long side, JPEG.
 * A 4 MB phone photo becomes about 250 KB, which matters on paid data.
 * If the browser cannot do it, the original is sent unchanged.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadPhoto(storeId: string, blob: Blob, fix: Fix, clientId = crypto.randomUUID()) {
  const form = new FormData();
  form.set("photo", blob, "photo.jpg");
  form.set("store_id", storeId);
  form.set("client_id", clientId);
  form.set("captured_at", new Date().toISOString());
  if (fix) {
    form.set("lat", String(fix.lat));
    form.set("lng", String(fix.lng));
    form.set("accuracy_m", String(fix.accuracy_m));
  }
  return apiFetch<{ id: string; duplicate: boolean }>("/api/v1/photos", { method: "POST", body: form });
}

