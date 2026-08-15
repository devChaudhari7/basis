import type { Metadata } from "next";
import Link from "next/link";

import { DeskFooter } from "@/app/_components/desk-footer";
import { SectionHeading } from "@/app/_components/section-heading";
import { WatchlistManager, type WatchRow } from "@/app/watchlist/watchlist-client";
import { getDesk } from "@/lib/datasource";
import { createSessionClient, currentViewer } from "@/lib/server/auth";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

interface AlertRow {
  id: number;
  pair_slug: string;
  d: string;
  z: number;
  message: string;
  read: boolean;
}

export default async function WatchlistPage() {
  const [desk, viewer] = await Promise.all([getDesk(), currentViewer()]);
  const client = createSessionClient();

  if (!viewer || !client) {
    return (
      <>
        <section className="animate-fade-up">
          <div className="border-b border-line pb-7">
            <SectionHeading eyebrow="Told when it matters" title="Watchlist" />
          </div>
          <div className="mt-7 border border-line bg-surface px-6 py-14 text-center">
            <p className="font-mono text-sm text-text">Sign in to keep a watchlist.</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              Pick the spreads you care about, set your own threshold on each, and the desk tells you
              when one stretches past it — in your feed here, and on Telegram if you want it on your
              phone.
            </p>
            <Link
              className="mt-6 inline-block rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20"
              href="/signin"
            >
              Sign in
            </Link>
          </div>
        </section>
        <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
      </>
    );
  }

  const [watchResult, settingsResult, alertsResult] = await Promise.all([
    client.from("watchlists").select("pair_slug,alert_z,last_alerted_on").order("pair_slug"),
    client.from("notification_settings").select("telegram_chat_id").maybeSingle(),
    client.from("alerts").select("*").order("created_at", { ascending: false }).limit(20)
  ]);

  const latestBySlug = new Map(desk.pairs.map((pair) => [pair.slug, pair]));
  const rows: WatchRow[] = (
    (watchResult.data ?? []) as { pair_slug: string; alert_z: unknown; last_alerted_on: string | null }[]
  ).map((row) => {
    const pair = latestBySlug.get(row.pair_slug);
    return {
      slug: row.pair_slug,
      name: pair?.displayName ?? row.pair_slug,
      alertZ: Number(row.alert_z) || 2,
      currentZ: pair?.latest.z ?? null,
      lastAlertedOn: row.last_alerted_on
    };
  });

  const alerts = (alertsResult.data ?? []) as AlertRow[];

  return (
    <>
      <section className="animate-fade-up">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Told when it matters" title="Watchlist" />
          <p className="font-mono text-[10px] text-muted">
            {rows.length} watched · {alerts.length} recent alert{alerts.length === 1 ? "" : "s"}
          </p>
        </div>

        <WatchlistManager
          rows={rows}
          telegramChatId={(settingsResult.data?.telegram_chat_id as string | null) ?? null}
        />

        <div className="mt-4 border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Your alert feed
          </h2>
          {alerts.length === 0 ? (
            <p className="px-5 py-5 font-mono text-[11px] leading-5 text-muted">
              No alerts yet. The desk checks your thresholds after each settlement.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {alerts.map((alert) => (
                <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3" key={alert.id}>
                  <span className="w-20 shrink-0 font-mono text-[10px] text-muted">
                    {formatDate(alert.d, { day: "2-digit", month: "short" })}
                  </span>
                  <Link
                    className="shrink-0 font-mono text-[11px] text-text hover:text-amber"
                    href={`/s/${alert.pair_slug}`}
                  >
                    {latestBySlug.get(alert.pair_slug)?.displayName ?? alert.pair_slug}
                  </Link>
                  <span
                    className={`font-mono text-[11px] ${Math.abs(Number(alert.z)) >= 2 ? "text-red" : "text-amber"}`}
                  >
                    z {Number(alert.z) > 0 ? "+" : ""}
                    {Number(alert.z).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DeskFooter asOf={desk.asOf} generatedAt={desk.generatedAt} mode={desk.mode} />
    </>
  );
}
