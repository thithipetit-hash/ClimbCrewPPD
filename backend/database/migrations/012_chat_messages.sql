create table if not exists chat_messages (
  id bigserial primary key,
  participant_id bigint not null references participants(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at_idx
  on chat_messages (created_at desc);
