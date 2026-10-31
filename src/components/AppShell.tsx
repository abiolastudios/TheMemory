"use client";

import { useEffect } from "react";
import { startSnapQueue } from "@/lib/snapQueue";

/** Starts the offline snap queue and the service worker on every page. */
export function AppShell() {
  useEffect(() => {
    startSnapQueue();
    // Only in production: the service worker would fight the dev server's live reloading.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
