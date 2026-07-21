import Link from "next/link";
import { ArrowRight, CircleDot, Database, Radio } from "lucide-react";

import { ColdOpen } from "@/app/_components/cold-open";
import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { SpreadCard } from "@/app/_components/spread-card";
import { getDesk, getTrades } from "@/lib/datasource";
import { pairMeta } from "@/lib/pair-meta";
import { directionLabel, formatDate, formatR } from "@/lib/utils";
import type { TapeItem } from "@/lib/types";

export const revalidate = 900;

export default async function DeskPage() {
  const [desk, tradesData] = await Promise.all([getDesk(), getTrades()]);
  const openTrades = tradesData.trades.filter((trade) => !trade.closedOn);
  const stretched = desk.pairs.filter(
    (pair) => pair.latest.z !== null && Math.abs(pair.latest.z) >= pair.entryZ
  ).length;
  const coldOpenItems: TapeItem[] = desk.pairs.map((pair) => ({
    slug: pair.slug,
    displayName: pair.displayName,
    z: pair.latest.z,
    value: pair.latest.value,
    decimals: pairMeta(pair.slug).decimals
  }));
  const pairName = new Map(desk.pairs.map((pair) => [pair.slug, pair.displayName]));

  return (
    <>
      <ColdOpen items={coldOpenItems} />
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Relative value monitoring" title="The desk" />
          <div className="flex items-center gap-3 font-mono text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
              <Database size={12} className="text-amber" /> {desk.mode === "live" ? "LIVE SYNC" : "EOD SNAPSHOT"}
            </span>
            <span>AS OF {formatDate(desk.asOf, { day: "2-digit", month: "short" }).toUpperCase()}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-5 font-mono text-[10px] text-muted">
          <span><b className="font-medium text-text">{desk.pairs.length}</b> monitored relationships</span>
          <span><b className={`font-medium ${stretched > 0 ? "text-red" : "text-text"}`}>{stretched}</b> beyond entry threshold</span>
          <span><b className="font-medium text-text">60d</b> default lookback</span>
          <span className="ml-auto flex items-center gap-1.5 text-amber"><Radio size={12} /> EOD SETTLEMENT MODEL</span>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {desk.pairs.map((pair, index) => <SpreadCard index={index} key={pair.slug} pair={pair} />)}
        </div>
      </section>

      <section className="mt-10 border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CircleDot className="text-amber" size={16} />
            <div>
              <h2 className="font-display text-base font-semibold tracking-display">Open paper trades</h2>
              <p className="mt-0.5 font-mono text-[10px] text-muted">
                {tradesData.mode === "live"
                  ? "Marked against the latest settlement session"
                  : "Trade logging needs the live database connection"}
              </p>
            </div>
          </div>
          <Link className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-amber hover:text-text" href="/journal">
            Open journal <ArrowRight size={13} />
          </Link>
        </div>
        {openTrades.length > 0 ? (
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {openTrades.map((trade) => (
              <Link className="group p-5 transition-colors hover:bg-surface-2" href={`/s/${trade.pairSlug}`} key={trade.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-text">{pairName.get(trade.pairSlug) ?? trade.pairSlug}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {directionLabel[trade.direction].toLowerCase()} · opened {formatDate(trade.openedOn)}
                    </p>
                  </div>
                  <span className={`font-mono text-[10px] ${trade.liveR !== null && trade.liveR < 0 ? "text-red" : "text-amber"}`}>
                    LIVE {formatR(trade.liveR)}
                  </span>
                </div>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted">{trade.hypothesis}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-5 font-mono text-[11px] leading-5 text-muted">
            No open trades — the log starts when the operator takes the first signal.
          </p>
        )}
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
