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

export const BUDDY_DAY_VALUES = BUDDY_DAYS.map((day) => day.value);
export const BUDDY_SLOT_VALUES = BUDDY_SLOTS.map((slot) => slot.value);
export const BUDDY_PREFERENCE_VALUES = BUDDY_DAY_VALUES.flatMap(
  (day) => BUDDY_SLOT_VALUES.map((slot) => `${day}:${slot}`),
);
