-- 001_integrity_constraints.sql
--
-- Objectif : rapprocher le schéma historique du modèle relationnel réel sans
-- rendre le démarrage impossible en présence d'une ancienne référence invalide.
-- Les conversions text -> bigint ne sont effectuées que si toutes les valeurs
-- existantes sont convertibles et pointent vers un participant présent.

alter table participants add column if not exists email text not null default '';
alter table participants add column if not exists sexe text not null default '';
alter table participants add column if not exists login_email text;
alter table participants add column if not exists avatar_id text not null default 'gecko';
alter table participants add column if not exists crest_id text not null default 'cristal';
alter table participants add column if not exists profile_public boolean not null default true;
alter table participants add column if not exists custom_avatar_image text not null default '';

alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists pending_email text;
alter table users add column if not exists theme_preference text not null default 'auto';

alter table routes add column if not exists tags text[] not null default '{}';
alter table realisations add column if not exists rating integer check (rating between 1 and 5);
alter table realisations add column if not exists tags text[] not null default '{}';
alter table realisations add column if not exists chute boolean not null default false;
alter table realisations add column if not exists assureur_id text;

create table if not exists route_ratings (
  route_id text not null references routes(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (route_id, user_id)
);

create index if not exists idx_route_ratings_route on route_ratings(route_id);

-- Relations déjà compatibles en type : elles sont ajoutées NOT VALID afin de
-- protéger immédiatement les nouvelles écritures sans rejeter une base qui
-- contiendrait une ancienne référence orpheline.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'realisations'::regclass and conname = 'fk_realisations_session'
  ) then
    alter table realisations
      add constraint fk_realisations_session
      foreign key (session_id) references sessions(id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'realisations'::regclass and conname = 'fk_realisations_route'
  ) then
    alter table realisations
      add constraint fk_realisations_route
      foreign key (voie_id) references routes(id)
      on delete cascade not valid;
  end if;
end $$;

-- Valide les contraintes précédentes quand l'historique est déjà propre.
do $$
begin
  if not exists (
    select 1
    from realisations r
    left join sessions s on s.id = r.session_id
    where s.id is null
  ) then
    alter table realisations validate constraint fk_realisations_session;
  else
    raise warning 'Des réalisations référencent une séance absente : fk_realisations_session reste NOT VALID pour l historique.';
  end if;

  if not exists (
    select 1
    from realisations r
    left join routes v on v.id = r.voie_id
    where v.id is null
  ) then
    alter table realisations validate constraint fk_realisations_route;
  else
    raise warning 'Des réalisations référencent une voie absente : fk_realisations_route reste NOT VALID pour l historique.';
  end if;
end $$;

-- session_participants.participant_id : conversion vers bigint + vraie FK si
-- toutes les références historiques sont propres.
do $$
declare
  current_type text;
  has_invalid boolean := false;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'session_participants'
    and column_name = 'participant_id';

  if current_type = 'text' then
    execute $q$
      select exists (
        select 1
        from session_participants sp
        left join participants p
          on p.id = case
            when trim(sp.participant_id) ~ '^[0-9]+$' then trim(sp.participant_id)::bigint
            else null
          end
        where trim(sp.participant_id) !~ '^[0-9]+$' or p.id is null
      )
    $q$ into has_invalid;

    if not has_invalid then
      alter table session_participants
        alter column participant_id type bigint
        using trim(participant_id)::bigint;
      current_type := 'bigint';
    else
      raise warning 'session_participants contient des participant_id invalides : conversion bigint différée.';
    end if;
  end if;

  if current_type = 'bigint' and not exists (
    select 1 from pg_constraint
    where conrelid = 'session_participants'::regclass
      and conname = 'fk_session_participants_participant'
  ) then
    alter table session_participants
      add constraint fk_session_participants_participant
      foreign key (participant_id) references participants(id)
      on delete cascade;
  end if;
end $$;

-- Encadrant et référent : les références deviennent des bigint et sont remises
-- à NULL automatiquement si le grimpeur correspondant est supprimé.
do $$
declare
  current_type text;
  has_invalid boolean := false;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'sessions'
    and column_name = 'encadrant_id';

  if current_type = 'text' then
    execute $q$
      select exists (
        select 1
        from sessions s
        left join participants p
          on p.id = case
            when s.encadrant_id is null then null
            when trim(s.encadrant_id) ~ '^[0-9]+$' then trim(s.encadrant_id)::bigint
            else null
          end
        where s.encadrant_id is not null
          and (trim(s.encadrant_id) !~ '^[0-9]+$' or p.id is null)
      )
    $q$ into has_invalid;

    if not has_invalid then
      alter table sessions
        alter column encadrant_id type bigint
        using nullif(trim(encadrant_id), '')::bigint;
      current_type := 'bigint';
    else
      raise warning 'sessions.encadrant_id contient des références invalides : conversion bigint différée.';
    end if;
  end if;

  if current_type = 'bigint' and not exists (
    select 1 from pg_constraint
    where conrelid = 'sessions'::regclass and conname = 'fk_sessions_encadrant'
  ) then
    alter table sessions
      add constraint fk_sessions_encadrant
      foreign key (encadrant_id) references participants(id)
      on delete set null;
  end if;
end $$;

do $$
declare
  current_type text;
  has_invalid boolean := false;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'sessions'
    and column_name = 'referent_id';

  if current_type = 'text' then
    execute $q$
      select exists (
        select 1
        from sessions s
        left join participants p
          on p.id = case
            when s.referent_id is null then null
            when trim(s.referent_id) ~ '^[0-9]+$' then trim(s.referent_id)::bigint
            else null
          end
        where s.referent_id is not null
          and (trim(s.referent_id) !~ '^[0-9]+$' or p.id is null)
      )
    $q$ into has_invalid;

    if not has_invalid then
      alter table sessions
        alter column referent_id type bigint
        using nullif(trim(referent_id), '')::bigint;
      current_type := 'bigint';
    else
      raise warning 'sessions.referent_id contient des références invalides : conversion bigint différée.';
    end if;
  end if;

  if current_type = 'bigint' and not exists (
    select 1 from pg_constraint
    where conrelid = 'sessions'::regclass and conname = 'fk_sessions_referent'
  ) then
    alter table sessions
      add constraint fk_sessions_referent
      foreign key (referent_id) references participants(id)
      on delete set null;
  end if;
end $$;

-- Réalisation -> grimpeur : CASCADE correspond au comportement historique de
-- suppression d'un participant. Assureur -> participant : SET NULL préserve la
-- réalisation si l'ancien assureur est supprimé.
do $$
declare
  current_type text;
  has_invalid boolean := false;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'realisations'
    and column_name = 'participant_id';

  if current_type = 'text' then
    execute $q$
      select exists (
        select 1
        from realisations r
        left join participants p
          on p.id = case
            when trim(r.participant_id) ~ '^[0-9]+$' then trim(r.participant_id)::bigint
            else null
          end
        where trim(r.participant_id) !~ '^[0-9]+$' or p.id is null
      )
    $q$ into has_invalid;

    if not has_invalid then
      alter table realisations
        alter column participant_id type bigint
        using trim(participant_id)::bigint;
      current_type := 'bigint';
    else
      raise warning 'realisations.participant_id contient des références invalides : conversion bigint différée.';
    end if;
  end if;

  if current_type = 'bigint' and not exists (
    select 1 from pg_constraint
    where conrelid = 'realisations'::regclass and conname = 'fk_realisations_participant'
  ) then
    alter table realisations
      add constraint fk_realisations_participant
      foreign key (participant_id) references participants(id)
      on delete cascade;
  end if;
end $$;

do $$
declare
  current_type text;
  has_invalid boolean := false;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = current_schema()
    and table_name = 'realisations'
    and column_name = 'assureur_id';

  if current_type = 'text' then
    execute $q$
      select exists (
        select 1
        from realisations r
        left join participants p
          on p.id = case
            when r.assureur_id is null then null
            when trim(r.assureur_id) ~ '^[0-9]+$' then trim(r.assureur_id)::bigint
            else null
          end
        where r.assureur_id is not null
          and (trim(r.assureur_id) !~ '^[0-9]+$' or p.id is null)
      )
    $q$ into has_invalid;

    if not has_invalid then
      alter table realisations
        alter column assureur_id type bigint
        using nullif(trim(assureur_id), '')::bigint;
      current_type := 'bigint';
    else
      raise warning 'realisations.assureur_id contient des références invalides : conversion bigint différée.';
    end if;
  end if;

  if current_type = 'bigint' and not exists (
    select 1 from pg_constraint
    where conrelid = 'realisations'::regclass and conname = 'fk_realisations_assureur'
  ) then
    alter table realisations
      add constraint fk_realisations_assureur
      foreign key (assureur_id) references participants(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_realisations_participant on realisations(participant_id);
create index if not exists idx_realisations_session on realisations(session_id);
create index if not exists idx_realisations_voie on realisations(voie_id);
create index if not exists idx_session_participants_participant on session_participants(participant_id);
