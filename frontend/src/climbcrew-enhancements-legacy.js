/**
 * Dernière compatibilité DOM historique de ClimbCrew.
 *
 * Le thème, la FAQ, les couleurs de voies, l'ordre des séances et le hachurage
 * sont désormais entièrement gérés par React et les feuilles CSS.
 * Ce module ne conserve temporairement que la navigation tactile horizontale.
 */
function enableHorizontalSwipe() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  document.addEventListener("touchstart", (event) => {
    const target = event.target;
    if (!(target instanceof Element)
      || target.closest("button,input,select,textarea,a,.modal-overlay,.sidebar")
      || !document.querySelector(".date-nav")) return;

    const touch = event.touches[0];
    if (!touch) return;

    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (!tracking) return;
    tracking = false;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    const buttons = [...document.querySelectorAll(".date-nav .nav-symbol")];
    if (buttons.length >= 2) (deltaX < 0 ? buttons.at(-1) : buttons[0])?.click();
  }, { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enableHorizontalSwipe, { once: true });
} else {
  enableHorizontalSwipe();
}
