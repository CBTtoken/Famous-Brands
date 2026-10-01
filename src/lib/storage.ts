import "server-only";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

// Photos live behind one small interface so the temporary home (a disk volume
// on the VM) and the permanent one (any S3-compatible bucket) are a setting,
// not a rewrite. Keys look like org/store/yyyy/mm/uuid.jpg.

export interface PhotoStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  size(key: string): Promise<number>;
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
}

let store: PhotoStore | null = null;
export function photoStore(): PhotoStore {
  store ??= config.storage.driver === "s3" ? new S3Store() : new LocalStore();
  return store;
}
