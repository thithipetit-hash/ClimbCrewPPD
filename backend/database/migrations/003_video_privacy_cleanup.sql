-- 003_video_privacy_cleanup.sql
--
-- Sépare les vidéos de voie, partagées au niveau du club, des vidéos chargées
-- depuis une réalisation personnelle. Les anciennes versions ajoutaient aussi
-- ces dernières dans routes.video_urls, ce qui pouvait contourner la
-- confidentialité du profil.

alter table routes
  add column if not exists video_urls text[] not null default '{}';

alter table realisations
  add column if not exists video_urls jsonb not null default '[]'::jsonb;

create table if not exists route_videos (
  id text primary key,
  route_id text not null references routes(id) on delete cascade,
  file_name text not null default 'video',
  mime_type text not null,
  content bytea not null,
  source_realisation_id text,
  created_at timestamptz not null default now()
);

alter table route_videos
  add column if not exists source_realisation_id text;

create index if not exists idx_route_videos_route
  on route_videos(route_id);

create index if not exists idx_route_videos_source_realisation
  on route_videos(source_realisation_id);

-- Retire rétroactivement des voies les URLs des vidéos personnelles. La
-- comparaison utilise l'identifiant vidéo, dernier segment de l'URL interne,
-- afin de rester correcte même si l'identifiant de voie a été URL-encodé.
update routes r
set video_urls = coalesce((
  select array_agg(item.url order by item.ordinality)
  from unnest(coalesce(r.video_urls, '{}'::text[])) with ordinality as item(url, ordinality)
  where not exists (
    select 1
    from route_videos rv
    where rv.route_id = r.id
      and rv.source_realisation_id is not null
      and split_part(item.url, '/videos/', 2) = rv.id
  )
), '{}'::text[])
where exists (
  select 1
  from unnest(coalesce(r.video_urls, '{}'::text[])) as current_url
  join route_videos rv
    on rv.route_id = r.id
   and rv.source_realisation_id is not null
   and split_part(current_url, '/videos/', 2) = rv.id
);

-- Une vidéo personnelle ne doit pas rester attachée à la réalisation d'un
-- autre grimpeur. Ce nettoyage corrige les références croisées héritées des
-- versions où les vidéos personnelles apparaissaient dans la liste de la voie.
update realisations re
set video_urls = coalesce((
  select jsonb_agg(item.url order by item.ordinality)
  from jsonb_array_elements_text(coalesce(re.video_urls, '[]'::jsonb))
       with ordinality as item(url, ordinality)
  where not exists (
    select 1
    from route_videos rv
    where rv.source_realisation_id is not null
      and rv.source_realisation_id <> re.id
      and split_part(item.url, '/videos/', 2) = rv.id
  )
), '[]'::jsonb)
where exists (
  select 1
  from jsonb_array_elements_text(coalesce(re.video_urls, '[]'::jsonb)) as current_item(url)
  join route_videos rv
    on rv.source_realisation_id is not null
   and rv.source_realisation_id <> re.id
   and split_part(current_item.url, '/videos/', 2) = rv.id
);

-- Empêche toute réintroduction future d'une vidéo personnelle dans la liste
-- partagée d'une voie, y compris via une ancienne version du backend.
create or replace function climbcrew_filter_private_route_videos()
returns trigger
language plpgsql
as $$
begin
  new.video_urls := coalesce((
    select array_agg(item.url order by item.ordinality)
    from unnest(coalesce(new.video_urls, '{}'::text[])) with ordinality as item(url, ordinality)
    where not exists (
      select 1
      from route_videos rv
      where rv.route_id = new.id
        and rv.source_realisation_id is not null
        and split_part(item.url, '/videos/', 2) = rv.id
    )
  ), '{}'::text[]);
  return new;
end;
$$;

drop trigger if exists trg_climbcrew_filter_private_route_videos on routes;
create trigger trg_climbcrew_filter_private_route_videos
before insert or update of video_urls on routes
for each row execute function climbcrew_filter_private_route_videos();

-- Quand un fichier vidéo disparaît, toutes ses références applicatives sont
-- retirées. Cela évite les URLs orphelines dans les voies et réalisations.
create or replace function climbcrew_cleanup_deleted_route_video()
returns trigger
language plpgsql
as $$
begin
  update routes r
  set video_urls = coalesce((
    select array_agg(item.url order by item.ordinality)
    from unnest(coalesce(r.video_urls, '{}'::text[])) with ordinality as item(url, ordinality)
    where split_part(item.url, '/videos/', 2) <> old.id
  ), '{}'::text[]),
      updated_at = now()
  where r.id = old.route_id;

  update realisations re
  set video_urls = coalesce((
    select jsonb_agg(item.url order by item.ordinality)
    from jsonb_array_elements_text(coalesce(re.video_urls, '[]'::jsonb))
         with ordinality as item(url, ordinality)
    where split_part(item.url, '/videos/', 2) <> old.id
  ), '[]'::jsonb),
      updated_at = now()
  where exists (
    select 1
    from jsonb_array_elements_text(coalesce(re.video_urls, '[]'::jsonb)) as current_item(url)
    where split_part(current_item.url, '/videos/', 2) = old.id
  );

  return old;
end;
$$;

drop trigger if exists trg_climbcrew_cleanup_deleted_route_video on route_videos;
create trigger trg_climbcrew_cleanup_deleted_route_video
after delete on route_videos
for each row execute function climbcrew_cleanup_deleted_route_video();

-- La suppression d'une réalisation supprime également les fichiers qu'elle a
-- elle-même chargés. Le trigger précédent nettoie ensuite toutes leurs URLs.
create or replace function climbcrew_cleanup_realisation_videos()
returns trigger
language plpgsql
as $$
begin
  delete from route_videos
  where source_realisation_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_climbcrew_cleanup_realisation_videos_delete on realisations;
create trigger trg_climbcrew_cleanup_realisation_videos_delete
after delete on realisations
for each row execute function climbcrew_cleanup_realisation_videos();

-- Si une réalisation est déplacée vers une autre voie, ses fichiers personnels
-- de l'ancienne voie ne doivent pas rester accessibles sous l'ancien contexte.
drop trigger if exists trg_climbcrew_cleanup_realisation_videos_route_change on realisations;
create trigger trg_climbcrew_cleanup_realisation_videos_route_change
after update of voie_id on realisations
for each row
when (old.voie_id is distinct from new.voie_id)
execute function climbcrew_cleanup_realisation_videos();
