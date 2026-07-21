/** Presentation-only metadata keyed by pair slug. Everything statistical or
 *  economic lives in the database / snapshot, not here. */

export interface PairPresentation {
  category: string;
  decimals: number;
  /** Display name fallback when a pair is added to the DB before this map. */
  displayName?: string;
}

const DEFAULT_META: PairPresentation = { category: "Spread", decimals: 2 };

const PAIR_META: Record<string, PairPresentation> = {
  "brent-wti": { category: "Energy", decimals: 2 },
  "gold-silver": { category: "Metals", decimals: 2 },
  "nifty-banknifty": { category: "India equities", decimals: 4 },
  "usdinr-dxy": { category: "FX", decimals: 2 }
};

export function pairMeta(slug: string): PairPresentation {
  return PAIR_META[slug] ?? DEFAULT_META;
}
