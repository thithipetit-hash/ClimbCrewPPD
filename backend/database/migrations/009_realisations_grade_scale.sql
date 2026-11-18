-- 009_realisations_grade_scale.sql
-- Aligne la contrainte des cotations proposées avec l'échelle actuelle de l'application.

alter table realisations drop constraint if exists realisations_cotation_proposee_check;

alter table realisations add constraint realisations_cotation_proposee_check
  check (
    cotation_proposee is null
    or cotation_proposee = ''
    or cotation_proposee in (
      '4', '4a', '4b', '4c', '5a', '5a+', '5b', '5b+', '5c', '5c+',
      '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7c'
    )
  ) not valid;
