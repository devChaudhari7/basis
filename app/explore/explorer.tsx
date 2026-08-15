"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatNumber, formatZScore } from "@/lib/utils";

interface Instrument {
  symbol: string;
  name: string;
  venue: string;
}

interface Point {
  d: string;
  v: number;
  m: number | null;
  s: number | null;
  z: number | null;
}

interface Result {
  legA: Instrument;
  legB: Instrument;
  method: string;
  lookback: number;
  sessions: number;
  latest: Point;
  series: Point[];
  caveat: string;
  monitored: boolean;
}

const WIDTH = 900;
const HEIGHT = 300;
const PAD = { top: 16, right: 56, bottom: 26, left: 12 };

function Chart({ series }: { series: Point[] }) {
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const values: number[] = [];
  for (const point of series) {
    values.push(point.v);
    if (point.m !== null && point.s !== null) {
      values.push(point.m + 2 * point.s, point.m - 2 * point.s);
    }
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.06, 1e-9);
  const lo = min - pad;
  const hi = max + pad;
  const x = (index: number) => PAD.left + (index / Math.max(series.length - 1, 1)) * plotW;
  const y = (value: number) => PAD.top + (1 - (value - lo) / (hi - lo)) * plotH;

  const band = series
    .map((point, index) =>
      point.m !== null && point.s !== null ? { index, upper: point.m + 2 * point.s, lower: point.m - 2 * point.s } : null
    )
    .filter((item): item is { index: number; upper: number; lower: number } => item !== null);

  const bandPath =
    band.length > 1
      ? `M ${band.map((b) => `${x(b.index)},${y(b.upper)}`).join(" L ")} L ${band
          .slice()
          .reverse()
          .map((b) => `${x(b.index)},${y(b.lower)}`)
          .join(" L ")} Z`
      : "";

  const line = series.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.v)}`).join(" ");
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];

  return (
    <svg className="block h-auto w-full" role="img" aria-label="Exploratory spread history" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line stroke="var(--grid)" x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} />
          <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10" x={PAD.left + plotW + 8} y={y(tick) + 3}>
            {formatNumber(tick, 2)}
          </text>
        </g>
      ))}
      {bandPath ? <path d={bandPath} fill="var(--blue)" opacity="0.08" /> : null}
      <path d={line} fill="none" stroke="var(--amber)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Explorer({ instruments }: { instruments: readonly Instrument[] }) {
  const [a, setA] = useState(instruments[0]?.symbol ?? "");
  const [b, setB] = useState(instruments[1]?.symbol ?? "");
  const [method, setMethod] = useState<"ratio" | "diff">("ratio");
  const [lookback, setLookback] = useState(60);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    if (!a || !b || a === b) {
      setError("Pick two different instruments.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/explore?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&method=${method}&lookback=${lookback}`
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Could not compute that spread.");
        setResult(null);
        return;
      }
      setResult(payload as Result);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [a, b, method, lookback]);

  useEffect(() => {
    void run();
    // Recompute whenever the combination changes.
  }, [run]);

  return (
    <>
      <div className="mt-7 grid gap-3 border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Leg A</span>
          <select
            className="rounded-terminal border border-line bg-bg px-2.5 py-2 font-mono text-[11px] text-text"
            onChange={(event) => setA(event.target.value)}
            value={a}
          >
            {instruments.map((item) => (
              <option key={item.symbol} value={item.symbol}>{item.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Leg B</span>
          <select
            className="rounded-terminal border border-line bg-bg px-2.5 py-2 font-mono text-[11px] text-text"
            onChange={(event) => setB(event.target.value)}
            value={b}
          >
            {instruments.map((item) => (
              <option key={item.symbol} value={item.symbol}>{item.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Method</span>
          <select
            className="rounded-terminal border border-line bg-bg px-2.5 py-2 font-mono text-[11px] text-text"
            onChange={(event) => setMethod(event.target.value as "ratio" | "diff")}
            value={method}
          >
            <option value="ratio">Ratio (A / B)</option>
            <option value="diff">Difference (A − B)</option>
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Lookback</span>
          <input
            className="numeric rounded-terminal border border-line bg-bg px-2.5 py-2 text-[13px] text-text"
            max={250}
            min={10}
            onChange={(event) => setLookback(Number(event.target.value))}
            type="number"
            value={lookback}
          />
        </label>

        <div className="flex items-end">
          <button
            className="w-full rounded-terminal border border-amber/50 bg-amber/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20 disabled:opacity-50"
            disabled={loading}
            onClick={() => void run()}
            type="button"
          >
            {loading ? "Computing…" : "Compute"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 border border-red/40 bg-red/[0.07] px-4 py-3 font-mono text-[11px] text-red">{error}</p>
      ) : null}

      {result ? (
        <div className="mt-4 border border-line bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="font-display text-base font-semibold tracking-display">
              {result.legA.name} {result.method === "ratio" ? "/" : "−"} {result.legB.name}
            </h2>
            <p className="font-mono text-[10px] text-muted">
              {result.sessions} overlapping sessions · {result.lookback}d lookback
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
            {[
              { label: "Latest", value: formatNumber(result.latest.v, 4) },
              { label: "Z-score", value: formatZScore(result.latest.z) },
              { label: "Mean", value: formatNumber(result.latest.m, 4) },
              { label: "σ", value: formatNumber(result.latest.s, 4) }
            ].map((cell) => (
              <div className="bg-surface p-4" key={cell.label}>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{cell.label}</p>
                <p className="numeric mt-2 text-lg text-text">{cell.value}</p>
              </div>
            ))}
          </div>

          <div className="p-4">
            <Chart series={result.series} />
          </div>

          <p className="border-t border-line px-5 py-4 font-mono text-[10px] leading-5 text-amber">
            EXPLORATORY — {result.caveat}{" "}
            <Link className="underline underline-offset-2 hover:text-text" href="/">
              The monitored desk
            </Link>{" "}
            applies roll filtering, stationarity testing and a written rationale; this tool applies
            none of them.
          </p>
        </div>
      ) : null}
    </>
  );
}
