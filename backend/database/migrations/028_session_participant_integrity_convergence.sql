-- Converge les relations du planning qui pouvaient rester sans contrainte
-- sur une base historique lorsque la migration 001 avait rencontré des données invalides.
-- Les valeurs vides des rôles optionnels sont normalisées à NULL ; toute autre
-- incohérence est signalée explicitement plutôt que corrigée de façon destructive.

do $$
declare
  current_type text;
  invalid_count bigint;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'session_participants'
    and column_name = 'participant_id';

  if current_type in ('text', 'character varying') then
    execute $q$
      select count(*)
      from session_participants sp
      left join participants p
        on p.id = case
          when trim(sp.participant_id) ~ '^[0-9]+$' then trim(sp.participant_id)::bigint
          else null
        end
      where trim(sp.participant_id) !~ '^[0-9]+$' or p.id is null
    $q$ into invalid_count;

    if invalid_count > 0 then
      raise exception
        'Convergence impossible : % inscription(s) de séance référencent un participant invalide.',
        invalid_count;
    end if;

    alter table session_participants
      alter column participant_id type bigint
      using trim(participant_id)::bigint;
    current_type := 'bigint';
  end if;

  if current_type <> 'bigint' then
    raise exception
      'Convergence impossible : type inattendu pour session_participants.participant_id : %.',
      coalesce(current_type, '<absent>');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'session_participants'::regclass
      and conname = 'fk_session_participants_participant'
  ) then
    alter table session_participants
      add constraint fk_session_participants_participant
      foreign key (participant_id) references participants(id)
      on delete cascade not valid;
  end if;

  alter table session_participants
    validate constraint fk_session_participants_participant;
end $$;

do $$
declare
  current_type text;
  invalid_count bigint;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'sessions'
    and column_name = 'encadrant_id';

  if current_type in ('text', 'character varying') then
    update sessions
    set encadrant_id = null
    where encadrant_id is not null and trim(encadrant_id) = '';

    execute $q$
      select count(*)
      from sessions s
      left join participants p
        on p.id = case
          when s.encadrant_id is not null and trim(s.encadrant_id) ~ '^[0-9]+$'
            then trim(s.encadrant_id)::bigint
          else null
        end
      where s.encadrant_id is not null
        and (trim(s.encadrant_id) !~ '^[0-9]+$' or p.id is null)
    $q$ into invalid_count;

    if invalid_count > 0 then
      raise exception
        'Convergence impossible : % séance(s) référencent un encadrant invalide.',
        invalid_count;
    end if;

    alter table sessions
      alter column encadrant_id type bigint
      using nullif(trim(encadrant_id), '')::bigint;
    current_type := 'bigint';
  end if;

  if current_type <> 'bigint' then
    raise exception
      'Convergence impossible : type inattendu pour sessions.encadrant_id : %.',
      coalesce(current_type, '<absent>');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'sessions'::regclass
      and conname = 'fk_sessions_encadrant'
  ) then
    alter table sessions
      add constraint fk_sessions_encadrant
      foreign key (encadrant_id) references participants(id)
      on delete set null not valid;
  end if;

  alter table sessions validate constraint fk_sessions_encadrant;
end $$;

do $$
declare
  current_type text;
  invalid_count bigint;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'sessions'
    and column_name = 'referent_id';

  if current_type in ('text', 'character varying') then
    update sessions
    set referent_id = null
    where referent_id is not null and trim(referent_id) = '';

    execute $q$
      select count(*)
      from sessions s
      left join participants p
        on p.id = case
          when s.referent_id is not null and trim(s.referent_id) ~ '^[0-9]+$'
            then trim(s.referent_id)::bigint
          else null
        end
      where s.referent_id is not null
        and (trim(s.referent_id) !~ '^[0-9]+$' or p.id is null)
    $q$ into invalid_count;

    if invalid_count > 0 then
      raise exception
        'Convergence impossible : % séance(s) référencent un référent invalide.',
        invalid_count;
    end if;

    alter table sessions
      alter column referent_id type bigint
      using nullif(trim(referent_id), '')::bigint;
    current_type := 'bigint';
  end if;

  if current_type <> 'bigint' then
    raise exception
      'Convergence impossible : type inattendu pour sessions.referent_id : %.',
      coalesce(current_type, '<absent>');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'sessions'::regclass
      and conname = 'fk_sessions_referent'
  ) then
    alter table sessions
      add constraint fk_sessions_referent
      foreign key (referent_id) references participants(id)
      on delete set null not valid;
  end if;

  alter table sessions validate constraint fk_sessions_referent;
end $$;
