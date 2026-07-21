"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  cn,
  directionLabel,
  exitReasonLabel,
  formatDate,
  formatNumber,
  formatR,
  formatZScore
} from "@/lib/utils";
import type { DataSourceMode, PaperTrade, TradeExitReason } from "@/lib/types";

const TOKEN_KEY = "basis-operator-token";
type OutcomeFilter = "all" | "open" | "win" | "loss";

function CloseForm({ trade, onDone }: { trade: PaperTrade; onDone: () => void }) {
  const [reason, setReason] = useState<TradeExitReason>("manual");
  const [postMortem, setPostMortem] = useState("");
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(TOKEN_KEY) ?? "")
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      const response = await fetch(`/api/trades/${trade.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Operator-Token": token },
        body: JSON.stringify({ exitReason: reason, postMortem })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Request failed (${response.status}).`);
        return;
      }
      onDone();
    } catch {
      setError("Network error — the trade was not closed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="mt-4 grid gap-3 border-t border-line pt-4" onSubmit={submit}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Exit reason</span>
          <select
            className="rounded-terminal border border-line bg-bg px-2.5 py-2 font-mono text-[11px] text-text"
            onChange={(event) => setReason(event.target.value as TradeExitReason)}
            value={reason}
          >
            {(Object.keys(exitReasonLabel) as TradeExitReason[]).map((key) => (
              <option key={key} value={key}>{exitReasonLabel[key]}</option>
            ))}
          </select>
        </label>
        <label className="grid flex-1 gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Post-mortem (recommended)</span>
          <input
            className="rounded-terminal border border-line bg-bg px-2.5 py-2 text-[13px] text-text"
            onChange={(event) => setPostMortem(event.target.value)}
            placeholder="What did the market teach you?"
            value={postMortem}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Operator token</span>
          <input
            autoComplete="off"
            className="w-40 rounded-terminal border border-line bg-bg px-2.5 py-2 font-mono text-[11px] text-text"
            onChange={(event) => setToken(event.target.value)}
            type="password"
            value={token}
          />
        </label>
        <button
          className="rounded-terminal border border-amber/50 bg-amber/10 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20 disabled:opacity-50"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Closing…" : "Close at last settle"}
        </button>
      </div>
      {error ? <p className="font-mono text-[11px] text-red">{error}</p> : null}
    </form>
  );
}

export function JournalTable({
  trades,
  pairNames,
  decimalsBySlug,
  mode
}: {
  trades: readonly PaperTrade[];
  pairNames: Record<string, string>;
  decimalsBySlug: Record<string, number>;
  mode: DataSourceMode;
}) {
  const router = useRouter();
  const [pairFilter, setPairFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      trades.filter((trade) => {
        if (pairFilter !== "all" && trade.pairSlug !== pairFilter) return false;
        if (outcomeFilter === "open") return !trade.closedOn;
        if (outcomeFilter === "win") return (trade.rMultiple ?? 0) > 0 && Boolean(trade.closedOn);
        if (outcomeFilter === "loss") return (trade.rMultiple ?? 0) < 0 && Boolean(trade.closedOn);
        return true;
      }),
    [trades, pairFilter, outcomeFilter]
  );

  if (trades.length === 0) {
    return (
      <div className="border border-line bg-surface px-6 py-14 text-center">
        <p className="font-mono text-sm text-text">No trades yet.</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          The log starts when the operator takes the first signal.
          {mode !== "live"
            ? " This deployment serves a static snapshot — connect Supabase to begin the journal."
            : " When a spread stretches past its entry threshold, log the paper trade from its detail page."}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          Pair
          <select
            className="rounded-terminal border border-line bg-bg px-2 py-1.5 text-[11px] text-text"
            onChange={(event) => setPairFilter(event.target.value)}
            value={pairFilter}
          >
            <option value="all">All</option>
            {Object.entries(pairNames).map(([slug, name]) => (
              <option key={slug} value={slug}>{name}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-1" role="group" aria-label="Outcome filter">
          {(["all", "open", "win", "loss"] as const).map((key) => (
            <button
              className={cn(
                "rounded-terminal border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                outcomeFilter === key ? "border-amber/50 bg-amber/10 text-amber" : "border-line text-muted hover:text-text"
              )}
              key={key}
              onClick={() => setOutcomeFilter(key)}
              type="button"
            >
              {key}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-muted">{filtered.length} rows</span>
      </div>

      <div className="scrollbar-terminal overflow-x-auto">
        <table className="w-full min-w-[760px] font-mono text-[11px]">
          <thead>
            <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.12em] text-muted">
              <th className="px-4 py-3 font-medium">Opened</th>
              <th className="px-4 py-3 font-medium">Pair</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Entry z → exit z</th>
              <th className="px-4 py-3 font-medium">Entry → exit</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 text-right font-medium">R</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((trade) => {
              const decimals = decimalsBySlug[trade.pairSlug] ?? 2;
              const isOpen = !trade.closedOn;
              const isExpanded = expanded === trade.id;
              const rValue = isOpen ? trade.liveR : trade.rMultiple;
              return (
                <FragmentRow
                  decimals={decimals}
                  isExpanded={isExpanded}
                  isOpen={isOpen}
                  key={trade.id}
                  mode={mode}
                  onDone={() => {
                    setExpanded(null);
                    router.refresh();
                  }}
                  onToggle={() => setExpanded(isExpanded ? null : trade.id)}
                  pairName={pairNames[trade.pairSlug] ?? trade.pairSlug}
                  rValue={rValue}
                  trade={trade}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  trade,
  pairName,
  decimals,
  isOpen,
  isExpanded,
  rValue,
  onToggle,
  onDone,
  mode
}: {
  trade: PaperTrade;
  pairName: string;
  decimals: number;
  isOpen: boolean;
  isExpanded: boolean;
  rValue: number | null;
  onToggle: () => void;
  onDone: () => void;
  mode: DataSourceMode;
}) {
  return (
    <>
      <tr
        aria-expanded={isExpanded}
        className="cursor-pointer border-b border-line/60 transition-colors last:border-b-0 hover:bg-surface-2"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-muted">{formatDate(trade.openedOn)}</td>
        <td className="px-4 py-3 text-text">{pairName}</td>
        <td className="px-4 py-3 text-muted">{directionLabel[trade.direction].toLowerCase()}</td>
        <td className="px-4 py-3 text-muted">
          {formatZScore(trade.entryZ)} → {isOpen ? "…" : formatZScore(trade.exitZ)}
        </td>
        <td className="px-4 py-3 text-muted">
          {formatNumber(trade.entryValue, decimals)} → {isOpen ? "…" : formatNumber(trade.exitValue, decimals)}
        </td>
        <td className="px-4 py-3">
          {isOpen ? (
            <span className="text-amber">OPEN</span>
          ) : (
            <span className="text-muted">{trade.exitReason ? exitReasonLabel[trade.exitReason].toLowerCase() : "—"}</span>
          )}
        </td>
        <td className={cn("px-4 py-3 text-right", (rValue ?? 0) < 0 ? "text-red" : (rValue ?? 0) > 0 ? "text-green" : "text-text")}>
          {isOpen ? `live ${formatR(rValue)}` : formatR(rValue)}
        </td>
        <td className="px-2 py-3 text-muted">
          <ChevronDown className={cn("transition-transform", isExpanded && "rotate-180")} size={14} />
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-line/60 bg-bg/40 last:border-b-0">
          <td className="px-4 pb-5 pt-4" colSpan={8}>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-amber">Hypothesis</p>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-text">{trade.hypothesis}</p>
            {trade.postMortem ? (
              <>
                <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-amber">Post-mortem</p>
                <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-muted">{trade.postMortem}</p>
              </>
            ) : null}
            {isOpen && mode === "live" ? <CloseForm onDone={onDone} trade={trade} /> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
