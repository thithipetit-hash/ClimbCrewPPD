function participantIdFromRequest(req) {
  return req.auth?.user?.participantId || req.enhancementAuth?.user?.participantId || null;
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOTS = ["matin", "midi", "soir"];
const DAY_SET = new Set(DAYS);
const SLOT_SET = new Set(SLOTS);
const PREFERENCE_SET = new Set(DAYS.flatMap((day) => SLOTS.map((slot) => `${day}:${slot}`)));

function cleanList(value, allowed) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter((item) => allowed.has(item)))];
}

export function legacyBuddyPreferences(days, slots) {
  const cleanedDays = cleanList(days, DAY_SET);
  const cleanedSlots = cleanList(slots, SLOT_SET);
  return cleanedDays.flatMap((day) => cleanedSlots.map((slot) => `${day}:${slot}`));
}

export function cleanBuddyPreferences(value) {
  return cleanList(value, PREFERENCE_SET);
}

export function legacyBuddyLists(preferences) {
  const cleanedPreferences = cleanBuddyPreferences(preferences);
  return {
    days: [...new Set(cleanedPreferences.map((preference) => preference.split(":")[0]))],
    slots: [...new Set(cleanedPreferences.map((preference) => preference.split(":")[1]))],
  };
}

function normalizeAvailability(row = {}) {
  const preferences = cleanBuddyPreferences(
    Array.isArray(row.preferences) ? row.preferences : legacyBuddyPreferences(row.days, row.slots),
  );
  const { days, slots } = legacyBuddyLists(preferences);
  return { preferences, days, slots, note: String(row.note || "") };
}

export function installBuddyRoutes(app, { requireAuth, pool }) {
  app.get("/buddy/me", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    if (!participantId) return res.status(400).json({ error: "Compte non associé à un grimpeur." });
    const { rows } = await pool.query(
      `select days, slots, preferences, note from buddy_availability where participant_id = $1`, [participantId]
    );
    res.json(normalizeAvailability(rows[0]));
  });

  app.put("/buddy/me", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    if (!participantId) return res.status(400).json({ error: "Compte non associé à un grimpeur." });
    const preferences = cleanBuddyPreferences(
      Array.isArray(req.body?.preferences)
        ? req.body.preferences
        : legacyBuddyPreferences(req.body?.days, req.body?.slots),
    );
    const { days, slots } = legacyBuddyLists(preferences);
    const note = String(req.body?.note || "").trim().slice(0, 240);
    const { rows } = await pool.query(
      `insert into buddy_availability (participant_id, days, slots, preferences, note, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (participant_id) do update set days=excluded.days, slots=excluded.slots, preferences=excluded.preferences, note=excluded.note, updated_at=now()
       returning days, slots, preferences, note`, [participantId, days, slots, preferences, note]
    );
    res.json(normalizeAvailability(rows[0]));
  });

  app.get("/buddy", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    const { rows } = await pool.query(
      `select b.participant_id as "participantId",
              trim(concat_ws(' ', p.prenom, p.nom)) as name,
              b.days, b.slots, b.preferences, b.note
       from buddy_availability b
       join participants p on p.id = b.participant_id
       where b.participant_id <> $1
         and cardinality(b.preferences) > 0
       order by p.prenom, p.nom`, [participantId]
    );
    res.json(rows.map((row) => ({ ...row, ...normalizeAvailability(row) })));
  });
}
