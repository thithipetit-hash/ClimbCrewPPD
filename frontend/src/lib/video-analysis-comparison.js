function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metricValue(analysis, selector) {
  return finiteNumber(selector(analysis?.metrics || {}));
}

function formatSeconds(value) {
  const seconds = Math.max(0, finiteNumber(value));
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} s`;
}

function formatPercent(value) {
  return `${Math.round(finiteNumber(value) * 100)} %`;
}

function formatCount(value) {
  return String(Math.max(0, Math.round(finiteNumber(value))));
}

const METRICS = [
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
    value: (metrics) => Array.isArray(metrics.pauses) ? metrics.pauses.length : 0,
    format: formatCount,
  },
  {
    key: "longPauses",
    label: "Pauses longues",
    value: (metrics) => Array.isArray(metrics.longPauses) ? metrics.longPauses.length : 0,
    format: formatCount,
  },
  {
    key: "footAdjustments",
    label: "Ajustements pieds",
    value: (metrics) => metrics.footAdjustments?.total,
    format: formatCount,
  },
  {
    key: "dynamicMoves",
    label: "Pics dynamiques",
    value: (metrics) => metrics.dynamicMoves,
    format: formatCount,
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

export function buildTechnicalAnalysisComparison(analysisA, analysisB) {
  if (!analysisA?.metrics || !analysisB?.metrics) return null;

  const rows = METRICS.map((definition) => {
    const a = metricValue(analysisA, definition.value);
    const b = metricValue(analysisB, definition.value);
    const delta = b - a;
    const deltaFormat = definition.deltaFormat
      || ((value) => `${value >= 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(2)}`);
    return {
      key: definition.key,
      label: definition.label,
      a,
      b,
      delta,
      aDisplay: definition.format(a),
      bDisplay: definition.format(b),
      deltaDisplay: deltaFormat(delta),
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

  return { rows, recommendations };
}
