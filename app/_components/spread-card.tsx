import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Sparkline } from "@/app/_components/sparkline";
import { ZDial } from "@/app/_components/z-dial";
import type { SpreadPair } from "@/lib/types";

const stateStyle = {
  stretched: "border-red/50 bg-red/10 text-red",
  normal: "border-green/50 bg-green/10 text-green",
  reverting: "border-amber/50 bg-amber/10 text-amber"
} as const;

export function SpreadCard({ pair, index }: { pair: SpreadPair; index: number }) {
  const change = pair.latestValue - pair.previousValue;
  const sparkTone = pair.state === "stretched" ? "red" : pair.state === "normal" ? "green" : "amber";

  return (
    <Link
      className="group relative block overflow-hidden border border-line bg-surface p-5 transition-[border-color,transform,background-color] duration-300 hover:-translate-y-0.5 hover:border-muted hover:bg-surface-2 focus-visible:outline-none"
      href={`/s/${pair.slug}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="absolute right-4 top-4 text-muted opacity-0 transition-opacity group-hover:opacity-100"><ArrowUpRight size={16} /></div>
      <div className="flex items-start justify-between gap-3 pr-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted">{pair.category.toUpperCase()}</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-display text-text">{pair.name}</h2>
          <p className="mt-1 font-mono text-[10px] text-muted">{pair.method} · {pair.unit}</p>
        </div>
        <span className={`rounded-terminal border px-2 py-1 font-mono text-[9px] font-medium tracking-[0.09em] ${stateStyle[pair.state]}`}>
          {pair.state.toUpperCase()}
        </span>
      </div>

      <div className="mt-7 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xl tracking-[-0.06em] text-text">{pair.latestValue.toFixed(pair.decimals)}</p>
          <p className={`mt-1 font-mono text-[11px] ${change >= 0 ? "text-green" : "text-red"}`}>
            {change >= 0 ? "+" : ""}{change.toFixed(pair.decimals)} <span className="text-muted">vs prior</span>
          </p>
        </div>
        <ZDial compact zScore={pair.zScore} />
      </div>

      <Sparkline className="mt-5 h-14 w-full" history={pair.history.slice(-48)} tone={sparkTone} />

      <div className="mt-5 flex items-center justify-between border-t border-line pt-3 font-mono text-[10px]">
        <span className={Math.abs(pair.zScore) >= 2 ? "text-red" : "text-text"}>z {pair.zScore > 0 ? "+" : ""}{pair.zScore.toFixed(2)}</span>
        <span className="text-muted">{pair.nextEvent ? `${pair.nextEvent.label} · ${pair.nextEvent.daysAway}d` : "No event tagged"}</span>
      </div>
    </Link>
  );
}
