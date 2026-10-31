// Text shown across the site. Edit these to personalise it.
// Photos of the couple: put them in public/couple/ (they show in name order).
export const EVENT = {
  partners: ["Darlington", "Divine"] as const,
  tagline: "You're here for our forever moment. Swipe up to snap a photo or record a video.",
};

export type WallpaperFit = {
  /**
   * Where the face is in the photo, in % from the left (focusX) and from the top (focusY).
   * The lock screen positions the photo so this point sits just below the names on every
   * screen size. Defaults: 50 / 35.
   */
  focusX?: number;
  focusY?: number;
};

// Face position for each couple photo, keyed by file name.
export const WALLPAPER_FIT: Record<string, WallpaperFit> = {
  "1.jpg": { focusX: 57, focusY: 24 },
  "2.jpg": { focusX: 37, focusY: 46 },
};
