-- Creates/updates the tables. Run with `npm run db:setup` (safe to run again), or paste into any Postgres client.
-- gen_random_uuid() is built into Postgres 13+.

create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  name text,
  message text,
  photo_key text,
  created_at timestamptz not null default now()
);

create index if not exists moments_created_at_idx on moments (created_at desc);

-- The status the admin sets (shown on the lock screen). Every change is a new row, so the
-- table is a timeline: a snap belongs to whichever status was live when it was taken.
create table if not exists statuses (
  id serial primary key,
  label text not null,
  started_at timestamptz not null default now()
);

create index if not exists statuses_started_at_idx on statuses (started_at desc);

-- The first status covers everything from the beginning of time.
insert into statuses (label, started_at)
select 'Our forever begins', '1970-01-01T00:00:00Z'
where not exists (select 1 from statuses);

-- Each snap's category: the status that was live when it was taken.
alter table moments add column if not exists category text;
update moments set category = (
  select label from statuses where started_at <= moments.created_at order by started_at desc limit 1
) where category is null;

-- Videos: the video file, its length, and whether a snap is a photo or a video.
-- For videos, photo_key holds the preview frame (poster) shown in the gallery.
alter table moments add column if not exists kind text not null default 'photo';
alter table moments add column if not exists video_key text;
alter table moments add column if not exists duration real;
