import { connection } from "next/server";
import { createMoment, listMoments } from "@/lib/db";
import { deletePhoto, uploadPhoto } from "@/lib/storage";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function GET() {
  await connection();
  try {
    return Response.json({ moments: await listMoments() });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load memories." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || null;
  const photo = form.get("photo");
  // When the snap was taken on the phone (it may upload much later after being offline).
  // Ignore clocks that are in the future or wildly off.
  const now = Date.now();
  const sentTakenAt = Number(form.get("takenAt"));
  const takenAt = new Date(
    sentTakenAt > now - 30 * 24 * 3600 * 1000 && sentTakenAt <= now ? sentTakenAt : now,
  );

  if (!UUID.test(id)) return Response.json({ error: "Missing snap id." }, { status: 400 });
  if (!(photo instanceof File) || photo.size === 0) {
    return Response.json({ error: "Missing photo." }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[photo.type];
  if (!ext) return Response.json({ error: "Photos must be JPEG, PNG or WebP." }, { status: 400 });
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "That photo is too large (max 8 MB)." }, { status: 400 });
  }

  // Named after the snap id, so a retried upload overwrites the same file.
  const photoKey = `${id.toLowerCase()}.${ext}`;
  try {
    await uploadPhoto(photoKey, photo);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not upload the photo." }, { status: 500 });
  }

  try {
    const moment = await createMoment({ id, name, photoKey, takenAt });
    return Response.json({ moment }, { status: 201 });
  } catch (err) {
    console.error(err);
    await deletePhoto(photoKey).catch(() => {});
    return Response.json({ error: "Could not save the photo." }, { status: 500 });
  }
}
