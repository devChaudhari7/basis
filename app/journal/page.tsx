import type { Metadata } from "next";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { JournalTable } from "@/app/journal/journal-table";
import { getDesk, getTrades } from "@/lib/datasource";
import { pairMeta } from "@/lib/pair-meta";

export const metadata: Metadata = { title: "Journal" };
export const revalidate = 0;

export default async function JournalPage() {
  const [desk, tradesData] = await Promise.all([getDesk(), getTrades()]);
  const open = tradesData.trades.filter((trade) => !trade.closedOn).length;
  const settled = tradesData.trades.length - open;

  const pairNames = Object.fromEntries(desk.pairs.map((pair) => [pair.slug, pair.displayName]));
  const decimalsBySlug = Object.fromEntries(desk.pairs.map((pair) => [pair.slug, pairMeta(pair.slug).decimals]));

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Every decision, written down" title="Journal" />
          <div className="flex items-center gap-5 font-mono text-[10px] text-muted">
            <span><b className="font-medium text-amber">{open}</b> open</span>
            <span><b className="font-medium text-text">{settled}</b> settled</span>
          </div>
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-6 text-muted">
          Each entry required a one-sentence hypothesis before it could exist. Closed trades carry the exit
          reason and a post-mortem — the desk keeps its mistakes on the record.
        </p>

        <div className="mt-7">
          <JournalTable
            decimalsBySlug={decimalsBySlug}
            mode={tradesData.mode}
            pairNames={pairNames}
            trades={tradesData.trades}
          />
        </div>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
