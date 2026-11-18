-- Les 👍 posés sur les messages système de réalisations deviennent des Kudos
-- de réalisation afin de conserver une source de vérité unique.
insert into realisation_kudos (realisation_id, participant_id, created_at)
select
  cm.event_ref,
  reaction.participant_id,
  min(reaction.created_at)
from chat_message_reactions reaction
join chat_messages cm on cm.id = reaction.message_id
join realisations realisation on realisation.id = cm.event_ref
where reaction.reaction = '👍'
  and cm.kind = 'system'
  and cm.event_type = 'realisation'
  and cm.event_ref is not null
  and reaction.participant_id::text <> realisation.participant_id::text
group by cm.event_ref, reaction.participant_id
on conflict (realisation_id, participant_id) do nothing;

-- Une fois repris dans realisation_kudos, ces 👍 ne doivent plus être stockés
-- une seconde fois comme réaction générique du chat.
delete from chat_message_reactions reaction
using chat_messages cm
where reaction.message_id = cm.id
  and reaction.reaction = '👍'
  and cm.kind = 'system'
  and cm.event_type = 'realisation'
  and cm.event_ref is not null;
