"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatDate, formatNumber, formatZScore } from "@/lib/utils";
import type { SeriesPoint, SignalMark } from "@/lib/types";

const WIDTH = 920;
const HEIGHT = 380;
const MARGIN = { top: 18, right: 62, bottom: 30, left: 14 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

type RangeKey = "6M" | "1Y" | "ALL";
const RANGE_SESSIONS: Record<RangeKey, number> = { "6M": 126, "1Y": 252, ALL: Number.POSITIVE_INFINITY };

interface BandSegment {
  outer: string;
  inner: string;
  mean: string;
}

function buildSegments(
  points: readonly SeriesPoint[],
  x: (index: number) => number,
  y: (value: number) => number
): BandSegment[] {
  const segments: BandSegment[] = [];
  let run: { index: number; point: SeriesPoint }[] = [];

  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const upper2 = run.map(({ index, point }) => `${x(index)},${y(point.m! + 2 * point.s!)}`);
    const lower2 = run.map(({ index, point }) => `${x(index)},${y(point.m! - 2 * point.s!)}`).reverse();
    const upper1 = run.map(({ index, point }) => `${x(index)},${y(point.m! + point.s!)}`);
    const lower1 = run.map(({ index, point }) => `${x(index)},${y(point.m! - point.s!)}`).reverse();
    const mean = run.map(({ index, point }, i) => `${i === 0 ? "M" : "L"} ${x(index)} ${y(point.m!)}`);
    segments.push({
      outer: `M ${upper2.join(" L ")} L ${lower2.join(" L ")} Z`,
      inner: `M ${upper1.join(" L ")} L ${lower1.join(" L ")} Z`,
      mean: mean.join(" ")
    });
    run = [];
  };

  points.forEach((point, index) => {
    if (point.m !== null && point.s !== null) {
      run.push({ index, point });
    } else {
      flush();
    }
  });
  flush();
  return segments;
}

export function SpreadChart({
  series,
  signals,
  unit,
  decimals
}: {
  series: readonly SeriesPoint[];
  signals: readonly SignalMark[];
  unit: string;
  decimals: number;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDrawn(true);
      return;
    }
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const points = useMemo(() => {
    const sessions = RANGE_SESSIONS[range];
    return Number.isFinite(sessions) ? series.slice(-sessions) : series;
  }, [series, range]);

  const scales = useMemo(() => {
    const values: number[] = [];
    for (const point of points) {
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
    const x = (index: number) => MARGIN.left + (index / Math.max(points.length - 1, 1)) * PLOT_W;
    const y = (value: number) => MARGIN.top + (1 - (value - lo) / (hi - lo)) * PLOT_H;
    return { x, y, lo, hi };
  }, [points]);

  const segments = useMemo(() => buildSegments(points, scales.x, scales.y), [points, scales]);

  const valuePath = useMemo(
    () =>
      points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${scales.x(index)} ${scales.y(point.v)}`)
        .join(" "),
    [points, scales]
  );

  const yTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => scales.lo + ((scales.hi - scales.lo) * i) / (count - 1));
  }, [scales]);

  const xTicks = useMemo(() => {
    const ticks: { index: number; label: string }[] = [];
    let lastMonth = "";
    points.forEach((point, index) => {
      const month = point.d.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        ticks.push({ index, label: formatDate(point.d, { month: "short", year: "2-digit" }) });
      }
    });
    const stride = Math.max(1, Math.ceil(ticks.length / 8));
    return ticks.filter((_, i) => i % stride === 0);
  }, [points]);

  const signalByDate = useMemo(() => new Map(signals.map((signal) => [signal.d, signal])), [signals]);
  const indexByDate = useMemo(() => new Map(points.map((point, index) => [point.d, index])), [points]);

  const moveTo = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * WIDTH;
    const frac = (px - MARGIN.left) / PLOT_W;
    const index = Math.round(frac * (points.length - 1));
    setHoverIndex(index >= 0 && index < points.length ? index : null);
  };

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) =>
    moveTo(event.clientX, event.currentTarget);
  const handleTouch = (event: React.TouchEvent<SVGSVGElement>) => {
    const touch = event.touches[0];
    if (touch) moveTo(touch.clientX, event.currentTarget);
  };

  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverLeftPct = hoverIndex !== null ? (scales.x(hoverIndex) / WIDTH) * 100 : 0;

  return (
    <div className="border border-line bg-surface" ref={containerRef}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
          <span className="flex items-center gap-1.5"><i aria-hidden className="inline-block h-px w-4 bg-amber" /> spread</span>
          <span className="flex items-center gap-1.5"><i aria-hidden className="inline-block h-px w-4 border-t border-dashed border-muted" /> mean 60d</span>
          <span className="flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-4 bg-blue/15" /> ±1σ / ±2σ</span>
          <span className="flex items-center gap-1.5 text-amber">△ roll-suspect</span>
          <span className="flex items-center gap-1.5"><i aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-red" /> signal</span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Chart range">
          {(Object.keys(RANGE_SESSIONS) as RangeKey[]).map((key) => (
            <button
              className={`rounded-terminal border px-2 py-1 font-mono text-[10px] transition-colors ${
                range === key ? "border-amber/50 bg-amber/10 text-amber" : "border-line text-muted hover:text-text"
              }`}
              key={key}
              onClick={() => setRange(key)}
              type="button"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg
          aria-label={`Spread history with mean and sigma bands, ${unit}`}
          className="block h-auto w-full cursor-crosshair select-none"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={handleMove}
          onTouchEnd={() => setHoverIndex(null)}
          onTouchMove={handleTouch}
          onTouchStart={handleTouch}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <clipPath id="band-reveal">
              <rect
                height={HEIGHT}
                style={{ transition: "width 800ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                width={drawn ? WIDTH : 0}
                x="0"
                y="0"
              />
            </clipPath>
          </defs>

          {yTicks.map((tick) => (
            <g key={tick}>
              <line stroke="var(--grid)" x1={MARGIN.left} x2={MARGIN.left + PLOT_W} y1={scales.y(tick)} y2={scales.y(tick)} />
              <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10" x={MARGIN.left + PLOT_W + 8} y={scales.y(tick) + 3}>
                {formatNumber(tick, decimals)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10" key={tick.index} textAnchor="middle" x={scales.x(tick.index)} y={HEIGHT - 8}>
              {tick.label}
            </text>
          ))}

          <g clipPath="url(#band-reveal)">
            {segments.map((segment, index) => (
              <g key={index}>
                <path d={segment.outer} fill="var(--blue)" opacity="0.07" />
                <path d={segment.inner} fill="var(--blue)" opacity="0.1" />
                <path d={segment.mean} fill="none" stroke="var(--muted)" strokeDasharray="3 5" strokeWidth="1" />
              </g>
            ))}
            <path d={valuePath} fill="none" stroke="var(--amber)" strokeLinejoin="round" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </g>

          {points.map((point, index) => {
            if (!point.roll) return null;
            const px = scales.x(index);
            const py = scales.y(point.v);
            return (
              <path
                d={`M ${px} ${py - 6} L ${px + 5} ${py + 3} L ${px - 5} ${py + 3} Z`}
                fill="none"
                key={`roll-${point.d}`}
                stroke="var(--amber)"
                strokeWidth="1.2"
              >
                <title>{`${point.d}: roll-suspect session — excluded from mean/σ estimation`}</title>
              </path>
            );
          })}

          {points.map((point, index) => {
            const signal = signalByDate.get(point.d);
            if (!signal) return null;
            const color = signal.direction === "short_spread" ? "var(--red)" : "var(--green)";
            return (
              <circle cx={scales.x(index)} cy={scales.y(point.v)} fill={color} key={`sig-${point.d}`} r="3.4" stroke="var(--bg)" strokeWidth="1">
                <title>{`${point.d}: ${signal.direction === "short_spread" ? "short" : "long"} spread signal at ${signal.z.toFixed(2)}σ`}</title>
              </circle>
            );
          })}

          {hover ? (
            <g pointerEvents="none">
              <line stroke="var(--muted)" strokeDasharray="2 3" strokeWidth="1" x1={scales.x(hoverIndex!)} x2={scales.x(hoverIndex!)} y1={MARGIN.top} y2={MARGIN.top + PLOT_H} />
              <line stroke="var(--muted)" strokeDasharray="2 3" strokeWidth="1" x1={MARGIN.left} x2={MARGIN.left + PLOT_W} y1={scales.y(hover.v)} y2={scales.y(hover.v)} />
              <circle cx={scales.x(hoverIndex!)} cy={scales.y(hover.v)} fill="var(--amber)" r="3" stroke="var(--bg)" strokeWidth="1.5" />
            </g>
          ) : null}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute top-3 z-10 -translate-x-1/2 whitespace-nowrap border border-line bg-bg/95 px-3 py-2 font-mono text-[10px] leading-4 text-text shadow-none"
            style={{ left: `clamp(90px, ${hoverLeftPct}%, calc(100% - 90px))` }}
          >
            <span className="text-muted">{formatDate(hover.d)}</span>
            <span className="mx-2 text-line">|</span>
            {formatNumber(hover.v, decimals)} {unit}
            <span className="mx-2 text-line">|</span>
            {hover.roll ? <span className="text-amber">roll-suspect</span> : <span>z {formatZScore(hover.z)}</span>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
