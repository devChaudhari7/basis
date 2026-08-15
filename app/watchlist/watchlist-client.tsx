"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatZScore } from "@/lib/utils";

export interface WatchRow {
  slug: string;
  name: string;
  alertZ: number;
  currentZ: number | null;
  lastAlertedOn: string | null;
}

export function WatchlistManager({
  rows,
  telegramChatId
}: {
  rows: readonly WatchRow[];
  telegramChatId: string | null;
}) {
  const router = useRouter();
  const [chatId, setChatId] = useState(telegramChatId ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (slug: string) => {
    setBusy(true);
    await fetch(`/api/watchlist?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  const updateThreshold = async (slug: string, alertZ: number) => {
    setBusy(true);
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, alertZ })
    });
    setBusy(false);
    router.refresh();
  };

  const saveChannel = async () => {
    setBusy(true);
    setStatus(null);
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramChatId: chatId, enabled: true })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setStatus(response.ok ? "Saved. Alerts will reach you on Telegram." : payload.error ?? "Failed.");
    if (response.ok) router.refresh();
  };

  return (
    <>
      <div className="mt-7 border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Watched spreads
        </h2>
        {rows.length === 0 ? (
          <p className="px-5 py-6 font-mono text-[11px] leading-5 text-muted">
            Nothing watched yet. Open any spread and use{" "}
            <span className="text-amber">Watch this spread</span> to be told when it stretches past a
            threshold you choose.
          </p>
        ) : (
          <div className="scrollbar-terminal overflow-x-auto">
            <table className="w-full min-w-[620px] font-mono text-[11px]">
              <thead>
                <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5 font-medium">Spread</th>
                  <th className="px-3 py-2.5 font-medium">Current z</th>
                  <th className="px-3 py-2.5 font-medium">Alert at |z| ≥</th>
                  <th className="px-3 py-2.5 font-medium">Last alert</th>
                  <th className="px-5 py-2.5 text-right font-medium">Remove</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const triggered =
                    row.currentZ !== null && Math.abs(row.currentZ) >= row.alertZ;
                  return (
                    <tr className="border-b border-line/60 last:border-b-0" key={row.slug}>
                      <td className="px-5 py-3">
                        <Link className="text-text hover:text-amber" href={`/s/${row.slug}`}>
                          {row.name}
                        </Link>
                      </td>
                      <td className={`px-3 py-3 ${triggered ? "text-red" : "text-muted"}`}>
                        {formatZScore(row.currentZ)}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          aria-label={`Alert threshold for ${row.name}`}
                          className="numeric w-16 rounded-terminal border border-line bg-bg px-2 py-1 text-[11px] text-text"
                          defaultValue={row.alertZ}
                          disabled={busy}
                          max={5}
                          min={0.5}
                          onBlur={(event) => {
                            const next = Number(event.target.value);
                            if (Number.isFinite(next) && next !== row.alertZ) {
                              void updateThreshold(row.slug, next);
                            }
                          }}
                          step={0.1}
                          type="number"
                        />
                      </td>
                      <td className="px-3 py-3 text-muted">{row.lastAlertedOn ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          aria-label={`Stop watching ${row.name}`}
                          className="text-muted transition-colors hover:text-red"
                          disabled={busy}
                          onClick={() => void remove(row.slug)}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 border border-line bg-surface">
        <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <Bell size={12} className="text-amber" /> Push alerts to Telegram
        </h2>
        <div className="px-5 py-4">
          <ol className="grid gap-1.5 font-mono text-[11px] leading-5 text-muted">
            <li>
              1 · Open{" "}
              <a
                className="text-amber underline-offset-2 hover:underline"
                href="https://t.me/basis_rv_desk_bot"
                rel="noreferrer noopener"
                target="_blank"
              >
                @basis_rv_desk_bot
              </a>{" "}
              and press Start.
            </li>
            <li>2 · Message @userinfobot to get your numeric chat id.</li>
            <li>3 · Paste it below. Alerts then arrive on your phone.</li>
          </ol>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Your Telegram chat id
              </span>
              <input
                className="numeric w-48 rounded-terminal border border-line bg-bg px-3 py-2 text-[13px] text-text"
                inputMode="numeric"
                onChange={(event) => setChatId(event.target.value)}
                placeholder="123456789"
                value={chatId}
              />
            </label>
            <button
              className="rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20 disabled:opacity-50"
              disabled={busy}
              onClick={() => void saveChannel()}
              type="button"
            >
              Save
            </button>
            {status ? <p className="font-mono text-[11px] text-muted">{status}</p> : null}
          </div>

          <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-5 text-muted">
            Leave it blank and alerts still appear in your feed here. One alert per spread per
            session, and none at all on a roll-suspect day.
          </p>
        </div>
      </div>
    </>
  );
}
