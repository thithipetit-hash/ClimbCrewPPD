-- Répare de manière idempotente la fonction de normalisation utilisée par
-- /auth/request-access. Certaines bases historiques peuvent avoir enregistré
-- 004_gmail_email_normalization.sql comme appliquée alors que la fonction
-- PostgreSQL n'existe plus.
--
-- La logique est volontairement identique à la migration 004 afin de conserver
-- une seule règle fonctionnelle de normalisation des adresses Gmail.

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
