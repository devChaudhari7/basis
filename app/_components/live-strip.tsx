"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarketStatus } from "@/app/_components/market-status";
import { formatZScore } from "@/lib/utils";

const POLL_MS = 60_000;

interface Reading {
  slug: string;
  name: string;
  value: number;
  z: number | null;
  state: string;
}

interface ActivityItem {
  d: string;
  slug: string;
  name: string;
  action: string;
  reason: string;
  z: number | null;
}

const ACTION_COLOR: Record<string, string> = {
  open: "text-green",
  close: "text-blue",
  hold: "text-amber",
  skip: "text-red",
  idle: "text-muted"
};

/**
 * The desk's live strip.
 *
 * The underlying data is end-of-day, so this never pretends to tick: it polls
 * for genuine changes and flashes only when a number actually moves. Faking
 * motion on settlement data would be the one dishonest thing on the site.
 */
export function LiveStrip({ initialAsOf }: { initialAsOf: string }) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const previous = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/v1/activity", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          readings: Reading[];
          activity: ActivityItem[];
        };
        if (cancelled) return;

        const moved = new Set<string>();
        for (const reading of payload.readings) {
          const before = previous.current.get(reading.slug);
          if (before !== undefined && before !== reading.value) moved.add(reading.slug);
          previous.current.set(reading.slug, reading.value);
        }

        setReadings(payload.readings);
        setActivity(payload.activity);
        setLastSync(new Date());
        if (moved.size > 0) {
          setChanged(moved);
          setTimeout(() => !cancelled && setChanged(new Set()), 1200);
        }
      } catch {
        // A failed poll is not worth surfacing; the next one will retry.
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const stretched = readings.filter((reading) => reading.state === "stretched").length;

  return (
    <section className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <MarketStatus />
        <span className="font-mono text-[10px] text-muted">
          settlement {initialAsOf}
          {lastSync
            ? ` · synced ${lastSync.getHours().toString().padStart(2, "0")}:${lastSync
                .getMinutes()
                .toString()
                .padStart(2, "0")}`
            : ""}
        </span>
      </div>

      <div className="grid gap-px bg-line md:grid-cols-[1.3fr_1fr]">
        <div className="bg-surface p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Board · {readings.length || "—"} spreads · {stretched} beyond threshold
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {readings.length === 0 ? (
              <span className="font-mono text-[11px] text-muted">connecting to the desk…</span>
            ) : (
              readings.map((reading) => (
                <Link
                  className={`font-mono text-[11px] transition-colors duration-500 hover:text-amber ${
                    changed.has(reading.slug) ? "text-amber" : "text-text"
                  }`}
                  href={`/s/${reading.slug}`}
                  key={reading.slug}
                >
                  {reading.name}{" "}
                  <span className={reading.state === "stretched" ? "text-red" : "text-muted"}>
                    {formatZScore(reading.z)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="bg-surface p-4">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            <Activity size={11} className="text-amber" /> Bot activity
          </p>
          <ul className="mt-3 grid gap-1.5">
            {activity.length === 0 ? (
              <li className="font-mono text-[11px] text-muted">
                the bot logs its next pass after the daily run
              </li>
            ) : (
              activity.slice(0, 4).map((item) => (
                <li className="flex items-baseline gap-2 font-mono text-[11px]" key={`${item.slug}-${item.d}`}>
                  <span className={`w-10 shrink-0 uppercase ${ACTION_COLOR[item.action] ?? "text-muted"}`}>
                    {item.action}
                  </span>
                  <Link className="shrink-0 text-text hover:text-amber" href={`/s/${item.slug}`}>
                    {item.name}
                  </Link>
                  <span className="truncate text-muted">{item.reason}</span>
                </li>
              ))
            )}
          </ul>
          <Link
            className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.1em] text-amber hover:text-text"
            href="/bot"
          >
            Full decision log →
          </Link>
        </div>
      </div>
    </section>
  );
}
