function participantIdFromRequest(req) {
  return req.auth?.user?.participantId || req.enhancementAuth?.user?.participantId || null;
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const SLOTS = ["matin", "midi", "soir"];
const AVAILABILITY_KEYS = new Set(DAYS.flatMap((day) => SLOTS.map((slot) => `${day}:${slot}`)));

function cleanAvailabilityKeys(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter((item) => AVAILABILITY_KEYS.has(item)))];
}

function legacyAvailabilityKeys(days, slots) {
  return DAYS
    .filter((day) => Array.isArray(days) && days.includes(day))
    .flatMap((day) => SLOTS
      .filter((slot) => Array.isArray(slots) && slots.includes(slot))
      .map((slot) => `${day}:${slot}`));
}

function availabilityFromRow(row) {
  const availabilityKeys = row?.availability_keys?.length
    ? cleanAvailabilityKeys(row.availability_keys)
    : legacyAvailabilityKeys(row?.days, row?.slots);
  return { availabilityKeys, note: row?.note || "" };
}

export function installBuddyRoutes(app, { requireAuth, pool }) {
  app.get("/buddy/me", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    if (!participantId) return res.status(400).json({ error: "Compte non associé à un grimpeur." });
    const { rows } = await pool.query(
      `select days, slots, availability_keys, note from buddy_availability where participant_id = $1`, [participantId]
    );
    res.json(availabilityFromRow(rows[0]));
  });

  app.put("/buddy/me", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    if (!participantId) return res.status(400).json({ error: "Compte non associé à un grimpeur." });
    const availabilityKeys = cleanAvailabilityKeys(req.body?.availabilityKeys);
    const note = String(req.body?.note || "").trim().slice(0, 240);
    const { rows } = await pool.query(
      `insert into buddy_availability (participant_id, availability_keys, note, updated_at)
       values ($1,$2,$3,now())
       on conflict (participant_id) do update set availability_keys=excluded.availability_keys, note=excluded.note, updated_at=now()
       returning days, slots, availability_keys, note`, [participantId, availabilityKeys, note]
    );
    res.json(availabilityFromRow(rows[0]));
  });

  app.get("/buddy", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    const { rows } = await pool.query(
      `select b.participant_id as "participantId",
              trim(concat_ws(' ', p.prenom, p.nom)) as name,
              b.days, b.slots, b.availability_keys, b.note
       from buddy_availability b
       join participants p on p.id = b.participant_id
       where b.participant_id <> $1
         and (cardinality(b.availability_keys) > 0
           or (cardinality(b.days) > 0 and cardinality(b.slots) > 0))
       order by p.prenom, p.nom`, [participantId]
    );
    res.json(rows.map((row) => ({ participantId: row.participantId, name: row.name, ...availabilityFromRow(row) })));
  });
}
