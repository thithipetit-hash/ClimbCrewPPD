export const PASSPORT_STYLES = {
  sans: { backgroundColor: "#334155", color: "#f8fafc" },
  jaune: { backgroundColor: "#fde047", color: "#111827" },
  orange: { backgroundColor: "#fb923c", color: "#111827" },
  vert: { backgroundColor: "#22c55e", color: "#052e16" },
  bleu: { backgroundColor: "#60a5fa", color: "#0f172a" },

  decouverte: { backgroundColor: "#64748b", color: "#ffffff" },
  "découverte": { backgroundColor: "#64748b", color: "#ffffff" },
  decouvertes: { backgroundColor: "#64748b", color: "#ffffff" },
  "découvertes": { backgroundColor: "#64748b", color: "#ffffff" },
};

export const ROPE_NUMBERS = Array.from({ length: 22 }, (_, index) => index);

export const ROUTE_COLORS = ["Blanc", "Bleu", "Gris", "Jaune", "Marron", "Noir", "Ocre", "Orange", "Rose", "Rouge", "Vert", "Violet"];

export const STYLE_LABELS = {
  a_vue: "À vue",
  flash: "Flash",
  en_tete: "En tête",
  moulinette: "En moulinette",
  avec_repos: "Avec repos",
  travaillee: "Travaillée",
  projet: "Projet",
  non_enchainee: "Non enchaînée",
  test: "Essai / test",
};

export const THECRAG_STYLE_BY_CLIMBCREW = {
  a_vue: "Onsight",
  flash: "Flash",
  en_tete: "Redpoint",
  moulinette: "Top rope",
  avec_repos: "Dog",
  travaillee: "Redpoint",
  projet: "Attempt",
  non_enchainee: "Attempt",
  test: "Attempt",
};

export const ROUTE_TAGS = [
  { value: "dalle", label: "Dalle" },
  { value: "devers", label: "Dévers" },
  { value: "physique", label: "Physique" },
  { value: "technique", label: "Technique" },
  { value: "a_doigts", label: "À doigts" },
  { value: "continuite", label: "Continuité" },
  { value: "morphologique", label: "Morphologique" },
  { value: "engagee", label: "Engagée" },
];

export const TABS = [
  { key: "inscriptions", label: "Inscriptions" },
  { key: "voies", label: "Voies" },
  { key: "mon_profil", label: "Profil" },
  { key: "statistiques", label: "Statistiques" },
  { key: "wall_of_fame", label: "Tableau d’honneur" },
  { key: "faq", label: "FAQ" },
  { key: "administration", label: "Administration des inscrits", adminOnly: true },
  { key: "gestion_comptes", label: "Gestion des comptes", adminOnly: true },
  { key: "logs", label: "Administration Serveur", adminOnly: true },
];
