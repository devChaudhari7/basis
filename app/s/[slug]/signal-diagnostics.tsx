import { formatNumber, formatPercent } from "@/lib/utils";
import type { SignalDiagnostic } from "@/lib/types";

/** Horizontal bar showing the p25–p75 range of outcomes around zero. */
function OutcomeBar({ row }: { row: SignalDiagnostic }) {
  const scale = Math.max(3, Math.abs(row.p25), Math.abs(row.p75), Math.abs(row.medianMae));
  const toPercent = (value: number) => ((value + scale) / (2 * scale)) * 100;
  const left = toPercent(Math.min(row.p25, row.p75));
  const right = toPercent(Math.max(row.p25, row.p75));

  return (
    <div className="relative h-6 w-full min-w-28 rounded-terminal border border-line bg-bg">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div
        className={`absolute inset-y-1 rounded-sm ${row.medianMove >= 0 ? "bg-green/25" : "bg-red/25"}`}
        style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%` }}
      />
      <div
        className={`absolute inset-y-0.5 w-0.5 ${row.medianMove >= 0 ? "bg-green" : "bg-red"}`}
        style={{ left: `${toPercent(row.medianMove)}%` }}
        title={`Median ${formatNumber(row.medianMove)}σ`}
      />
      <div
        className="absolute inset-y-1.5 w-0.5 bg-amber/70"
        style={{ left: `${toPercent(row.medianMae)}%` }}
        title={`Median worst excursion ${formatNumber(row.medianMae)}σ`}
      />
    </div>
  );
}

export function SignalDiagnostics({
  diagnostics,
  entryZ
}: {
  diagnostics: readonly SignalDiagnostic[];
  entryZ: number;
}) {
  if (diagnostics.length === 0) {
    return (
      <div className="border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          What happened after past signals
        </h2>
        <p className="px-5 py-4 font-mono text-[11px] leading-5 text-muted">
          Not enough historical dislocations on this relationship to say anything. An empty sample is
          the honest answer.
        </p>
      </div>
    );
  }

  const headline = diagnostics.find((row) => row.horizon === 10) ?? diagnostics[0];
  const positive = headline.medianMove > 0 && headline.hitRate >= 50;

  return (
    <div className="border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          What happened after past signals
        </h2>
        <p className="font-mono text-[10px] text-muted">
          n = {headline.n} · |z| ≥ {formatNumber(entryZ, 1)} · measured in entry-day σ
        </p>
      </div>

      <div className="scrollbar-terminal overflow-x-auto">
        <table className="w-full min-w-[560px] font-mono text-[11px]">
          <thead>
            <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
              <th className="px-5 py-2.5 font-medium">Horizon</th>
              <th className="px-3 py-2.5 font-medium">n</th>
              <th className="px-3 py-2.5 font-medium">Closed</th>
              <th className="px-3 py-2.5 font-medium">Median</th>
              <th className="px-3 py-2.5 font-medium">Worst on the way</th>
              <th className="px-3 py-2.5 font-medium">Distribution (p25–p75)</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.map((row) => (
              <tr className="border-b border-line/60 last:border-b-0" key={row.horizon}>
                <td className="px-5 py-3 text-text">{row.horizon}d</td>
                <td className="px-3 py-3 text-muted">{row.n}</td>
                <td className={`px-3 py-3 ${row.hitRate >= 50 ? "text-green" : "text-red"}`}>
                  {formatPercent(row.hitRate)}
                </td>
                <td className={`px-3 py-3 ${row.medianMove >= 0 ? "text-green" : "text-red"}`}>
                  {row.medianMove >= 0 ? "+" : ""}{formatNumber(row.medianMove)}σ
                </td>
                <td className="px-3 py-3 text-amber">{formatNumber(row.medianMae)}σ</td>
                <td className="px-3 py-3"><OutcomeBar row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="text-[13px] leading-6 text-text">
          {positive ? (
            <>
              Historically this dislocation has tended to close: {formatPercent(headline.hitRate)} of{" "}
              {headline.n} signals moved favourably over {headline.horizon} sessions, median{" "}
              +{formatNumber(headline.medianMove)}σ. The median signal still drew down{" "}
              {formatNumber(headline.medianMae)}σ before it did.
            </>
          ) : (
            <>
              This screen has <b className="font-medium text-red">not</b> worked on this relationship:
              only {formatPercent(headline.hitRate)} of {headline.n} signals moved favourably over{" "}
              {headline.horizon} sessions, median {formatNumber(headline.medianMove)}σ. Reported
              because a screen that fails on a pair is exactly what an operator needs to know.
            </>
          )}
        </p>
        <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-5 text-muted">
          Descriptive history, not a forecast. Windows overlap, so these observations are not
          independent; the sample is in-sample by construction; no execution costs, slippage or
          legging risk are modelled. Worst-on-the-way is the lowest point the position passed through
          before the horizon — what the operator would have had to sit through.
        </p>
      </div>
    </div>
  );
}
