-- Les badges de challenge portent le nom du challenge plutôt que le libellé générique "Challenge".
-- Cette migration met également à niveau les badges déjà attribués par la version précédente.
update participant_badges
   set label = metadata->>'challengeName'
 where badge_type = 'challenge'
   and source_type = 'challenge'
   and btrim(coalesce(metadata->>'challengeName', '')) <> '';
