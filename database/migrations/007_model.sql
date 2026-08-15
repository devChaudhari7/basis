-- BASIS migration 007 — the learned filter and its running scorecard
-- Apply in the Supabase SQL editor after 006.

begin;

-- Result of each walk-forward experiment, so the claim is dated and auditable
-- rather than a screenshot someone remembers.
create table if not exists model_experiments (
  ran_on date primary key,
  n_evaluated int not null,
  rule_hit_rate numeric not null,
  model_hit_rate numeric,
  model_taken int not null,
  rule_expectancy numeric not null,
  model_expectancy numeric,
  permutation_p numeric not null,
  verdict text not null,
  features text[] not null default '{}'
);

-- Every live decision the filter makes, recorded whether or not it is acted
-- on. This is what turns a promising experiment into a forward record: the
-- model's call is logged before the outcome exists.
create table if not exists model_predictions (
  pair_id int not null references pairs(id) on delete cascade,
  d date not null,
  probability numeric not null,
  would_take boolean not null,
  -- Filled in later by the worker once the horizon has elapsed.
  realised_outcome numeric,
  primary key (pair_id, d)
);

create index if not exists model_predictions_recent on model_predictions (d desc);

alter table model_experiments enable row level security;
alter table model_predictions enable row level security;

drop policy if exists "Public read model experiments" on model_experiments;
drop policy if exists "Public read model predictions" on model_predictions;

create policy "Public read model experiments" on model_experiments for select to anon, authenticated using (true);
create policy "Public read model predictions" on model_predictions for select to anon, authenticated using (true);

grant select on model_experiments, model_predictions to anon, authenticated;

commit;
