export const PASSPORT_STYLES = {
  gris: { backgroundColor: "#cbd5e1", color: "#111827" },
  jaune: { backgroundColor: "#fde047", color: "#111827" },
  orange: { backgroundColor: "#fb923c", color: "#111827" },
  bleu: { backgroundColor: "#60a5fa", color: "#0f172a" },
  vert: { backgroundColor: "#22c55e", color: "#052e16" },

  // Compatibilité visuelle temporaire avec les anciennes données non migrées.
  sans: { backgroundColor: "#cbd5e1", color: "#111827" },
  decouverte: { backgroundColor: "#cbd5e1", color: "#111827" },
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


export const ROUTE_TAGS = [
  { value: "dalle", label: "Dalle" },
  { value: "devers", label: "Dévers" },
  { value: "diedre", label: "Dièdre" },
  { value: "physique", label: "Physique" },
  { value: "technique", label: "Technique" },
  { value: "a_doigts", label: "À doigts" },
  { value: "continuite", label: "Continuité" },
  { value: "morphologique", label: "Morphologique" },
  { value: "engagee", label: "Engagée" },
];

export const TABS = [
  { key: "inscriptions", label: "Planning" },
  { key: "voies", label: "Voies" },
  { key: "mon_profil", label: "Profil" },
  { key: "competences", label: "Compétences" },
  { key: "challenges", label: "Challenges" },
  { key: "chat", label: "Chat" },
  { key: "statistiques", label: "Statistiques" },
  { key: "wall_of_fame", label: "Tableau d’honneur" },
  { key: "faq", label: "FAQ" },
  { key: "gestion_comptes", label: "Gestion des comptes", adminOnly: true },
  { key: "donnees_utilisateurs", label: "Données utilisateurs", adminOnly: true },
  { key: "logs", label: "Administration", adminOnly: true },
];
