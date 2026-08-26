-- 004_gmail_email_normalization.sql
--
-- Objectif : Gmail ignore les points dans la partie locale d'une adresse et
-- tout ce qui suit un "+" (alias). "prenom.nom@gmail.com" et
-- "prenomnom@gmail.com" désignent donc la même boîte aux lettres, mais
-- l'application les comparait jusqu'ici littéralement (lower/trim
-- uniquement) : deux comptes distincts pouvaient être créés pour la même
-- personne, bloquant ensuite l'association compte <-> fiche grimpeur.
--
-- Cette fonction centralise la normalisation utilisée pour toute comparaison
-- d'identité par e-mail (association automatique, détection de doublon à
-- l'inscription). Elle ne modifie aucune donnée existante ni l'adresse
-- affichée/stockée telle quelle : uniquement la clé de comparaison.

create or replace function climbcrew_normalize_email(input text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  at_pos int;
  local_part text;
  domain_part text;
begin
  cleaned := lower(trim(coalesce(input, '')));
  if cleaned = '' then
    return '';
  end if;

  at_pos := position('@' in cleaned);
  if at_pos = 0 then
    return cleaned;
  end if;

  local_part := substr(cleaned, 1, at_pos - 1);
  domain_part := substr(cleaned, at_pos + 1);

  if domain_part = 'gmail.com' or domain_part = 'googlemail.com' then
    local_part := split_part(local_part, '+', 1);
    local_part := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  end if;

  return local_part || '@' || domain_part;
end;
$$;
