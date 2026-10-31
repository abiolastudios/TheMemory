import { createMoment, getMoment } from "@/lib/db";
import { MAX_VIDEO_BYTES, MAX_VIDEO_CHUNKS, MAX_VIDEO_SECONDS, VIDEO_EXTENSIONS } from "@/lib/limits";
import { deletePhoto, uploadFromDisk, uploadPhoto } from "@/lib/storage";
import { joinPieces, removePieces } from "@/lib/videoUpload";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Called once every piece of a video has been sent. Joins them, stores the video and its
 * preview frame, and saves the snap. Safe to call again if the response was lost.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/complete">) {
  const { id: rawId } = await ctx.params;
  if (!UUID.test(rawId)) return Response.json({ error: "Bad snap id." }, { status: 400 });
  const id = rawId.toLowerCase();

  // Already saved (a retry after the phone missed our reply): nothing more to do.
  const existing = await getMoment(id).catch(() => null);
  if (existing) return Response.json({ moment: existing });

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || null;
  const pieces = Number(form.get("pieces"));
  const ext = VIDEO_EXTENSIONS[String(form.get("type") ?? "").split(";")[0]];
  const sentDuration = Number(form.get("duration"));
  const duration = Number.isFinite(sentDuration) && sentDuration > 0 ? Math.min(sentDuration, MAX_VIDEO_SECONDS + 5) : null;
  const poster = form.get("poster");
  const now = Date.now();
  const sentTakenAt = Number(form.get("takenAt"));
  const takenAt = new Date(sentTakenAt > now - 30 * 24 * 3600 * 1000 && sentTakenAt <= now ? sentTakenAt : now);

  if (!ext) return Response.json({ error: "Unsupported video type." }, { status: 400 });
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > MAX_VIDEO_CHUNKS) {
    return Response.json({ error: "Bad piece count." }, { status: 400 });
  }

  const joined = await joinPieces(id, pieces);
  // Pieces missing: the phone will send them and try again (409 = "not yet").
  if (!joined) return Response.json({ error: "Some pieces are missing." }, { status: 409 });
  if (joined.size > MAX_VIDEO_BYTES) {
    await removePieces(id);
    return Response.json({ error: "Video is too large." }, { status: 400 });
  }

  const videoKey = `${id}.${ext}`;
  let posterKey: string | null = null;
  try {
    await uploadFromDisk(videoKey, joined.path);
    if (poster instanceof File && poster.size > 0 && poster.type === "image/jpeg") {
      posterKey = `${id}-poster.jpg`;
      await uploadPhoto(posterKey, poster);
    }
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not store the video." }, { status: 500 });
  }

  try {
    const moment = await createMoment({ id, name, takenAt, photoKey: posterKey, video: { key: videoKey, duration } });
    await removePieces(id);
    return Response.json({ moment }, { status: 201 });
  } catch (err) {
    console.error(err);
    await Promise.all([deletePhoto(videoKey), posterKey && deletePhoto(posterKey)].map((p) => Promise.resolve(p).catch(() => {})));
    return Response.json({ error: "Could not save the video." }, { status: 500 });
  }
}
