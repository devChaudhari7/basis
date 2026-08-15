-- BASIS migration 004 — the bot's public decision log
-- Apply in the Supabase SQL editor after 003.

begin;

-- Every session, for every pair, the bot records what it did and why.
-- Publishing the declines matters as much as the entries: a system that only
-- shows its trades is hiding the half of the record that explains them.
create table if not exists bot_decisions (
  pair_id int not null references pairs(id) on delete cascade,
  d date not null,
  action text not null check (action in ('open', 'hold', 'close', 'skip', 'idle')),
  reason text not null,
  z numeric,
  primary key (pair_id, d)
);

create index if not exists bot_decisions_recent on bot_decisions (d desc);

-- Per-pair eligibility, recomputed walk-forward each run: the bot's own view
-- of which relationships have earned the right to be traded, using only
-- signals that had already resolved at the time of the judgement.
create table if not exists bot_eligibility (
  pair_id int primary key references pairs(id) on delete cascade,
  eligible boolean not null,
  reason text not null,
  prior_n int not null default 0,
  prior_hit_rate numeric,
  updated_on date not null
);

alter table bot_decisions enable row level security;
alter table bot_eligibility enable row level security;

drop policy if exists "Public read bot decisions" on bot_decisions;
drop policy if exists "Public read bot eligibility" on bot_eligibility;

create policy "Public read bot decisions" on bot_decisions for select to anon, authenticated using (true);
create policy "Public read bot eligibility" on bot_eligibility for select to anon, authenticated using (true);

grant select on bot_decisions, bot_eligibility to anon, authenticated;

commit;
