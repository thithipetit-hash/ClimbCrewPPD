-- Réactions et messages automatiques du chat.
alter table chat_messages
  add column if not exists kind text not null default 'user',
  add column if not exists event_type text,
  add column if not exists event_ref text;

create table if not exists chat_message_reactions (
  message_id bigint not null references chat_messages(id) on delete cascade,
  participant_id bigint not null references participants(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (message_id, participant_id, reaction)
);

create index if not exists chat_message_reactions_message_idx
  on chat_message_reactions (message_id);
