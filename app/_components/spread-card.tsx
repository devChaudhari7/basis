import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Sparkline } from "@/app/_components/sparkline";
import { ZDial } from "@/app/_components/z-dial";
import { pairMeta } from "@/lib/pair-meta";
import {
  formatNumber,
  formatSigned,
  formatZScore,
  getSpreadState,
  methodLabel,
  spreadStateClass,
  spreadStateLabel
} from "@/lib/utils";
import type { Pair } from "@/lib/types";

const sparkToneByState = {
  stretched: "red",
  reverting: "amber",
  normal: "green",
  na: "muted"
} as const;

export function SpreadCard({ pair, index }: { pair: Pair; index: number }) {
  const meta = pairMeta(pair.slug);
  const state = getSpreadState(pair.latest.z, pair.series, pair.entryZ);
  const change =
    pair.latest.prevValue !== null ? pair.latest.value - pair.latest.prevValue : null;

  return (
    <Link
      className="group relative block overflow-hidden border border-line bg-surface p-5 transition-[border-color,transform,background-color] duration-300 hover:-translate-y-0.5 hover:border-muted hover:bg-surface-2 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      href={`/s/${pair.slug}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="absolute right-4 top-4 text-muted opacity-0 transition-opacity group-hover:opacity-100"><ArrowUpRight size={16} /></div>
      <div className="flex items-start justify-between gap-3 pr-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted">{meta.category.toUpperCase()}</p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-display text-text">{pair.displayName}</h2>
          <p className="mt-1 font-mono text-[10px] text-muted">{methodLabel[pair.method].toLowerCase()} · {pair.unit}</p>
        </div>
        <span className={`rounded-terminal border px-2 py-1 font-mono text-[9px] font-medium tracking-[0.09em] ${spreadStateClass[state]}`}>
          {spreadStateLabel[state]}
        </span>
      </div>

      <div className="mt-7 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xl tracking-[-0.06em] text-text">{formatNumber(pair.latest.value, meta.decimals)}</p>
          <p className={`mt-1 font-mono text-[11px] ${change !== null && change < 0 ? "text-red" : "text-green"}`}>
            {change !== null ? formatSigned(change, meta.decimals) : "—"} <span className="text-muted">vs prior</span>
          </p>
        </div>
        <ZDial compact zScore={pair.latest.z} />
      </div>

      <Sparkline className="mt-5 h-14 w-full" series={pair.series.slice(-48)} tone={sparkToneByState[state]} />

      <div className="mt-5 flex items-center justify-between border-t border-line pt-3 font-mono text-[10px]">
        <span className={state === "stretched" ? "text-red" : "text-text"}>z {formatZScore(pair.latest.z)}</span>
        <span className="text-muted">
          {pair.nextEvent ? `${pair.nextEvent.label} · ${pair.nextEvent.daysAway}d` : "No event tagged"}
        </span>
      </div>
    </Link>
  );
}
