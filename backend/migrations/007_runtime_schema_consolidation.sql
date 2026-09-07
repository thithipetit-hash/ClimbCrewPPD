-- Consolide le schéma encore créé au runtime dans des migrations versionnées.
-- Cette migration est transactionnelle via backend/database/migrate.js.

alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists pending_email text;
alter table users add column if not exists receive_account_notifications boolean not null default false;

alter table participants add column if not exists email text not null default '';
alter table participants add column if not exists login_email text;

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

update users set is_admin = true where role = 'admin' and is_admin = false;
update users set role = 'admin' where is_admin = true and role <> 'admin';

drop index if exists uq_participants_login_email_normalized;

update participants
set email = lower(trim(coalesce(email, ''))),
    login_email = nullif(lower(trim(coalesce(login_email, ''))), '');

update participants
set login_email = nullif(email, '')
where (login_email is null or trim(login_email) = '')
  and trim(email) <> '';

update participants p
set can_admin = (u.role = 'admin' or u.is_admin),
    email = lower(trim(u.email)),
    login_email = lower(trim(u.email))
from users u
where u.participant_id = p.id;

update participants
set email = coalesce(login_email, '')
where login_email is not null
  and email is distinct from login_email;

create or replace function climbcrew_sync_participant_email()
returns trigger
language plpgsql
as $$
declare
  normalized_email text;
  normalized_login_email text;
begin
  normalized_email := lower(trim(coalesce(new.email, '')));
  normalized_login_email := nullif(lower(trim(coalesce(new.login_email, ''))), '');

  if tg_op = 'INSERT' then
    if normalized_login_email is null and normalized_email <> '' then
      normalized_login_email := normalized_email;
    elsif normalized_login_email is not null then
      normalized_email := normalized_login_email;
    end if;
  else
    if new.login_email is distinct from old.login_email then
      normalized_email := coalesce(normalized_login_email, '');
    elsif new.email is distinct from old.email then
      normalized_login_email := nullif(normalized_email, '');
    elsif normalized_login_email is not null then
      normalized_email := normalized_login_email;
    elsif normalized_email <> '' then
      normalized_login_email := normalized_email;
    end if;
  end if;

  new.email := normalized_email;
  new.login_email := normalized_login_email;
  return new;
end;
$$;

drop trigger if exists trg_climbcrew_sync_participant_email on participants;
create trigger trg_climbcrew_sync_participant_email
before insert or update of email, login_email on participants
for each row execute function climbcrew_sync_participant_email();

create index if not exists idx_participants_login_email_normalized
on participants ((lower(trim(login_email))))
where login_email is not null and trim(login_email) <> '';

do $$
begin
  if not exists (
    select 1
    from participants
    where login_email is not null and trim(login_email) <> ''
    group by lower(trim(login_email))
    having count(*) > 1
  ) then
    create unique index if not exists uq_participants_login_email_normalized
    on participants ((lower(trim(login_email))))
    where login_email is not null and trim(login_email) <> '';
  end if;
end;
$$;

-- Schéma vidéo : toutes les tables et index nécessaires existent avant l'ouverture HTTP.
alter table routes add column if not exists video_urls text[] not null default '{}';
alter table realisations add column if not exists video_urls jsonb not null default '[]'::jsonb;

create table if not exists route_videos (
  id text primary key,
  route_id text not null references routes(id) on delete cascade,
  file_name text not null default 'video',
  mime_type text not null,
  content bytea not null,
  created_at timestamptz not null default now(),
  source_realisation_id text
);
alter table route_videos add column if not exists source_realisation_id text;

create table if not exists route_video_upload_chunks (
  participant_id text not null,
  upload_id text not null,
  part_number integer not null,
  realisation_id text not null,
  route_id text not null,
  file_name text not null default 'video',
  mime_type text not null,
  total_parts integer not null,
  total_bytes bigint not null,
  content bytea not null,
  created_at timestamptz not null default now(),
  primary key (participant_id, upload_id, part_number)
);

create index if not exists idx_route_videos_route on route_videos(route_id);
create index if not exists idx_route_videos_source_realisation on route_videos(source_realisation_id);
create index if not exists idx_route_video_upload_chunks_realisation
  on route_video_upload_chunks(realisation_id, participant_id);
