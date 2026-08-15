import type { Metadata } from "next";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { Explorer } from "@/app/explore/explorer";
import { getDesk } from "@/lib/datasource";
import { serviceClient } from "@/lib/server/operator";

export const metadata: Metadata = {
  title: "Explore",
  description: "Chart any spread between the instruments this desk tracks."
};
export const revalidate = 900;

export default async function ExplorePage() {
  const desk = await getDesk();
  const client = serviceClient();
  const result = client
    ? await client.from("instruments").select("symbol,name,venue").order("name")
    : null;
  const instruments = (result?.data ?? []) as { symbol: string; name: string; venue: string }[];
  const combinations = (instruments.length * (instruments.length - 1)) / 2;

  return (
    <>
      <section className="animate-fade-up">
        <div className="border-b border-line pb-7">
          <SectionHeading eyebrow="Every combination, not just the nine" title="Explore" />
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted">
            Combine any two of the {instruments.length} instruments the desk ingests — that is{" "}
            {combinations} possible spreads — as a ratio or a difference, over any lookback from 10 to
            250 sessions. The z-score uses the same no-lookahead construction as the monitored desk:
            today is measured against the mean and sigma of the sessions before it, never including
            itself.
          </p>
        </div>

        {instruments.length > 1 ? (
          <Explorer instruments={instruments} />
        ) : (
          <p className="mt-7 border border-line bg-surface px-5 py-8 text-center font-mono text-[11px] text-muted">
            The explorer needs the live database. This deployment is serving a static snapshot.
          </p>
        )}

        <div className="mt-6 border border-amber/30 bg-amber/[0.06] px-5 py-4">
          <p className="text-[13px] leading-6 text-muted">
            <b className="font-medium text-text">Read this before you trust a chart here.</b> Any two
            price series can be divided, and roughly {combinations} combinations will always contain
            some that look beautifully mean-reverting by chance alone — that is what searching a large
            space does. The nine spreads on the desk earned their place through an economic reason
            for the relationship to exist, and they carry roll filtering, a stationarity test and a
            half-life estimate. Nothing you build here has any of that. Treat it as a way to look, not
            as a way to find signals.
          </p>
        </div>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
