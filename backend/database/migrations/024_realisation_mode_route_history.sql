-- Sépare définitivement le mode de réalisation de l'ancien champ nb_essais
-- et protège l'historique lorsqu'une voie est retirée.
alter table realisations add column if not exists mode_realisation text;

update realisations
set mode_realisation = case
  when lower(trim(coalesce(nb_essais, ''))) in ('en_tete', 'moulinette')
    then lower(trim(nb_essais))
  when lower(trim(coalesce(style_realisation, ''))) = 'moulinette'
    then 'moulinette'
  else 'en_tete'
end
where mode_realisation is null
   or lower(trim(mode_realisation)) not in ('en_tete', 'moulinette');

-- Les valeurs sentinelles introduites pendant la compatibilité redeviennent
-- NULL afin que nb_essais retrouve son sens historique.
update realisations
set nb_essais = null
where lower(trim(coalesce(nb_essais, ''))) in ('en_tete', 'moulinette');

alter table realisations
  alter column mode_realisation set default 'en_tete';
alter table realisations
  alter column mode_realisation set not null;
alter table realisations
  drop constraint if exists realisations_mode_realisation_check;
alter table realisations
  add constraint realisations_mode_realisation_check
  check (mode_realisation in ('en_tete', 'moulinette'));

-- Une voie portant un historique ne doit plus pouvoir être supprimée par
-- cascade. L'API la désactive à la place.
alter table realisations
  drop constraint if exists fk_realisations_route;
alter table realisations
  add constraint fk_realisations_route
  foreign key (voie_id) references routes(id)
  on delete restrict not valid;

do $$
begin
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
