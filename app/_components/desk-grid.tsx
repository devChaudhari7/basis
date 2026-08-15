"use client";

import { useMemo, useState } from "react";

import { SpreadCard } from "@/app/_components/spread-card";
import { pairMeta } from "@/lib/pair-meta";
import { cn, getSpreadState } from "@/lib/utils";
import type { Pair } from "@/lib/types";

type SortKey = "stretch" | "name" | "category";
type FilterKey = "all" | "stretched" | "tradeable";

const SORT_LABEL: Record<SortKey, string> = {
  stretch: "|z|",
  name: "Name",
  category: "Category"
};

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "All",
  stretched: "Stretched",
  tradeable: "Stationary"
};

export function DeskGrid({ pairs, asOf }: { pairs: readonly Pair[]; asOf: string }) {
  const [sort, setSort] = useState<SortKey>("stretch");
  const [filter, setFilter] = useState<FilterKey>("all");

  const visible = useMemo(() => {
    const filtered = pairs.filter((pair) => {
      if (filter === "stretched") {
        return pair.latest.z !== null && Math.abs(pair.latest.z) >= pair.entryZ;
      }
      if (filter === "tradeable") {
        // A spread that is not stationary should not be traded as if it were.
        return pair.latest.adfP !== null && pair.latest.adfP < 0.1;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.displayName.localeCompare(b.displayName);
      if (sort === "category") {
        return (
          pairMeta(a.slug).category.localeCompare(pairMeta(b.slug).category) ||
          a.displayName.localeCompare(b.displayName)
        );
      }
      return Math.abs(b.latest.z ?? 0) - Math.abs(a.latest.z ?? 0);
    });
  }, [pairs, sort, filter]);

  const stretched = pairs.filter(
    (pair) => getSpreadState(pair.latest.z, pair.series, pair.entryZ) === "stretched"
  ).length;

  return (
    <>
      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Sort</span>
          <div className="flex gap-1" role="group" aria-label="Sort spreads">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <button
                className={cn(
                  "rounded-terminal border px-2.5 py-1.5 font-mono text-[10px] transition-colors",
                  sort === key
                    ? "border-amber/50 bg-amber/10 text-amber"
                    : "border-line text-muted hover:text-text"
                )}
                key={key}
                onClick={() => setSort(key)}
                type="button"
              >
                {SORT_LABEL[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Show</span>
          <div className="flex gap-1" role="group" aria-label="Filter spreads">
            {(Object.keys(FILTER_LABEL) as FilterKey[]).map((key) => (
              <button
                className={cn(
                  "rounded-terminal border px-2.5 py-1.5 font-mono text-[10px] transition-colors",
                  filter === key
                    ? "border-amber/50 bg-amber/10 text-amber"
                    : "border-line text-muted hover:text-text"
                )}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {FILTER_LABEL[key]}
              </button>
            ))}
          </div>
        </div>

        <p aria-live="polite" className="ml-auto font-mono text-[10px] text-muted">
          {visible.length} of {pairs.length} shown · {stretched} stretched
        </p>
      </div>

      {visible.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((pair, index) => (
            <SpreadCard asOf={asOf} index={index} key={pair.slug} pair={pair} />
          ))}
        </div>
      ) : (
        <p className="mt-5 border border-line bg-surface px-5 py-8 text-center font-mono text-[11px] text-muted">
          {filter === "stretched"
            ? "Nothing is beyond its entry threshold right now. A quiet screen is the normal state."
            : "No spread currently passes the stationarity test."}
        </p>
      )}
    </>
  );
}
