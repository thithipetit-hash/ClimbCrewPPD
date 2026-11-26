import { observedPauseRatio } from "./video-analysis-observations.js";

export const SKELETON_JOINTS = Object.freeze([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);
export const SKELETON_LINKS = Object.freeze([[0,1],[0,2],[2,4],[1,3],[3,5],[0,6],[1,7],[6,7],[6,8],[8,10],[7,9],[9,11]]);

export function finiteMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function observedRatio(value, seconds) {
  return finiteMetric(value) !== null && finiteMetric(seconds) !== null && seconds > 0 ? Math.min(1, value / seconds) : null;
}

export function nearestPoseFrame(frames, time, fps) {
  if (!frames?.length || !Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0) return null;
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].time < time) low = mid + 1;
    else high = mid;
  }
  const next = frames[low];
  const prev = frames[Math.max(0, low - 1)];
  const closest = Math.abs(next.time - time) < Math.abs(prev.time - time) ? next : prev;
  return Math.abs(closest.time - time) <= 0.6 / fps ? closest : null;
}

export function buildVideoDisplay(metrics = {}) {
  const seconds = finiteMetric(metrics.analyzedSeconds);
  const count = (items) => Array.isArray(items) ? items.length : null;
  return {
    pauseRatio: observedPauseRatio(metrics),
    armLeftRatio: observedRatio(metrics.bentArmSeconds?.left, seconds),
    armRightRatio: observedRatio(metrics.bentArmSeconds?.right, seconds),
    domains: [
      { label: "Fluidité", observations: [["Pauses", count(metrics.pauses)], ["Pauses longues", count(metrics.longPauses)]], context: "Distinguer les repos, la lecture et le mousquetonnage des hésitations." },
      { label: "Pieds", observations: [["Ajustements gauche", finiteMetric(metrics.footAdjustments?.left)], ["Ajustements droite", finiteMetric(metrics.footAdjustments?.right)]], context: "Un déplacement de cheville n’est pas une preuve de mauvaise pose." },
      { label: "Bras", observations: [["Bras G fléchi (s)", finiteMetric(metrics.bentArmSeconds?.left)], ["Bras D fléchi (s)", finiteMetric(metrics.bentArmSeconds?.right)]], context: "Vérifier les possibilités de relâchement selon le tracé." },
      { label: "Bassin et jambes", observations: [["Composante verticale (%)", finiteMetric(metrics.hipMotion?.pathEfficiency) === null ? null : 100 * metrics.hipMotion.pathEfficiency], ["Genoux (°)", finiteMetric(metrics.meanKneeAngleDegrees)]], context: "Le déplacement 2D dépend du cadrage et du profil de la voie." },
      { label: "Coordination", observations: [["Séquences détectées", count(metrics.movementSegments)], ["Pics dynamiques", finiteMetric(metrics.dynamicMoves)]], context: "Les pics peuvent être volontaires ; confirmer les techniques à la vidéo." },
    ],
  };
}

export function timelineItems(metrics = {}) {
  const duration = finiteMetric(metrics.duration);
  if (!duration) return [];
  const validTime = (value) => finiteMetric(value) !== null && value <= duration;
  const pauses = (Array.isArray(metrics.pauses) ? metrics.pauses : [])
    .filter(p => validTime(p?.start) && validTime(p?.end) && p.end >= p.start)
    .map(p => ({ kind: "pause", start: p.start, end: p.end }));
  const events = (Array.isArray(metrics.events) ? metrics.events : [])
    .filter(e => ["dynamic", "foot-adjustment"].includes(e?.type) && validTime(e.time))
    .map(e => ({ kind: e.type, start: e.time, end: e.time }));
  return [...pauses, ...events].sort((a,b) => a.start - b.start);
}

export function comparisonGraphRows(comparison) {
  const keys = ["duration", "pauseRatio", "footAdjustmentsPerMinute", "bentLeft", "bentRight", "hipPathEfficiency"];
  return keys.map(key => comparison?.rows?.find(row => row.key === key))
    .filter(row => row && finiteMetric(row.a) !== null && finiteMetric(row.b) !== null);
}
