import { connection } from "next/server";
import { isAdmin } from "@/lib/admin";
import { listStatuses, setStatus } from "@/lib/db";

/** The live status (shown on the lock screen) and the full timeline, newest first. */
export async function GET() {
  await connection();
  try {
    const history = await listStatuses();
    return Response.json({ current: history[0] ?? null, history });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load the status." }, { status: 500 });
  }
}

/** Admin: make a new status live. Snaps taken from now on go into this category. */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const label = String(body.label ?? "").trim().slice(0, 60);
  if (!label) return Response.json({ error: "Enter a status." }, { status: 400 });

  try {
    return Response.json({ current: await setStatus(label) }, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not change the status." }, { status: 500 });
  }
}
