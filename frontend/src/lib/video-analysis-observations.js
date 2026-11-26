// Les coordonnées MediaPipe sont normalisées séparément sur chaque axe.
// Les ramener à une unité commune (hauteur de l’image) avant la géométrie 2D.
export function correctImageAspect(point, aspectRatio) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  return { x: point.x * aspectRatio, y: point.y };
}

// Indicateur descriptif : durée des pauses reconnues / durée analysable.
// Les pauses du moteur sont des intervalles disjoints ; fusionner aussi les
// recouvrements éventuels des mesures historiques avant de calculer le ratio.
export function observedPauseRatio(metrics) {
  const seconds = metrics?.analyzedSeconds;
  if (!Number.isFinite(seconds) || seconds <= 0 || !Array.isArray(metrics?.pauses)) return null;
  const intervals = [];
  for (const pause of metrics.pauses) {
    if (!Number.isFinite(pause?.start) || !Number.isFinite(pause?.end) || pause.start < 0 || pause.end < pause.start) return null;
    intervals.push([pause.start, pause.end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = 0;
  for (const [start, stop] of intervals) {
    total += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return Math.min(1, total / seconds);
}
