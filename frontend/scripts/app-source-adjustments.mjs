export function makeRealisationRatingOptional(code) {
  const alreadyOptional = code.includes(
    "if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId) {",
  ) && code.includes("...(newRealisation.rating ? { rating: newRealisation.rating } : {}),");
  if (alreadyOptional) return code;

  const replacements = [
    [
      "if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId || !newRealisation.rating) {",
      "if (!newRealisation.participantId || !newRealisation.selectedDay || !newRealisation.voieId) {",
    ],
    [
      "alert(\"Sélectionne un jour, un participant, une voie et une note de 1 à 5 étoiles.\");",
      "alert(\"Sélectionne un jour, un participant et une voie.\");",
    ],
    [
      "rating: newRealisation.rating,",
      "...(newRealisation.rating ? { rating: newRealisation.rating } : {}),",
    ],
  ];

  let transformed = code;
  for (const [source, replacement] of replacements) {
    if (!transformed.includes(source)) {
      throw new Error(`Point de transformation introuvable pour l'évaluation facultative : ${source}`);
    }
    transformed = transformed.replace(source, replacement);
  }
  return transformed;
}

export function moveThemeSettingsOutOfSidebar(code) {
  let transformed = code;

  const sidebarThemeBlock = /\s*<div className="sidebar-theme">[\s\S]*?<\/div>\s*(?=\{authUser && \(\s*<div className="sidebar-account">)/;
  const sidebarEmailBlock = /\s*\{authUser && \(\s*<div className="sidebar-account">\s*<div className="small">\{authUser\.email\}<\/div>\s*<\/div>\s*\)\}/;
  const settingsAlreadyMoved = /<Parametres\b[\s\S]*?themePreference=\{themePreference\}[\s\S]*?onThemePreferenceChange=\{handleThemePreferenceChange\}[\s\S]*?themeOptions=\{THEME_OPTIONS\}[\s\S]*?\/>/;

  if (!sidebarThemeBlock.test(transformed) && !sidebarEmailBlock.test(transformed)) {
    if (settingsAlreadyMoved.test(transformed)) {
      return transformed;
    }
    throw new Error("Le bloc Ambiance du menu latéral est introuvable et Paramètres n'est pas déjà configuré.");
  }

  if (sidebarThemeBlock.test(transformed)) {
    transformed = transformed.replace(sidebarThemeBlock, "\n");
  }
  if (sidebarEmailBlock.test(transformed)) {
    transformed = transformed.replace(sidebarEmailBlock, "");
  }

  if (settingsAlreadyMoved.test(transformed)) {
    return transformed;
  }

  const settingsProps = /(<Parametres\b[\s\S]*?)(\s*\/>)/;
  if (!settingsProps.test(transformed)) {
    throw new Error("Les propriétés de la page Paramètres sont introuvables.");
  }
  return transformed.replace(
    settingsProps,
    `$1\n            themePreference={themePreference}\n            onThemePreferenceChange={handleThemePreferenceChange}\n            themeOptions={THEME_OPTIONS}$2`,
  );
}

export function extractRouteDisplayGrouping(code) {
  const importAnchor = 'import { PASSWORD_RULE_TEXT, isStrongPassword } from "./lib/password-policy.js";';
  if (!code.includes(importAnchor)) {
    throw new Error("Le point d'import du module de groupement des voies est introuvable.");
  }

  let transformed = code.replace(
    importAnchor,
    `${importAnchor}\nimport { buildRouteDisplayGroups } from "./lib/route-display-groups.js";`,
  );

  const groupingBlock = /\n  \/\/ Prépare les groupes du tableau des voies\.[\s\S]*?\n  const routeDisplayGroups = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[routeSortMode, state\.routes, state\.ropes\]\);/;
  if (!groupingBlock.test(transformed)) {
    throw new Error("Le bloc de groupement des voies de App.jsx est introuvable.");
  }

  return transformed.replace(
    groupingBlock,
    `\n  const routeDisplayGroups = useMemo(\n    () => buildRouteDisplayGroups({\n      routes: state.routes,\n      ropes: state.ropes,\n      sortMode: routeSortMode,\n    }),\n    [routeSortMode, state.routes, state.ropes],\n  );`,
  );
}

export function applyAppSourceAdjustments(code) {
  return extractRouteDisplayGrouping(
    moveThemeSettingsOutOfSidebar(makeRealisationRatingOptional(code)),
  );
}
