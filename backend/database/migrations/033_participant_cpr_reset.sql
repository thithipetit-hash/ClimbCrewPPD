-- Un reset du CPR ne modifie jamais les réalisations enregistrées.
alter table participants
  add column if not exists cpr_reset_at timestamptz;
