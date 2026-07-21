"use client";

import { useEffect, useState } from "react";

function polar(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function arc(cx: number, cy: number, radius: number, start: number, end: number) {
  const from = polar(cx, cy, radius, end);
  const to = polar(cx, cy, radius, start);
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${end - start <= 180 ? "0" : "1"} 0 ${to.x} ${to.y}`;
}

export function ZDial({ zScore, compact = false }: { zScore: number; compact?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const clamped = Math.max(-3, Math.min(3, zScore));
  const angle = 180 + ((clamped + 3) / 6) * 180;
  const needle = polar(50, 50, 31, angle);
  const magnitude = Math.abs(zScore);
  const color = magnitude >= 2 ? "var(--red)" : magnitude >= 1 ? "var(--amber)" : "var(--green)";

  return (
    <div className={compact ? "w-24" : "w-32"}>
      <svg aria-label={`Z score ${zScore.toFixed(2)} standard deviations`} className="h-auto w-full overflow-visible" role="img" viewBox="0 0 100 62">
        <path d={arc(50, 50, 37, 270, 450)} fill="none" stroke="var(--line)" strokeLinecap="round" strokeWidth="7" />
        <path d={arc(50, 50, 37, 270, 330)} fill="none" stroke="var(--green)" strokeLinecap="round" strokeWidth="7" opacity=".8" />
        <path d={arc(50, 50, 37, 330, 390)} fill="none" stroke="var(--amber)" strokeLinecap="round" strokeWidth="7" opacity=".8" />
        <path d={arc(50, 50, 37, 390, 450)} fill="none" stroke="var(--red)" strokeLinecap="round" strokeWidth="7" opacity=".8" />
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
        <circle cx="50" cy="50" fill={color} r="3" />
        <text fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="6" textAnchor="middle" x="50" y="60">−3σ · 0 · +3σ</text>
      </svg>
    </div>
  );
}
