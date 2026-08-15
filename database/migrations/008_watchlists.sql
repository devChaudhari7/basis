-- BASIS migration 008 — watchlists and per-user alerts
-- Apply in the Supabase SQL editor after 007.

begin;

-- One row per spread a signed-in visitor is watching, with their own
-- threshold rather than the desk's.
create table if not exists watchlists (
  owner_id uuid not null references auth.users(id) on delete cascade,
  pair_slug text not null,
  alert_z numeric not null default 2.0 check (alert_z > 0 and alert_z <= 5),
  created_at timestamptz not null default now(),
  -- Set when an alert fires so a stretched spread does not notify daily.
  last_alerted_on date,
  primary key (owner_id, pair_slug)
);

-- Delivery preferences. The Telegram chat id is the user's own; they obtain it
-- by messaging the bot, so no address is ever collected without an explicit
-- action on their side.
create table if not exists notification_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- In-app alert feed, so notifications work even with no channel configured.
create table if not exists alerts (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  pair_slug text not null,
  d date not null,
  z numeric not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists alerts_owner_recent on alerts (owner_id, created_at desc);
create unique index if not exists alerts_once_per_session on alerts (owner_id, pair_slug, d);

alter table watchlists enable row level security;
alter table notification_settings enable row level security;
alter table alerts enable row level security;

drop policy if exists "Users manage own watchlist" on watchlists;
drop policy if exists "Users manage own settings" on notification_settings;
drop policy if exists "Users read own alerts" on alerts;
drop policy if exists "Users update own alerts" on alerts;

create policy "Users manage own watchlist" on watchlists
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Users manage own settings" on notification_settings
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Users read own alerts" on alerts
  for select to authenticated using (owner_id = auth.uid());

create policy "Users update own alerts" on alerts
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on watchlists, notification_settings to authenticated;
grant select, update on alerts to authenticated;

commit;
