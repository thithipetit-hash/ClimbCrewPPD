-- Kudos : une marque d'encouragement unique par grimpeur et par réalisation.
create table if not exists realisation_kudos (
  realisation_id text not null references realisations(id) on delete cascade,
  participant_id bigint not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (realisation_id, participant_id)
);

create index if not exists realisation_kudos_participant_idx
  on realisation_kudos (participant_id);
