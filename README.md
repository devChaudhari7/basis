# basis — relative value desk

A live desk that monitors statistical dislocations between related futures/index
instruments, alerts when a spread stretches, lets the operator log paper trades
against those signals, and reports an honest track record. Monitoring and
journaling only — no prediction, no ML, no brokerage.

**Pairs:** BRENT−WTI (difference) · GOLD/SILVER (ratio) · NIFTY/BANKNIFTY (ratio)
· USDINR vs DXY (rolling-beta residual)

## Architecture

```
worker/  (Python 3.11)                      app/ + lib/  (Next.js 14, TS)
  ingest.py    Yahoo EOD → prices             /            the desk grid
  stats.py     z, ADF, half-life, rolls       /s/[slug]    chart + σ bands + log trade
  run.py       daily pipeline + alerts        /journal     the trade log
  notify.py    WhatsApp / Telegram            /performance R-multiples, expectancy
  seed.py      instruments, pairs, events     /method      statistics + where they break
  export_snapshot.py  offline snapshot      database/schema.sql  (Supabase Postgres, RLS)
```

Two data modes, chosen automatically:

- **live** — Supabase env configured: pages read the worker-maintained tables;
  paper trades are logged through `/api/trades` (operator token + service key,
  server-side only).
- **snapshot** — no Supabase env: pages serve `lib/snapshot/desk.json`, real
  statistics computed from real Yahoo settlement data by
  `python -m worker.export_snapshot`. Journal/performance stay honestly empty.

## Setup

1. **Python worker**
   ```
   python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
   python -m worker.export_snapshot        # offline snapshot, no keys needed
   ```
2. **Supabase** — create a free project, run `database/schema.sql` in the SQL
   editor, copy `.env.example` → `.env` and fill `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`, then:
   ```
   python -m worker.seed
   python -m worker.run                    # backfill + stats + signals
   ```
3. **Frontend**
   ```
   npm install && npm run dev
   ```
   For live mode set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPERATOR_TOKEN` in `.env.local` (and in Vercel).
4. **Daily cron** — `.github/workflows/daily.yml` runs `worker.run` at
   02:00 UTC Tue–Sat (post-US-settlement, ≈07:30 IST). Add the repo secrets it
   references. Alerts use Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) or
   Twilio WhatsApp (`TWILIO_*`) — whichever is configured.

## Statistical guarantees (see /method in the app)

- No forward-fill across missing sessions; legs are inner-joined on date.
- No lookahead: session *t*'s z uses mean/σ of the prior 60 clean sessions only.
- Roll-suspect sessions (|Δspread| > 4σ of prior daily changes) are plotted but
  excluded from every estimate.
- Signals need |z| ≥ 2 **and** ADF p < 0.10 **and** a clean session, with a
  5-session cooldown.
- The z-score is reproducible by hand: an independent pandas computation matches
  the engine to 1e-9 (see git history).
- The performance page is empty until real trades are logged. Expectancy =
  (hit% × avg win R) − (miss% × avg loss R); R uses risk fixed on the entry day.

Data: Yahoo Finance EOD, delayed, settlement-approximate. Research use only.
