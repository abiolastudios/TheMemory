import { isAdmin } from "@/lib/admin";
import { deleteMoment, setMomentCategory } from "@/lib/db";
import { deletePhoto } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin: move a snap to a different category. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/moments/[id]">) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const category = String(body.category ?? "").trim().slice(0, 60);
  if (!category) return Response.json({ error: "Choose a category." }, { status: 400 });

  try {
    const moment = await setMomentCategory(id, category);
    if (!moment) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ moment });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not update." }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/moments/[id]">) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const keys = await deleteMoment(id);
    await Promise.all(keys.map((key) => deletePhoto(key)));
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not delete." }, { status: 500 });
  }
}
