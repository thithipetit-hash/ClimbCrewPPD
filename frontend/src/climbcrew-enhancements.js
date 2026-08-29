/**
 * Point d'entrée transitoire pour les anciens ajustements d'interface.
 *
 * L'ancien module est conservé tel quel pour préserver le rendu, mais ses
 * MutationObserver sont neutralisés pendant son initialisation. Les
 * ajustements ne sont donc plus relancés à chaque mutation du DOM : ils
 * s'exécutent au démarrage puis sur les événements "change" explicites déjà
 * gérés par le module historique.
 */
const NativeMutationObserver = window.MutationObserver;

class DisabledMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
}

window.MutationObserver = DisabledMutationObserver;

try {
  await import("./climbcrew-enhancements-legacy.js");
} finally {
  window.MutationObserver = NativeMutationObserver;
}

// Le module historique démarre avant que React ait terminé son premier rendu.
// Un déclenchement différé suffit à appliquer une première fois les ajustements
// aux éléments effectivement montés, sans observer en permanence le DOM.
window.setTimeout(() => {
  document.dispatchEvent(new Event("change", { bubbles: true }));
}, 0);
