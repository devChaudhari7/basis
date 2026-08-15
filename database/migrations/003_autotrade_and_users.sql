-- BASIS migration 003 — mechanical trader + multi-user paper trading
-- Apply in the Supabase SQL editor after 002.

begin;

-- Who (or what) opened a trade.
--   'auto'     — the mechanical rule engine, owner_id null, publicly visible.
--   'operator' — the desk owner via the operator token, owner_id null.
--   'user'     — a signed-in visitor, owner_id set to their auth.users id.
alter table paper_trades add column if not exists source text
  not null default 'operator'
  check (source in ('auto', 'operator', 'user'));

alter table paper_trades add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- The exit rule that closed an auto trade, recorded for auditability.
alter table paper_trades add column if not exists rule text;

-- One open mechanical trade per pair at a time: the rule never pyramids.
create unique index if not exists paper_trades_one_open_auto_per_pair
  on paper_trades (pair_id)
  where source = 'auto' and closed_on is null;

-- A signed-in user likewise holds at most one open trade per pair.
create unique index if not exists paper_trades_one_open_user_per_pair
  on paper_trades (owner_id, pair_id)
  where source = 'user' and closed_on is null;

create index if not exists paper_trades_owner on paper_trades (owner_id, opened_on desc);
create index if not exists paper_trades_source on paper_trades (source, opened_on desc);

-- Replace the single-desk policies with ownership-aware ones.
drop policy if exists "Public read paper trades" on paper_trades;
drop policy if exists "Authenticated operator inserts paper trades" on paper_trades;
drop policy if exists "Authenticated operator updates paper trades" on paper_trades;

-- The mechanical and operator records are the public track record.
create policy "Public read desk trades" on paper_trades
  for select to anon, authenticated
  using (source in ('auto', 'operator'));

-- A signed-in visitor sees only their own trades on top of that.
create policy "Users read own trades" on paper_trades
  for select to authenticated
  using (owner_id = auth.uid());

create policy "Users insert own trades" on paper_trades
  for insert to authenticated
  with check (owner_id = auth.uid() and source = 'user');

create policy "Users update own trades" on paper_trades
  for update to authenticated
  using (owner_id = auth.uid() and source = 'user')
  with check (owner_id = auth.uid() and source = 'user');

commit;
