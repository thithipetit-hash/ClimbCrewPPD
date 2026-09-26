export const BUDDY_DAYS = [
  { value: "Lun", label: "Lundi" },
  { value: "Mar", label: "Mardi" },
  { value: "Mer", label: "Mercredi" },
  { value: "Jeu", label: "Jeudi" },
  { value: "Ven", label: "Vendredi" },
];

export const BUDDY_SLOTS = [
  { value: "matin", label: "Matin" },
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
];

const VALID_PREFERENCES = new Set(
  BUDDY_DAYS.flatMap((day) => BUDDY_SLOTS.map((slot) => `${day.value}:${slot.value}`)),
);

export function buddyPreferenceKey(day, slot) {
  return `${day}:${slot}`;
}

const BUDDY_DAY_BY_WEEKDAY = {
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
};

export function buddyPreferenceKeyForSession(date, slot) {
  const normalizedSlot = String(slot || "").trim().toLowerCase();
  if (!BUDDY_SLOTS.some((item) => item.value === normalizedSlot)) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!match) return "";

  const [, year, month, day] = match;
  const sessionDate = new Date(Number(year), Number(month) - 1, Number(day), 12);
  const buddyDay = BUDDY_DAY_BY_WEEKDAY[sessionDate.getDay()];
  return buddyDay ? buddyPreferenceKey(buddyDay, normalizedSlot) : "";
}

export function hasBuddyAvailabilityForSession(preferencesByParticipantId, participantId, session) {
  const sessionPreference = buddyPreferenceKeyForSession(session?.date, session?.slot);
  if (!sessionPreference) return false;

  const participantPreferences = preferencesByParticipantId?.[String(participantId)];
  return Array.isArray(participantPreferences) && participantPreferences.includes(sessionPreference);
}

export function normalizeBuddyPreferences(preferences) {
  return [...new Set((Array.isArray(preferences) ? preferences : []).map(String).filter((value) => VALID_PREFERENCES.has(value)))];
}

export function buddyPreferencesFromAvailability(availability = {}) {
  if (Array.isArray(availability.preferences)) {
    return normalizeBuddyPreferences(availability.preferences);
  }
  const days = new Set(Array.isArray(availability.days) ? availability.days : []);
  const slots = new Set(Array.isArray(availability.slots) ? availability.slots : []);
  return BUDDY_DAYS.flatMap((day) => BUDDY_SLOTS
    .filter((slot) => days.has(day.value) && slots.has(slot.value))
    .map((slot) => buddyPreferenceKey(day.value, slot.value)));
}

export function formatBuddyPreferences(availability = {}) {
  const selected = new Set(buddyPreferencesFromAvailability(availability));
  return BUDDY_DAYS.map((day) => {
    const slots = BUDDY_SLOTS
      .filter((slot) => selected.has(buddyPreferenceKey(day.value, slot.value)))
      .map((slot) => slot.label);
    return slots.length ? `${day.label} : ${slots.join(", ")}` : "";
  }).filter(Boolean).join(" · ");
}
