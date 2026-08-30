// Compatibilité temporaire pour les imports backend existants.
// La règle métier canonique vit désormais dans /shared afin que le frontend
// n'ait plus à dépendre de l'arborescence backend.
export { getDefaultSessionStatus } from "../shared/session-default-status.js";
