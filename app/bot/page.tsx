import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CircleCheck, CircleSlash } from "lucide-react";

import { DeskFooter } from "@/app/_components/desk-footer";
import { MetricCard } from "@/app/_components/metric-card";
import { SectionHeading } from "@/app/_components/section-heading";
import { getBotState, getDesk, getTrades } from "@/lib/datasource";
import { pairMeta } from "@/lib/pair-meta";
import {
  calculatePerformance,
  directionLabel,
  formatDate,
  formatNumber,
  formatPercent,
  formatR,
  formatZScore
} from "@/lib/utils";
import type { BotAction } from "@/lib/types";

export const metadata: Metadata = { title: "The bot" };
export const revalidate = 0;

const ACTION_STYLE: Record<BotAction, string> = {
  open: "border-green/40 bg-green/10 text-green",
  close: "border-blue/40 bg-blue/10 text-blue",
  hold: "border-amber/40 bg-amber/10 text-amber",
  skip: "border-red/40 bg-red/10 text-red",
  idle: "border-line bg-surface-2 text-muted"
};

export default async function BotPage() {
  const [desk, tradesData, bot] = await Promise.all([getDesk(), getTrades(), getBotState()]);

  const autoTrades = tradesData.trades.filter((trade) => trade.source === "auto");
  const openAuto = autoTrades.filter((trade) => !trade.closedOn);
  const metrics = calculatePerformance(autoTrades);
  const nameBySlug = new Map(desk.pairs.map((pair) => [pair.slug, pair.displayName]));
  const decimalsBySlug = new Map(desk.pairs.map((pair) => [pair.slug, pairMeta(pair.slug).decimals]));
  const standDowns = bot.eligibility.filter((row) => !row.eligible);

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Rules, executed without discretion" title="The bot" />
          <p className="flex items-center gap-2 font-mono text-[10px] text-muted">
            <Bot size={13} className="text-amber" />
            {openAuto.length} open · {metrics.settledTrades} settled
          </p>
        </div>

        <p className="mt-6 max-w-3xl text-[15px] leading-7 text-muted">
          A paper trader that runs every session on the same data you see. It has no model and
          predicts nothing: it applies rules that were fixed before the record started, and it never
          tunes them against results. Everything it does — including every time it declines to
          trade — is logged below.{" "}
          <b className="font-medium text-text">
            No real money is involved at any point, and none ever will be from this page.
          </b>
        </p>

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Open positions" tone="amber" value={openAuto.length} />
          <MetricCard label="Settled" value={metrics.settledTrades} />
          <MetricCard
            detail={metrics.settledTrades === 0 ? "no settled trades yet" : `${metrics.wins}W / ${metrics.losses}L`}
            label="Hit rate"
            value={formatPercent(metrics.hitRate)}
          />
          <MetricCard
            detail="(hit% × avg win R) − (miss% × avg loss R)"
            label="Expectancy"
            tone={(metrics.expectancyR ?? 0) >= 0 ? "green" : "red"}
            value={formatR(metrics.expectancyR)}
          />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            The rules, in full
          </h2>
          <dl className="grid gap-3 px-5 py-4 font-mono text-[11px] leading-5">
            {[
              ["Entry", "a signal fires: |z| ≥ 2, ADF p < 0.10, clean session, 5-session cooldown"],
              ["Eligibility", "the pair has not failed its walk-forward record check (see right)"],
              ["Target", "|z| ≤ 0.5 — the dislocation has closed"],
              ["Stop", "|z| ≥ 3 against the position"],
              ["Time stop", "2× the half-life estimated at entry, bounded to 5–40 sessions"],
              ["Risk", "(stop z − |entry z|) × σ₆₀, fixed at entry and never revised"],
              ["Position limit", "one open position per spread; the rule never adds to a loser"]
            ].map(([term, definition]) => (
              <div className="flex flex-col gap-1 border-b border-line pb-2.5 last:border-b-0 sm:flex-row sm:justify-between sm:gap-6" key={term}>
                <dt className="shrink-0 text-muted">{term}</dt>
                <dd className="text-text sm:text-right">{definition}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Which spreads it will trade
          </h2>
          {bot.eligibility.length > 0 ? (
            <ul className="divide-y divide-line/60">
              {[...bot.eligibility]
                .sort((a, b) => Number(a.eligible) - Number(b.eligible))
                .map((row) => (
                  <li className="flex items-start gap-3 px-5 py-3" key={row.pairSlug}>
                    {row.eligible ? (
                      <CircleCheck className="mt-0.5 shrink-0 text-green" size={14} />
                    ) : (
                      <CircleSlash className="mt-0.5 shrink-0 text-red" size={14} />
                    )}
                    <div>
                      <Link className="font-mono text-[11px] text-text hover:text-amber" href={`/s/${row.pairSlug}`}>
                        {nameBySlug.get(row.pairSlug) ?? row.pairSlug}
                      </Link>
                      <p className="mt-0.5 font-mono text-[10px] leading-4 text-muted">{row.reason}</p>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="px-5 py-4 font-mono text-[11px] leading-5 text-muted">
              Eligibility is judged on the next run.
            </p>
          )}
          <p className="border-t border-line px-5 py-3.5 font-mono text-[10px] leading-5 text-muted">
            Judged walk-forward: only signals that had already resolved at the time count toward the
            verdict, so a pair is never rewarded or punished using its own future.
            {standDowns.length > 0 ? ` ${standDowns.length} pair(s) currently stood down.` : ""}
          </p>
        </div>
      </section>

      {openAuto.length > 0 ? (
        <section className="mt-6 border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Open positions
          </h2>
          <div className="scrollbar-terminal overflow-x-auto">
            <table className="w-full min-w-[640px] font-mono text-[11px]">
              <thead>
                <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5 font-medium">Spread</th>
                  <th className="px-3 py-2.5 font-medium">Opened</th>
                  <th className="px-3 py-2.5 font-medium">Direction</th>
                  <th className="px-3 py-2.5 font-medium">Entry z</th>
                  <th className="px-5 py-2.5 text-right font-medium">Live R</th>
                </tr>
              </thead>
              <tbody>
                {openAuto.map((trade) => (
                  <tr className="border-b border-line/60 last:border-b-0" key={trade.id}>
                    <td className="px-5 py-3">
                      <Link className="text-text hover:text-amber" href={`/s/${trade.pairSlug}`}>
                        {nameBySlug.get(trade.pairSlug) ?? trade.pairSlug}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted">{formatDate(trade.openedOn)}</td>
                    <td className="px-3 py-3 text-muted">{directionLabel[trade.direction].toLowerCase()}</td>
                    <td className="px-3 py-3 text-text">{formatZScore(trade.entryZ)}</td>
                    <td className={`px-5 py-3 text-right ${(trade.liveR ?? 0) < 0 ? "text-red" : "text-green"}`}>
                      {formatR(trade.liveR)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-6 border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Decision log
        </h2>
        {bot.decisions.length > 0 ? (
          <ul className="divide-y divide-line/60">
            {bot.decisions.slice(0, 40).map((decision) => (
              <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 font-mono text-[11px]" key={`${decision.pairSlug}-${decision.d}`}>
                <span className="w-20 shrink-0 text-muted">{formatDate(decision.d, { day: "2-digit", month: "short" })}</span>
                <span className={`w-14 shrink-0 rounded-terminal border px-1.5 py-0.5 text-center text-[9px] uppercase tracking-[0.08em] ${ACTION_STYLE[decision.action]}`}>
                  {decision.action}
                </span>
                <Link className="w-36 shrink-0 text-text hover:text-amber" href={`/s/${decision.pairSlug}`}>
                  {nameBySlug.get(decision.pairSlug) ?? decision.pairSlug}
                </Link>
                <span className="text-muted">{decision.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 font-mono text-[11px] leading-5 text-muted">
            The log fills on the next scheduled run. Every session the bot records what it did on
            every spread, including the ones it left alone.
          </p>
        )}
      </section>

      <section className="mt-6 border border-amber/30 bg-amber/[0.06] px-5 py-4">
        <p className="text-[13px] leading-6 text-muted">
          <b className="font-medium text-text">Why there is no model here.</b> Across nine spreads and
          seven years this desk has produced about {formatNumber(205, 0)} signals in total, and they
          overlap. That is not enough data to train anything — a model fitted to it would be
          memorising noise and would look brilliant on history while knowing nothing about tomorrow.
          What the bot does instead is commit to rules in advance and let an honest forward record
          accumulate. That record, not a backtest, is the only thing that could ever justify trusting
          it with anything real.
        </p>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
