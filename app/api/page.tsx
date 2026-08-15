import type { Metadata } from "next";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { getDesk } from "@/lib/datasource";

export const metadata: Metadata = {
  title: "API",
  description: "Free, open, read-only JSON access to every spread the basis desk monitors."
};
export const revalidate = 900;

function Endpoint({
  method,
  path,
  description,
  children
}: {
  method: string;
  path: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <span className="rounded-terminal border border-green/40 bg-green/10 px-2 py-0.5 font-mono text-[10px] text-green">
          {method}
        </span>
        <code className="font-mono text-[12px] text-text">{path}</code>
      </div>
      <div className="px-5 py-4">
        <p className="text-[13px] leading-6 text-muted">{description}</p>
        {children}
      </div>
    </div>
  );
}

export default async function ApiPage() {
  const desk = await getDesk();
  const example = desk.pairs[0]?.slug ?? "brent-wti";

  return (
    <>
      <section className="animate-fade-up">
        <div className="border-b border-line pb-7">
          <SectionHeading eyebrow="Open data" title="API" />
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted">
            Everything this desk computes is readable as JSON, without a key, without a signup, and
            with CORS open. If you want to plot these spreads in your own notebook, wire them into a
            dashboard, or check the arithmetic yourself, that is encouraged — the whole point of
            publishing the limitations is that the numbers can be checked.
          </p>
        </div>

        <div className="mt-7 grid gap-4">
          <Endpoint
            description="Every monitored spread with its current z-score, window stability, percentile, half-life, ADF p-value, and whether its estimation window spans a structural break."
            method="GET"
            path="/api/v1/spreads"
          />
          <Endpoint
            description="One spread in full: current statistics, the rationale, price history, past signals with their realised outcomes, detected structural breaks, and the diagnostics of the screen itself."
            method="GET"
            path={`/api/v1/spreads/${example}`}
          >
            <p className="mt-3 font-mono text-[11px] leading-5 text-muted">
              Optional <code className="text-amber">?sessions=N</code> controls history length
              (1–500, default 120).
            </p>
          </Endpoint>
        </div>

        <div className="mt-6 border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Try it
          </h2>
          <pre className="scrollbar-terminal overflow-x-auto px-5 py-4 font-mono text-[12px] leading-6 text-text">
{`curl -s https://basis-self.vercel.app/api/v1/spreads | jq '.spreads[] | {name, z, state}'

# one spread, a year of history
curl -s "https://basis-self.vercel.app/api/v1/spreads/${example}?sessions=252" | jq '.latest'`}
          </pre>
        </div>

        <div className="mt-6 border border-amber/30 bg-amber/[0.06] px-5 py-4">
          <p className="text-[13px] leading-6 text-muted">
            <b className="font-medium text-text">Terms, in one paragraph.</b> The data is delayed
            end-of-day settlement from Yahoo Finance, published as research. It is not a forecast, not
            investment advice, and not suitable for automated execution. Statistics are computed with
            no lookahead and exclude roll-suspect sessions, but they inherit every limitation of the
            underlying source — read{" "}
            <a className="text-amber underline-offset-2 hover:underline" href="/method">
              the method
            </a>{" "}
            before you trust a number. Please cache responses rather than polling; the data only
            changes once per session.
          </p>
        </div>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
