"use client";

import Link from "next/link";
import { ArrowRight, CircleDot, Database, Radio } from "lucide-react";

import { ColdOpen } from "@/app/_components/cold-open";
import { DeskFrame } from "@/app/_components/desk-frame";
import { SectionHeading } from "@/app/_components/section-heading";
import { SpreadCard } from "@/app/_components/spread-card";
import { deskMeta, paperTrades, spreadPairs } from "@/lib/data";

export default function DeskPage() {
  const openTrades = paperTrades.filter((trade) => trade.status === "open");
  const stretched = spreadPairs.filter((pair) => pair.state === "stretched").length;

  return (
    <DeskFrame>
      <ColdOpen />
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Relative value monitoring" title="The desk" />
          <div className="flex items-center gap-3 font-mono text-[10px] text-muted">
            <span className="flex items-center gap-1.5"><Database size={12} className="text-amber" /> SEEDED DEMO</span>
            <span>AS OF {deskMeta.asOf}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-5 font-mono text-[10px] text-muted">
          <span><b className="font-medium text-text">{spreadPairs.length}</b> monitored relationships</span>
          <span><b className="font-medium text-red">{stretched}</b> beyond entry threshold</span>
          <span><b className="font-medium text-text">60d</b> default lookback</span>
          <span className="ml-auto flex items-center gap-1.5 text-amber"><Radio size={12} /> EOD SETTLEMENT MODEL</span>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {spreadPairs.map((pair, index) => <SpreadCard index={index} key={pair.slug} pair={pair} />)}
        </div>
      </section>

      <section className="mt-10 border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CircleDot className="text-amber" size={16} />
            <div>
              <h2 className="font-display text-base font-semibold tracking-display">Open paper trades</h2>
              <p className="mt-0.5 font-mono text-[10px] text-muted">Seeded examples only — not an operator track record</p>
            </div>
          </div>
          <Link className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-amber hover:text-text" href="/journal">
            Open journal <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {openTrades.map((trade) => {
            const pair = spreadPairs.find((candidate) => candidate.slug === trade.pairSlug);
            return (
              <Link className="group p-5 transition-colors hover:bg-surface-2" href={`/s/${trade.pairSlug}`} key={trade.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-text">{pair?.shortName}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted">{trade.direction.replace("_", " ")} · opened {trade.openedOn}</p>
                  </div>
                  <span className="font-mono text-[10px] text-amber">LIVE R —</span>
                </div>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted">{trade.hypothesis}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="mt-7 border-t border-line pt-5 font-mono text-[10px] leading-5 text-muted">
        {deskMeta.footerDisclosure}
      </footer>
    </DeskFrame>
  );
}
