"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, PhotosIcon, RingIcon } from "@/components/icons";
import { Credit } from "@/components/Credit";
import { PendingPill, useSnap } from "@/components/Snap";
import { EVENT, type WallpaperFit } from "@/lib/event";
import { initials, timeAgo } from "@/lib/time";
import { useLiveStatus } from "@/lib/liveStatus";
import { onSnapUploaded } from "@/lib/snapQueue";
import { isHidden, useIdle } from "@/lib/useIdle";
import type { Moment } from "@/lib/types";

const SLIDE_MS = 7000;
const REFRESH_MS = 15_000;
/** While resting (no touch for a minute), check for new snaps much less often. */
const REST_REFRESH_MS = 60_000;

type Wallpaper = WallpaperFit & { src: string };

export function LockScreen({ photos }: { photos: Wallpaper[] }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [slide, setSlide] = useState(0);
  const [latest, setLatest] = useState<Moment[] | null>(null);
  const frameRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const snap = useSnap();
  const status = useLiveStatus();
  // After a minute without a touch the lock screen rests: it dims, stops the slideshow
  // and animations, and checks for new snaps less often, to save the guest's battery.
  const resting = useIdle();
  const swipe = useSwipeUp(frameRef, snap.openCamera);

  const loadLatest = useCallback(
    () =>
      fetch("/api/moments", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setLatest(data.moments.slice(0, 3)))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    const tick = () => setNow(new Date());
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 30_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (photos.length < 2 || resting) return;
    const timer = setInterval(() => setSlide((s) => (s + 1) % photos.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [photos.length, resting]);

  useEffect(() => {
    const first = setTimeout(loadLatest, 0);
    // Nothing at all while the screen is off or another app is in front.
    const timer = setInterval(() => !isHidden() && loadLatest(), resting ? REST_REFRESH_MS : REFRESH_MS);
    const unsubscribe = onSnapUploaded(loadLatest);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      unsubscribe();
    };
  }, [loadLatest, resting]);

  // Track the screen size and where the names end, so faces can be placed below them.
  useEffect(() => {
    const frame = frameRef.current;
    const header = headerRef.current;
    if (!frame || !header) return;
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect();
      const headerBottom = header.offsetTop + header.offsetHeight;
      setBox({ width, height, faceY: headerBottom + FACE_GAP });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const current = photos[slide];
  const height = box?.height ?? 800;
  const progress = Math.min(1, swipe.offset / (height * SWIPE_THRESHOLD));

  return (
    <div className="fixed inset-0 bg-night md:flex md:items-center md:justify-center">
      {/* On larger screens, show the lock screen as a phone in the middle of a blurred backdrop. */}
      {current && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.src}
          alt=""
          className="absolute inset-0 hidden h-full w-full scale-110 object-cover blur-3xl brightness-50 md:block"
        />
      )}
      <main
        ref={frameRef}
        {...swipe.handlers}
        className="@container relative h-full w-full touch-none overflow-hidden bg-night text-white select-none md:aspect-[9/19.5] md:h-[min(94vh,920px)] md:w-auto md:rounded-[48px] md:border md:border-white/15 md:shadow-[0_30px_120px_rgb(0_0_0/0.6)]"
      >
        {/* Revealed underneath while swiping up */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end gap-3 pb-[18%] text-white/80"
          style={{ height: Math.max(swipe.offset, 0), opacity: progress }}
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors ${progress >= 1 ? "bg-accent text-night" : "bg-white/10"}`}
          >
            <CameraIcon className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium">{progress >= 1 ? "Release to snap" : "Keep swiping"}</p>
        </div>

        {/* The lock screen itself, which follows the finger */}
        <div
          className="absolute inset-0 will-change-transform"
          style={{
            transform: `translateY(${-swipe.offset}px)`,
            transition: swipe.dragging ? "none" : "transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {photos.length > 0 ? (
            photos.map((photo, i) => (
              <WallpaperImage key={photo.src} photo={photo} box={box} active={i === slide} paused={resting} />
            ))
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#5b2a35_0%,#2a1418_45%,#0b0a0a_100%)]" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/25 via-45% to-black/80" />

          <div className="relative flex h-full flex-col safe-top">
            {/* Date + names, where the clock sits on a lock screen */}
            <header ref={headerRef} className="animate-rise-in pt-8 text-center">
              <p className="text-[17px] font-semibold tracking-tight text-white/90 [text-shadow:0_1px_10px_rgb(0_0_0/0.5)]">
                {now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : " "}
              </p>
              <h1 className="mt-1 font-serif font-medium leading-[0.92] tracking-tight [text-shadow:0_2px_6px_rgb(0_0_0/0.25),0_4px_30px_rgb(0_0_0/0.45)]">
                <span className="block text-[clamp(3.4rem,17cqw,6.5rem)]">{EVENT.partners[0]}</span>
                <span className="block text-[clamp(2rem,9cqw,3.5rem)] italic text-accent-strong">&amp;</span>
                <span className="block text-[clamp(3.4rem,17cqw,6.5rem)]">{EVENT.partners[1]}</span>
              </h1>
              {/* The live status, set from the admin page */}
              <p
                key={status ?? ""}
                className="animate-fade-in mx-auto mt-4 max-w-[90%] text-[11px] font-semibold uppercase leading-relaxed tracking-[0.42em] text-white/85 [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]"
              >
                {status ?? "\u00a0"}
              </p>
            </header>

            <div className="flex-1" />

            {/* Notifications */}
            <section className="mx-auto w-full max-w-md space-y-2 px-3 pb-6">
              <div className="flex justify-center">
                <PendingPill className="mb-1" />
              </div>
              {latest === null ? null : latest.length === 0 ? (
                <Notification title="Be the first to capture" body={EVENT.tagline} time="now" onClick={snap.openCamera} />
              ) : (
                latest.slice(0, 2).map((m, i) => (
                  <Notification
                    key={m.id}
                    delay={i * 90}
                    title={m.name || "A guest"}
                    body={m.kind === "video" ? "Recorded a video 🎥" : "Snapped a moment 📸"}
                    time={timeAgo(m.createdAt)}
                    avatar={initials(m.name || null)}
                    thumbnail={m.photoUrl}
                    onClick={() => router.push("/memories")}
                  />
                ))
              )}
              {latest && latest.length > 2 && (
                <div className="glass mx-4 h-2.5 rounded-b-2xl border-t-0 opacity-70" aria-hidden />
              )}
            </section>

            {/* Lock-screen controls */}
            <footer className="safe-bottom px-11">
              <div className="flex items-center justify-between">
                <Link
                  href="/memories"
                  aria-label="See everyone's snaps"
                  className="glass flex h-[52px] w-[52px] items-center justify-center rounded-full transition active:scale-90"
                >
                  <PhotosIcon className="h-[22px] w-[22px]" />
                </Link>

                <div className="flex flex-col items-center text-white/85" style={{ opacity: 1 - progress }}>
                  <span className="animate-nudge-up text-lg leading-none">⌃</span>
                  <span className="mt-1 text-[12px] font-medium">Swipe up to snap</span>
                </div>

                <button
                  type="button"
                  onClick={snap.openCamera}
                  aria-label="Take a photo"
                  className="glass flex h-[52px] w-[52px] items-center justify-center rounded-full transition active:scale-90"
                >
                  <CameraIcon className="h-[22px] w-[22px]" />
                </button>
              </div>
              <div className="mx-auto mt-5 h-[5px] w-[134px] rounded-full bg-white/85" />
              <Credit className="mt-2.5 text-center text-white/45" />
            </footer>
          </div>
        </div>
        {/* Dims the screen while resting, like a phone about to sleep. Any touch wakes it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-1000"
          style={{ opacity: resting ? 0.55 : 0 }}
        />
      </main>
      {snap.element}
    </div>
  );
}

/** How far up (as a share of the screen height) a swipe must go to open the camera. */
const SWIPE_THRESHOLD = 0.2;

/**
 * Lets the whole lock screen be dragged upwards with a finger (or mouse). Releasing past
 * the threshold, or flicking up quickly, calls `onUnlock`. That happens inside the release
 * event, which browsers accept as a user action, so the camera is allowed to open.
 */
function useSwipeUp(frameRef: React.RefObject<HTMLElement | null>, onUnlock: () => boolean) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ id: number; startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const suppressClick = useRef(false);

  const end = (unlock: boolean) => {
    gesture.current = null;
    setDragging(false);
    // onUnlock returns false when it shows the name prompt instead of the camera.
    if (unlock && onUnlock()) {
      // Slide the lock screen away, then bring it back for when they return from the camera.
      setOffset(frameRef.current?.getBoundingClientRect().height ?? 800);
      setTimeout(() => setOffset(0), 650);
    } else {
      setOffset(0);
    }
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      gesture.current = { id: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
      suppressClick.current = false;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const distance = g.startY - e.clientY;
      if (!dragging && distance < 8) return;
      if (!dragging) setDragging(true);
      suppressClick.current = true;
      const dt = Math.max(1, e.timeStamp - g.lastT);
      g.velocity = (g.lastY - e.clientY) / dt; // px/ms, positive = upwards
      g.lastY = e.clientY;
      g.lastT = e.timeStamp;
      setOffset(Math.max(0, distance));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const height = frameRef.current?.getBoundingClientRect().height ?? 800;
      const distance = g.startY - e.clientY;
      end(distance > height * SWIPE_THRESHOLD || (distance > 50 && g.velocity > 0.6));
    },
    onPointerCancel: () => gesture.current && end(false),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && gesture.current) end(false);
    },
    // A swipe that started on a button or notification shouldn't also count as a tap on it.
    onClickCapture: (e: React.MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return { offset, dragging, handlers };
}

/** Space between the bottom of the names and the centre of the face. */
const FACE_GAP = 96;

type Box = { width: number; height: number; faceY: number };
type Size = { width: number; height: number };

/**
 * Sizes and positions a photo so it fills the screen and its face (focus point) sits at
 * box.faceY, just below the names. If that needs the photo pushed down, the gap above is
 * covered by a blurred copy of the photo.
 */
function fitWallpaper(image: Size, box: Box, focusX: number, focusY: number) {
  const cover = Math.max(box.width / image.width, box.height / image.height);
  // Big enough that, with the face at faceY, the photo still reaches the bottom of the screen.
  const reachBottom = (box.height - box.faceY) / (image.height * (1 - focusY));
  const scale = Math.min(Math.max(cover, reachBottom), cover * 1.6);
  const width = image.width * scale;
  const height = image.height * scale;
  const left = Math.min(0, Math.max(box.width - width, box.width / 2 - focusX * width));
  const top = Math.max(box.height - height, box.faceY - focusY * height);
  return { left, top, width, height };
}

function WallpaperImage({
  photo,
  box,
  active,
  paused,
}: {
  photo: Wallpaper;
  box: Box | null;
  active: boolean;
  paused: boolean;
}) {
  const [natural, setNatural] = useState<Size | null>(null);
  const focusX = (photo.focusX ?? 50) / 100;
  const focusY = (photo.focusY ?? 35) / 100;
  const layout = box && natural ? fitWallpaper(natural, box, focusX, focusY) : null;

  const readSize = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth && !natural) {
      setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  return (
    <div
      className="absolute inset-0 transition-opacity duration-[1500ms] ease-in-out"
      style={{ opacity: active ? 1 : 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[0.6]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={readSize}
        src={photo.src}
        alt=""
        onLoad={(e) => readSize(e.currentTarget)}
        className={`absolute max-w-none ${active && layout ? "animate-slow-zoom" : ""}`}
        style={
          layout
            ? {
                ...layout,
                transformOrigin: `${focusX * 100}% ${focusY * 100}%`,
                animationPlayState: paused ? "paused" : "running",
                maskImage: layout.top > 0 ? "linear-gradient(to bottom, transparent, black 140px)" : undefined,
                WebkitMaskImage: layout.top > 0 ? "linear-gradient(to bottom, transparent, black 140px)" : undefined,
              }
            : { opacity: 0 }
        }
      />
    </div>
  );
}

type NotificationProps = {
  title: string;
  body: string;
  time: string;
  avatar?: string;
  thumbnail?: string | null;
  delay?: number;
  onClick: () => void;
};

function Notification({ title, body, time, avatar, thumbnail, delay = 0, onClick }: NotificationProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className="glass animate-rise-in flex w-full items-center gap-3 rounded-[22px] p-3 text-left transition active:scale-[0.98]"
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent-strong to-[#b8956a] text-night">
          {avatar ? <span className="text-sm font-bold">{avatar}</span> : <RingIcon className="h-5 w-5" />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          <p className="shrink-0 text-[12px] text-white/60">{time}</p>
        </div>
        <p className="line-clamp-2 text-[14px] leading-snug text-white/85">{body}</p>
      </div>
      {thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
      )}
    </button>
  );
}
