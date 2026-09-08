function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricValue(analysis, selector) {
  return finiteNumberOrNull(selector(analysis?.metrics || {}, analysis));
}

function formatSeconds(value) {
  const seconds = finiteNumberOrNull(value);
  if (seconds === null) return "—";
  return `${Math.max(0, seconds).toFixed(seconds >= 10 ? 1 : 2)} s`;
}

function formatPercent(value) {
  const ratio = finiteNumberOrNull(value);
  return ratio === null ? "—" : `${Math.round(ratio * 100)} %`;
}

function formatCount(value) {
  const count = finiteNumberOrNull(value);
  return count === null ? "—" : String(Math.max(0, Math.round(count)));
}

function formatRate(value) {
  const rate = finiteNumberOrNull(value);
  return rate === null ? "—" : `${Math.max(0, rate).toFixed(rate >= 10 ? 1 : 2)}/min`;
}

function ratePerMinute(count, metrics) {
  const value = finiteNumberOrNull(count);
  const analyzedSeconds = finiteNumberOrNull(metrics?.analyzedSeconds);
  if (value === null || analyzedSeconds === null || analyzedSeconds <= 0) return null;
  return value * 60 / analyzedSeconds;
}

function stableRulesSignature(rules) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const entries = Object.entries(rules)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? JSON.stringify(entries) : null;
}

function deltaDisplay(value, formatter) {
  if (value === null) return "—";
  return formatter(value);
}

const METRICS = [
  {
    key: "duration",
    label: "Durée vidéo",
    value: (metrics) => metrics.duration,
    format: formatSeconds,
  },
  {
    key: "analyzedSeconds",
    label: "Temps réellement analysé",
    value: (metrics) => metrics.analyzedSeconds,
    format: formatSeconds,
  },
  {
    key: "detectionRatio",
    label: "Corps détecté",
    value: (metrics) => metrics.detectionRatio,
    format: formatPercent,
    deltaFormat: (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} pt`,
  },
  {
    key: "pauses",
    label: "Pauses",
    value: (metrics) => Array.isArray(metrics.pauses) ? metrics.pauses.length : null,
    format: formatCount,
  },
  {
    key: "pausesPerMinute",
    label: "Pauses par minute analysée",
    value: (metrics) => ratePerMinute(Array.isArray(metrics.pauses) ? metrics.pauses.length : null, metrics),
    format: formatRate,
  },
  {
    key: "longPauses",
    label: "Pauses longues",
    value: (metrics) => Array.isArray(metrics.longPauses) ? metrics.longPauses.length : null,
    format: formatCount,
  },
  {
    key: "footAdjustments",
    label: "Ajustements pieds",
    value: (metrics) => metrics.footAdjustments?.total,
    format: formatCount,
  },
  {
    key: "footAdjustmentsPerMinute",
    label: "Ajustements pieds par minute analysée",
    value: (metrics) => ratePerMinute(metrics.footAdjustments?.total, metrics),
    format: formatRate,
  },
  {
    key: "dynamicMoves",
    label: "Pics dynamiques",
    value: (metrics) => metrics.dynamicMoves,
    format: formatCount,
  },
  {
    key: "dynamicMovesPerMinute",
    label: "Pics dynamiques par minute analysée",
    value: (metrics) => ratePerMinute(metrics.dynamicMoves, metrics),
    format: formatRate,
  },
  {
    key: "bentLeft",
    label: "Bras gauche fléchi",
    value: (metrics) => metrics.bentArmSeconds?.left,
    format: formatSeconds,
  },
  {
    key: "bentRight",
    label: "Bras droit fléchi",
    value: (metrics) => metrics.bentArmSeconds?.right,
    format: formatSeconds,
  },
  {
    key: "lockLeft",
    label: "Verrouillage gauche",
    value: (metrics) => metrics.lockOffSeconds?.left,
    format: formatSeconds,
  },
  {
    key: "lockRight",
    label: "Verrouillage droit",
    value: (metrics) => metrics.lockOffSeconds?.right,
    format: formatSeconds,
  },
  {
    key: "armAsymmetry",
    label: "Asymétrie des bras",
    value: (metrics) => metrics.armAsymmetryRatio,
    format: formatPercent,
    deltaFormat: (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} pt`,
  },
];

function buildCompatibilityRows(analysisA, analysisB) {
  const engineA = String(analysisA?.engineVersion || "").trim() || "—";
  const engineB = String(analysisB?.engineVersion || "").trim() || "—";
  const rulesA = stableRulesSignature(analysisA?.rules);
  const rulesB = stableRulesSignature(analysisB?.rules);

  return [
    {
      key: "engineVersion",
      label: "Version moteur",
      a: null,
      b: null,
      delta: null,
      aDisplay: engineA,
      bDisplay: engineB,
      deltaDisplay: engineA !== "—" && engineB !== "—" && engineA === engineB
        ? "Identique"
        : "⚠ Différente ou inconnue",
    },
    {
      key: "rulesCompatibility",
      label: "Règles d’analyse",
      a: null,
      b: null,
      delta: null,
      aDisplay: rulesA ? "Snapshot enregistré" : "—",
      bDisplay: rulesB ? "Snapshot enregistré" : "—",
      deltaDisplay: rulesA && rulesB && rulesA === rulesB
        ? "Identiques"
        : "⚠ Différentes ou inconnues",
    },
  ];
}

export function buildTechnicalAnalysisComparison(analysisA, analysisB) {
  if (!analysisA?.metrics || !analysisB?.metrics) return null;

  const rows = METRICS.map((definition) => {
    const a = metricValue(analysisA, definition.value);
    const b = metricValue(analysisB, definition.value);
    const delta = a === null || b === null ? null : b - a;
    const formatter = definition.deltaFormat
      || ((value) => `${value >= 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(2)}`);
    return {
      key: definition.key,
      label: definition.label,
      a,
      b,
      delta,
      aDisplay: definition.format(a),
      bDisplay: definition.format(b),
      deltaDisplay: deltaDisplay(delta, formatter),
    };
  });

  const recommendationsA = Array.isArray(analysisA.recommendations) ? analysisA.recommendations : [];
  const recommendationsB = Array.isArray(analysisB.recommendations) ? analysisB.recommendations : [];
  const byCodeA = new Map(recommendationsA.map((item) => [String(item.code || item.title), item]));
  const byCodeB = new Map(recommendationsB.map((item) => [String(item.code || item.title), item]));
  const codes = [...new Set([...byCodeA.keys(), ...byCodeB.keys()])];

  const recommendations = codes.map((code) => {
    const a = byCodeA.get(code) || null;
    const b = byCodeB.get(code) || null;
    return {
      code,
      status: a && b ? "common" : a ? "only-a" : "only-b",
      title: b?.title || a?.title || code,
      a,
      b,
    };
  });

  return { rows: [...buildCompatibilityRows(analysisA, analysisB), ...rows], recommendations };
}
