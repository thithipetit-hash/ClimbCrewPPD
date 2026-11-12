-- Année de naissance facultative : la catégorie FFME est calculée, non stockée,
-- pour suivre automatiquement la saison sportive de septembre à août.
alter table participants
  add column if not exists annee_naissance integer
    check (annee_naissance is null or annee_naissance between 1900 and 2100);
