-- 003_route_grade_scale.sql
--
-- Objectif : aligner les contraintes de vérification des cotations de voies
-- (cotation_reference / cotation_ajustee) sur l'échelle actuelle de
-- l'application (GRADES dans backend/validation.js et
-- frontend/src/lib/domain.js), qui inclut désormais "4", "5a+", "5b+",
-- "5c+" et "7c" en plus des valeurs déjà acceptées.
--
-- La contrainte existante (routes_cotation_ajustee_check) n'était tracée
-- dans aucune migration versionnée : dérive de schéma constatée lors d'un
-- import réel bloqué par l'ancienne échelle. Recréées en NOT VALID, comme
-- dans 001_integrity_constraints.sql, afin de ne jamais faire échouer le
-- démarrage sur une base contenant d'anciennes valeurs, tout en imposant
-- la nouvelle échelle à chaque écriture à partir de maintenant.

alter table routes drop constraint if exists routes_cotation_reference_check;
alter table routes drop constraint if exists routes_cotation_ajustee_check;

alter table routes add constraint routes_cotation_reference_check
  check (cotation_reference in (
    '4', '4a', '4b', '4c', '5a', '5a+', '5b', '5b+', '5c', '5c+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7c'
  )) not valid;

alter table routes add constraint routes_cotation_ajustee_check
  check (cotation_ajustee in (
    '4', '4a', '4b', '4c', '5a', '5a+', '5b', '5b+', '5c', '5c+',
    '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7c'
  )) not valid;
