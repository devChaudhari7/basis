import type { DataSourceMode } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function DeskFooter({
  mode,
  asOf,
  generatedAt
}: {
  mode: DataSourceMode;
  asOf: string;
  generatedAt: string | null;
}) {
  return (
    <footer className="mt-7 border-t border-line pt-5 font-mono text-[10px] leading-5 text-muted">
      EOD settlement data via Yahoo Finance, delayed and settlement-approximate. Research use only — no
      brokerage integration, no live orders. Latest session {formatDate(asOf)}.
      {mode === "snapshot" ? (
        <>
          {" "}
          Serving a static research snapshot generated {generatedAt ? formatDate(generatedAt) : "offline"} — the
          daily sync is not connected in this deployment.
        </>
      ) : null}
    </footer>
  );
}
