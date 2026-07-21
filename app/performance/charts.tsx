import { bin } from "d3";

import { formatR } from "@/lib/utils";
import type { EquityPoint } from "@/lib/types";

const CURVE_W = 880;
const CURVE_H = 260;
const HIST_W = 880;
const HIST_H = 220;
const MARGIN = { top: 16, right: 52, bottom: 26, left: 14 };

/** Cumulative R after each settled trade. R is the professional unit: currency
 *  would hide position-sizing discipline; R shows it. */
export function EquityCurve({ points }: { points: readonly EquityPoint[] }) {
  const plotW = CURVE_W - MARGIN.left - MARGIN.right;
  const plotH = CURVE_H - MARGIN.top - MARGIN.bottom;
  const values = [0, ...points.map((point) => point.cumulativeR)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.12, 0.5);
  const lo = min - pad;
  const hi = max + pad;

  const x = (index: number) => MARGIN.left + (index / Math.max(points.length, 1)) * plotW;
  const y = (value: number) => MARGIN.top + (1 - (value - lo) / (hi - lo)) * plotH;

  const path = [`M ${x(0)} ${y(0)}`, ...points.map((point) => `L ${x(point.index)} ${y(point.cumulativeR)}`)].join(" ");
  const ticks = [lo + (hi - lo) * 0.08, (lo + hi) / 2, hi - (hi - lo) * 0.08];

  return (
    <svg aria-label="Equity curve in R multiples" className="block h-auto w-full" role="img" viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line stroke="var(--grid)" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(tick)} y2={y(tick)} />
          <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10" x={MARGIN.left + plotW + 8} y={y(tick) + 3}>
            {formatR(tick).replace("R", "")}
          </text>
        </g>
      ))}
      <line stroke="var(--muted)" strokeDasharray="3 5" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(0)} y2={y(0)} />
      <path d={path} fill="none" stroke="var(--amber)" strokeLinejoin="round" strokeWidth="1.8" />
      {points.map((point) => (
        <circle
          cx={x(point.index)}
          cy={y(point.cumulativeR)}
          fill={point.rMultiple >= 0 ? "var(--green)" : "var(--red)"}
          key={point.tradeId}
          r="3"
          stroke="var(--bg)"
          strokeWidth="1"
        >
          <title>{`Trade ${point.index} (${point.date}): ${formatR(point.rMultiple)} → cumulative ${formatR(point.cumulativeR)}`}</title>
        </circle>
      ))}
      <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10" textAnchor="middle" x={MARGIN.left + plotW / 2} y={CURVE_H - 6}>
        settled trades, in sequence
      </text>
    </svg>
  );
}

export function RHistogram({ rMultiples }: { rMultiples: readonly number[] }) {
  const plotW = HIST_W - MARGIN.left - MARGIN.right;
  const plotH = HIST_H - MARGIN.top - MARGIN.bottom;
  const lo = Math.min(-1.5, ...rMultiples);
  const hi = Math.max(1.5, ...rMultiples);
  const bins = bin().domain([lo, hi]).thresholds(12)([...rMultiples]);
  const maxCount = Math.max(...bins.map((b) => b.length), 1);

  const x = (value: number) => MARGIN.left + ((value - lo) / (hi - lo)) * plotW;
  const y = (count: number) => MARGIN.top + (1 - count / maxCount) * plotH;

  return (
    <svg aria-label="Histogram of R outcomes" className="block h-auto w-full" role="img" viewBox={`0 0 ${HIST_W} ${HIST_H}`}>
      {bins.map((b, index) => {
        if (b.x0 === undefined || b.x1 === undefined) return null;
        const barX = x(b.x0) + 1;
        const barW = Math.max(x(b.x1) - x(b.x0) - 2, 1);
        const mid = (b.x0 + b.x1) / 2;
        return (
          <rect
            fill={mid >= 0 ? "var(--green)" : "var(--red)"}
            height={MARGIN.top + plotH - y(b.length)}
            key={index}
            opacity={b.length === 0 ? 0 : 0.75}
            width={barW}
            x={barX}
            y={y(b.length)}
          >
            <title>{`${b.length} trade${b.length === 1 ? "" : "s"} between ${formatR(b.x0)} and ${formatR(b.x1)}`}</title>
          </rect>
        );
      })}
      <line stroke="var(--muted)" strokeDasharray="3 5" x1={x(0)} x2={x(0)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
      {[lo, lo / 2, 0, hi / 2, hi].map((tick) => (
        <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10" key={tick} textAnchor="middle" x={x(tick)} y={HIST_H - 6}>
          {formatR(tick).replace("R", "")}
        </text>
      ))}
    </svg>
  );
}
