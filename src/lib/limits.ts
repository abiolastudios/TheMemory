// Shared by the phone and the server.

/** Videos upload in pieces of this size, so a dropped connection only re-sends one piece. */
export const VIDEO_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_VIDEO_CHUNKS = Math.ceil(MAX_VIDEO_BYTES / VIDEO_CHUNK_BYTES);

export const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};
