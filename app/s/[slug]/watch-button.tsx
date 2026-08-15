"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function WatchButton({
  slug,
  signedIn,
  initiallyWatched,
  defaultZ
}: {
  slug: string;
  signedIn: boolean;
  initiallyWatched: boolean;
  defaultZ: number;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(initiallyWatched);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <Link
        className="inline-flex items-center gap-2 rounded-terminal border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber/40 hover:text-amber"
        href="/signin"
      >
        <Eye size={14} /> Sign in to watch
      </Link>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      if (watched) {
        await fetch(`/api/watchlist?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
        setWatched(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, alertZ: defaultZ })
        });
        setWatched(true);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      aria-pressed={watched}
      className={`inline-flex items-center gap-2 rounded-terminal border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50 ${
        watched
          ? "border-green/50 bg-green/10 text-green hover:bg-green/20"
          : "border-line text-muted hover:border-amber/40 hover:text-amber"
      }`}
      disabled={busy}
      onClick={() => void toggle()}
      type="button"
    >
      {watched ? <EyeOff size={14} /> : <Eye size={14} />}
      {watched ? "Watching" : "Watch this spread"}
    </button>
  );
}
