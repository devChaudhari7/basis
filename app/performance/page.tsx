import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { DeskFooter } from "@/app/_components/desk-footer";
import { MetricCard } from "@/app/_components/metric-card";
import { SectionHeading } from "@/app/_components/section-heading";
import { EquityCurve, RHistogram } from "@/app/performance/charts";
import { getDesk, getTrades } from "@/lib/datasource";
import { calculatePerformance, formatNumber, formatPercent, formatR } from "@/lib/utils";

export const metadata: Metadata = { title: "Performance" };
export const revalidate = 0;

export default async function PerformancePage() {
  const [desk, tradesData] = await Promise.all([getDesk(), getTrades()]);
  const metrics = calculatePerformance(tradesData.trades);
  const hasRecord = metrics.settledTrades > 0;

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="The honest scoreboard" title="Performance" />
          <p className="font-mono text-[10px] text-muted">
            {metrics.settledTrades} settled · {metrics.openTrades} open
          </p>
        </div>

        <div className="mt-5 flex items-start gap-3 border border-amber/30 bg-amber/[0.06] px-4 py-3.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber" size={14} />
          <p className="font-mono text-[11px] leading-5 text-muted">
            Paper trades on EOD settlement data. No slippage or commission modelled. R-multiples measure
            discipline against pre-committed risk, not realisable profit.
          </p>
        </div>

        {hasRecord ? (
          <>
            <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-4">
              <MetricCard label="Settled trades" value={metrics.settledTrades} />
              <MetricCard
                detail={`${metrics.wins}W / ${metrics.losses}L${metrics.breakeven ? ` / ${metrics.breakeven}BE` : ""}`}
                label="Hit rate"
                value={formatPercent(metrics.hitRate)}
              />
              <MetricCard label="Avg win" tone="green" value={formatR(metrics.averageWinR)} />
              <MetricCard label="Avg loss" tone="red" value={metrics.averageLossR !== null ? `−${formatNumber(metrics.averageLossR)}R` : "—"} />
              <MetricCard
                detail="(hit% × avg win R) − (miss% × avg loss R)"
                label="Expectancy"
                tone={metrics.expectancyR !== null && metrics.expectancyR >= 0 ? "green" : "red"}
                value={formatR(metrics.expectancyR)}
              />
              <MetricCard label="Max drawdown" tone="red" value={`−${formatNumber(metrics.maxDrawdownR)}R`} />
              <MetricCard label="Longest losing streak" value={metrics.longestLosingStreak} />
              <MetricCard label="Open trades" tone="amber" value={metrics.openTrades} />
            </div>

            <div className="mt-7 border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Equity curve · cumulative R
              </h2>
              <div className="p-4">
                <EquityCurve points={metrics.equityCurve} />
              </div>
            </div>

            <div className="mt-4 border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Distribution of R outcomes
              </h2>
              <div className="p-4">
                <RHistogram rMultiples={metrics.equityCurve.map((point) => point.rMultiple)} />
              </div>
            </div>
          </>
        ) : (
          <div className="mt-7 border border-line bg-surface px-6 py-16 text-center">
            <p className="font-mono text-sm text-text">No trades yet.</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              The log starts when the operator takes the first signal. An empty scoreboard is a truthful
              scoreboard — nothing here is simulated, backfilled, or imagined.
            </p>
          </div>
        )}
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
