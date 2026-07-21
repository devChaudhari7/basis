import type { Metadata } from "next";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { getDesk } from "@/lib/datasource";

export const metadata: Metadata = { title: "Method" };
export const revalidate = 900;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-8 first:pt-6 last:border-b-0" id={id}>
      <h2 className="font-display text-xl font-semibold tracking-display text-text">{title}</h2>
      <div className="mt-4 max-w-3xl space-y-4 text-[15px] leading-7 text-muted [&_b]:font-medium [&_b]:text-text">
        {children}
      </div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="numeric overflow-x-auto border border-line bg-surface px-4 py-3 text-[13px] text-text">
      {children}
    </p>
  );
}

export default async function MethodPage() {
  const desk = await getDesk();

  return (
    <>
      <div className="animate-fade-up">
        <div className="border-b border-line pb-7">
          <SectionHeading eyebrow="How the desk thinks" title="Method" />
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted">
            This page explains every statistic on the desk, in the order the pipeline computes them, and
            then lists the ways the whole approach can fail. Nothing here predicts a price. The desk asks a
            narrower question: <b>is a relationship between two related instruments unusually stretched
            relative to its own recent history, and is that history even trustworthy?</b>
          </p>
        </div>

        <Section id="spread" title="1 · What a spread is here">
          <p>
            Each pair is reduced to a single daily series. <b>Difference</b> spreads subtract one price from
            another (Brent − WTI, in dollars per barrel). <b>Ratio</b> spreads divide (gold/silver), which
            keeps the series meaningful when both legs trend. <b>Beta-adjusted</b> spreads regress one leg on
            the other over a rolling 60-session window and keep the residual — USDINR minus beta × DXY asks
            what part of a rupee move is <i>not</i> explained by broad dollar strength.
          </p>
          <Formula>diff: aₜ − bₜ&ensp;·&ensp;ratio: aₜ / bₜ&ensp;·&ensp;beta: aₜ − βₜbₜ, βₜ = cov₆₀(a,b) / var₆₀(b)</Formula>
          <p>
            Prices are joined only on sessions where <b>both</b> markets actually traded. US and Indian
            holidays differ; a missing session stays missing. Forward-filling across a holiday would
            manufacture a day where the spread appears frozen and then &ldquo;reverts&rdquo; — fake mean
            reversion, the exact artefact this desk exists to avoid.
          </p>
        </Section>

        <Section id="roll" title="2 · Roll handling — the part most screens skip">
          <p>
            Continuous futures series like CL=F are stitched from expiring contracts. At each roll the series
            jumps for reasons that have nothing to do with the economics of the spread — the front month
            simply changed. Treating that jump as information poisons every statistic downstream.
          </p>
          <p>
            The desk flags a session as <b>roll-suspect</b> when the one-day change in the spread exceeds 4×
            the standard deviation of daily changes measured over the prior 60 sessions (as of the previous
            day, so a jump can never dilute the yardstick used to judge it). Flagged sessions are still
            plotted — marked with a hollow triangle — but are <b>excluded from every estimate</b>: mean,
            sigma, percentile, half-life, ADF. Exclusion is deliberately conservative: a genuine shock day
            occasionally gets caught, and the cost of that is far lower than letting a roll gap fabricate a
            two-sigma signal.
          </p>
        </Section>

        <Section id="z" title="3 · The z-score, without lookahead">
          <Formula>zₜ = (valueₜ − mean₆₀(t−1)) / σ₆₀(t−1)</Formula>
          <p>
            Today&rsquo;s z measures today&rsquo;s value against the mean and standard deviation of the
            previous 60 clean sessions — <b>today is not a member of its own baseline</b>. Including it is
            the classic backtest leak: every extreme becomes less extreme the moment it happens. The
            percentile rank answers the same question non-parametrically, against the trailing year: a
            96th-percentile reading is stretched even if the distribution is fat-tailed and the sigma is
            misleading.
          </p>
        </Section>

        <Section id="halflife" title="4 · Half-life — how long dislocations have taken to fade">
          <Formula>Δyₜ = α + λyₜ₋₁ + εₜ&ensp;→&ensp;half-life = −ln(2)/λ</Formula>
          <p>
            If the spread mean-reverts, the daily change should lean against the level: high yesterday, down
            today. The regression slope λ captures that pull, and −ln(2)/λ converts it into the number of
            sessions a typical dislocation has taken to close halfway. A six-day half-life and a two-sigma
            stretch is a tradeable thought; a sixty-day half-life is a position you will hate. When λ comes
            out non-negative the desk prints <b>&ldquo;no mean reversion detected&rdquo;</b> rather than a
            fictitious number.
          </p>
        </Section>

        <Section id="adf" title="5 · The ADF test — permission to use the word &ldquo;reversion&rdquo;">
          <p>
            The Augmented Dickey–Fuller test asks whether the spread behaves like a series with a stable
            level or like a random walk. The desk stores the p-value and shows it unedited. Signals require
            p &lt; 0.10; when a spread fails, the UI says so, because <b>a spread that is not stationary
            should not be traded as if it were</b> — however seductive the z-score looks. Gold/silver drifts
            through long regimes and fails this test regularly. Showing that is the point.
          </p>
        </Section>

        <Section id="stability" title="6 · Window stability — the anti-overfitting check">
          <p>
            Every lookback is a choice, and any single choice can be flattered by luck. The desk computes z
            at 30, 60, and 90 sessions and displays all three. When they roughly agree, the signal is a
            property of the data. When they disagree wildly, the desk prints <b>unstable</b> and the honest
            conclusion is that the &ldquo;signal&rdquo; is a property of the window — so it is not one. No
            lookback was ever optimised against past signals; 60 days is a convention, held fixed.
          </p>
        </Section>

        <Section id="signals" title="7 · Signals, risk, and R">
          <p>
            A signal requires all three gates at once: |z| ≥ 2, a stationary spread (ADF p &lt; 0.10), and a
            clean session (no roll flag) — with at most one signal per pair per five sessions. A signal is a
            prompt to think, not an instruction. Logging a paper trade demands a one-sentence hypothesis
            first; if the reason cannot survive one sentence, there is no trade.
          </p>
          <Formula>risk = (stop_z − |entry_z|) × σ₆₀(entry day)&ensp;·&ensp;R = direction × (exit − entry) / risk</Formula>
          <p>
            Results are kept in <b>R-multiples</b> — profit measured against the risk committed at entry —
            because currency P&amp;L on paper trades flatters whoever sizes imaginary positions largest.
            Expectancy is (hit% × avg win R) − (miss% × avg loss R). The scoreboard starts empty and only
            real logged decisions ever fill it.
          </p>
        </Section>

        <Section id="breaks" title="8 · Where this breaks">
          <p>
            <b>Regime shifts.</b> Mean reversion assumes the mean is worth reverting to. The shale boom
            permanently rewired Brent–WTI; a pipeline reversal at Cushing can do it again overnight. The
            statistics will keep producing z-scores right through a structural break — which is why each
            pair&rsquo;s economic rationale sits on its page. When the physical story changes, stop trusting
            the numbers before the numbers stop looking trustworthy.
          </p>
          <p>
            <b>Small samples.</b> Sixty sessions is a small window; the year of history behind the percentile
            is one draw from one regime. Every number on this desk has error bars it does not display.
          </p>
          <p>
            <b>Correlated gates.</b> The ADF test is run on the same data that produced the z-score, so the
            stationarity gate is not independent evidence — it filters the worst cases, it does not bless the
            rest.
          </p>
          <p>
            <b>Data quality.</b> Yahoo EOD data is delayed, settlement-approximate, and occasionally revised.
            The roll detector is a heuristic on top of an already-stitched series, not contract-level truth.
            A desk with exchange data would do this properly; this one is honest about doing it approximately.
          </p>
          <p>
            <b>Execution fiction.</b> Paper fills at EOD settlement assume liquidity, no slippage, and no
            legging risk. Real spread execution is two legs, two order books, and a basis of its own. The
            R-multiples here measure decision quality, not realisable profit.
          </p>
        </Section>
      </div>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
