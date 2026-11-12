export const THEME_PREFERENCE_KEY = "climbcrew-theme-preference";

export const THEME_OPTIONS = [
  { value: "auto", label: "Automatique" },
  { value: "craie_ardoise", label: "Craie & Ardoise" },
  { value: "ocean_mineral", label: "Océan minéral" },
  { value: "foret_mousse", label: "Forêt mousse" },
  { value: "terre_cuite", label: "Terre cuite" },
  { value: "aurore_alpine", label: "Aurore alpine" },
  { value: "lavande_nocturne", label: "Lavande nocturne" },
  { value: "sable_corde", label: "Sable & Corde" },
  { value: "bloc_neon", label: "Bloc néon" },
  { value: "glacier", label: "Glacier" },
  { value: "cristal", label: "Cristal" },
  { value: "daltonien", label: "Daltonien - contraste & motifs" },
];

const THEME_VALUES = THEME_OPTIONS.filter((option) => option.value !== "auto").map((option) => option.value);

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "craie_ardoise";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "lavande_nocturne" : "craie_ardoise";
}

export function resolveThemePreference(value) {
  if (THEME_VALUES.includes(value)) return value;
  if (value === "light") return "craie_ardoise";
  if (value === "dark") return "lavande_nocturne";
  if (value === "fun") return "bloc_neon";
  return getSystemTheme();
}
