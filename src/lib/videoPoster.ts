// Browser-only: reads a recorded video's length and grabs a frame to show in the gallery.

const POSTER_MAX_SIDE = 720;

function waitFor(el: HTMLMediaElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    el.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    el.addEventListener("error", () => (clearTimeout(timer), reject(new Error("video error"))), { once: true });
  });
}

/** Never throws: if the phone can't decode the video here, it still uploads, just without a preview. */
export async function inspectVideo(file: Blob): Promise<{ poster: Blob | null; duration: number | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  let duration: number | null = null;
  try {
    video.load();
    await waitFor(video, "loadedmetadata", 10_000);
    duration = Number.isFinite(video.duration) ? video.duration : null;
    // iPhones only decode frames once playback has started, so nudge it.
    await video.play().catch(() => {});
    video.pause();
    video.currentTime = Math.min(0.5, (duration ?? 1) / 2);
    await waitFor(video, "seeked", 8_000);

    const scale = Math.min(1, POSTER_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return { poster, duration };
  } catch {
    return { poster: null, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
