-- 010_participant_passeport_ffme.sql
-- Distingue la couleur/niveau de passeport de l'inscription Passeport FFME.

alter table participants
  add column if not exists passeport_ffme boolean not null default false;
