// Serves photos and videos saved locally (only used when Cloudflare R2 isn't configured).
import { serveLocal } from "@/lib/storage";

export async function GET(request: Request, ctx: RouteContext<"/api/media/[key]">) {
  const { key } = await ctx.params;
  const response = await serveLocal(key, request.headers.get("range"));
  return response ?? new Response("Not found", { status: 404 });
}
