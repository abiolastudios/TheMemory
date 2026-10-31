"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, CloseIcon } from "@/components/icons";
import { timeAgo } from "@/lib/time";

export type GalleryItem = {
  id: string;
  kind: "photo" | "video";
  /** The photo, or a video's preview frame (null if the phone couldn't make one). */
  url: string | null;
  videoUrl: string | null;
  duration: number | null;
  name: string | null;
  createdAt: string;
  category?: string | null;
  /** Still saved on this phone, waiting to upload. */
  pending?: boolean;
};

type Props = {
  items: GalleryItem[];
  /** Admin only: download, delete and move-to-category controls in the full-screen view. */
  admin?: {
    onDelete: (item: GalleryItem) => void;
    categories: string[];
    onMove: (item: GalleryItem, category: string) => void;
  };
};

export function Gallery({ items, admin }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const index = items.findIndex((item) => item.id === openId);

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(item.id)}
            className="group relative aspect-[3/4] overflow-hidden bg-white/[0.04]"
          >
            {item.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={item.name ? `${item.kind === "video" ? "Video" : "Snapped"} by ${item.name}` : "Snap"}
                loading="lazy"
                className="h-full w-full object-cover transition duration-300 group-active:scale-95"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/10 to-white/[0.02]" />
            )}
            {item.kind === "video" && (
              <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/55 py-0.5 pl-1.5 pr-2 text-[10px] font-semibold text-white backdrop-blur">
                <PlayIcon className="h-2.5 w-2.5" />
                {item.duration ? formatDuration(item.duration) : "Video"}
              </span>
            )}
            {item.pending && (
              <span className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-center text-[10px] font-medium text-white backdrop-blur">
                Sending…
              </span>
            )}
          </button>
        ))}
      </div>

      {index >= 0 && (
        <Viewer
          items={items}
          index={index}
          onIndex={(i) => setOpenId(items[i].id)}
          onClose={() => setOpenId(null)}
          admin={admin}
        />
      )}
    </>
  );
}

function Viewer({
  items,
  index,
  onIndex,
  onClose,
  admin,
}: {
  items: GalleryItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  admin?: Props["admin"];
}) {
  const item = items[index];
  const touchX = useRef<number | null>(null);
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < items.length - 1 && onIndex(index + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (dx > 50) prev();
        if (dx < -50) next();
      }}
    >
      <div className="safe-top flex items-center justify-between px-4 pb-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.name || "A guest"}</p>
          <p className="text-xs text-muted">
            {item.pending ? "Waiting to send" : timeAgo(item.createdAt)} · {index + 1} of {items.length}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {item.kind === "video" && item.videoUrl ? (
          <video
            key={item.id}
            src={item.videoUrl}
            poster={item.url ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="animate-fade-in max-h-full max-w-full"
          />
        ) : item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.url} alt="" className="animate-fade-in max-h-full max-w-full object-contain" />
        ) : null}
        {index > 0 && (
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className="absolute left-3 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 sm:flex"
          >
            <ChevronLeftIcon />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="absolute right-3 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 sm:flex"
          >
            <ChevronLeftIcon className="h-5 w-5 rotate-180" />
          </button>
        )}
      </div>

      {admin && !item.pending ? (
        <div className="safe-bottom flex flex-wrap items-center justify-center gap-3 px-4 pt-3">
          <label className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-4 pr-2 text-sm">
            <span className="text-muted">Category</span>
            <select
              value={item.category ?? ""}
              onChange={(e) => admin.onMove(item, e.target.value)}
              className="max-w-52 rounded-full bg-transparent py-1.5 font-medium outline-none"
            >
              {[...new Set([item.category ?? "", ...admin.categories])].filter(Boolean).map((c) => (
                <option key={c} value={c} className="bg-night">
                  {c}
                </option>
              ))}
            </select>
          </label>
          <a
            href={item.videoUrl ?? item.url ?? undefined}
            download
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium"
          >
            Download
          </a>
          <button
            type="button"
            onClick={() => admin.onDelete(item)}
            className="rounded-full bg-red-500/15 px-6 py-2.5 text-sm font-medium text-red-300"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="safe-bottom" />
      )}
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
