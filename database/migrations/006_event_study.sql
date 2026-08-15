-- BASIS migration 006 — automated event-impact research
-- Apply in the Supabase SQL editor after 005.

begin;

-- Does a scheduled release actually move this spread? Every tested
-- combination is stored, not just the significant ones, so the multiple
-- comparison arithmetic stays visible.
create table if not exists event_impacts (
  pair_slug text not null,
  label text not null,
  event_sessions int not null,
  other_sessions int not null,
  median_event_move numeric not null,
  median_other_move numeric not null,
  ratio numeric,
  p_value numeric not null,
  survives_fdr boolean not null default false,
  scanned_on date not null,
  primary key (pair_slug, label)
);

create index if not exists event_impacts_significant on event_impacts (survives_fdr desc, p_value);

alter table event_impacts enable row level security;
drop policy if exists "Public read event impacts" on event_impacts;
create policy "Public read event impacts" on event_impacts for select to anon, authenticated using (true);
grant select on event_impacts to anon, authenticated;

commit;
