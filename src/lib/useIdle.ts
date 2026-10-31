"use client";

import { useEffect, useState } from "react";

/** How long without a touch before guest pages lock / go to rest, to save battery. */
export const IDLE_MS = 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"] as const;

/** True once the guest hasn't touched the screen for `ms`. Any touch makes it false again. */
export function useIdle(ms = IDLE_MS) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms);
    const onActivity = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    // Coming back to the page (e.g. from the camera app) counts as activity.
    const onVisible = () => document.visibilityState === "visible" && onActivity();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);

  return idle;
}

/** True while the page is in the background (screen off, another app or tab in front). */
export const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
