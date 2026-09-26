alter table buddy_availability
  add column if not exists availability_keys text[] not null default '{}';

update buddy_availability
set availability_keys = (
  select coalesce(array_agg(day || ':' || slot order by day_position, slot_position), '{}')
  from unnest(array['Lun','Mar','Mer','Jeu','Ven']) with ordinality as d(day, day_position)
  cross join unnest(array['matin','midi','soir']) with ordinality as s(slot, slot_position)
  where day = any(buddy_availability.days)
    and slot = any(buddy_availability.slots)
)
where cardinality(availability_keys) = 0
  and cardinality(days) > 0
  and cardinality(slots) > 0;
