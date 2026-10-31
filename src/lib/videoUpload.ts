// Server-only: receives videos in pieces (see src/lib/limits.ts) and joins them once all
// have arrived. Pieces are kept on disk under .upload-pieces/<snap id>/<index>, so an
// interrupted upload resumes where it stopped, even across server restarts.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const PIECES_DIR = path.join(process.cwd(), ".upload-pieces");
const STALE_MS = 48 * 3600 * 1000;

const piecesFor = (id: string) => path.join(PIECES_DIR, id.toLowerCase());

export async function savePiece(id: string, index: number, data: Uint8Array) {
  const dir = piecesFor(id);
  await mkdir(dir, { recursive: true });
  // Write then rename, so a half-written piece is never mistaken for a complete one.
  const tmp = path.join(dir, `${index}.part`);
  await writeFile(tmp, data);
  await rename(tmp, path.join(dir, String(index)));
}

/** Joins pieces 0..count-1 into one file. Returns its path and size, or null if any are missing. */
export async function joinPieces(id: string, count: number) {
  const dir = piecesFor(id);
  const sizes = await Promise.all(
    Array.from({ length: count }, (_, i) => stat(path.join(dir, String(i))).then((s) => s.size, () => null)),
  );
  if (sizes.some((size) => size === null)) return null;

  const output = path.join(dir, "joined");
  const out = createWriteStream(output);
  for (let i = 0; i < count; i++) {
    await pipeline(createReadStream(path.join(dir, String(i))), out, { end: false });
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  return { path: output, size: sizes.reduce((a, b) => a! + b!, 0)! };
}

export async function removePieces(id: string) {
  await rm(piecesFor(id), { recursive: true, force: true });
}

/** Deletes pieces of uploads that were abandoned days ago, so they don't fill the disk. */
export async function cleanStalePieces() {
  const entries = await readdir(PIECES_DIR).catch(() => [] as string[]);
  const now = Date.now();
  await Promise.all(
    entries.map(async (entry) => {
      const info = await stat(path.join(PIECES_DIR, entry)).catch(() => null);
      if (info && now - info.mtimeMs > STALE_MS) await rm(path.join(PIECES_DIR, entry), { recursive: true, force: true });
    }),
  );
}
