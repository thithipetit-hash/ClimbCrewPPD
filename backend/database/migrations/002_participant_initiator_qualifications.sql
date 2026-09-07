alter table participants
  add column if not exists initiateur_sae boolean not null default false;

alter table participants
  add column if not exists initiateur_sne boolean not null default false;
