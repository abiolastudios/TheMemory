"use client";

// The live status shown on guests' screens. Polls the server while any page shows it, and
// remembers the last value on the phone so it appears instantly (and offline) next time.
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "live-status";
const POLL_MS = 10_000;

const listeners = new Set<() => void>();
let current: string | null = null;
let loaded = false;
let timer: ReturnType<typeof setInterval> | null = null;

function read() {
  if (!loaded) {
    loaded = true;
    current = localStorage.getItem(STORAGE_KEY);
  }
  return current;
}

function set(label: string) {
  if (label === read()) return;
  current = label;
  localStorage.setItem(STORAGE_KEY, label);
  listeners.forEach((fn) => fn());
}

async function refresh() {
  if (document.visibilityState === "hidden") return; // screen off / app in background
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data.current?.label) set(data.current.label);
  } catch {
    // Offline: keep showing the last known status.
  }
}

function onVisible() {
  if (document.visibilityState === "visible") void refresh();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    void refresh();
    timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/** The status currently live, or null until it's known. */
export function useLiveStatus() {
  return useSyncExternalStore(subscribe, read, () => null);
}
