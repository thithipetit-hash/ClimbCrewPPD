alter table buddy_availability
  add column if not exists preferences text[] not null default '{}';

update buddy_availability b
set preferences = (
  select coalesce(
    array_agg(day_value || ':' || slot_value order by day_order, slot_order),
    array[]::text[]
  )
  from unnest(b.days) with ordinality as day_item(day_value, day_order)
  cross join unnest(b.slots) with ordinality as slot_item(slot_value, slot_order)
)
where cardinality(b.preferences) = 0
  and cardinality(b.days) > 0
  and cardinality(b.slots) > 0;
