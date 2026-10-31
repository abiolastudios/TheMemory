import { MAX_VIDEO_CHUNKS, VIDEO_CHUNK_BYTES } from "@/lib/limits";
import { cleanStalePieces, savePiece } from "@/lib/videoUpload";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Receives one piece of a video: PUT /api/videos/<snap id>/chunk?i=<index> with the raw bytes. */
export async function PUT(request: Request, ctx: RouteContext<"/api/videos/[id]/chunk">) {
  const { id } = await ctx.params;
  const index = Number(new URL(request.url).searchParams.get("i"));
  if (!UUID.test(id)) return Response.json({ error: "Bad snap id." }, { status: 400 });
  if (!Number.isInteger(index) || index < 0 || index >= MAX_VIDEO_CHUNKS) {
    return Response.json({ error: "Bad piece number." }, { status: 400 });
  }

  const data = new Uint8Array(await request.arrayBuffer());
  if (data.length === 0 || data.length > VIDEO_CHUNK_BYTES) {
    return Response.json({ error: "Bad piece size." }, { status: 400 });
  }

  try {
    await savePiece(id, index, data);
    if (index === 0) void cleanStalePieces().catch(() => {});
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not save." }, { status: 500 });
  }
}
