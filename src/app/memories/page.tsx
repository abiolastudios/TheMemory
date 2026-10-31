"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Gallery, type GalleryItem } from "@/components/Gallery";
import { Credit } from "@/components/Credit";
import { CameraIcon, ChevronLeftIcon } from "@/components/icons";
import { PendingPill, usePendingPreviews, useSnap, useSnapQueue } from "@/components/Snap";
import { EVENT } from "@/lib/event";
import { onSnapUploaded } from "@/lib/snapQueue";
import { isHidden, useIdle } from "@/lib/useIdle";
import type { Moment } from "@/lib/types";

const REFRESH_MS = 10_000;

export default function MemoriesPage() {
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const { pending } = useSnapQueue();
  const previews = usePendingPreviews(pending);
  const snap = useSnap();
  const router = useRouter();
  const idle = useIdle();

  // No touch for a minute: back to the lock screen, which then rests to save battery.
  useEffect(() => {
    if (idle) router.replace("/");
  }, [idle, router]);

  const load = useCallback(
    () =>
      fetch("/api/moments", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setMoments(data.moments))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => !isHidden() && load(), REFRESH_MS);
    const unsubscribe = onSnapUploaded(load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      unsubscribe();
    };
  }, [load]);

  // This phone's unsent snaps first, then everyone's, grouped by category. Groups are
  // ordered by their latest snap, so the category that's live now is at the top.
  const uploadedIds = new Set(moments?.map((m) => m.id));
  const sending: GalleryItem[] = previews
    .filter((p) => !uploadedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      url: p.url,
      videoUrl: p.videoUrl,
      duration: p.duration,
      name: "You",
      createdAt: new Date(p.takenAt).toISOString(),
      pending: true,
    }));
  const groups = new Map<string, GalleryItem[]>();
  for (const m of moments ?? []) {
    if (!m.photoUrl && !m.videoUrl) continue;
    const key = m.category || "Snaps";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      id: m.id,
      kind: m.kind,
      url: m.photoUrl,
      videoUrl: m.videoUrl,
      duration: m.duration,
      name: m.name,
      createdAt: m.createdAt,
    });
  }
  const sections = [...(sending.length ? [["Sending from your phone", sending] as const] : []), ...groups];
  const total = sending.length + (moments?.filter((m) => m.photoUrl || m.videoUrl).length ?? 0);
  const guests = new Set(moments?.map((m) => m.name || "guest")).size;

  return (
    <main className="min-h-dvh w-full pb-32">
      <header className="safe-top sticky top-0 z-20 border-b border-line bg-night/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2.5">
          <Link href="/" className="flex w-20 items-center gap-0.5 text-accent">
            <ChevronLeftIcon />
            <span className="text-[15px]">Back</span>
          </Link>
          <p className="font-serif text-xl">
            {EVENT.partners[0]} <span className="italic text-accent">&amp;</span> {EVENT.partners[1]}
          </p>
          <span className="w-20" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl">
        <div className="px-4 py-8 text-center">
          <h1 className="font-serif text-5xl">Snaps</h1>
          {total > 0 && (
            <p className="mt-2 text-sm text-muted">
              {total} {total === 1 ? "snap" : "snaps"}
              {guests > 0 && ` from ${guests} ${guests === 1 ? "guest" : "guests"}`}
            </p>
          )}
          <PendingPill className="mt-4" />
        </div>

        {moments === null && total === 0 ? (
          <p className="text-center text-muted">Loading…</p>
        ) : total === 0 ? (
          <div className="mx-auto max-w-xs py-16 text-center">
            <p className="font-serif text-2xl">No snaps yet</p>
            <p className="mt-2 text-sm text-muted">Tap the camera to capture the first photo or video.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {sections.map(([category, items]) => (
              <section key={category}>
                <div className="flex items-baseline justify-between px-4 pb-3">
                  <h2 className="font-serif text-2xl">{category}</h2>
                  <span className="text-xs text-muted">{items.length}</span>
                </div>
                <Gallery items={items} />
              </section>
            ))}
          </div>
        )}
        <Credit className="mt-16 text-center text-white/40" />
      </div>

      <button
        type="button"
        onClick={snap.openCamera}
        aria-label="Take a photo"
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-night shadow-[0_10px_40px_rgb(0_0_0/0.5)] transition active:scale-90"
      >
        <CameraIcon className="h-7 w-7" />
      </button>

      {snap.element}
    </main>
  );
}
