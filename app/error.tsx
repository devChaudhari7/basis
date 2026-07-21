"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Desk render error:", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-red">Desk fault</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-display text-text">
          Something broke on render.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted">
          The underlying data is untouched — this is a display failure, not a data one.
          {error.digest ? (
            <span className="mt-2 block font-mono text-[10px] text-muted">ref {error.digest}</span>
          ) : null}
        </p>
        <button
          className="mt-7 rounded-terminal border border-amber/50 bg-amber/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber/20"
          onClick={reset}
          type="button"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
