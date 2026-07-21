# BASIS — Relative-Value Spread Desk
### Complete build specification (hand this whole file to an AI coding agent)

> **What we're building:** a live desk that monitors statistical dislocations between related futures/index instruments, alerts on WhatsApp when a spread stretches, lets the operator log paper trades against those signals, and reports an honest track record.
> **Who it's for:** a proprietary-trading firm interview (Futures First — relative value in international derivatives). It must read like a trading tool, not a student project.
> **Name:** **BASIS** (a real market term: the spread between related prices). Wordmark lowercase `basis`, monospace.
> **Non-goals:** no price prediction, no ML, no "buy signals," no brokerage integration, no real money. This is a monitoring + journaling desk.

---

## 0 · Product definition

**Core loop:** daily data pull → compute spread statistics → detect dislocations → alert → operator logs a paper trade → performance analytics accumulate.

**Five surfaces:**
1. **The Desk** — grid of live spread cards (z-score, sparkline, state).
2. **Spread detail** — full chart with σ bands, statistics, signal history, "log paper trade."
3. **Journal** — the trade log with entry/exit/rationale.
4. **Performance** — equity curve in R-multiples, hit rate, expectancy, drawdown.
5. **Method** — a page explaining the statistics and their limits (written for a trader to read).

---

## 1 · Tech stack (exact)

| Layer | Choice | Notes |
|---|---|---|
| Data worker | **Python 3.11** | runs daily, computes, writes to DB |
| Libraries | `yfinance`, `pandas`, `numpy`, `statsmodels`, `scipy`, `supabase-py`, `python-dotenv`, `twilio` | statsmodels for ADF + OLS half-life |
| Scheduler | **GitHub Actions** cron (free) — `0 2 * * 2-6` UTC (post-US-settlement) | alternative: Vercel Cron hitting an API route |
| Database | **Supabase Postgres** (free tier) | Row-Level Security on, service key only in the worker |
| Frontend | **Next.js 14 (App Router) + TypeScript** | deployed on Vercel |
| Styling | **Tailwind CSS** + CSS variables for the design tokens | no component library — hand-built |
| Charts | **Lightweight-charts** (TradingView, free) for price/spread series; **D3** only for the custom z-dial and distribution histogram | lightweight-charts gives the professional feel instantly |
| Motion | **GSAP** + `ScrollTrigger` for the entry sequence; CSS transitions for micro-interactions | respect `prefers-reduced-motion` |
| Alerts | **Twilio WhatsApp** sandbox (free) | fallback: Telegram Bot API (simpler, fully free) |
| Fonts | Headlines **Geist** or **Inter Tight**; ALL numerics **JetBrains Mono** (tabular figures) | `font-variant-numeric: tabular-nums` everywhere numbers change |
| Env | `.env.local` (frontend), repo secrets (worker). Never commit keys. | |

---

## 2 · Data sources (exact tickers, limits, gotchas)

### 2.1 Primary: Yahoo Finance via `yfinance` (no API key, free)

```python
TICKERS = {
  "WTI":        "CL=F",     # NYMEX crude, USD/bbl
  "BRENT":      "BZ=F",     # ICE Brent, USD/bbl
  "NATGAS":     "NG=F",
  "GOLD":       "GC=F",     # USD/oz
  "SILVER":     "SI=F",
  "US10Y_NOTE": "ZN=F",
  "NIFTY":      "^NSEI",
  "BANKNIFTY":  "^NSEBANK",
  "USDINR":     "USDINR=X",
  "DXY":        "DX-Y.NYB",
}
# daily: yf.download(ticker, start="2019-01-01", interval="1d", auto_adjust=False)
```

**Gotchas to handle in code (each is also an interview talking point):**
- **Roll gaps.** `CL=F` is a *stitched continuous* series — at each expiry roll, the series jumps for non-economic reasons. Detect and flag: if `|Δspread| > 4 × rolling σ` on a single day, mark `roll_suspect = true` and **exclude that day from mean/σ estimation**.
- **Holiday misalignment.** US and Indian markets have different holidays. Inner-join on date; never forward-fill across a missing session (log the gap instead).
- **Delayed / EOD data.** Yahoo is delayed and settlement-approximate. State this openly in the UI footer: *"EOD settlement data, delayed. Research use only."* Honesty here reads as maturity.
- **Rate limiting.** Batch downloads, cache raw responses to `data/raw/`, retry with exponential backoff.

### 2.2 Backups / enrichment
- **Stooq** — CSV, no key: `https://stooq.com/q/d/l/?s=cl.f&i=d` (good failover).
- **FRED** (free API key) — for macro context series: `DCOILWTICO`, `DCOILBRENTEU`, `DTWEXBGS`.
- **Twelve Data** (free key, 800 req/day) — if intraday granularity is ever wanted.
- **Economic calendar** — no reliable free API; **hardcode a `events` table** with FOMC dates, EIA crude inventory (Wednesdays 10:30 ET), RBI MPC dates, US CPI/NFP. ~40 rows/year, maintained by hand. Display "next event in N days" on affected spreads — traders will notice you accounted for event risk.

### 2.3 The pairs to ship with (v1)

| Pair | Type | Economic rationale (must appear in the UI) |
|---|---|---|
| **BRENT – WTI** | difference, USD/bbl | Seaborne vs landlocked-Cushing crude; transport, quality (sulfur/API), regional supply shocks |
| **GOLD / SILVER** | ratio | Classic precious-metal risk gauge; silver has larger industrial demand → higher beta |
| **NIFTY / BANKNIFTY** | ratio | Financials' weight vs the broad Indian market; credit and rate cycles drive divergence |
| **USDINR vs DXY** | beta-adjusted | Is rupee weakness idiosyncratic or just dollar strength? (rolling OLS beta) |
| **NATGAS calendar** *(stretch)* | difference between expiries | Seasonality and storage economics |

---

## 3 · Database schema (Supabase Postgres)

```sql
create table instruments (
  id serial primary key,
  symbol text unique not null,        -- 'CL=F'
  name text not null,                 -- 'WTI Crude'
  unit text,                          -- 'USD/bbl'
  venue text
);

create table prices (
  instrument_id int references instruments(id),
  d date not null,
  close numeric not null,
  volume numeric,
  primary key (instrument_id, d)
);

create table pairs (
  id serial primary key,
  slug text unique not null,          -- 'brent-wti'
  leg_a int references instruments(id),
  leg_b int references instruments(id),
  method text not null,               -- 'diff' | 'ratio' | 'beta'
  lookback int not null default 60,   -- rolling window (days)
  entry_z numeric default 2.0,
  stop_z numeric default 3.0,
  rationale text not null             -- the economics paragraph, shown in UI
);

create table spread_daily (
  pair_id int references pairs(id),
  d date not null,
  value numeric not null,
  mean_60 numeric, std_60 numeric,
  z numeric,
  pct_rank_252 numeric,               -- percentile over 1y
  half_life numeric,                  -- OU estimate, days
  beta numeric,                       -- for method='beta'
  roll_suspect boolean default false,
  primary key (pair_id, d)
);

create table signals (
  id serial primary key,
  pair_id int references pairs(id),
  d date not null,
  z numeric not null,
  direction text not null,            -- 'long_spread' | 'short_spread'
  notified boolean default false
);

create table paper_trades (
  id serial primary key,
  pair_id int references pairs(id),
  opened_on date not null,
  entry_value numeric not null,
  entry_z numeric not null,
  direction text not null,
  stop_z numeric not null,
  hypothesis text not null,           -- REQUIRED free text: one sentence, why
  closed_on date,
  exit_value numeric,
  exit_z numeric,
  exit_reason text,                   -- 'target' | 'stop' | 'time' | 'manual'
  pnl_points numeric,
  r_multiple numeric,
  post_mortem text
);

create table events (
  id serial primary key,
  d date not null,
  label text not null,                -- 'FOMC', 'EIA crude inventories', 'RBI MPC'
  affects text[]                      -- ['brent-wti','usdinr-dxy']
);
```

---

## 4 · The statistics engine (`worker/stats.py`)

```python
def spread_series(a, b, method, beta_window=60):
    if method == "diff":  return a - b
    if method == "ratio": return a / b
    if method == "beta":                       # rolling OLS hedge ratio
        beta = a.rolling(beta_window).cov(b) / b.rolling(beta_window).var()
        return a - beta * b
```

- **z-score:** `(value − rolling_mean(lookback)) / rolling_std(lookback)`, computed on roll-cleaned data.
- **Percentile rank:** rank of today's value within the trailing 252 sessions.
- **Half-life (Ornstein–Uhlenbeck):** regress `Δy_t` on `y_{t−1}`; `half_life = −ln(2) / λ` where λ is the slope. Report in days; if λ ≥ 0, mark **"no mean reversion detected."**
- **ADF test** (`statsmodels.tsa.stattools.adfuller`) on the spread; store the p-value and show it — a spread that isn't stationary shouldn't be traded as one, and *saying so* is the maturity signal.
- **Window stability check:** compute z at lookbacks 30/60/90 and display all three. If they disagree wildly, the UI says **"unstable"** — this is your built-in anti-overfitting answer.

**Signal rule:** `|z| ≥ entry_z` AND `roll_suspect = false` AND `adf_p < 0.10` → write a `signals` row. Cooldown: one signal per pair per 5 sessions.

---

## 5 · Alerts (`worker/notify.py`)

Twilio WhatsApp (or Telegram). Message format — terse, like a desk message:

```
BASIS · BRENT-WTI
z = +2.34  (60d)  |  spread 4.18 USD/bbl
1y percentile: 96th   half-life: 6.2d
ADF p = 0.03   windows 30/60/90: 2.1/2.3/2.4 (stable)
next event: EIA inventories in 1d
→ basis.vercel.app/s/brent-wti
```

Also send a **daily 08:00 IST digest**: every pair's z on one line, plus any open paper trades and their current R.

---

## 6 · Design system — "trading terminal, editorially art-directed"

**Direction:** the visual language of a professional terminal (dense, monospaced, dark, numeric) but composed with editorial restraint and one signature motion moment. Think *Bloomberg × Kinfolk*. Never neon-crypto, never dashboard-template.

### 6.1 Tokens

```css
:root{
  --bg:        #0A0B0D;       /* near-black, slightly warm */
  --surface:   #121417;
  --surface-2: #191C21;
  --line:      #23272E;
  --text:      #E8EAED;
  --muted:     #8A9099;
  --amber:     #E8A33D;       /* primary accent — terminal amber */
  --green:     #3FB27F;       /* reversion / profit */
  --red:       #E5484D;       /* stretch / loss */
  --blue:      #4C8DFF;       /* neutral highlight */
  --grid:      rgba(255,255,255,.04);
}
```

- **Type:** display `Geist` / `Inter Tight`, 600–700, tight tracking (−0.02em); body `Inter` 400/15px, line-height 1.6; **all numbers `JetBrains Mono` with `font-variant-numeric: tabular-nums`** so digits never jitter as they update.
- **Scale:** 4px base. Section rhythm 96/64/32.
- **Texture:** a 3–4% opacity film-grain PNG overlay, fixed, `pointer-events:none` — instantly lifts it above "template."
- **Borders over shadows.** 1px `--line` hairlines, no drop shadows. Radius 6px max — terminals are angular.
- **Data density is the aesthetic.** Don't pad numbers into oblivion; tight tables read as expert.

### 6.2 Signature interactions (the awwwards moments — pick two, execute perfectly)

1. **Cold open (2.5s, skippable, once per session):** black screen, a single monospace line types `initialising basis · relative value desk`, then a live tape of the five spreads streams in from the right, the grid resolves into place, and the z-dials sweep from 0 to their real values. GSAP timeline, staggered 60ms.
2. **The z-dial:** a semicircular SVG arc per spread, −3σ to +3σ, with a needle that animates on load and colours by state (green ≤1, amber 1–2, red ≥2). This is the product's visual signature — it must be beautiful.
3. **Band-draw on the spread chart:** the ±1σ/±2σ bands fill in with a left-to-right clip animation on first paint (0.8s, ease-out).
4. **Tape marquee** across the top: `BRENT-WTI +2.34σ · GOLD/SILVER −0.8σ · …` — slow, continuous, pausing on hover.
5. **Cursor crosshair** on charts with a floating readout, exactly like a terminal.

Rules: every animation ≤ 600ms except the cold open; everything GPU-only (`transform`/`opacity`); full `prefers-reduced-motion` fallback that skips straight to the resolved state.

### 6.3 Layout

- Desktop: 12-column, 1280 max width, 24px gutters. Left rail (72px) with the wordmark and 5 nav glyphs.
- Mobile: single column; z-dial and chart stack; tape hidden.
- **The Desk** grid: cards 3-up on desktop. Each card: pair name · unit · current value (large mono) · z-dial · 60-day sparkline · state chip (`STRETCHED` / `NORMAL` / `REVERTING`) · "next event in Nd".

---

## 7 · Pages (implementation-ready)

**`/` The Desk** — cold open → tape → grid of pair cards → "open paper trades" strip at the bottom with live R.

**`/s/[slug]` Spread detail**
- Header: pair name, method (`difference` / `ratio` / `beta-adjusted`), current value, z, percentile.
- Big chart: spread line + mean + ±1σ/±2σ bands; markers for past signals; **roll-suspect days marked with a hollow triangle** (and a tooltip explaining the roll).
- Stats strip: half-life · ADF p-value · windows 30/60/90 · beta (if applicable).
- **Rationale block** — the economics paragraph from `pairs.rationale`, always visible. *This is what makes the product read as trader-built.*
- CTA: **Log paper trade** → modal requiring direction, stop-z, and a one-sentence hypothesis (hypothesis is mandatory — that constraint is the point).

**`/journal`** — table of trades: date, pair, direction, entry z, exit z, R, reason, hypothesis. Filters by pair/outcome. Expandable row shows the post-mortem field.

**`/performance`**
- Equity curve in **R-multiples** (not currency — R is the professional unit).
- Cards: trades, hit rate, average win R, average loss R, **expectancy**, max drawdown in R, longest losing streak.
- Histogram of R outcomes (D3).
- Honest banner: *"Paper trades on EOD settlement data. No slippage or commission modelled."*

**`/method`** — plain-English explanation of z-score, half-life, ADF, roll handling, and a **"where this breaks"** section (regime shifts, structural breaks like the shale boom or a pipeline reversal, non-stationarity, small sample). Interviewers will read this page and it should be the most impressive thing on the site.

---

## 8 · Build order (weekend + a trickle)

**Day 1 (6h):** repo + Supabase schema + seed instruments/pairs → `worker/ingest.py` (yfinance → `prices`) → `worker/stats.py` (spread, z, half-life, ADF, roll flags) → backfill 5 years → verify numbers by hand for one pair in a spreadsheet.
**Day 2 (6h):** Next.js scaffold + design tokens → Desk grid + z-dial + sparkline → spread detail with lightweight-charts + bands → deploy to Vercel.
**Day 3 (3h):** paper-trade modal + journal + performance math → Twilio alert + GitHub Action cron → cold-open animation.
**Ongoing (10 min/day):** review the digest, log trades, write post-mortems. **The track record is the real deliverable — start it the day the ingest works, before the UI is pretty.**

---

## 9 · Acceptance criteria

- [ ] Daily cron runs unattended; a missed day is visible in the UI, not silently forward-filled.
- [ ] z-scores reproducible by hand in a spreadsheet for at least one pair (verify before trusting anything).
- [ ] Roll-suspect days excluded from mean/σ and visibly marked on the chart.
- [ ] Every pair displays its economic rationale.
- [ ] Alert delivers to WhatsApp/Telegram within 10 minutes of the cron.
- [ ] Performance page computes expectancy correctly: `(hit% × avgWinR) − (miss% × avgLossR)`.
- [ ] Lighthouse ≥ 95 performance, ≥ 95 accessibility; full reduced-motion path.
- [ ] Mobile-usable — you will demo this on a phone.
- [ ] Footer states data source, delay, and "research only."

---

## 10 · The 60-second interview demo

> "This is a relative-value desk I run daily. It tracks five spreads between related instruments — Brent versus WTI, gold/silver, Nifty against Bank Nifty. Every morning it recomputes each spread's z-score against a rolling window, checks whether the relationship is still statistically stationary, and messages me when something stretches past two sigma.
> Right now Brent–WTI sits at plus 2.3 — 96th percentile for the year — and the estimated half-life of the dislocation is about six days.
> The part I'd point at is this: continuous futures series have roll gaps, so I flag and exclude those days — otherwise the spread shows a jump that isn't economic. And on each pair I keep the reason the relationship exists at all: Brent is seaborne, WTI is landlocked at Cushing, so transport and quality drive the gap — which also tells me when the model should stop being trusted.
> I've been paper-trading its signals for five weeks — every trade needs a one-sentence hypothesis before I can log it. Twenty-two trades, 41% hit rate, winners averaging 2.1× losers."

**Never say:** "profitable strategy," "predicts," "AI-powered." **Do say:** "monitors," "dislocation," "half-life," "stationarity," "where it breaks."

---

## 11 · Pitfalls the AI builder must avoid

1. No forward-fill across missing sessions — it manufactures fake mean reversion.
2. No lookahead: today's z uses data up to **yesterday's** close only.
3. Don't optimise the lookback for the best backtest — show 30/60/90 and their stability instead.
4. No ML, no price prediction, no "signal strength score" invented from nothing.
5. Don't fabricate an equity curve — the performance page is empty until real logged trades exist, and an empty state that says *"no trades yet — the log starts when the operator takes the first signal"* is far better than fake data.
6. Keep the copy sober. No emoji in the product UI, no "🚀". This is a desk.
