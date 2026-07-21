"use client";

import { useEffect, useState } from "react";

// Coordinates are rounded so the server- and client-rendered path strings are
// bit-identical; raw trig differs across engines at the 1e-15 level and
// triggers hydration warnings.
function polar(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(radians)).toFixed(3)),
    y: Number((cy + radius * Math.sin(radians)).toFixed(3))
  };
}

function arc(cx: number, cy: number, radius: number, start: number, end: number) {
  const from = polar(cx, cy, radius, end);
  const to = polar(cx, cy, radius, start);
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${end - start <= 180 ? "0" : "1"} 0 ${to.x} ${to.y}`;
}

export function ZDial({ zScore, compact = false }: { zScore: number | null; compact?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasValue = zScore !== null && Number.isFinite(zScore);
  const clamped = hasValue ? Math.max(-3, Math.min(3, zScore)) : 0;
  const angle = 180 + ((clamped + 3) / 6) * 180;
  const needle = polar(50, 50, 31, angle);
  const magnitude = hasValue ? Math.abs(zScore) : 0;
  const color = !hasValue
    ? "var(--muted)"
    : magnitude >= 2
      ? "var(--red)"
      : magnitude >= 1
        ? "var(--amber)"
        : "var(--green)";
  const label = hasValue ? `Z score ${zScore.toFixed(2)} standard deviations` : "Z score unavailable";

  return (
    <div className={compact ? "w-24" : "w-32"}>
      <svg aria-label={label} className="h-auto w-full overflow-visible" role="img" viewBox="0 0 100 62">
        <path d={arc(50, 50, 37, 270, 450)} fill="none" stroke="var(--line)" strokeLinecap="round" strokeWidth="7" />
        <path d={arc(50, 50, 37, 270, 330)} fill="none" stroke="var(--green)" strokeLinecap="round" strokeWidth="7" opacity=".8" />
        <path d={arc(50, 50, 37, 330, 390)} fill="none" stroke="var(--amber)" strokeLinecap="round" strokeWidth="7" opacity=".8" />
        <path d={arc(50, 50, 37, 390, 450)} fill="none" stroke="var(--red)" strokeLinecap="round" strokeWidth="7" opacity=".8" />
        {hasValue ? (
          <line
            className="origin-[50px_50px] motion-reduce:transition-none"
            style={{ transform: `rotate(${mounted ? 0 : 180 - angle}deg)`, transformOrigin: "50px 50px", transition: "transform 560ms cubic-bezier(0.16, 1, 0.3, 1)" }}
            x1="50"
            x2={needle.x}
            y1="50"
            y2={needle.y}
            stroke={color}
            strokeLinecap="round"
            strokeWidth="2"
          />
        ) : (
          <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="8" textAnchor="middle" x="50" y="46">n/a</text>
        )}
        <circle cx="50" cy="50" fill={color} r="3" />
        <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="6" textAnchor="middle" x="50" y="60">−3σ · 0 · +3σ</text>
      </svg>
    </div>
  );
}
