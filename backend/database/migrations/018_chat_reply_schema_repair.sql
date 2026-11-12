-- Répare les bases PPD où le suivi historique des migrations peut indiquer
-- les réponses comme appliquées alors que la colonne n'est pas présente.
-- La migration 022 reste historique ; cette migration séquentielle rend
-- explicitement le schéma nécessaire aux réponses idempotent.
alter table chat_messages
  add column if not exists reply_to_id bigint references chat_messages(id) on delete set null;

create index if not exists chat_messages_reply_to_idx
  on chat_messages (reply_to_id);
