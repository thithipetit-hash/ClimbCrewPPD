alter table chat_messages add column if not exists edited_at timestamptz;
alter table chat_messages add column if not exists pinned boolean not null default false;
alter table chat_messages add column if not exists poll jsonb;
create index if not exists chat_messages_pinned_idx on chat_messages(pinned, created_at desc);
