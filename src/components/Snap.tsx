"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CameraIcon } from "@/components/icons";
import { compressImage } from "@/lib/compress";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_EXTENSIONS } from "@/lib/limits";
import {
  addSnap,
  getQueueState,
  subscribeQueue,
  type PendingSnap,
  type QueueState,
} from "@/lib/snapQueue";
import { inspectVideo } from "@/lib/videoPoster";

const NAME_KEY = "guest-name";
const NAME_ASKED_KEY = "guest-name-asked";
const SERVER_STATE: QueueState = { pending: [], uploading: false, online: true, progress: null };

const VIDEO_TYPE_BY_EXTENSION: Record<string, string> = { mov: "video/quicktime", mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm" };

/** Some phones leave a recorded video's type blank; work it out from the file name. */
function videoTypeOf(file: File) {
  if (VIDEO_EXTENSIONS[file.type]) return file.type;
  if (file.type && !file.type.startsWith("video/")) return null;
  return VIDEO_TYPE_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

export function useSnapQueue() {
  return useSyncExternalStore(subscribeQueue, getQueueState, () => SERVER_STATE);
}

const previewUrls = new Map<string, string>();

/** Object URLs for snaps still waiting on the phone, so they can be shown before uploading. */
export function usePendingPreviews(pending: PendingSnap[]) {
  return useMemo(() => {
    const ids = new Set(pending.map((snap) => snap.id));
    for (const [key, url] of previewUrls) {
      if (ids.has(key.split(":")[0])) continue;
      previewUrls.delete(key);
      // Uploaded: keep the preview a little longer while the gallery swaps in the server copy.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    const objectUrl = (key: string, blob: Blob) => {
      let url = previewUrls.get(key);
      if (!url) {
        url = URL.createObjectURL(blob);
        previewUrls.set(key, url);
      }
      return url;
    };
    return pending.map((snap) => {
      const isVideo = snap.kind === "video";
      return {
        id: snap.id,
        takenAt: snap.takenAt,
        kind: isVideo ? ("video" as const) : ("photo" as const),
        url: isVideo ? (snap.poster ? objectUrl(snap.id, snap.poster) : null) : objectUrl(snap.id, snap.blob),
        videoUrl: isVideo ? objectUrl(`${snap.id}:video`, snap.blob) : null,
        duration: snap.duration ?? null,
      };
    });
  }, [pending]);
}

/**
 * The camera. `openCamera` must be called from a tap or swipe (browsers only open the
 * camera in response to the user). The first time, it asks for the guest's name once.
 */
export function useSnap() {
  const input = useRef<HTMLInputElement>(null);
  const [askingName, setAskingName] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Returns true if the camera opened, false if the name prompt is shown first. */
  const openCamera = () => {
    if (!localStorage.getItem(NAME_ASKED_KEY)) {
      setAskingName(true);
      return false;
    }
    input.current?.click();
    return true;
  };

  const say = (text: string) => setToast({ id: Date.now(), text });

  const onVideo = async (file: File, type: string) => {
    if (file.size > MAX_VIDEO_BYTES) {
      say("That video is too large. Please keep videos under 3 minutes.");
      return;
    }
    say("Saving your video…");
    const blob = file.type === type ? file : new Blob([file], { type });
    const { poster, duration } = await inspectVideo(blob);
    if (duration && duration > MAX_VIDEO_SECONDS + 1) {
      say("Videos can be up to 3 minutes. Please record a shorter one.");
      return;
    }
    try {
      // The category follows when recording started, not when it was saved.
      const takenAt = Date.now() - Math.round((duration ?? 0) * 1000);
      await addSnap(blob, localStorage.getItem(NAME_KEY) ?? "", { poster, duration, takenAt });
      say(navigator.onLine ? "Video saved! Sending now…" : "Video saved! It will send when you're online");
    } catch {
      say("Couldn't save that video. Please try again.");
    }
  };

  const onPhoto = async (file: File) => {
    let blob: Blob = file;
    try {
      blob = await compressImage(file);
    } catch {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        setToast({ id: Date.now(), text: "Couldn't read that photo. Please try again." });
        return;
      }
    }
    try {
      await addSnap(blob, localStorage.getItem(NAME_KEY) ?? "");
      setToast({
        id: Date.now(),
        text: navigator.onLine ? "Snapped! Sending now…" : "Snapped! Saved, will send when you're online",
      });
    } catch {
      setToast({ id: Date.now(), text: "Couldn't save that photo. Please try again." });
    }
  };

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const videoType = videoTypeOf(file);
          if (videoType) void onVideo(file, videoType);
          else if (file.type.startsWith("video/")) say("That video format isn't supported. Please try again.");
          else void onPhoto(file);
        }}
      />
      {askingName && (
        <NameSheet
          onDone={(name) => {
            localStorage.setItem(NAME_ASKED_KEY, "1");
            if (name) localStorage.setItem(NAME_KEY, name);
            setAskingName(false);
            input.current?.click();
          }}
          onCancel={() => setAskingName(false)}
        />
      )}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="animate-rise-in pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4"
        >
          <p className="max-w-sm rounded-full border border-white/10 bg-[#1c1919]/95 px-5 py-2.5 text-center text-sm font-medium text-white shadow-[0_8px_30px_rgb(0_0_0/0.5)]">
            {toast.text}
          </p>
        </div>
      )}
    </>
  );

  return { openCamera, element };
}

function NameSheet({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Close" onClick={onCancel} className="animate-fade-in absolute inset-0 bg-black/60" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDone(name.trim());
        }}
        className="glass-dark animate-sheet-up safe-bottom relative w-full max-w-lg rounded-t-[28px] border-t border-line px-6 pt-3"
      >
        <div className="mx-auto mb-6 h-1.5 w-10 rounded-full bg-white/25" />
        <h2 className="font-serif text-3xl">Before your first snap</h2>
        <p className="mt-1.5 text-muted">Tell the couple who&apos;s behind the camera.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          placeholder="Your name"
          className="mt-6 w-full rounded-2xl bg-white/[0.07] px-4 py-4 text-lg outline-none placeholder:text-white/40 focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-semibold text-night active:scale-[0.99]"
        >
          <CameraIcon className="h-5 w-5" /> Open camera
        </button>
        <button type="button" onClick={() => onDone("")} className="mb-2 mt-1 w-full py-3 text-sm text-muted">
          Skip
        </button>
      </form>
    </div>
  );
}

/** Small pill showing snaps that are saved on this phone but not uploaded yet. */
export function PendingPill({ className = "" }: { className?: string }) {
  const { pending, online, uploading, progress } = useSnapQueue();
  if (!pending.length) return null;
  const count = `${pending.length} ${pending.length === 1 ? "snap" : "snaps"}`;
  const videoPercent = progress && online ? Math.round(progress.fraction * 100) : null;
  return (
    <p className={`glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium text-white ${className}`}>
      <span className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-accent" : "bg-white/50"}`} />
      {!online
        ? `${count} saved · will send when online`
        : videoPercent !== null
          ? `Sending video ${videoPercent}%${pending.length > 1 ? ` · ${pending.length - 1} more waiting` : ""}`
          : uploading
            ? `Sending ${count}…`
            : `${count} waiting to send`}
    </p>
  );
}
