"""BASIS daily data worker.

The worker is deliberately separate from the web application: it downloads
end-of-day data, computes research statistics, writes Supabase rows, and
delivers desk-style notifications.  It never places trades or handles
brokerage credentials.
"""

__all__ = ["config", "ingest", "notify", "seed", "stats"]
