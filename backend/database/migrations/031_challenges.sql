create table if not exists challenges (
  id bigserial primary key,
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '',
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  target_mode text not null default 'snapshot' check (target_mode in ('snapshot', 'dynamic')),
  criteria jsonb not null default '{}'::jsonb,
  created_by bigint references users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists idx_challenges_status_dates
  on challenges(status, starts_on desc, ends_on);

-- Les voies d'un challenge sont figées à sa création. Le snapshot conserve
-- le libellé même si la voie est ensuite renommée ou désactivée.
create table if not exists challenge_routes (
  challenge_id bigint not null references challenges(id) on delete cascade,
  route_id text not null,
  route_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (challenge_id, route_id)
);

create index if not exists idx_challenge_routes_route
  on challenge_routes(route_id);

-- Le classement final est figé à la clôture afin que les réalisations futures
-- ne puissent jamais modifier un résultat publié.
create table if not exists challenge_results (
  challenge_id bigint not null references challenges(id) on delete cascade,
  participant_id bigint not null references participants(id) on delete cascade,
  rank integer not null check (rank > 0),
  score integer not null check (score >= 0),
  completed_route_ids text[] not null default '{}',
  final_scoring_at date,
  finalized_at timestamptz not null default now(),
  primary key (challenge_id, participant_id),
  unique (challenge_id, rank)
);

create index if not exists idx_challenge_results_participant
  on challenge_results(participant_id, finalized_at desc);

-- Récompenses persistées et génériques : le premier usage est le badge
-- "Challenge", mais la table pourra accueillir d'autres récompenses.
create table if not exists participant_badges (
  id bigserial primary key,
  participant_id bigint not null references participants(id) on delete cascade,
  badge_type text not null,
  label text not null,
  source_type text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  unique (participant_id, badge_type, source_type, source_id)
);

create index if not exists idx_participant_badges_participant
  on participant_badges(participant_id, awarded_at desc);
