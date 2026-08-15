import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { getDesk } from "@/lib/datasource";
import { serviceClient } from "@/lib/server/operator";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Research",
  description: "What the desk found when it searched every combination — and what survived correction."
};
export const revalidate = 900;

interface ScanRun {
  scanned_on: string;
  tested: number;
  raw_pass: number;
  survivors: number;
  expected_false_positives: number;
  alpha: number;
}

interface Candidate {
  symbol_a: string;
  symbol_b: string;
  method: string;
  sessions: number;
  adf_p: number;
  half_life: number | null;
  latest_z: number | null;
  survives_fdr: boolean;
}

interface EventImpact {
  pair_slug: string;
  label: string;
  event_sessions: number;
  median_event_move: number;
  median_other_move: number;
  ratio: number | null;
  p_value: number;
  survives_fdr: boolean;
}

interface ModelExperiment {
  ran_on: string;
  n_evaluated: number;
  rule_hit_rate: number;
  model_hit_rate: number | null;
  model_taken: number;
  rule_expectancy: number;
  model_expectancy: number | null;
  permutation_p: number;
  verdict: string;
}

export default async function ResearchPage() {
  const desk = await getDesk();
  const client = serviceClient();

  const [runResult, candidatesResult, impactsResult, experimentResult] = client
    ? await Promise.all([
        client.from("scan_runs").select("*").order("scanned_on", { ascending: false }).limit(1),
        client.from("candidates").select("*").order("rank").limit(14),
        client.from("event_impacts").select("*").order("p_value").limit(14),
        client.from("model_experiments").select("*").order("ran_on", { ascending: false }).limit(1)
      ])
    : [null, null, null, null];

  const run = ((runResult?.data ?? []) as ScanRun[])[0] ?? null;
  const experiment = ((experimentResult?.data ?? []) as ModelExperiment[])[0] ?? null;
  const candidates = (candidatesResult?.data ?? []) as Candidate[];
  const impacts = (impactsResult?.data ?? []) as EventImpact[];
  const nameBySlug = new Map(desk.pairs.map((pair) => [pair.slug, pair.displayName]));

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="What the desk found on its own" title="Research" />
          <p className="flex items-center gap-2 font-mono text-[10px] text-muted">
            <FlaskConical size={13} className="text-amber" />
            {run ? `last sweep ${run.scanned_on}` : "awaiting first sweep"}
          </p>
        </div>

        <p className="mt-6 max-w-3xl text-[15px] leading-7 text-muted">
          Every night the desk re-tests every combination of the instruments it ingests, and re-tests
          whether scheduled releases actually move each spread. Both sweeps publish their failures
          next to their survivors, because{" "}
          <b className="font-medium text-text">
            a shortlist without its denominator is not a finding, it is a story
          </b>
          .
        </p>

        {run ? (
          <div className="mt-7 border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              The multiple-comparison arithmetic
            </h2>
            <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
              {[
                { label: "Combinations tested", value: run.tested, tone: "text-text" },
                {
                  label: `Passed at ${formatNumber(run.alpha * 100, 0)}%, uncorrected`,
                  value: run.raw_pass,
                  tone: "text-text"
                },
                {
                  label: "Expected by chance alone",
                  value: run.expected_false_positives,
                  tone: "text-amber"
                },
                { label: "Survive correction", value: run.survivors, tone: "text-green" }
              ].map((cell) => (
                <div className="bg-surface p-4" key={cell.label}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{cell.label}</p>
                  <p className={`numeric mt-2 text-2xl ${cell.tone}`}>{cell.value}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-line px-5 py-4 text-[13px] leading-6 text-muted">
              A p-value promises to be wrong only 10% of the time <i>per test</i>. Run {run.tested}{" "}
              tests and roughly {run.expected_false_positives} will pass on noise alone
              {run.raw_pass <= run.expected_false_positives ? (
                <>
                  {" "}
                  — which is more than the {run.raw_pass} that actually passed here. Read plainly:
                  the raw results are entirely consistent with there being no widespread stationarity
                  in this universe at all.
                </>
              ) : (
                <> — so the {run.raw_pass} raw passes must be corrected before any of them mean anything.</>
              )}{" "}
              Benjamini-Hochberg controls the share of survivors expected to be false, leaving{" "}
              {run.survivors}.
            </p>
          </div>
        ) : null}

        {experiment ? (
          <div className="mt-6 border border-line bg-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Can a learned filter beat the fixed rule?
              </h2>
              <p className="font-mono text-[10px] text-muted">
                walk-forward · {experiment.n_evaluated} out-of-sample decisions · {experiment.ran_on}
              </p>
            </div>

            <div className="grid gap-px bg-line sm:grid-cols-2">
              <div className="bg-surface p-5">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  Fixed rule · takes every signal
                </p>
                <p className="numeric mt-2 text-2xl text-text">
                  {formatNumber(experiment.rule_hit_rate, 1)}%
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  expectancy {experiment.rule_expectancy >= 0 ? "+" : ""}
                  {formatNumber(experiment.rule_expectancy, 3)}σ
                </p>
              </div>
              <div className="bg-surface p-5">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  Learned filter · took {experiment.model_taken} of {experiment.n_evaluated}
                </p>
                <p className="numeric mt-2 text-2xl text-green">
                  {experiment.model_hit_rate === null ? "—" : `${formatNumber(experiment.model_hit_rate, 1)}%`}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  expectancy {(experiment.model_expectancy ?? 0) >= 0 ? "+" : ""}
                  {formatNumber(experiment.model_expectancy, 3)}σ · permutation p ={" "}
                  {formatNumber(experiment.permutation_p, 3)}
                </p>
              </div>
            </div>

            <div className="border-t border-line px-5 py-4">
              <p className="text-[13px] leading-6 text-text">{experiment.verdict}.</p>
              <p className="mt-3 text-[13px] leading-6 text-muted">
                Every feature is observable on the signal session; the model is refitted before each
                decision using only signals that had already resolved; the permutation test measures
                what a gap this size looks like when there is no edge at all. What it learned is
                economically coherent rather than arbitrary — fast-reverting, window-stable, more
                extreme dislocations are the ones that close.
              </p>
              <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-5 text-amber">
                HELD LOOSELY — {experiment.model_taken} taken decisions and p ≈{" "}
                {formatNumber(experiment.permutation_p, 3)} is a promising result, not a proven one,
                and the magnitude has already moved as signals accumulated. Every live prediction is
                now logged before its outcome exists, so this claim is being tested forward in public
                rather than trusted once. No real money is involved.
              </p>
            </div>
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <div className="mt-6 border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Candidate sweep
            </h2>
            <div className="scrollbar-terminal overflow-x-auto">
              <table className="w-full min-w-[640px] font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
                    <th className="px-5 py-2.5 font-medium">Combination</th>
                    <th className="px-3 py-2.5 font-medium">Sessions</th>
                    <th className="px-3 py-2.5 font-medium">ADF p</th>
                    <th className="px-3 py-2.5 font-medium">Half-life</th>
                    <th className="px-5 py-2.5 text-right font-medium">After correction</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr
                      className="border-b border-line/60 last:border-b-0"
                      key={`${candidate.symbol_a}-${candidate.symbol_b}-${candidate.method}`}
                    >
                      <td className="px-5 py-2.5 text-text">
                        {candidate.symbol_a} {candidate.method === "ratio" ? "/" : "−"} {candidate.symbol_b}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{candidate.sessions}</td>
                      <td className="px-3 py-2.5 text-muted">{candidate.adf_p.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-muted">
                        {candidate.half_life === null ? "none" : `${formatNumber(candidate.half_life, 1)}d`}
                      </td>
                      <td className={`px-5 py-2.5 text-right ${candidate.survives_fdr ? "text-green" : "text-muted"}`}>
                        {candidate.survives_fdr ? "SURVIVES" : "rejected"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-4 text-[13px] leading-6 text-muted">
              A survivor is a candidate, not a pair. Promotion to the{" "}
              <Link className="text-amber underline-offset-2 hover:underline" href="/">monitored desk</Link>{" "}
              requires a human to write down why the relationship should exist economically. Statistics
              can rank candidates; only a reason can justify one.
            </p>
          </div>
        ) : null}

        {impacts.length > 0 ? (
          <div className="mt-6 border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Do scheduled events actually move these spreads?
            </h2>
            <div className="scrollbar-terminal overflow-x-auto">
              <table className="w-full min-w-[680px] font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
                    <th className="px-5 py-2.5 font-medium">Spread</th>
                    <th className="px-3 py-2.5 font-medium">Release</th>
                    <th className="px-3 py-2.5 font-medium">Event days</th>
                    <th className="px-3 py-2.5 font-medium">Move vs normal</th>
                    <th className="px-5 py-2.5 text-right font-medium">p (corrected)</th>
                  </tr>
                </thead>
                <tbody>
                  {impacts.map((impact) => (
                    <tr className="border-b border-line/60 last:border-b-0" key={`${impact.pair_slug}-${impact.label}`}>
                      <td className="px-5 py-2.5">
                        <Link className="text-text hover:text-amber" href={`/s/${impact.pair_slug}`}>
                          {nameBySlug.get(impact.pair_slug) ?? impact.pair_slug}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{impact.label}</td>
                      <td className="px-3 py-2.5 text-muted">{impact.event_sessions}</td>
                      <td
                        className={`px-3 py-2.5 ${
                          (impact.ratio ?? 1) > 1.1 ? "text-amber" : (impact.ratio ?? 1) < 0.9 ? "text-blue" : "text-muted"
                        }`}
                      >
                        {impact.ratio === null ? "—" : `${formatNumber(impact.ratio, 2)}×`}
                      </td>
                      <td className={`px-5 py-2.5 text-right ${impact.survives_fdr ? "text-green" : "text-muted"}`}>
                        {impact.p_value.toFixed(4)} {impact.survives_fdr ? "· KEEP" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-4 text-[13px] leading-6 text-muted">
              A ratio below 1 means the spread moves <i>less</i> on release days than on ordinary ones.
              That is not a bug — it is the relative-value premise working: a shock that hits both legs
              largely cancels in the difference between them, even while each leg moves. Tested with a
              Mann-Whitney U on absolute daily moves, because spread changes are fat-tailed and a
              t-test would overstate significance.
            </p>
          </div>
        ) : null}

        {!run && candidates.length === 0 && impacts.length === 0 ? (
          <p className="mt-7 border border-line bg-surface px-5 py-10 text-center font-mono text-[11px] text-muted">
            The first automated sweep runs on the next scheduled job.
          </p>
        ) : null}
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
