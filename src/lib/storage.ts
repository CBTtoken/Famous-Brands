import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

// Photos live behind one small interface so the temporary home (a disk volume
// on the VM) and the permanent one (any S3-compatible bucket) are a setting,
// not a rewrite. Keys look like org/store/yyyy/mm/uuid.jpg.

export interface PhotoStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  size(key: string): Promise<number>;
  remove(key: string): Promise<void>;
}

class LocalStore implements PhotoStore {
  private root = resolve(config.storage.localDir);
  private path(key: string) {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error("Bad storage key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async size(key: string) {
    return (await stat(this.path(key))).size;
  }
  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

class S3Store implements PhotoStore {
  private client = new S3Client({
    region: config.storage.s3Region,
    endpoint: config.storage.s3Endpoint,
    forcePathStyle: !!config.storage.s3Endpoint,
    credentials: { accessKeyId: config.storage.s3AccessKeyId, secretAccessKey: config.storage.s3SecretAccessKey },
  });
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: config.storage.s3Bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: config.storage.s3Bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async size(key: string) {
    const r = await this.client.send(new HeadObjectCommand({ Bucket: config.storage.s3Bucket, Key: key }));
    return r.ContentLength ?? -1;
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: config.storage.s3Bucket, Key: key }));
  }
}

let store: PhotoStore | null = null;
export function photoStore(): PhotoStore {
  store ??= config.storage.driver === "s3" ? new S3Store() : new LocalStore();
  return store;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/**
 * Stores bytes and proves they arrived intact: the SHA-256 of what was sent
 * against the SHA-256 of what reads back, retried because the faults that
 * corrupt an upload are intermittent. A failed object is removed, and the
 * caller is told the truth rather than shown success.
 *
 * Ported on 1 October 2026 from DigitalFlyer Growth (src/lib/storage/put.ts).
 * There, a stored photo once had the right type and length and still could
 * not be opened, because every byte above 0x7F had been replaced in transit.
 * A size check cannot see that; a digest can, for any kind of file.
 */
export async function putVerified(key: string, body: Buffer, contentType: string, attempts = 3): Promise<{ attempts: number }> {
  const ps = photoStore();
  const expected = sha256(body);
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await ps.put(key, body, contentType);
    try {
      const back = await ps.get(key);
      if (sha256(back) === expected) return { attempts: attempt };
      last = `read back ${back.length} bytes that do not match the ${body.length} sent`;
    } catch (e) {
      last = `could not read it back (${e instanceof Error ? e.message : String(e)})`;
    }
  }
  await ps.remove(key).catch(() => undefined);
  throw new Error(`Photo storage check failed after ${attempts} attempts: ${last}`);
}
