-- ClimbCrew - schéma de référence pour une base neuve.
-- Les évolutions d'une base existante sont appliquées par backend/migrations/*.sql.

create table if not exists participants (
  id bigserial primary key,
  nom text not null,
  prenom text not null,
  email text not null default '',
  login_email text,
  passport text not null default 'sans',
  sexe text not null default '' check (sexe in ('', 'h', 'f')),
  cotisation boolean not null default false,
  ffme boolean not null default false,
  initiateur_sae boolean not null default false,
  initiateur_sne boolean not null default false,
  can_encadrer boolean not null default false,
  can_referer boolean not null default false,
  can_admin boolean not null default false,
  avatar_id text not null default 'gecko',
  crest_id text not null default 'cristal',
  profile_public boolean not null default true,
  custom_avatar_image text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_participants_login_email_normalized
  on participants ((lower(trim(login_email))))
  where login_email is not null and trim(login_email) <> '';

create table if not exists sessions (
  id text primary key,
  date text not null,
  slot text not null check (slot in ('midi', 'matin', 'soir')),
  status text not null default 'fermee',
  encadrant_id bigint references participants(id) on delete set null,
  referent_id bigint references participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sessions_date on sessions(date);

create table if not exists session_participants (
  session_id text not null references sessions(id) on delete cascade,
  participant_id bigint not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, participant_id)
);

create index if not exists idx_session_participants_participant
  on session_participants(participant_id);

create table if not exists users (
  id bigserial primary key,
  participant_id bigint references participants(id) on delete set null,
  email text unique not null,
  prenom text not null,
  nom text not null,
  password_hash text not null,
  role text not null default 'user',
  is_admin boolean not null default false,
  status text not null default 'pending',
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  last_login_at timestamptz,
  email_verified_at timestamptz,
  pending_email text,
  theme_preference text not null default 'auto'
);

create index if not exists idx_users_email on users(lower(email));
create index if not exists idx_users_status on users(status);

create table if not exists user_sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_address text
);

create index if not exists idx_user_sessions_user on user_sessions(user_id);
create index if not exists idx_user_sessions_token_hash on user_sessions(token_hash);

create table if not exists password_reset_tokens (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_password_reset_tokens_user on password_reset_tokens(user_id);
create index if not exists idx_password_reset_tokens_hash on password_reset_tokens(token_hash);

create table if not exists email_verification_tokens (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_email_verification_tokens_user on email_verification_tokens(user_id);
create index if not exists idx_email_verification_tokens_hash on email_verification_tokens(token_hash);

create table if not exists email_change_tokens (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  new_email text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_email_change_tokens_user on email_change_tokens(user_id);
create index if not exists idx_email_change_tokens_hash on email_change_tokens(token_hash);

create table if not exists access_logs (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  event_type text not null,
  success boolean not null default true,
  ip_address text,
  user_agent text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_access_logs_created_at on access_logs(created_at desc);
create index if not exists idx_access_logs_event_type on access_logs(event_type);

create table if not exists broadcast_messages (
  id bigserial primary key,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 2000),
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists broadcast_message_recipients (
  message_id bigint not null references broadcast_messages(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists idx_broadcast_recipients_pending
  on broadcast_message_recipients(user_id, read_at, message_id);

create table if not exists ropes (
  numero_corde integer primary key,
  actif boolean not null default true,
  couleur_corde text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists routes (
  id text primary key,
  numero_voie_unique text unique not null,
  numero_corde integer references ropes(numero_corde) on delete set null,
  couleur_prises text not null default '',
  cotation_reference text not null default '',
  cotation_ajustee text not null default '',
  nom_voie text not null default '',
  nom_ouvreur text not null default '',
  moulinette_only boolean not null default false,
  active boolean not null default true,
  date_creation text not null default '',
  tags text[] not null default '{}',
  video_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_routes_numero_corde on routes(numero_corde);
create index if not exists idx_routes_active on routes(active);

create table if not exists route_videos (
  id text primary key,
  route_id text not null references routes(id) on delete cascade,
  file_name text not null default 'video',
  mime_type text not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_route_videos_route on route_videos(route_id);

create table if not exists route_ratings (
  route_id text not null references routes(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (route_id, user_id)
);

create index if not exists idx_route_ratings_route on route_ratings(route_id);

create table if not exists realisations (
  id text primary key,
  participant_id bigint not null references participants(id) on delete cascade,
  session_id text not null references sessions(id) on delete restrict,
  voie_id text not null references routes(id) on delete cascade,
  date_realisation text not null,
  style_realisation text not null,
  commentaire text,
  cotation_proposee text,
  nb_essais text,
  chute boolean not null default false,
  assureur_id bigint references participants(id) on delete set null,
  rating integer check (rating between 1 and 5),
  tags text[] not null default '{}',
  video_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_realisations_participant on realisations(participant_id);
create index if not exists idx_realisations_session on realisations(session_id);
create index if not exists idx_realisations_voie on realisations(voie_id);

create table if not exists video_analysis_settings (
  id integer primary key check (id = 1),
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into video_analysis_settings (id, rules)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists evolution_requests (
  id bigserial primary key,
  author_id bigint not null references users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null check (char_length(description) between 3 and 4000),
  status text not null default 'a_voir' check (status in ('a_voir', 'approuve', 'integre', 'trop_creatif')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evolution_comments (
  id bigserial primary key,
  request_id bigint not null references evolution_requests(id) on delete cascade,
  author_id bigint not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists evolution_votes (
  request_id bigint not null references evolution_requests(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists idx_evolution_requests_created on evolution_requests(created_at desc);
create index if not exists idx_evolution_comments_request on evolution_comments(request_id, created_at);
create index if not exists idx_evolution_votes_request on evolution_votes(request_id);

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);