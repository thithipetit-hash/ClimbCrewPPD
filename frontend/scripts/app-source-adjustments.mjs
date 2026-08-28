export function makeRealisationRatingOptional(code) {
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
    [
      "<label>Évaluation de la voie</label>",
      "<label>Évaluation de la voie (facultative)</label>",
    ],
    [
      "disabled={!newRealisation.selectedDay || !newRealisation.participantId || !newRealisation.voieId || !newRealisation.rating || (newRealisation.chute && !newRealisation.assureurId) || modalEligibleParticipants.length === 0}",
      "disabled={!newRealisation.selectedDay || !newRealisation.participantId || !newRealisation.voieId || (newRealisation.chute && !newRealisation.assureurId) || modalEligibleParticipants.length === 0}",
    ],
  ];

  let transformed = code;
  for (const [source, replacement] of replacements) {
    if (!transformed.includes(source)) {
      throw new Error(`Point de transformation introuvable pour l'évaluation facultative : ${source}`);
    }
    transformed = transformed.replace(source, replacement);
  }

  const consensusBlock = /\s*<div>\s*<label>Cotation consensus<\/label>\s*<input value=\{realisationModalRoute \? routeAggregatesById\[realisationModalRoute\.id\]\?\.consensusGrade \|\| "Non calculée" : "Choisir une voie"\} readOnly \/>\s*<\/div>/;
  if (!consensusBlock.test(transformed)) {
    throw new Error("Le bloc Cotation consensus de la saisie de réalisation est introuvable.");
  }
  return transformed.replace(consensusBlock, "");
}

export function moveThemeSettingsOutOfSidebar(code) {
  let transformed = code;

  const sidebarThemeBlock = /\s*<div className="sidebar-theme">[\s\S]*?<\/div>\s*(?=\{authUser && \(\s*<div className="sidebar-account">)/;
  if (!sidebarThemeBlock.test(transformed)) {
    throw new Error("Le bloc Ambiance du menu latéral est introuvable.");
  }
  transformed = transformed.replace(sidebarThemeBlock, "\n");

  const sidebarEmailBlock = /\s*\{authUser && \(\s*<div className="sidebar-account">\s*<div className="small">\{authUser\.email\}<\/div>\s*<\/div>\s*\)\}/;
  if (!sidebarEmailBlock.test(transformed)) {
    throw new Error("L'adresse e-mail du menu latéral est introuvable.");
  }
  transformed = transformed.replace(sidebarEmailBlock, "");

  const settingsProps = /(<Parametres\b[\s\S]*?)(\s*\/>)/;
  if (!settingsProps.test(transformed)) {
    throw new Error("Les propriétés de la page Paramètres sont introuvables.");
  }
  return transformed.replace(
    settingsProps,
    `$1\n            themePreference={themePreference}\n            onThemePreferenceChange={handleThemePreferenceChange}\n            themeOptions={THEME_OPTIONS}$2`,
  );
}

export function applyAppSourceAdjustments(code) {
  return moveThemeSettingsOutOfSidebar(makeRealisationRatingOptional(code));
}
