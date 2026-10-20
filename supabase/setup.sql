-- ===========================================================================
-- D&D Kampagnen-Tracker – Datenbank-Einrichtung für Supabase (ab Version 1.4)
-- ---------------------------------------------------------------------------
-- Einmal komplett im Supabase-Dashboard ausführen:
--   SQL Editor  ->  "New query"  ->  diesen Text einfügen  ->  "Run"
--
-- Legt EINE Tabelle an. Pro Benutzerkonto gibt es genau eine Zeile, in der
-- der komplette Kampagnenstand als JSON liegt. Row Level Security sorgt
-- dafür, dass jedes Konto nur seine eigene Zeile lesen und schreiben kann –
-- und da neue Registrierungen abgeschaltet werden, gibt es nur dein Konto.
-- ===========================================================================

create table if not exists public.campaign_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- updated_at setzt immer die Datenbank (wichtig für die Konflikterkennung
-- zwischen Handy und PC – die Uhren der Geräte spielen so keine Rolle).
create or replace function public.campaign_state_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campaign_state_touch on public.campaign_state;
create trigger campaign_state_touch
  before insert or update on public.campaign_state
  for each row execute function public.campaign_state_touch();

-- Row Level Security: ohne passende Regel ist NICHTS erlaubt.
alter table public.campaign_state enable row level security;

drop policy if exists "eigene Zeile lesen"   on public.campaign_state;
drop policy if exists "eigene Zeile anlegen" on public.campaign_state;
drop policy if exists "eigene Zeile ändern"  on public.campaign_state;

create policy "eigene Zeile lesen" on public.campaign_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "eigene Zeile anlegen" on public.campaign_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "eigene Zeile ändern" on public.campaign_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Nicht angemeldete Besucher bekommen überhaupt keinen Zugriff auf die Tabelle.
revoke all on public.campaign_state from anon;
grant select, insert, update on public.campaign_state to authenticated;

-- ---------------------------------------------------------------------------
-- OPTIONAL, für doppelte Sicherheit: Zugriff zusätzlich fest an DEINE
-- E-Mail-Adresse binden. Dazu die beiden Zeilen unten entkommentieren
-- (die "--" entfernen), deine Adresse eintragen und erneut ausführen.
-- ---------------------------------------------------------------------------
-- create policy "nur meine Adresse" on public.campaign_state as restrictive
--   for all to authenticated using ((select auth.jwt() ->> 'email') = 'deine@email.de');
