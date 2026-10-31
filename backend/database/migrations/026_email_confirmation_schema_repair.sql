-- Répare de manière idempotente le schéma nécessaire au flux de confirmation e-mail.
-- Cette migration couvre les bases historiques où 007_runtime_schema_consolidation
-- aurait pu être marquée appliquée alors que certains objets n'existent plus.

alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists receive_account_notifications boolean not null default false;

create table if not exists email_verification_tokens (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table email_verification_tokens add column if not exists user_id bigint;
alter table email_verification_tokens add column if not exists token_hash text;
alter table email_verification_tokens add column if not exists created_at timestamptz not null default now();
alter table email_verification_tokens add column if not exists expires_at timestamptz;
alter table email_verification_tokens add column if not exists used_at timestamptz;

create index if not exists idx_email_verification_tokens_user on email_verification_tokens(user_id);
create index if not exists idx_email_verification_tokens_hash on email_verification_tokens(token_hash);
