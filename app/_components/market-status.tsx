"use client";

import { useEffect, useState } from "react";

/**
 * Indicative exchange session status, computed from the visitor's clock.
 *
 * These windows are approximations of regular electronic hours and ignore
 * holidays and maintenance breaks, so the strip is labelled indicative.  It
 * exists to show that the desk is a live thing sitting on real market hours —
 * not to be relied on for whether an order would fill.
 */

interface Venue {
  code: string;
  name: string;
  /** Open windows in UTC minutes-from-midnight, Sunday=0 … Saturday=6. */
  isOpen: (utcDay: number, minutes: number) => boolean;
}

const CME_LIKE = (day: number, minutes: number) => {
  // Sun 23:00 through Fri 22:00 UTC, with a daily 22:00–23:00 halt.
  if (day === 6) return false;
  if (day === 0) return minutes >= 23 * 60;
  if (day === 5) return minutes < 22 * 60;
  return !(minutes >= 22 * 60 && minutes < 23 * 60);
};

const VENUES: Venue[] = [
  { code: "NYMEX", name: "NYMEX · crude, natgas", isOpen: CME_LIKE },
  { code: "COMEX", name: "COMEX · metals", isOpen: CME_LIKE },
  { code: "CBOT", name: "CBOT · rates, grains", isOpen: CME_LIKE },
  { code: "ICE", name: "ICE · Brent, DXY", isOpen: CME_LIKE },
  {
    code: "NSE",
    name: "NSE · India equities",
    // 09:15–15:30 IST = 03:45–10:00 UTC, weekdays.
    isOpen: (day, minutes) => day >= 1 && day <= 5 && minutes >= 225 && minutes < 600
  }
];

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function MarketStatus() {
  const now = useNow();

  // Rendered only after mount: the server has no visitor clock, and guessing
  // one would produce a hydration mismatch.
  if (!now) {
    return <div className="h-5" aria-hidden="true" />;
  }

  const day = now.getUTCDay();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const utc = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const openCount = VENUES.filter((venue) => venue.isOpen(day, minutes)).length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
        </span>
        <span className="text-green">DESK LIVE</span>
      </span>

      <span className="tabular-nums">{utc} UTC</span>

      <span className="hidden items-center gap-2 sm:flex">
        {VENUES.map((venue) => {
          const open = venue.isOpen(day, minutes);
          return (
            <span
              className={open ? "text-text" : "text-muted/50"}
              key={venue.code}
              title={`${venue.name} — ${open ? "open" : "closed"} (indicative hours)`}
            >
              <span className={`mr-1 inline-block h-1 w-1 rounded-full align-middle ${open ? "bg-green" : "bg-line"}`} />
              {venue.code}
            </span>
          );
        })}
      </span>

      <span className="sm:hidden">{openCount}/{VENUES.length} venues open</span>
    </div>
  );
}
