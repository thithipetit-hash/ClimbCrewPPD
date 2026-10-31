-- 030_passport_color_discovery.sql
-- Sépare la couleur du passeport de l'option Découverte sans changer
-- la valeur historique "sans", affichée dans l'interface comme Gris clair.

alter table participants
  add column if not exists passport_decouverte boolean not null default false;

update participants
set passport_decouverte = true
where lower(trim(passport)) in ('decouverte', 'decouvertes', 'découverte', 'découvertes')
   or lower(trim(passport)) ~ '_d$';

update participants
set passport = case
  when lower(trim(passport)) in ('', 'gris', 'decouverte', 'decouvertes', 'découverte', 'découvertes')
    then 'sans'
  when lower(trim(passport)) ~ '_d$'
    then regexp_replace(lower(trim(passport)), '_d$', '')
  else lower(trim(passport))
end;
