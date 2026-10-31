// Server-only: photo and video storage. Uses Cloudflare R2 (through its S3-compatible API)
// when R2_BUCKET is set; otherwise saves to a local folder (fine on a VPS; back it up).
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const LOCAL_DIR = path.join(process.cwd(), ".local-uploads");
const r2Enabled = () => !!process.env.R2_BUCKET;

/** Storage keys are `<uuid>.<ext>` or `<uuid>-poster.jpg`; anything else is refused. */
export const KEY_PATTERN = /^[0-9a-f-]{36}(-poster)?\.(jpg|png|webp|mp4|mov|webm|m4v)$/;

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
};

export const contentTypeOf = (key: string) => CONTENT_TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";

let client: S3Client | null = null;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in .env.local`);
  return value;
}

function r2() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

/** Stores a small file (a photo or poster) received in a request. */
export async function uploadPhoto(key: string, file: Blob) {
  const body = new Uint8Array(await file.arrayBuffer());
  if (!r2Enabled()) {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, key), body);
    return;
  }
  await r2().send(new PutObjectCommand({ Bucket: env("R2_BUCKET"), Key: key, Body: body, ContentType: file.type }));
}

/** Stores a large file (a video) that's already on disk, streaming it rather than loading it into memory. */
export async function uploadFromDisk(key: string, filePath: string) {
  if (!r2Enabled()) {
    await mkdir(LOCAL_DIR, { recursive: true });
    const target = path.join(LOCAL_DIR, key);
    // rename is instant on the same disk; fall back to copying across disks.
    await rename(filePath, target).catch(async () => {
      await copyFile(filePath, target);
      await rm(filePath, { force: true });
    });
    return;
  }
  const { size } = await stat(filePath);
  await r2().send(
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
      ContentType: contentTypeOf(key),
    }),
  );
  await rm(filePath, { force: true });
}

export async function deletePhoto(key: string) {
  if (!r2Enabled()) {
    await rm(path.join(LOCAL_DIR, key), { force: true });
    return;
  }
  await r2().send(new DeleteObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
}

export function publicUrl(key: string) {
  if (!r2Enabled()) return `/api/media/${key}`;
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

/** Reads a stored file as a stream (for the ZIP download). */
export async function readStored(key: string): Promise<Readable> {
  if (!r2Enabled()) return createReadStream(path.join(LOCAL_DIR, key));
  const res = await r2().send(new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
  return res.Body as Readable;
}

/**
 * Serves a locally stored file, honouring HTTP Range requests (Safari won't play a video
 * without them). Returns null when R2 is in use, the key is invalid or the file is missing.
 */
export async function serveLocal(key: string, rangeHeader: string | null) {
  if (r2Enabled() || !KEY_PATTERN.test(key)) return null;
  const filePath = path.join(LOCAL_DIR, key);
  const size = await stat(filePath).then((s) => s.size, () => null);
  if (size === null) return null;

  const headers: Record<string, string> = {
    "Content-Type": contentTypeOf(key),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
