import { getRealisationCriterion } from "../shared/realisation-mode.js";

const CHAT_ACTION_BY_CRITERION = {
  a_vue: { emoji: "🧗", action: "a enchaîné à vue" },
  flash: { emoji: "⚡", action: "a enchaîné flash" },
  travaillee: { emoji: "✅", action: "a enchaîné" },
  avec_repos: { emoji: "🔧", action: "a travaillé" },
  projet: { emoji: "🔧", action: "a travaillé" },
  non_enchainee: { emoji: "🎯", action: "a tenté" },
  test: { emoji: "🎯", action: "a tenté" },
};

export function buildRealisationChatMessage({
  who,
  route,
  grade,
  modeRealisation,
  styleRealisation,
}) {
  const criterion = getRealisationCriterion({ styleRealisation });
  const { emoji, action } = CHAT_ACTION_BY_CRITERION[criterion]
    || { emoji: "✅", action: "a enchaîné" };
  const mode = modeRealisation === "moulinette" ? "en moulinette" : "en tête";
  return `${emoji} ${who} ${action} ${route} — ${grade} · ${mode}.`;
}
