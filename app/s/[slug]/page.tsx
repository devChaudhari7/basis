import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";

import { DeskFooter } from "@/app/_components/desk-footer";
import { ZDial } from "@/app/_components/z-dial";
import { SpreadChart } from "@/app/s/[slug]/spread-chart";
import { TradeModal } from "@/app/s/[slug]/trade-modal";
import { getDesk, getPair, getTrades } from "@/lib/datasource";
import { pairMeta } from "@/lib/pair-meta";
import {
  directionLabel,
  exitReasonLabel,
  formatDate,
  formatHalfLife,
  formatNumber,
  formatOrdinal,
  formatPValue,
  formatR,
  formatZScore,
  getSpreadState,
  methodLabel,
  spreadStateClass,
  spreadStateLabel,
  stabilityLabel
} from "@/lib/utils";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const pair = await getPair(params.slug);
  return { title: pair ? pair.displayName : "Unknown spread" };
}

function StatCell({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="numeric mt-2 text-lg text-text">{value}</p>
      {hint ? <p className="mt-1 font-mono text-[10px] leading-4 text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function SpreadDetailPage({ params }: { params: { slug: string } }) {
  const [desk, pair, tradesData] = await Promise.all([
    getDesk(),
    getPair(params.slug),
    getTrades()
  ]);
  if (!pair) notFound();

  const meta = pairMeta(pair.slug);
  const state = getSpreadState(pair.latest.z, pair.series, pair.entryZ);
  const pairTrades = tradesData.trades.filter((trade) => trade.pairSlug === pair.slug);
  const adfWarning = pair.latest.adfP !== null && pair.latest.adfP >= 0.1;
  const noMeanReversion = pair.latest.halfLife === null;

  return (
    <>
      <Link className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-text" href="/">
        <ArrowLeft size={13} /> Desk
      </Link>

      <header className="mt-5 flex flex-col justify-between gap-7 border-b border-line pb-7 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">{meta.category}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-display text-text sm:text-4xl">{pair.displayName}</h1>
            <span className="rounded-terminal border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              {methodLabel[pair.method]}
            </span>
            <span className={`rounded-terminal border px-2 py-1 font-mono text-[10px] font-medium tracking-[0.09em] ${spreadStateClass[state]}`}>
              {spreadStateLabel[state]}
            </span>
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted">
            {pair.legs[0].name} ({pair.legs[0].symbol}) vs {pair.legs[1].name} ({pair.legs[1].symbol}) · settle {formatDate(pair.latest.d)}
          </p>
        </div>

        <div className="flex items-end gap-7">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Current spread</p>
            <p className="numeric mt-1 text-4xl tracking-[-0.05em] text-text">{formatNumber(pair.latest.value, meta.decimals)}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">{pair.unit} · {formatOrdinal(pair.latest.pctRank)} pct (1y)</p>
          </div>
          <ZDial zScore={pair.latest.z} />
        </div>
      </header>

      {pair.nextEvent ? (
        <p className="mt-4 flex items-center gap-2 font-mono text-[11px] text-amber">
          <CalendarClock size={13} /> next event: {pair.nextEvent.label} in {pair.nextEvent.daysAway}d ({formatDate(pair.nextEvent.d)})
        </p>
      ) : null}

      <section className="mt-6">
        <SpreadChart decimals={meta.decimals} series={pair.series} signals={pair.signals} unit={pair.unit} />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <StatCell
          hint={noMeanReversion ? "λ ≥ 0 in this sample" : "OU estimate on clean data"}
          label="Half-life"
          value={<span className={noMeanReversion ? "text-red" : undefined}>{formatHalfLife(pair.latest.halfLife)}</span>}
        />
        <StatCell
          hint={adfWarning ? "not stationary at 10% — don't trade it as mean-reverting" : "trailing 252 clean sessions"}
          label="ADF test"
          value={<span className={adfWarning ? "text-red" : undefined}>{formatPValue(pair.latest.adfP)}</span>}
        />
        <StatCell
          hint={stabilityLabel[pair.latest.stability]}
          label="Windows 30/60/90"
          value={
            <span className={pair.latest.stability === "unstable" ? "text-amber" : undefined}>
              {formatZScore(pair.latest.z30).replace("σ", "")}/{formatZScore(pair.latest.z).replace("σ", "")}/{formatZScore(pair.latest.z90).replace("σ", "")}
            </span>
          }
        />
        <StatCell hint="σ distance from 60d mean" label="Z-score" value={formatZScore(pair.latest.z)} />
        <StatCell hint={`entry ±${formatNumber(pair.entryZ, 1)} · stop ±${formatNumber(pair.stopZ, 1)}`} label="Thresholds" value={`${formatNumber(pair.entryZ, 1)}σ / ${formatNumber(pair.stopZ, 1)}σ`} />
        {pair.method === "beta" ? (
          <StatCell hint="rolling 60d OLS hedge ratio" label="Beta" value={formatNumber(pair.latest.beta, 3)} />
        ) : (
          <StatCell hint="mean ± σ over 60d lookback" label="Mean / σ" value={`${formatNumber(pair.latest.mean60, meta.decimals)} / ${formatNumber(pair.latest.std60, meta.decimals)}`} />
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="border border-line bg-surface p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Why this relationship exists</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-text">{pair.rationale}</p>
          <p className="mt-4 border-t border-line pt-4 font-mono text-[10px] leading-5 text-muted">
            The economics are the model. When the physical story changes — new pipelines, policy shifts,
            structural breaks — the statistics stop meaning anything, whatever the z-score says.
          </p>
        </div>

        <div className="flex flex-col justify-between gap-5 border border-line bg-surface p-5">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Take the other side?</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Signals fire at |z| ≥ {formatNumber(pair.entryZ, 1)} with a stationary spread and no roll
              contamination. Logging demands a hypothesis first.
            </p>
          </div>
          <TradeModal
            decimals={meta.decimals}
            defaultStopZ={pair.stopZ}
            displayName={pair.displayName}
            latestDate={pair.latest.d}
            latestValue={pair.latest.value}
            latestZ={pair.latest.z}
            mode={tradesData.mode}
            slug={pair.slug}
            unit={pair.unit}
          />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Signal history
          </h2>
          {pair.signals.length > 0 ? (
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {[...pair.signals].reverse().map((signal) => (
                  <tr className="border-b border-line/60 last:border-b-0" key={signal.d}>
                    <td className="px-5 py-2.5 text-muted">{formatDate(signal.d)}</td>
                    <td className={`px-5 py-2.5 ${Math.abs(signal.z) >= 2 ? "text-red" : "text-text"}`}>{formatZScore(signal.z)}</td>
                    <td className="px-5 py-2.5 text-right text-muted">{directionLabel[signal.direction].toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-4 font-mono text-[11px] text-muted">No qualifying dislocations in the recorded window.</p>
          )}
        </div>

        <div className="border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Trades on this spread
          </h2>
          {pairTrades.length > 0 ? (
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {pairTrades.map((trade) => (
                  <tr className="border-b border-line/60 last:border-b-0" key={trade.id}>
                    <td className="px-5 py-2.5 text-muted">{formatDate(trade.openedOn)}</td>
                    <td className="px-5 py-2.5 text-text">{directionLabel[trade.direction].toLowerCase()}</td>
                    <td className="px-5 py-2.5 text-muted">
                      {trade.closedOn ? (trade.exitReason ? exitReasonLabel[trade.exitReason].toLowerCase() : "closed") : "open"}
                    </td>
                    <td className={`px-5 py-2.5 text-right ${((trade.rMultiple ?? trade.liveR) ?? 0) < 0 ? "text-red" : "text-green"}`}>
                      {trade.closedOn ? formatR(trade.rMultiple) : `live ${formatR(trade.liveR)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-4 font-mono text-[11px] text-muted">
              No trades logged on this spread yet{tradesData.mode !== "live" ? " — connect the live database to start the journal" : ""}.
            </p>
          )}
        </div>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
