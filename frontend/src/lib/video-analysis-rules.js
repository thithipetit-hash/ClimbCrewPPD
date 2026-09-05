export const VIDEO_ANALYSIS_RULES_STORAGE_KEY = "climbcrew.videoAnalysisRules.v1";

export const DEFAULT_VIDEO_ANALYSIS_RULES = Object.freeze({
  sampleFps: 4,
  minVisibility: 0.5,
  pauseSpeedTorsoPerSecond: 0.08,
  pauseMinSeconds: 2.5,
  longPauseMinSeconds: 5,
  bentArmAngleDegrees: 120,
  bentArmMinSeconds: 2,
  lockOffAngleDegrees: 100,
  lockOffMinSeconds: 1,
  footAdjustmentSpeedTorsoPerSecond: 0.12,
  footAdjustmentMaxDistanceTorso: 0.35,
  footAdjustmentMinGapSeconds: 0.7,
  dynamicSpeedTorsoPerSecond: 1.6,
  armAsymmetryRatio: 0.25,
});

export const VIDEO_ANALYSIS_RULE_DEFINITIONS = Object.freeze([
  { key: "sampleFps", label: "Échantillonnage", unit: "images/s", min: 2, max: 8, step: 1 },
  { key: "minVisibility", label: "Visibilité minimale d’un point", unit: "", min: 0.2, max: 0.9, step: 0.05 },
  { key: "pauseSpeedTorsoPerSecond", label: "Vitesse max. pour une immobilité", unit: "torse/s", min: 0.02, max: 0.3, step: 0.01 },
  { key: "pauseMinSeconds", label: "Durée minimale d’une immobilité", unit: "s", min: 1, max: 8, step: 0.5 },
  { key: "longPauseMinSeconds", label: "Durée d’une longue immobilité", unit: "s", min: 2, max: 15, step: 0.5 },
  { key: "bentArmAngleDegrees", label: "Angle bras fléchi", unit: "°", min: 80, max: 150, step: 5 },
  { key: "bentArmMinSeconds", label: "Durée bras fléchi prolongé", unit: "s", min: 0.5, max: 8, step: 0.5 },
  { key: "lockOffAngleDegrees", label: "Angle lock-off marqué", unit: "°", min: 60, max: 130, step: 5 },
  { key: "lockOffMinSeconds", label: "Durée minimale lock-off", unit: "s", min: 0.5, max: 5, step: 0.5 },
  { key: "footAdjustmentSpeedTorsoPerSecond", label: "Vitesse mini. ajustement pied", unit: "torse/s", min: 0.04, max: 0.8, step: 0.02 },
  { key: "footAdjustmentMaxDistanceTorso", label: "Amplitude max. d’un ajustement pied", unit: "torse", min: 0.1, max: 1, step: 0.05 },
  { key: "footAdjustmentMinGapSeconds", label: "Écart mini. entre deux ajustements", unit: "s", min: 0.2, max: 3, step: 0.1 },
  { key: "dynamicSpeedTorsoPerSecond", label: "Vitesse d’un mouvement dynamique", unit: "torse/s", min: 0.5, max: 4, step: 0.1 },
  { key: "armAsymmetryRatio", label: "Asymétrie bras significative", unit: "ratio", min: 0.05, max: 0.8, step: 0.05 },
]);

function finiteOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeVideoAnalysisRules(candidate = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_VIDEO_ANALYSIS_RULES).map(([key, fallback]) => [
      key,
      finiteOrDefault(candidate?.[key], fallback),
    ]),
  );
}

export function loadVideoAnalysisRules() {
  if (typeof window === "undefined") return { ...DEFAULT_VIDEO_ANALYSIS_RULES };
  try {
    const raw = window.localStorage.getItem(VIDEO_ANALYSIS_RULES_STORAGE_KEY);
    return normalizeVideoAnalysisRules(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_VIDEO_ANALYSIS_RULES };
  }
}

export function saveVideoAnalysisRules(rules) {
  const normalized = normalizeVideoAnalysisRules(rules);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VIDEO_ANALYSIS_RULES_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function resetVideoAnalysisRules() {
  const defaults = { ...DEFAULT_VIDEO_ANALYSIS_RULES };
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(VIDEO_ANALYSIS_RULES_STORAGE_KEY);
  }
  return defaults;
}
