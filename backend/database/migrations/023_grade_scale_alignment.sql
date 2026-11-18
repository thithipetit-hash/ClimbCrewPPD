-- 023_grade_scale_alignment.sql
-- Aligne PostgreSQL sur la source de vérité partagée des cotations ClimbCrew.

alter table routes drop constraint if exists routes_cotation_reference_check;
alter table routes drop constraint if exists routes_cotation_ajustee_check;
alter table realisations drop constraint if exists realisations_cotation_proposee_check;

alter table routes add constraint routes_cotation_reference_check
  check (cotation_reference in (
    '4',
    '4a', '4a+', '4b', '4b+', '4c', '4c+',
    '5a', '5a+', '5b', '5b+', '5c', '5c+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+'
  )) not valid;

alter table routes add constraint routes_cotation_ajustee_check
  check (cotation_ajustee in (
    '4',
    '4a', '4a+', '4b', '4b+', '4c', '4c+',
    '5a', '5a+', '5b', '5b+', '5c', '5c+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+'
  )) not valid;

alter table realisations add constraint realisations_cotation_proposee_check
  check (
    cotation_proposee is null
    or cotation_proposee = ''
    or cotation_proposee in (
      '4',
      '4a', '4a+', '4b', '4b+', '4c', '4c+',
      '5a', '5a+', '5b', '5b+', '5c', '5c+',
      '6a', '6a+', '6b', '6b+', '6c', '6c+',
      '7a', '7a+', '7b', '7b+', '7c', '7c+'
    )
  ) not valid;
