export function isChristmasAvatarDate(date = new Date()) {
  return date.getMonth() === 11;
}

export function millisecondsUntilNextLocalDay(date = new Date()) {
  const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return nextMidnight.getTime() - date.getTime();
}
