import Link from "next/link";

import { formatNumber } from "@/lib/utils";
import type { Pair, PairCorrelation } from "@/lib/types";

/** Amber for positively correlated, blue for negatively — magnitude drives
 *  intensity, so a glance shows concentration rather than exact numbers.
 *  Class names are written out in full so Tailwind's compiler can see them. */
function cellStyle(corr: number | null): string {
  if (corr === null) return "bg-surface-2 text-muted";
  const magnitude = Math.min(Math.abs(corr), 1);
  if (magnitude < 0.15) return "text-muted";
  if (corr > 0) {
    if (magnitude >= 0.6) return "bg-amber/40 text-text";
    if (magnitude >= 0.35) return "bg-amber/25 text-text";
    return "bg-amber/[0.12] text-text";
  }
  if (magnitude >= 0.6) return "bg-blue/40 text-text";
  if (magnitude >= 0.35) return "bg-blue/25 text-text";
  return "bg-blue/[0.12] text-text";
}

export function CorrelationMatrix({
  pairs,
  correlations
}: {
  pairs: readonly Pair[];
  correlations: readonly PairCorrelation[];
}) {
  if (correlations.length === 0 || pairs.length < 2) return null;

  const slugs = pairs.map((pair) => pair.slug);
  const nameBySlug = new Map(pairs.map((pair) => [pair.slug, pair.displayName]));
  const lookup = new Map<string, PairCorrelation>();
  for (const row of correlations) {
    lookup.set(`${row.pairA}|${row.pairB}`, row);
    lookup.set(`${row.pairB}|${row.pairA}`, row);
  }

  const strongest = [...correlations]
    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
    .slice(0, 3);
  const window = correlations[0]?.windowSessions ?? 120;

  return (
    <section className="border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="font-display text-base font-semibold tracking-display">Are these one bet?</h2>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            Correlation of daily spread changes over the last {window} common sessions
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
          <span className="flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-4 bg-amber/40" /> moves together</span>
          <span className="flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-4 bg-blue/40" /> moves opposite</span>
        </div>
      </div>

      <div className="scrollbar-terminal overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse font-mono text-[10px]">
          <caption className="sr-only">
            Pairwise correlation of daily spread changes between monitored relationships
          </caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-muted">Pair</th>
              {slugs.map((slug) => (
                <th className="px-1.5 py-2 text-center font-medium text-muted" key={slug} scope="col">
                  <span className="block max-w-16 truncate" title={nameBySlug.get(slug)}>
                    {nameBySlug.get(slug)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slugs.map((rowSlug) => (
              <tr key={rowSlug}>
                <th className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2 text-left font-normal text-text" scope="row">
                  <Link className="transition-colors hover:text-amber" href={`/s/${rowSlug}`}>
                    {nameBySlug.get(rowSlug)}
                  </Link>
                </th>
                {slugs.map((colSlug) => {
                  if (rowSlug === colSlug) {
                    return (
                      <td className="border border-line/50 bg-surface-2 px-1.5 py-2 text-center text-muted" key={colSlug}>
                        —
                      </td>
                    );
                  }
                  const entry = lookup.get(`${rowSlug}|${colSlug}`);
                  const corr = entry ? entry.corr : null;
                  return (
                    <td
                      className={`border border-line/50 px-1.5 py-2 text-center ${cellStyle(corr)}`}
                      key={colSlug}
                      title={
                        entry
                          ? `${nameBySlug.get(rowSlug)} vs ${nameBySlug.get(colSlug)}: ${formatNumber(entry.corr)} over ${entry.n} sessions`
                          : "Not enough overlapping sessions"
                      }
                    >
                      {corr === null ? "·" : formatNumber(corr, 2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="text-[13px] leading-6 text-text">
          Strongest links right now:{" "}
          {strongest.map((row, index) => (
            <span key={`${row.pairA}-${row.pairB}`}>
              {index > 0 ? ", " : ""}
              <b className="font-medium">
                {nameBySlug.get(row.pairA)} / {nameBySlug.get(row.pairB)}
              </b>{" "}
              at {formatNumber(row.corr)}
            </span>
          ))}
          . Two spreads that move together are one position held twice — sizing them independently
          understates the risk.
        </p>
        <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-5 text-muted">
          Computed on daily changes rather than levels, because two trending spreads can look related
          at the level while their day-to-day risk is not. Pairs are inner-joined on date, so
          differing market holidays never create a shared session. Correlation is unstable and says
          nothing about causation.
        </p>
      </div>
    </section>
  );
}
