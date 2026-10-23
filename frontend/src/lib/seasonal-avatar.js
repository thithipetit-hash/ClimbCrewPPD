export function isChristmasAvatarDate(date = new Date()) {
  return date.getMonth() === 11;
}

export function millisecondsUntilNextLocalDay(date = new Date()) {
  const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return nextMidnight.getTime() - date.getTime();
}

export const NOVEMBER_PUMPKIN_COUNT = 20;

// Novembre 2026 uniquement, sur la date locale du navigateur.
export function isNovemberPumpkinDate(date = new Date()) {
  return date.getFullYear() === 2026 && date.getMonth() === 10
    && date.getDate() >= 1 && date.getDate() <= 30;
}

export function selectNovemberPumpkin(date = new Date(), random = Math.random) {
  if (!isNovemberPumpkinDate(date)) return null;
  const value = random();
  const index = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  return Math.floor(index * NOVEMBER_PUMPKIN_COUNT);
}
