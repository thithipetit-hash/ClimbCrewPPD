alter table chat_messages
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_content bytea;

alter table chat_messages
  drop constraint if exists chat_messages_message_check;

alter table chat_messages
  add constraint chat_messages_message_or_attachment_check
  check (
    (char_length(message) between 1 and 2000)
    or attachment_content is not null
  );

alter table chat_messages
  add constraint chat_messages_attachment_size_check
  check (attachment_size is null or attachment_size between 1 and 10485760);
