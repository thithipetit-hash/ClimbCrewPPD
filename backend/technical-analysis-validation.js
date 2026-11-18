const MAX_TECHNICAL_ANALYSIS_BYTES = 128 * 1024;
const MAX_ANALYSIS_SECONDS = 8 * 60;
const MAX_INTERVALS = 2000;
const MAX_RECOMMENDATIONS = 20;
const MAX_EVENTS = 1000;
const MAX_TRAJECTORY_POINTS = 240;
const MAX_MOVEMENT_SEGMENTS = 500;
const EXPECTED_ENGINE = "MediaPipe Pose Landmarker Lite";

const RULE_LIMITS = Object.freeze({
  sampleFps: [2, 8],
  minVisibility: [0.2, 0.9],
  pauseSpeedTorsoPerSecond: [0.02, 0.3],
  pauseMinSeconds: [1, 8],
  longPauseMinSeconds: [2, 15],
  bentArmAngleDegrees: [80, 150],
  bentArmMinSeconds: [0.5, 8],
  lockOffAngleDegrees: [60, 130],
  lockOffMinSeconds: [0.5, 5],
  footAdjustmentSpeedTorsoPerSecond: [0.04, 0.8],
  footAdjustmentMaxDistanceTorso: [0.1, 1],
  footAdjustmentMinGapSeconds: [0.2, 3],
  dynamicSpeedTorsoPerSecond: [0.5, 4],
  armAsymmetryRatio: [0.05, 0.8],
});

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${label} est invalide.`);
  }
  return value;
}

function finiteNumber(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw badRequest(`${label} est hors limites.`);
  }
  return number;
}

function boundedString(value, label, maxLength, { required = false } = {}) {
  const text = String(value ?? "").trim();
  if ((required && !text) || text.length > maxLength) {
    throw badRequest(`${label} est invalide.`);
  }
  return text;
}

function normalizeInterval(value, label, duration) {
  const interval = objectValue(value, label);
  const start = finiteNumber(interval.start, `${label}.start`, { min: 0, max: duration });
  const end = finiteNumber(interval.end, `${label}.end`, { min: start, max: duration });
  const calculatedDuration = Math.max(0, end - start);
  if (interval.duration !== undefined) {
    const declared = finiteNumber(interval.duration, `${label}.duration`, { min: 0, max: duration });
    if (Math.abs(declared - calculatedDuration) > 0.15) {
      throw badRequest(`${label}.duration est incohérente.`);
    }
  }
  return { start, end, duration: calculatedDuration };
}

function normalizeIntervals(value, label, duration) {
  if (!Array.isArray(value) || value.length > MAX_INTERVALS) {
    throw badRequest(`${label} est invalide.`);
  }
  return value.map((interval, index) => normalizeInterval(interval, `${label}[${index}]`, duration));
}

function normalizeRules(value) {
  const rules = objectValue(value, "Les règles d’analyse");
  const normalized = {};
  for (const [key, [min, max]] of Object.entries(RULE_LIMITS)) {
    normalized[key] = finiteNumber(rules[key], `rules.${key}`, { min, max });
  }
  if (normalized.longPauseMinSeconds < normalized.pauseMinSeconds) {
    throw badRequest("La durée d’une longue pause ne peut pas être inférieure à la durée minimale d’une pause.");
  }
  if (normalized.lockOffAngleDegrees > normalized.bentArmAngleDegrees) {
    throw badRequest("L’angle de lock-off ne peut pas dépasser l’angle de bras fléchi.");
  }
  return normalized;
}

function normalizeMetrics(value) {
  const metrics = objectValue(value, "Les mesures de l’analyse technique");
  const duration = finiteNumber(metrics.duration, "metrics.duration", { min: 0.001, max: MAX_ANALYSIS_SECONDS });
  const analyzedSeconds = finiteNumber(metrics.analyzedSeconds, "metrics.analyzedSeconds", { min: 0, max: duration });
  const sampleCount = finiteNumber(metrics.sampleCount, "metrics.sampleCount", { min: 1, max: 20000, integer: true });
  const validSamples = finiteNumber(metrics.validSamples, "metrics.validSamples", { min: 0, max: sampleCount, integer: true });
  const detectionRatio = finiteNumber(metrics.detectionRatio, "metrics.detectionRatio", { min: 0, max: 1 });
  const expectedDetectionRatio = validSamples / sampleCount;
  if (Math.abs(detectionRatio - expectedDetectionRatio) > 0.01) {
    throw badRequest("Le ratio de détection est incohérent avec le nombre d’échantillons valides.");
  }
  if (Math.abs(analyzedSeconds - (duration * detectionRatio)) > 0.2) {
    throw badRequest("Le temps analysé est incohérent avec le ratio de détection.");
  }

  const bent = objectValue(metrics.bentArmSeconds, "metrics.bentArmSeconds");
  const lock = objectValue(metrics.lockOffSeconds, "metrics.lockOffSeconds");
  const feet = objectValue(metrics.footAdjustments, "metrics.footAdjustments");
  const footLeft = finiteNumber(feet.left, "metrics.footAdjustments.left", { min: 0, max: 5000, integer: true });
  const footRight = finiteNumber(feet.right, "metrics.footAdjustments.right", { min: 0, max: 5000, integer: true });
  const footTotal = finiteNumber(feet.total, "metrics.footAdjustments.total", { min: 0, max: 10000, integer: true });
  if (footTotal !== footLeft + footRight) {
    throw badRequest("Le total des ajustements de pieds est incohérent.");
  }

  return {
    duration,
    analyzedSeconds,
    sampleCount,
    validSamples,
    detectionRatio,
    pauses: normalizeIntervals(metrics.pauses, "metrics.pauses", duration),
    longPauses: normalizeIntervals(metrics.longPauses, "metrics.longPauses", duration),
    bentArmSeconds: {
      left: finiteNumber(bent.left, "metrics.bentArmSeconds.left", { min: 0, max: duration }),
      right: finiteNumber(bent.right, "metrics.bentArmSeconds.right", { min: 0, max: duration }),
    },
    lockOffSeconds: {
      left: finiteNumber(lock.left, "metrics.lockOffSeconds.left", { min: 0, max: duration }),
      right: finiteNumber(lock.right, "metrics.lockOffSeconds.right", { min: 0, max: duration }),
    },
    footAdjustments: { left: footLeft, right: footRight, total: footTotal },
    dynamicMoves: finiteNumber(metrics.dynamicMoves, "metrics.dynamicMoves", { min: 0, max: 5000, integer: true }),
    armAsymmetryRatio: finiteNumber(metrics.armAsymmetryRatio, "metrics.armAsymmetryRatio", { min: 0, max: 1 }),
    ...normalizeMotionExtras(metrics, duration),
  };
}

function normalizeMotionExtras(metrics, duration) {
  const output = {};
  if (metrics.hipMotion !== undefined) {
    const hip = objectValue(metrics.hipMotion, "metrics.hipMotion");
    output.hipMotion = {
      travelTorso: finiteNumber(hip.travelTorso, "metrics.hipMotion.travelTorso", { min: 0, max: 10000 }),
      verticalProgressTorso: finiteNumber(hip.verticalProgressTorso, "metrics.hipMotion.verticalProgressTorso", { min: 0, max: 10000 }),
      pathEfficiency: finiteNumber(hip.pathEfficiency, "metrics.hipMotion.pathEfficiency", { min: 0, max: 1 }),
      meanSpeedTorsoPerSecond: finiteNumber(hip.meanSpeedTorsoPerSecond, "metrics.hipMotion.meanSpeedTorsoPerSecond", { min: 0, max: 100 }),
      maxSpeedTorsoPerSecond: finiteNumber(hip.maxSpeedTorsoPerSecond, "metrics.hipMotion.maxSpeedTorsoPerSecond", { min: 0, max: 100 }),
    };
  }
  if (metrics.bodyPosition !== undefined) {
    const body = objectValue(metrics.bodyPosition, "metrics.bodyPosition");
    output.bodyPosition = {
      meanHipLateralOffsetHipWidths: finiteNumber(body.meanHipLateralOffsetHipWidths, "metrics.bodyPosition.meanHipLateralOffsetHipWidths", { min: 0, max: 20 }),
      maxHipLateralOffsetHipWidths: finiteNumber(body.maxHipLateralOffsetHipWidths, "metrics.bodyPosition.maxHipLateralOffsetHipWidths", { min: 0, max: 20 }),
      meanShoulderHipOffsetTorso: finiteNumber(body.meanShoulderHipOffsetTorso, "metrics.bodyPosition.meanShoulderHipOffsetTorso", { min: 0, max: 20 }),
      maxShoulderHipOffsetTorso: finiteNumber(body.maxShoulderHipOffsetTorso, "metrics.bodyPosition.maxShoulderHipOffsetTorso", { min: 0, max: 20 }),
      compactSeconds: finiteNumber(body.compactSeconds, "metrics.bodyPosition.compactSeconds", { min: 0, max: duration }),
    };
  }
  if (metrics.meanKneeAngleDegrees !== undefined && metrics.meanKneeAngleDegrees !== null) output.meanKneeAngleDegrees = finiteNumber(metrics.meanKneeAngleDegrees, "metrics.meanKneeAngleDegrees", { min: 0, max: 180 });
  if (metrics.observationConfidence !== undefined) output.observationConfidence = finiteNumber(metrics.observationConfidence, "metrics.observationConfidence", { min: 0, max: 1 });
  if (metrics.events !== undefined) {
    if (!Array.isArray(metrics.events) || metrics.events.length > MAX_EVENTS) throw badRequest("metrics.events est invalide.");
    output.events = metrics.events.map((item, index) => {
      const event = objectValue(item, `metrics.events[${index}]`);
      const type = boundedString(event.type, `metrics.events[${index}].type`, 40, { required: true });
      if (!["pause", "dynamic", "foot-adjustment", "cross", "foot-switch", "flag-candidate", "movement", "movement-peak", "stabilization"].includes(type)) throw badRequest(`metrics.events[${index}].type est invalide.`);
      const normalized = { type, time: finiteNumber(event.time, `metrics.events[${index}].time`, { min: 0, max: duration }), confidence: finiteNumber(event.confidence, `metrics.events[${index}].confidence`, { min: 0, max: 1 }) };
      if (event.end !== undefined) normalized.end = finiteNumber(event.end, `metrics.events[${index}].end`, { min: normalized.time, max: duration });
      if (event.phase !== undefined) {
        const phase = boundedString(event.phase, `metrics.events[${index}].phase`, 20);
        if (!["preparation", "execution", "stabilization"].includes(phase)) throw badRequest(`metrics.events[${index}].phase est invalide.`);
        normalized.phase = phase;
      }
      if (event.side !== undefined) {
        const side = boundedString(event.side, `metrics.events[${index}].side`, 10);
        if (!["left", "right"].includes(side)) throw badRequest(`metrics.events[${index}].side est invalide.`);
        normalized.side = side;
      }
      return normalized;
    });
  }
  if (metrics.movementSegments !== undefined) {
    if (!Array.isArray(metrics.movementSegments) || metrics.movementSegments.length > MAX_MOVEMENT_SEGMENTS) throw badRequest("metrics.movementSegments est invalide.");
    output.movementSegments = metrics.movementSegments.map((item, index) => {
      const segment = objectValue(item, `metrics.movementSegments[${index}]`);
      const start = finiteNumber(segment.start, `metrics.movementSegments[${index}].start`, { min: 0, max: duration });
      const end = finiteNumber(segment.end, `metrics.movementSegments[${index}].end`, { min: start, max: duration });
      return { start, peak: finiteNumber(segment.peak ?? start, `metrics.movementSegments[${index}].peak`, { min: start, max: end }), end, peakSpeed: finiteNumber(segment.peakSpeed, `metrics.movementSegments[${index}].peakSpeed`, { min: 0, max: 100 }) };
    });
  }
  if (metrics.hipTrajectory !== undefined) {
    if (!Array.isArray(metrics.hipTrajectory) || metrics.hipTrajectory.length > MAX_TRAJECTORY_POINTS) throw badRequest("metrics.hipTrajectory est invalide.");
    output.hipTrajectory = metrics.hipTrajectory.map((point, index) => {
      const p = objectValue(point, `metrics.hipTrajectory[${index}]`);
      return { t: finiteNumber(p.t, `metrics.hipTrajectory[${index}].t`, { min: 0, max: duration }), x: finiteNumber(p.x, `metrics.hipTrajectory[${index}].x`, { min: -2, max: 3 }), y: finiteNumber(p.y, `metrics.hipTrajectory[${index}].y`, { min: -2, max: 3 }) };
    });
  }
  return output;
}

function normalizeRecommendations(value) {
  if (!Array.isArray(value) || value.length > MAX_RECOMMENDATIONS) {
    throw badRequest("Les recommandations de l’analyse technique sont invalides.");
  }
  return value.map((item, index) => {
    const recommendation = objectValue(item, `recommendations[${index}]`);
    const severity = boundedString(recommendation.severity, `recommendations[${index}].severity`, 20, { required: true });
    if (!["success", "info", "warning"].includes(severity)) {
      throw badRequest(`recommendations[${index}].severity est invalide.`);
    }
    return {
      code: boundedString(recommendation.code, `recommendations[${index}].code`, 80, { required: true }),
      severity,
      title: boundedString(recommendation.title, `recommendations[${index}].title`, 160, { required: true }),
      detail: boundedString(recommendation.detail, `recommendations[${index}].detail`, 1000, { required: true }),
    };
  });
}

function normalizeDisplay(value) {
  if (value === undefined) return undefined;
  const display = objectValue(value, "display");
  return Object.fromEntries(
    ["duration", "detection", "bentLeft", "bentRight", "lockLeft", "lockRight"]
      .map((key) => [key, boundedString(display[key], `display.${key}`, 40)])
      .filter(([, text]) => text),
  );
}

export function normalizeTechnicalAnalysis(value) {
  const analysis = objectValue(value, "Le résultat d’analyse technique");
  const engine = boundedString(analysis.engine, "Le moteur d’analyse", 120, { required: true });
  if (engine !== EXPECTED_ENGINE) throw badRequest("Le moteur d’analyse technique est inconnu.");
  const engineVersion = boundedString(analysis.engineVersion, "La version du moteur", 40, { required: true });
  if (!/^\d+\.\d+\.\d+$/.test(engineVersion)) throw badRequest("La version du moteur d’analyse est invalide.");
  if (analysis.localProcessing !== true) throw badRequest("L’analyse doit avoir été calculée localement.");

  const normalized = {
    engine,
    engineVersion,
    localProcessing: true,
    rules: normalizeRules(analysis.rules),
    metrics: normalizeMetrics(analysis.metrics),
    recommendations: normalizeRecommendations(analysis.recommendations || []),
    analyzedAt: new Date().toISOString(),
    storageVersion: 2,
  };
  const display = normalizeDisplay(analysis.display);
  if (display) normalized.display = display;

  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized, "utf8") > MAX_TECHNICAL_ANALYSIS_BYTES) {
    throw badRequest("Le résultat d’analyse technique est trop volumineux.");
  }
  return normalized;
}
