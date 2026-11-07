alter table participants
  add column if not exists cotisation_precedente boolean not null default false;
