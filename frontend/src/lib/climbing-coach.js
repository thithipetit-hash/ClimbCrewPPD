const COACH_VERSION = 1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function ratio(part, total) {
  const denominator = Math.max(1, finite(total, 0));
  return Math.max(0, finite(part, 0)) / denominator;
}

function priority(code, score, title, reason, cue, exercise, dose, caution = "") {
  return { code, score, title, reason, cue, exercise, dose, caution };
}

export function buildClimbingCoach(metrics = {}, rules = {}) {
  const analyzedSeconds = Math.max(1, finite(metrics.analyzedSeconds, metrics.duration));
  const detectionRatio = Math.max(0, Math.min(1, finite(metrics.detectionRatio, 0)));
  const pauses = Array.isArray(metrics.pauses) ? metrics.pauses : [];
  const longPauses = Array.isArray(metrics.longPauses) ? metrics.longPauses : [];
  const footAdjustments = Math.max(0, finite(metrics.footAdjustments?.total, 0));
  const bentLeftRatio = ratio(metrics.bentArmSeconds?.left, analyzedSeconds);
  const bentRightRatio = ratio(metrics.bentArmSeconds?.right, analyzedSeconds);
  const maxBentRatio = Math.max(bentLeftRatio, bentRightRatio);
  const bentSide = bentLeftRatio > bentRightRatio ? "gauche" : "droit";
  const armAsymmetryRatio = Math.max(0, finite(metrics.armAsymmetryRatio, 0));
  const dynamicMoves = Math.max(0, finite(metrics.dynamicMoves, 0));
  const candidates = [];

  if (longPauses.length > 0 || pauses.length >= 3) {
    const threshold = finite(rules.longPauseMinSeconds, 4);
    candidates.push(priority(
      "coach-fluidity",
      90 + Math.min(9, longPauses.length * 3 + pauses.length),
      "Fluidité et anticipation",
      longPauses.length
        ? `${longPauses.length} immobilisation${longPauses.length > 1 ? "s" : ""} longue${longPauses.length > 1 ? "s" : ""} détectée${longPauses.length > 1 ? "s" : ""}, au-delà d’environ ${threshold} s.`
        : `${pauses.length} pauses techniques détectées sur le passage.`,
      "Avant de bouger, préparer les deux ou trois mouvements suivants puis repartir sans rester suspendu inutilement.",
      "Sur 2 voies faciles, lire 3 mouvements à l’avance depuis le sol puis grimper avec l’objectif de garder un rythme continu. Une pause reste autorisée si elle est nécessaire à la sécurité.",
      "2 voies faciles, 1 essai concentré par voie.",
    ));
  }

  if (maxBentRatio >= 0.18) {
    candidates.push(priority(
      "coach-arm-economy",
      82 + Math.min(14, Math.round(maxBentRatio * 30)),
      "Économie des bras",
      `Le bras ${bentSide} reste fléchi environ ${Math.round(maxBentRatio * 100)} % du temps où le corps est analysable.`,
      "Chercher une position de bassin qui permette de relâcher le bras entre deux mouvements plutôt que de rester en traction.",
      "Sur 2 à 3 voies sous le niveau maximal, marquer chaque position stable en relâchant volontairement un bras et en poussant davantage sur les jambes.",
      "2 à 3 voies faciles, récupération complète entre les essais.",
    ));
  }

  if (footAdjustments >= 5) {
    candidates.push(priority(
      "coach-foot-precision",
      86 + Math.min(12, Math.round(footAdjustments)),
      "Précision des pieds",
      `${Math.round(footAdjustments)} ajustements courts de pieds ont été détectés.`,
      "Regarder la prise de pied jusqu’au contact et viser une pose unique, silencieuse, avant de transférer le poids.",
      "Faire des voies faciles en « pieds silencieux » : un placement volontaire par prise de pied, sans reprise sauf nécessité de sécurité.",
      "3 passages courts ou 2 voies faciles.",
    ));
  }

  const asymmetryThreshold = Math.max(0.05, finite(rules.armAsymmetryRatio, 0.35));
  if (armAsymmetryRatio >= asymmetryThreshold) {
    candidates.push(priority(
      "coach-arm-balance",
      55 + Math.min(15, Math.round(armAsymmetryRatio * 20)),
      "Équilibre gauche / droite",
      `L’utilisation des bras présente une asymétrie d’environ ${Math.round(armAsymmetryRatio * 100)} % sur cette voie.`,
      "Vérifier d’abord si cette différence est imposée par le tracé avant d’en faire un axe de correction.",
      "Répéter une voie facile assez symétrique en observant si le même côté reste dominant ; alterner volontairement les prises de repos quand c’est possible.",
      "1 à 2 répétitions de contrôle.",
      "Une seule voie peut naturellement favoriser un côté : ce signal doit être confirmé sur plusieurs passages.",
    ));
  }

  if (dynamicMoves >= 3) {
    candidates.push(priority(
      "coach-dynamic-control",
      45 + Math.min(12, dynamicMoves),
      "Dynamisme maîtrisé",
      `${Math.round(dynamicMoves)} pics de vitesse corporelle ont été détectés.`,
      "Distinguer les mouvements dynamiques choisis des corrections rapides subies.",
      "Revoir les pics repérés et, sur une voie facile, refaire les mouvements concernés en décidant à l’avance s’ils doivent être statiques ou dynamiques.",
      "1 passage d’observation puis 1 passage ciblé.",
      "Un pic de vitesse n’est pas une erreur : il peut correspondre à un mouvement dynamique efficace.",
    ));
  }

  candidates.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  const priorities = candidates.slice(0, 2);

  if (!priorities.length) {
    priorities.push(priority(
      "coach-consolidation",
      10,
      "Consolider le geste",
      "Aucun des signaux mécaniques suivis ne ressort fortement sur cette vidéo.",
      "Conserver la qualité de placement et chercher surtout une grimpe relâchée et intentionnelle.",
      "Refaire une voie facile en choisissant un seul thème d’attention : pieds, bassin ou relâchement des bras.",
      "1 à 2 passages de consolidation.",
    ));
  }

  const titles = priorities.map((item) => item.title);
  const lowDetection = detectionRatio > 0 && detectionRatio < 0.6;

  return {
    version: COACH_VERSION,
    method: "rule-based",
    summary: titles.length === 1
      ? `Priorité entraîneur : ${titles[0]}.`
      : `Priorités entraîneur : ${titles[0]}, puis ${titles[1]}.`,
    priorities,
    note: lowDetection
      ? "La détection du corps est partielle : utiliser ces priorités comme pistes à confirmer visuellement ou sur une autre vidéo."
      : "Les priorités sont déduites des mesures de cette vidéo et doivent être interprétées avec le contexte de la voie.",
  };
}
