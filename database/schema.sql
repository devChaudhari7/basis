-- BASIS / Supabase schema
-- Apply this once in the Supabase SQL editor, then run `python -m worker.seed`.
-- The worker uses a service-role key kept only in its runtime environment.
-- Browser clients receive read access through RLS; journal writes require an
-- authenticated operator and should never expose a service-role key.

begin;

create table instruments (
  id serial primary key,
  symbol text unique not null check (length(trim(symbol)) > 0), -- e.g. 'CL=F'
  name text not null check (length(trim(name)) > 0),
  unit text,
  venue text
);

create table prices (
  instrument_id int not null references instruments(id) on delete cascade,
  d date not null,
  close numeric not null,
  volume numeric,
  primary key (instrument_id, d)
);

create table pairs (
  id serial primary key,
  slug text unique not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  leg_a int not null references instruments(id),
  leg_b int not null references instruments(id),
  method text not null check (method in ('diff', 'ratio', 'beta')),
  lookback int not null default 60 check (lookback >= 2),
  entry_z numeric not null default 2.0 check (entry_z > 0),
  stop_z numeric not null default 3.0 check (stop_z > entry_z),
  rationale text not null check (length(trim(rationale)) > 0),
  check (leg_a <> leg_b)
);

create table spread_daily (
  pair_id int not null references pairs(id) on delete cascade,
  d date not null,
  value numeric not null,
  mean_60 numeric,
  std_60 numeric,
  z numeric,
  pct_rank_252 numeric,               -- percentile within trailing 252 clean sessions
  half_life numeric,                  -- OU estimate in sessions; null = no mean reversion detected
  beta numeric,                       -- populated for method = 'beta'
  roll_suspect boolean not null default false,
  adf_p numeric,                      -- stored explicitly: non-stationary spreads must be visible
  z_30 numeric,
  z_90 numeric,
  stability text check (stability in ('stable', 'unstable', 'insufficient_data')),
  primary key (pair_id, d),
  check (pct_rank_252 is null or (pct_rank_252 >= 0 and pct_rank_252 <= 100))
);

create table signals (
  id serial primary key,
  pair_id int not null references pairs(id) on delete cascade,
  d date not null,
  z numeric not null,
  direction text not null check (direction in ('long_spread', 'short_spread')),
  notified boolean not null default false,
  unique (pair_id, d)
);

create table paper_trades (
  id serial primary key,
  pair_id int not null references pairs(id),
  opened_on date not null,
  entry_value numeric not null,
  entry_z numeric not null,
  direction text not null check (direction in ('long_spread', 'short_spread')),
  stop_z numeric not null,
  hypothesis text not null check (length(trim(hypothesis)) > 0), -- one sentence is enforced by the UI
  closed_on date,
  exit_value numeric,
  exit_z numeric,
  exit_reason text check (exit_reason in ('target', 'stop', 'time', 'manual')),
  pnl_points numeric,
  r_multiple numeric,
  post_mortem text,
  check (closed_on is null or closed_on >= opened_on),
  check (
    (closed_on is null and exit_value is null and exit_z is null and exit_reason is null)
    or closed_on is not null
  )
);

create table events (
  id serial primary key,
  d date not null,
  label text not null check (length(trim(label)) > 0),
  affects text[] not null default '{}', -- e.g. {'brent-wti', 'usdinr-dxy'}
  unique (d, label)
);

create index prices_by_date on prices (d desc);
create index spread_daily_by_date on spread_daily (d desc);
create index signals_pair_date on signals (pair_id, d desc);
create index paper_trades_pair_opened on paper_trades (pair_id, opened_on desc);
create index events_affects_gin on events using gin (affects);

-- RLS is enabled everywhere.  Read policies make the research desk and its
-- method transparent, while the ingestion worker writes via service role.
alter table instruments enable row level security;
alter table prices enable row level security;
alter table pairs enable row level security;
alter table spread_daily enable row level security;
alter table signals enable row level security;
alter table paper_trades enable row level security;
alter table events enable row level security;

create policy "Public read instruments" on instruments for select to anon, authenticated using (true);
create policy "Public read prices" on prices for select to anon, authenticated using (true);
create policy "Public read pairs" on pairs for select to anon, authenticated using (true);
create policy "Public read spread daily" on spread_daily for select to anon, authenticated using (true);
create policy "Public read signals" on signals for select to anon, authenticated using (true);
create policy "Public read paper trades" on paper_trades for select to anon, authenticated using (true);
create policy "Public read events" on events for select to anon, authenticated using (true);

-- A future authenticated operator UI can log and close paper trades without
-- using a service key.  For a multi-user deployment, add an owner_id column
-- and replace these single-desk policies with ownership checks.
create policy "Authenticated operator inserts paper trades"
  on paper_trades for insert to authenticated with check (true);
create policy "Authenticated operator updates paper trades"
  on paper_trades for update to authenticated using (true) with check (true);

grant select on instruments, prices, pairs, spread_daily, signals, paper_trades, events to anon, authenticated;
grant insert, update on paper_trades to authenticated;
grant usage, select on sequence paper_trades_id_seq to authenticated;

commit;
