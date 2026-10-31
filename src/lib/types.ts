// Shared between server and browser code.
export type Moment = {
  id: string;
  name: string | null;
  kind: "photo" | "video";
  /** The photo, or for a video its preview frame (may be null if none could be made). */
  photoUrl: string | null;
  videoUrl: string | null;
  /** Video length in seconds. */
  duration: number | null;
  /** The status that was live when the snap was taken. */
  category: string | null;
  createdAt: string;
};

export type Status = {
  id: number;
  label: string;
  startedAt: string;
};
