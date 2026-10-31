"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { Credit } from "@/components/Credit";
import { Gallery, type GalleryItem } from "@/components/Gallery";
import { EVENT } from "@/lib/event";
import type { Moment, Status } from "@/lib/types";

const PASSWORD_KEY = "admin-password";
const REFRESH_MS = 15_000;
const SUGGESTED_STATUSES = ["Our forever begins", "Will you marry me?", "She said yes 💍", "Let's celebrate 🥂"];

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [qr, setQr] = useState("");
  const [origin, setOrigin] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [guest, setGuest] = useState<string | null>(null);

  const login = useCallback(async (pw: string) => {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "x-admin-password": pw },
    });
    if (res.ok) {
      sessionStorage.setItem(PASSWORD_KEY, pw);
      setPassword(pw);
      setError("");
    } else {
      sessionStorage.removeItem(PASSWORD_KEY);
      setError("Wrong password.");
    }
  }, []);

  const load = useCallback(
    () =>
      Promise.all([
        fetch("/api/moments", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
        fetch("/api/status", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
      ])
        .then(([m, s]) => {
          if (m) setMoments(m.moments);
          if (s) setStatuses(s.history);
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(PASSWORD_KEY);
    if (saved) {
      fetch("/api/admin/login", { method: "POST", headers: { "x-admin-password": saved } }).then((res) =>
        res.ok ? setPassword(saved) : sessionStorage.removeItem(PASSWORD_KEY),
      );
    }
    const url = window.location.origin;
    QRCode.toDataURL(url, { width: 600, margin: 2 }).then((data) => {
      setQr(data);
      setOrigin(url);
    });
  }, []);

  useEffect(() => {
    if (!password) return;
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [password, load]);

  const goLive = async (label: string) => {
    label = label.trim();
    if (!password || !label || label === statuses[0]?.label) return false;
    if (
      !confirm(
        `Switch the live status to “${label}”?\n\nGuests' screens will update, and every snap taken from now on goes into this category.`,
      )
    ) {
      return false;
    }
    const res = await fetch("/api/status", {
      method: "POST",
      headers: { "x-admin-password": password, "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) {
      alert("Could not change the status. Please try again.");
      return false;
    }
    await load();
    return true;
  };

  const remove = async (item: GalleryItem) => {
    if (!password || !confirm("Delete this snap for everyone? This can't be undone.")) return;
    const res = await fetch(`/api/moments/${item.id}`, {
      method: "DELETE",
      headers: { "x-admin-password": password },
    });
    if (res.ok) setMoments((prev) => prev.filter((x) => x.id !== item.id));
    else alert("Could not delete. Please try again.");
  };

  const move = async (item: GalleryItem, to: string) => {
    if (!password || !to || to === item.category) return;
    const res = await fetch(`/api/moments/${item.id}`, {
      method: "PATCH",
      headers: { "x-admin-password": password, "Content-Type": "application/json" },
      body: JSON.stringify({ category: to }),
    });
    if (res.ok) setMoments((prev) => prev.map((m) => (m.id === item.id ? { ...m, category: to } : m)));
    else alert("Could not move the snap. Please try again.");
  };

  if (!password) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6">
        <h1 className="font-serif text-4xl">Admin</h1>
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            login(input);
          }}
        >
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl bg-white/[0.07] px-4 py-3.5 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-accent"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-night">Sign in</button>
        </form>
        <Credit className="mt-10 text-center text-white/40" />
      </main>
    );
  }

  const live = statuses[0];
  const categoryOf = (m: Moment) => m.category || "Uncategorised";
  // Categories in the order they happened (oldest status first), plus any that only exist
  // because a snap was moved by hand.
  const timeline = [...statuses].reverse();
  const categories = [...new Set([...timeline.map((s) => s.label), ...moments.map(categoryOf)])];
  const countBy = (key: (m: Moment) => string) => {
    const counts = new Map<string, number>();
    for (const m of moments) counts.set(key(m), (counts.get(key(m)) ?? 0) + 1);
    return counts;
  };
  const perCategory = countBy(categoryOf);
  const perGuest = countBy((m) => m.name || "Guest");
  const guests = [...perGuest.entries()].sort((a, b) => b[1] - a[1]);
  const suggestions = [...new Set([...timeline.map((s) => s.label), ...SUGGESTED_STATUSES])].filter(
    (label) => label !== live?.label,
  );

  const shown = moments.filter(
    (m) =>
      (m.photoUrl || m.videoUrl) &&
      (!category || categoryOf(m) === category) &&
      (!guest || (m.name || "Guest") === guest),
  );
  const toItem = (m: Moment): GalleryItem => ({
    id: m.id,
    kind: m.kind,
    url: m.photoUrl,
    videoUrl: m.videoUrl,
    duration: m.duration,
    name: m.name,
    createdAt: m.createdAt,
    category: m.category,
  });
  const sections = categories
    .map((c) => [c, shown.filter((m) => categoryOf(m) === c).map(toItem)] as const)
    .filter(([, items]) => items.length > 0)
    .reverse(); // newest category first

  const videoCount = moments.filter((m) => m.kind === "video").length;
  const zipName = `${slug(EVENT.partners.join(" and "))}-snaps${category ? `-${slug(category)}` : ""}${guest ? `-${slug(guest)}` : ""}.zip`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl">Admin</h1>
          <p className="mt-1 text-muted">
            {moments.length - videoCount} {moments.length - videoCount === 1 ? "photo" : "photos"} · {videoCount}{" "}
            {videoCount === 1 ? "video" : "videos"} · {guests.length}{" "}
            {guests.length === 1 ? "guest" : "guests"} · {categories.length}{" "}
            {categories.length === 1 ? "category" : "categories"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-full bg-white/10 px-5 py-2 text-sm">
            Refresh
          </button>
          {/* The server builds and streams the ZIP, so it works with any number of videos. */}
          <form method="post" action="/api/admin/zip">
            <input type="hidden" name="password" value={password} />
            <input type="hidden" name="category" value={category ?? ""} />
            <input type="hidden" name="guest" value={guest ?? ""} />
            <input type="hidden" name="filename" value={zipName} />
            <button
              disabled={shown.length === 0}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-night disabled:opacity-60"
            >
              {category || guest ? "Download these (ZIP)" : "Download all (ZIP)"}
            </button>
          </form>
        </div>
      </div>

      {/* Live status */}
      <section className="mt-8 rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/[0.12] to-transparent p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" /> Live on guests&apos; screens
            </p>
            <p className="mt-2 font-serif text-4xl">{live?.label ?? "…"}</p>
            {live && (
              <p className="mt-1 text-sm text-muted">
                {sinceLabel(live.startedAt)} · {perCategory.get(live.label) ?? 0} snaps
              </p>
            )}
          </div>
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const field = e.currentTarget.elements.namedItem("label") as HTMLInputElement;
              goLive(field.value).then((ok) => ok && (field.value = ""));
            }}
          >
            <input
              name="label"
              maxLength={60}
              placeholder="New status, e.g. She said yes 💍"
              className="min-w-0 flex-1 rounded-full bg-white/[0.08] px-5 py-3 outline-none placeholder:text-white/40 focus:ring-1 focus:ring-accent"
            />
            <button className="shrink-0 rounded-full bg-accent px-6 py-3 font-semibold text-night">Go live</button>
          </form>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Quick switch:</span>
            {suggestions.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => goLive(label)}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm transition hover:border-accent hover:text-accent"
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {timeline.length > 1 && (
          <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-white/10 pt-5 text-sm">
            <span className="mr-1 text-xs text-muted">Timeline:</span>
            {timeline.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-white/25">→</span>}
                <span className={i === timeline.length - 1 ? "font-semibold text-accent" : "text-white/80"}>
                  {s.label}
                </span>
                <span className="text-xs text-muted">{timeLabel(s.startedAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {qr && (
        <section className="mt-6 flex flex-wrap items-center gap-6 rounded-3xl bg-white/[0.06] p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code to the guest page" className="h-32 w-32 rounded-xl" />
          <div className="space-y-2">
            <p className="font-medium">QR code for guests</p>
            <p className="text-sm text-muted">
              Print this or show it on a screen. It opens {EVENT.partners.join(" & ")}&apos;s page at{" "}
              <span className="font-mono">{origin}</span>
            </p>
            <a href={qr} download="guest-qr-code.png" className="inline-block text-sm font-medium text-accent hover:underline">
              Download QR code
            </a>
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="mt-10 space-y-3">
        <FilterRow
          label="Category"
          options={categories.map((c) => [c, perCategory.get(c) ?? 0] as const)}
          total={moments.length}
          value={category}
          onChange={setCategory}
        />
        {guests.length > 1 && (
          <FilterRow label="Guest" options={guests} total={moments.length} value={guest} onChange={setGuest} />
        )}
      </div>

      <div className="-mx-4 mt-8 space-y-10 sm:mx-0">
        {sections.length === 0 ? (
          <p className="py-16 text-center text-muted">No snaps here yet.</p>
        ) : (
          sections.map(([name, items]) => (
            <section key={name}>
              <div className="flex items-baseline justify-between px-4 pb-3 sm:px-0">
                <h2 className="font-serif text-2xl">
                  {name}
                  {name === live?.label && <span className="ml-2 align-middle font-sans text-xs text-accent">● live</span>}
                </h2>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <Gallery items={items} admin={{ onDelete: remove, onMove: move, categories }} />
            </section>
          ))
        )}
      </div>

      <Credit className="mt-16 text-center text-white/40" />
    </main>
  );
}

function FilterRow({
  label,
  options,
  total,
  value,
  onChange,
}: {
  label: string;
  options: (readonly [string, number])[];
  total: number;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
      {[["All", total] as const, ...options].map(([name, count]) => {
        const active = name === "All" ? value === null : value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name === "All" ? null : name)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${active ? "bg-accent font-semibold text-night" : "bg-white/10"}`}
          >
            {name} <span className={active ? "text-night/60" : "text-muted"}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The first status is stored as starting in 1970 (it covers everything before). */
function timeLabel(iso: string) {
  const date = new Date(iso);
  return date.getFullYear() <= 1970 ? "start" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sinceLabel(iso: string) {
  const time = timeLabel(iso);
  return time === "start" ? "Since the start" : `Since ${time}`;
}

function slug(name: string | null) {
  return (name ?? "guest").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest";
}
