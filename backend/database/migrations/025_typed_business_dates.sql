-- Convertit les dates métier vers de vrais types PostgreSQL sans perdre
-- aucune ligne historique. Toute valeur obligatoire non convertible fait
-- échouer la transaction complète : aucune conversion partielle n'est possible.

do $$
begin
  if exists (
    select 1 from sessions
    where date is null
       or trim(date) !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'Migration 025 refusée : sessions.date contient une valeur non ISO.';
  end if;

  if exists (
    select 1 from realisations
    where date_realisation is null
       or left(trim(date_realisation), 10) !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'Migration 025 refusée : realisations.date_realisation contient une valeur non ISO.';
  end if;

  if exists (
    select 1 from routes
    where nullif(trim(date_creation), '') is not null
      and left(trim(date_creation), 10) !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'Migration 025 refusée : routes.date_creation contient une valeur non ISO.';
  end if;
end $$;

alter table sessions
  alter column date type date using trim(date)::date;

alter table realisations
  alter column date_realisation type date using left(trim(date_realisation), 10)::date;

alter table routes
  alter column date_creation drop default;
alter table routes
  alter column date_creation drop not null;
alter table routes
  alter column date_creation type date
  using nullif(left(trim(date_creation), 10), '')::date;

create index if not exists idx_sessions_date_slot on sessions(date, slot);
create index if not exists idx_realisations_date on realisations(date_realisation desc);
create index if not exists idx_routes_date_creation on routes(date_creation desc);
