export function isChristmasAvatarDate(date = new Date()) {
  return date.getMonth() === 11;
}

export function millisecondsUntilNextLocalDay(date = new Date()) {
  const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return nextMidnight.getTime() - date.getTime();
}

export const OCTOBER_PUMPKIN_COUNT = 20;

// Les images saisonnières ne modifient jamais les choix enregistrés.
export function isOctoberPumpkinDate(date = new Date()) {
  return date.getFullYear() === 2026 && date.getMonth() === 9;
}

export function pumpkinIndexForParticipant(participantId, sessionSalt) {
  let hash = Number(sessionSalt) >>> 0;
  for (const character of String(participantId ?? "")) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return hash % OCTOBER_PUMPKIN_COUNT;
}

export function pumpkinSpriteStyle(index) {
  return { backgroundPosition: `${(index % 5) * 25}% ${Math.floor(index / 5) * (100 / 3)}%` };
}
