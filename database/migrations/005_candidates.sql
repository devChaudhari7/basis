-- BASIS migration 005 — automated candidate research
-- Apply in the Supabase SQL editor after 004.

begin;

-- One row per combination the scanner examined, kept whether it passed or
-- not. Publishing the failures is what makes the survivors meaningful: a
-- shortlist without its denominator is just a story.
create table if not exists candidates (
  symbol_a text not null,
  symbol_b text not null,
  method text not null check (method in ('diff', 'ratio')),
  sessions int not null,
  adf_p numeric not null,
  half_life numeric,
  latest_z numeric,
  survives_fdr boolean not null default false,
  rank int not null default 0,
  scanned_on date not null,
  primary key (symbol_a, symbol_b, method)
);

create index if not exists candidates_rank on candidates (survives_fdr desc, rank);

-- Summary of each sweep, so the multiple-comparison arithmetic is on record.
create table if not exists scan_runs (
  scanned_on date primary key,
  tested int not null,
  raw_pass int not null,
  survivors int not null,
  expected_false_positives int not null,
  alpha numeric not null
);

alter table candidates enable row level security;
alter table scan_runs enable row level security;

drop policy if exists "Public read candidates" on candidates;
drop policy if exists "Public read scan runs" on scan_runs;

create policy "Public read candidates" on candidates for select to anon, authenticated using (true);
create policy "Public read scan runs" on scan_runs for select to anon, authenticated using (true);

grant select on candidates, scan_runs to anon, authenticated;

commit;
