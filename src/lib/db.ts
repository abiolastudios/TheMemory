// Server-only: Postgres connection and queries.
import postgres from "postgres";
import { publicUrl } from "@/lib/storage";
import type { Moment, Status } from "@/lib/types";

type MomentRow = {
  id: string;
  name: string | null;
  message: string | null;
  photo_key: string | null;
  kind: string;
  video_key: string | null;
  duration: number | null;
  category: string | null;
  created_at: Date;
};

type StatusRow = { id: number; label: string; started_at: Date };

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

function db() {
  if (!globalForDb.sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set in .env.local");
    globalForDb.sql = postgres(process.env.DATABASE_URL, { max: 5 });
  }
  return globalForDb.sql;
}

function toMoment(row: MomentRow): Moment {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "video" ? "video" : "photo",
    photoUrl: row.photo_key ? publicUrl(row.photo_key) : null,
    videoUrl: row.video_key ? publicUrl(row.video_key) : null,
    duration: row.duration,
    category: row.category,
    createdAt: row.created_at.toISOString(),
  };
}

function toStatus(row: StatusRow): Status {
  return { id: row.id, label: row.label, startedAt: row.started_at.toISOString() };
}

export async function listMoments() {
  const rows = await db()<MomentRow[]>`
    select * from moments order by created_at desc limit 5000
  `;
  return rows.map(toMoment);
}

/**
 * Saves a snap. Its category is the status that was live when it was taken (not when it
 * uploaded), so snaps taken offline still land in the right category.
 * The id comes from the guest's phone, so a retried upload updates the existing row
 * instead of creating a duplicate, and never changes its category.
 */
export async function createMoment(fields: {
  id: string;
  name: string | null;
  takenAt: Date;
  photoKey: string | null;
  video?: { key: string; duration: number | null };
}) {
  const [row] = await db()<MomentRow[]>`
    insert into moments (id, name, kind, photo_key, video_key, duration, created_at, category)
    values (
      ${fields.id}, ${fields.name}, ${fields.video ? "video" : "photo"}, ${fields.photoKey},
      ${fields.video?.key ?? null}, ${fields.video?.duration ?? null}, ${fields.takenAt},
      coalesce(
        (select label from statuses where started_at <= ${fields.takenAt} order by started_at desc limit 1),
        (select label from statuses order by started_at asc limit 1)
      )
    )
    on conflict (id) do update set name = excluded.name
    returning *
  `;
  return toMoment(row);
}

/** Admin: move one snap to a different category. */
export async function setMomentCategory(id: string, category: string) {
  const [row] = await db()<MomentRow[]>`
    update moments set category = ${category} where id = ${id} returning *
  `;
  return row ? toMoment(row) : null;
}

export async function getMoment(id: string) {
  const [row] = await db()<MomentRow[]>`select * from moments where id = ${id}`;
  return row ? toMoment(row) : null;
}

/** Storage keys (photo, poster, video) of the given snaps, for building a ZIP. */
export async function listMomentFiles() {
  return db()<Pick<MomentRow, "id" | "name" | "kind" | "photo_key" | "video_key" | "category" | "created_at">[]>`
    select id, name, kind, photo_key, video_key, category, created_at from moments order by created_at asc
  `;
}

/** Deletes the row and returns its stored files so they can be removed too. */
export async function deleteMoment(id: string) {
  const [row] = await db()<Pick<MomentRow, "photo_key" | "video_key">[]>`
    delete from moments where id = ${id} returning photo_key, video_key
  `;
  return [row?.photo_key, row?.video_key].filter((key): key is string => !!key);
}

/** The status timeline, newest first. The first entry is the one live now. */
export async function listStatuses() {
  const rows = await db()<StatusRow[]>`
    select * from statuses order by started_at desc, id desc
  `;
  return rows.map(toStatus);
}

/** Admin: make a new status live from now on. */
export async function setStatus(label: string) {
  const [row] = await db()<StatusRow[]>`
    insert into statuses (label) values (${label}) returning *
  `;
  return toStatus(row);
}
