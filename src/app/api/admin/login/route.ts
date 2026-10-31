import { isAdmin } from "@/lib/admin";

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Wrong password" }, { status: 401 });
  return Response.json({ ok: true });
}
