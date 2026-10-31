// Browser-only. Every snap is saved on the phone (IndexedDB) first, then uploaded in the
// background. If the guest is offline, or the upload fails, it stays saved and is retried
// automatically: when the connection comes back, when they return to the page, and on a timer.
// Videos are sent in pieces; the phone remembers how many pieces got through, so an
// interrupted video carries on where it stopped instead of starting again.
import { VIDEO_CHUNK_BYTES } from "@/lib/limits";

export type PendingSnap = {
  id: string;
  /** The photo, or the video file. */
  blob: Blob;
  name: string;
  takenAt: number;
  /** Missing on snaps saved before videos existed, which are photos. */
  kind?: "photo" | "video";
  /** Video only: a preview frame and its length in seconds. */
  poster?: Blob | null;
  duration?: number | null;
};

export type QueueState = {
  pending: PendingSnap[];
  uploading: boolean;
  online: boolean;
  /** The video being sent right now and how far along it is (0–1). */
  progress: { id: string; fraction: number } | null;
};

const DB_NAME = "proposal-moments";
const STORE = "pending-snaps";
const RETRY_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 90_000;

let state: QueueState = { pending: [], uploading: false, online: true, progress: null };
const listeners = new Set<() => void>();
const uploadedListeners = new Set<() => void>();
let started = false;
let flushing: Promise<void> | null = null;

function setState(patch: Partial<QueueState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function getQueueState() {
  return state;
}

export function subscribeQueue(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called after at least one snap has reached the server, so galleries can refresh. */
export function onSnapUploaded(fn: () => void) {
  uploadedListeners.add(fn);
  return () => uploadedListeners.delete(fn);
}

// --- IndexedDB -------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function refreshPending() {
  const all = await tx<PendingSnap[]>("readonly", (s) => s.getAll() as IDBRequest<PendingSnap[]>);
  setState({ pending: all.sort((a, b) => b.takenAt - a.takenAt) });
}

// --- Public API ------------------------------------------------------------------------

/** Saves a snap on the phone and starts uploading it. Resolves once it's safely stored. */
export async function addSnap(
  blob: Blob,
  name: string,
  video?: { poster: Blob | null; duration: number | null; takenAt?: number },
) {
  const snap: PendingSnap = video
    ? { id: uuid(), blob, name, takenAt: video.takenAt ?? Date.now(), kind: "video", poster: video.poster, duration: video.duration }
    : { id: uuid(), blob, name, takenAt: Date.now(), kind: "photo" };
  await tx("readwrite", (s) => s.put(snap));
  await refreshPending();
  void flush();
  return snap;
}

/** Uploads every saved snap, oldest first. Safe to call any time; runs one at a time. */
export function flush() {
  // `.finally` runs asynchronously, so `flushing` is always cleared after it's been set,
  // even when there turns out to be nothing to upload.
  flushing ??= uploadAll().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function uploadAll() {
  try {
    if (!navigator.onLine) return;
    const queue = [...state.pending].sort((a, b) => a.takenAt - b.takenAt);
    if (!queue.length) return;
    setState({ uploading: true });
    let uploadedAny = false;
    for (const snap of queue) {
      const result = await upload(snap);
      if (result === "retry-later") break;
      // Uploaded, or rejected for good (e.g. not an image): either way, stop retrying it.
      await tx("readwrite", (s) => s.delete(snap.id));
      localStorage.removeItem(piecesKey(snap.id));
      await refreshPending();
      if (result === "done") uploadedAny = true;
    }
    if (uploadedAny) uploadedListeners.forEach((fn) => fn());
  } catch {
    // Storage or network trouble: everything stays saved and the next retry picks it up.
  } finally {
    setState({ uploading: false, progress: null });
  }
}

type Result = "done" | "rejected" | "retry-later";

/** Only give up when the server says the snap itself is invalid. Anything else (server busy,
 * proxy errors, timeouts) is retried, so a guest's snap is never silently lost. */
const outcome = (res: Response): Result =>
  res.ok ? "done" : res.status === 400 || res.status === 415 ? "rejected" : "retry-later";

function upload(snap: PendingSnap): Promise<Result> {
  return snap.kind === "video" ? uploadVideo(snap) : uploadPhoto(snap);
}

const piecesKey = (id: string) => `video-pieces-sent:${id}`;

async function uploadVideo(snap: PendingSnap): Promise<Result> {
  const pieces = Math.max(1, Math.ceil(snap.blob.size / VIDEO_CHUNK_BYTES));
  let sent = Number(localStorage.getItem(piecesKey(snap.id))) || 0;
  try {
    for (let i = sent; i < pieces; i++) {
      setState({ progress: { id: snap.id, fraction: i / pieces } });
      const res = await fetch(`/api/videos/${snap.id}/chunk?i=${i}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: snap.blob.slice(i * VIDEO_CHUNK_BYTES, (i + 1) * VIDEO_CHUNK_BYTES),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!res.ok) return outcome(res);
      sent = i + 1;
      localStorage.setItem(piecesKey(snap.id), String(sent));
    }
    setState({ progress: { id: snap.id, fraction: 1 } });

    const form = new FormData();
    form.set("name", snap.name);
    form.set("takenAt", String(snap.takenAt));
    form.set("pieces", String(pieces));
    form.set("type", snap.blob.type);
    if (snap.duration) form.set("duration", String(snap.duration));
    if (snap.poster) form.set("poster", snap.poster, "poster.jpg");
    const res = await fetch(`/api/videos/${snap.id}/complete`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS * 2),
    });
    // The server lost some pieces (e.g. cleaned up after days offline): send them all again.
    if (res.status === 409) {
      localStorage.removeItem(piecesKey(snap.id));
      return "retry-later";
    }
    return outcome(res);
  } catch {
    return "retry-later";
  }
}

async function uploadPhoto(snap: PendingSnap): Promise<Result> {
  const form = new FormData();
  form.set("id", snap.id);
  form.set("name", snap.name);
  form.set("takenAt", String(snap.takenAt));
  form.set("photo", snap.blob, `${snap.id}.jpg`);
  try {
    const res = await fetch("/api/moments", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    return outcome(res);
  } catch {
    return "retry-later";
  }
}

/** Loads saved snaps and sets up automatic retries. Call once when the app starts. */
export function startSnapQueue() {
  if (started || typeof window === "undefined") return;
  started = true;
  setState({ online: navigator.onLine });

  // Ask the browser not to clear our saved snaps when the phone is low on space.
  navigator.storage?.persist?.().catch(() => {});

  window.addEventListener("online", () => {
    setState({ online: true });
    void flush();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  setInterval(() => void flush(), RETRY_MS);

  refreshPending()
    .then(() => flush())
    .catch(() => {});
}

/** crypto.randomUUID needs HTTPS; this works on plain http too (e.g. testing on Wi-Fi). */
function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
