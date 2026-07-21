"use client";

import { useRouter } from "next/navigation";
import { NotebookPen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { directionLabel, formatDate, formatNumber, formatZScore } from "@/lib/utils";
import type { DataSourceMode, TradeDirection } from "@/lib/types";

const TOKEN_KEY = "basis-operator-token";

export function TradeModal({
  slug,
  displayName,
  unit,
  decimals,
  latestDate,
  latestValue,
  latestZ,
  defaultStopZ,
  mode
}: {
  slug: string;
  displayName: string;
  unit: string;
  decimals: number;
  latestDate: string;
  latestValue: number;
  latestZ: number | null;
  defaultStopZ: number;
  mode: DataSourceMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<TradeDirection>(
    latestZ !== null && latestZ > 0 ? "short_spread" : "long_spread"
  );
  const [stopZ, setStopZ] = useState(String(defaultStopZ));
  const [hypothesis, setHypothesis] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog; restore it to the trigger when it closes.
    const first = dialogRef.current?.querySelector<HTMLElement>("input, textarea, button");
    first?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  const disabledReason =
    mode !== "live"
      ? "Logging needs the live database — this deployment serves a static snapshot."
      : latestZ === null
        ? "No z-score for the latest session (roll day or warm-up) — nothing to log against."
        : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsedStop = Number(stopZ);
    if (!Number.isFinite(parsedStop) || parsedStop <= Math.abs(latestZ ?? 0)) {
      setError(`Stop z must be beyond the current |z| of ${Math.abs(latestZ ?? 0).toFixed(2)}.`);
      return;
    }
    if (hypothesis.trim().length < 10) {
      setError("The one-sentence hypothesis is mandatory — that constraint is the point.");
      return;
    }
    setSubmitting(true);
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Operator-Token": token },
        body: JSON.stringify({ slug, direction, stopZ: parsedStop, hypothesis: hypothesis.trim() })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Request failed (${response.status}).`);
        return;
      }
      setOpen(false);
      setHypothesis("");
      router.refresh();
    } catch {
      setError("Network error — the trade was not logged.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div>
        <button
          className="inline-flex items-center gap-2 rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-muted"
          disabled={disabledReason !== null}
          onClick={() => setOpen(true)}
          ref={triggerRef}
          type="button"
        >
          <NotebookPen size={14} /> Log paper trade
        </button>
        {disabledReason ? (
          <p className="mt-2 max-w-xs font-mono text-[10px] leading-4 text-muted">{disabledReason}</p>
        ) : null}
      </div>

      {open ? (
        <div
          aria-labelledby="trade-modal-title"
          aria-modal="true"
          className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4"
          role="dialog"
        >
          <div className="w-full max-w-lg border border-line bg-surface" ref={dialogRef}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-display text-base font-semibold tracking-display" id="trade-modal-title">Log paper trade · {displayName}</h2>
              <button aria-label="Close" className="text-muted transition-colors hover:text-text" onClick={() => setOpen(false)} type="button">
                <X size={16} />
              </button>
            </div>

            <form className="grid gap-4 px-5 py-5" onSubmit={submit}>
              <div className="grid grid-cols-3 gap-px border border-line bg-line font-mono text-[10px]">
                <div className="bg-bg p-3">
                  <p className="text-muted">ENTRY SESSION</p>
                  <p className="mt-1 text-text">{formatDate(latestDate)}</p>
                </div>
                <div className="bg-bg p-3">
                  <p className="text-muted">ENTRY VALUE</p>
                  <p className="mt-1 text-text">{formatNumber(latestValue, decimals)} {unit}</p>
                </div>
                <div className="bg-bg p-3">
                  <p className="text-muted">ENTRY Z</p>
                  <p className="mt-1 text-text">{formatZScore(latestZ)}</p>
                </div>
              </div>

              <fieldset>
                <legend className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Direction</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["long_spread", "short_spread"] as const).map((option) => (
                    <label
                      className={`cursor-pointer rounded-terminal border px-3 py-2.5 text-center font-mono text-[11px] transition-colors ${
                        direction === option ? "border-amber/50 bg-amber/10 text-amber" : "border-line text-muted hover:text-text"
                      }`}
                      key={option}
                    >
                      <input checked={direction === option} className="sr-only" name="direction" onChange={() => setDirection(option)} type="radio" value={option} />
                      {directionLabel[option]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Stop z (risk is fixed at entry)</span>
                <input
                  className="numeric w-32 rounded-terminal border border-line bg-bg px-3 py-2 text-sm text-text focus-visible:border-amber"
                  inputMode="decimal"
                  onChange={(event) => setStopZ(event.target.value)}
                  step="0.1"
                  type="number"
                  value={stopZ}
                />
              </label>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Hypothesis — one sentence, mandatory</span>
                <textarea
                  className="min-h-20 rounded-terminal border border-line bg-bg px-3 py-2 text-sm leading-6 text-text focus-visible:border-amber"
                  maxLength={240}
                  onChange={(event) => setHypothesis(event.target.value)}
                  placeholder="Why should this dislocation close rather than persist?"
                  required
                  value={hypothesis}
                />
              </label>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Operator token</span>
                <input
                  autoComplete="off"
                  className="w-56 rounded-terminal border border-line bg-bg px-3 py-2 font-mono text-sm text-text focus-visible:border-amber"
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  value={token}
                />
              </label>

              {error ? <p className="font-mono text-[11px] leading-5 text-red">{error}</p> : null}

              <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                <button className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted transition-colors hover:text-text" onClick={() => setOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20 disabled:opacity-50"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? "Logging…" : "Log trade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
