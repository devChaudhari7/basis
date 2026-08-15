-- BASIS migration 002 — research features
-- Apply in the Supabase SQL editor on an existing database.
-- (database/schema.sql already contains these for fresh installs.)

begin;

-- Events gain provenance: published calendars vs rule-derived recurring dates
-- (EIA Wednesdays, NFP first Fridays) which can shift around holidays.
alter table events add column if not exists source text
  check (source in ('published', 'rule-derived'));

-- Per-signal forward outcomes, measured in entry-day sigma units and signed so
-- positive always means the dislocation closed in the signal's favour.
alter table signals add column if not exists fwd_5 numeric;
alter table signals add column if not exists fwd_10 numeric;
alter table signals add column if not exists fwd_20 numeric;
alter table signals add column if not exists mae_20 numeric;   -- worst excursion along the way

-- Aggregated signal diagnostics per pair and horizon. Descriptive history of
-- what followed past dislocations; never a forecast.
create table if not exists signal_diagnostics (
  pair_id int not null references pairs(id) on delete cascade,
  horizon int not null check (horizon > 0),
  n int not null check (n >= 0),
  hit_rate numeric,          -- share of signals with a favourable move at the horizon
  median_move numeric,       -- median signed move, in entry-day sigma
  p25 numeric,
  p75 numeric,
  median_mae numeric,        -- median worst adverse excursion before the horizon
  worst numeric,             -- single worst outcome in the sample
  primary key (pair_id, horizon)
);

-- Retrospective level shifts. Display and context only: never an input to the
-- z-score, which stays a strictly backward-looking rolling statistic.
create table if not exists structural_breaks (
  pair_id int not null references pairs(id) on delete cascade,
  d date not null,
  shift numeric not null,    -- change in mean level, in pooled sigma
  t_stat numeric not null,
  primary key (pair_id, d)
);

-- Rolling correlation between pairs, computed on daily spread changes.
create table if not exists spread_correlations (
  pair_a int not null references pairs(id) on delete cascade,
  pair_b int not null references pairs(id) on delete cascade,
  window_sessions int not null check (window_sessions > 1),
  corr numeric not null check (corr >= -1 and corr <= 1),
  n int not null,
  primary key (pair_a, pair_b, window_sessions)
);

alter table signal_diagnostics enable row level security;
alter table structural_breaks enable row level security;
alter table spread_correlations enable row level security;

drop policy if exists "Public read signal diagnostics" on signal_diagnostics;
drop policy if exists "Public read structural breaks" on structural_breaks;
drop policy if exists "Public read spread correlations" on spread_correlations;

create policy "Public read signal diagnostics" on signal_diagnostics for select to anon, authenticated using (true);
create policy "Public read structural breaks" on structural_breaks for select to anon, authenticated using (true);
create policy "Public read spread correlations" on spread_correlations for select to anon, authenticated using (true);

grant select on signal_diagnostics, structural_breaks, spread_correlations to anon, authenticated;

commit;
