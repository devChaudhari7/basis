import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Trophy } from "lucide-react";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { getDesk } from "@/lib/datasource";
import { MIN_RANKED_TRADES, getLeaderboard } from "@/lib/server/leaderboard";
import { formatNumber, formatPercent, formatR } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };
export const revalidate = 0;

export default async function LeaderboardPage() {
  const [desk, rows] = await Promise.all([getDesk(), getLeaderboard()]);
  const machineRank = rows.findIndex((row) => row.isMachine);

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Discretion against rules" title="Leaderboard" />
          <p className="flex items-center gap-2 font-mono text-[10px] text-muted">
            <Trophy size={13} className="text-amber" /> ranked by expectancy
          </p>
        </div>

        <p className="mt-6 max-w-3xl text-[15px] leading-7 text-muted">
          Everyone here trades the same signals on the same data. The machine follows rules fixed in
          advance; everyone else uses judgement, and has to write a hypothesis before each entry.
          Ranking is by <b className="font-medium text-text">expectancy</b> rather than total R,
          because a large number produced by one lucky trade is not a better process. Books need at
          least {MIN_RANKED_TRADES} settled trades before they appear.
        </p>

        {rows.length > 0 ? (
          <div className="mt-7 border border-line bg-surface">
            <div className="scrollbar-terminal overflow-x-auto">
              <table className="w-full min-w-[620px] font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">Book</th>
                    <th className="px-3 py-3 font-medium">Settled</th>
                    <th className="px-3 py-3 font-medium">Hit rate</th>
                    <th className="px-3 py-3 font-medium">Expectancy</th>
                    <th className="px-5 py-3 text-right font-medium">Total R</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      className={`border-b border-line/60 last:border-b-0 ${row.isMachine ? "bg-blue/[0.06]" : ""}`}
                      key={row.handle}
                    >
                      <td className="px-5 py-3 text-muted">{index + 1}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2 text-text">
                          {row.isMachine ? <Bot className="text-blue" size={13} /> : null}
                          {row.handle}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted">{row.settled}</td>
                      <td className="px-3 py-3 text-text">{formatPercent(row.hitRate)}</td>
                      <td className={`px-3 py-3 ${(row.expectancyR ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                        {formatR(row.expectancyR)}
                      </td>
                      <td className={`px-5 py-3 text-right ${row.totalR >= 0 ? "text-green" : "text-red"}`}>
                        {row.totalR >= 0 ? "+" : ""}{formatNumber(row.totalR)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {machineRank >= 0 ? (
              <p className="border-t border-line px-5 py-3.5 font-mono text-[10px] leading-5 text-muted">
                The machine currently sits at #{machineRank + 1}. If discretion cannot beat a fixed
                rule over a meaningful sample, that is worth knowing — it is the most useful thing
                this page can tell you.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-7 border border-line bg-surface px-6 py-14 text-center">
            <p className="font-mono text-sm text-text">Nobody has a track record yet.</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              Books appear once they have {MIN_RANKED_TRADES} settled trades. The machine opens its
              first position the next time a spread crosses its threshold on a clean session.{" "}
              <Link className="text-amber underline-offset-2 hover:underline" href="/signin">
                Sign in
              </Link>{" "}
              to start your own book against the same signals.
            </p>
          </div>
        )}

        <p className="mt-5 font-mono text-[10px] leading-5 text-muted">
          Handles are anonymised one-way hashes. No email address, user id, or individual trade of
          another user is ever exposed by this page. Paper trading only — no real money, no orders,
          no brokerage.
        </p>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
