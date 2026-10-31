// Admin: downloads snaps as a ZIP, built and streamed by the server so even many large
// videos never have to fit in the browser's memory. Submitted as a normal form (POST) so
// the browser handles it as a file download.
import { Readable } from "node:stream";
import { type ArchiverError, ZipArchive } from "archiver";
import { listMomentFiles, listStatuses } from "@/lib/db";
import { readStored } from "@/lib/storage";

export async function POST(request: Request) {
  const form = await request.formData();
  if (!process.env.ADMIN_PASSWORD || form.get("password") !== process.env.ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }
  const category = String(form.get("category") ?? "") || null;
  const guest = String(form.get("guest") ?? "") || null;
  const filename = String(form.get("filename") ?? "snaps.zip").replace(/[^\w.-]+/g, "-");

  const [rows, statuses] = await Promise.all([listMomentFiles(), listStatuses()]);
  const categoryOf = (c: string | null) => c || "Uncategorised";
  const selected = rows.filter(
    (r) => (!category || categoryOf(r.category) === category) && (!guest || (r.name || "Guest") === guest),
  );

  // Folders numbered in the order the categories happened.
  const order = [...new Set([...[...statuses].reverse().map((s) => s.label), ...selected.map((r) => categoryOf(r.category))])];
  const folders = order.filter((c) => selected.some((r) => categoryOf(r.category) === c));

  const archive = new ZipArchive({ store: true }); // photos and videos are already compressed
  archive.on("warning", (err: ArchiverError) => console.warn(err));
  archive.on("error", (err: ArchiverError) => console.error(err));

  void (async () => {
    for (let i = 0; i < selected.length; i++) {
      const r = selected[i];
      const key = r.kind === "video" ? r.video_key : r.photo_key;
      if (!key) continue;
      const folder = `${String(folders.indexOf(categoryOf(r.category)) + 1).padStart(2, "0")} ${safeName(categoryOf(r.category))}`;
      const time = r.created_at.toTimeString().slice(0, 8).replaceAll(":", "");
      const name = `${folder}/${String(i + 1).padStart(3, "0")}-${time}-${slug(r.name)}${r.kind === "video" ? "-video" : ""}.${key.split(".").pop()}`;
      try {
        const stream = await readStored(key);
        archive.append(stream, { name, date: r.created_at });
        // Wait for this file to be written before opening the next, to keep memory low.
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          stream.once("end", done);
          stream.once("error", done);
          stream.once("close", done);
        });
      } catch (err) {
        console.error(`Skipping ${key} in ZIP:`, err);
      }
    }
    await archive.finalize();
  })();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function slug(name: string | null) {
  return (name ?? "guest").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest";
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "").trim() || "Snaps";
}
