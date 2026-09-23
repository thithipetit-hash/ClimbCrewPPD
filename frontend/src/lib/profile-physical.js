import { getRealisationCriterion, getRealisationMode } from "./realisation-mode.js";

export function calculateBmi(heightCm, weightKg) {
  const heightM = Number(heightCm) / 100;
  const weight = Number(weightKg);
  if (!(heightM > 0) || !(weight > 0)) return null;
  return weight / (heightM * heightM);
}

export function physicalConsistencyWarnings(profile) {
  const warnings = [];
  const height = Number(profile?.heightCm);
  const weight = Number(profile?.weightKg);
  const span = Number(profile?.armSpanCm);
  const reach = Number(profile?.standingReachCm);
  const bmi = calculateBmi(height, weight);
  if (height && (height < 120 || height > 220)) warnings.push("La taille saisie paraît inhabituelle : vérifiez l’unité (cm).");
  if (weight && (weight < 35 || weight > 180)) warnings.push("Le poids saisi paraît inhabituel : vérifiez l’unité (kg).");
  if (height && span && Math.abs(span - height) > 25) warnings.push("L’écart entre taille et envergure dépasse 25 cm : vérifiez les deux mesures.");
  if (height && reach && (reach < height || reach > height + 100)) warnings.push("La portée bras levé paraît incohérente avec la taille.");
  if (bmi && (bmi < 14 || bmi > 45)) warnings.push("L’IMC calculé est très inhabituel : vérifiez taille et poids.");
  const pairs = [
    ["gripStrengthRightKg", "Préhension droite", 100],
    ["gripStrengthLeftKg", "Préhension gauche", 100],
    ["hang20mmSeconds", "Suspension 20 mm", 300],
    ["jugHangSeconds", "Suspension sur bac", 300],
    ["strictPullups", "Tractions strictes", 60],
    ["flexedArmHangSeconds", "Suspension à 90°", 180],
    ["hipMobilityCm", "Mobilité des hanches", 200],
  ];
  pairs.forEach(([key, label, high]) => {
    const value = Number(profile?.[key]);
    if (value > high) warnings.push(`${label} : valeur très élevée, vérifiez la saisie et le protocole.`);
  });
  return warnings;
}

const CRITERION_SCORE = {
  "a-vue": 60, "a_vue": 60, "à-vue": 60, "à_vue": 60,
  flash: 50, travaillee: 40, "travaillée": 40,
  "avec-repos": 20, "avec_repos": 20,
  projet: 10, "non-enchainee": 0, "non_enchainee": 0, essai: 0, test: 0,
};

export function realisationQualityScore(realisation, route) {
  const mode = getRealisationMode(realisation, route);
  const criterion = getRealisationCriterion(realisation);
  const criterionScore = CRITERION_SCORE[String(criterion || "").toLowerCase()] ?? 0;
  const success = criterionScore >= 40;
  return (success ? 1000 : 0) + (mode === "tete" || mode === "en-tete" ? 100 : 0) + criterionScore;
}

export function bestRealisationIds(realisations, routesById) {
  const best = new Map();
  for (const item of realisations || []) {
    const route = routesById?.[item.voieId];
    const score = realisationQualityScore(item, route);
    const previous = best.get(String(item.voieId));
    if (!previous || score > previous.score || (score === previous.score && String(item.dateRealisation || "") > String(previous.item.dateRealisation || ""))) {
      best.set(String(item.voieId), { item, score });
    }
  }
  return new Set([...best.values()].map(({ item }) => String(item.id)));
}

export function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}
