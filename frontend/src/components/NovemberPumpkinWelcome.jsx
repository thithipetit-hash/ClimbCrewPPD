import { NOVEMBER_PUMPKIN_COUNT } from "../lib/seasonal-avatar.js";
import "../styles/november-pumpkins.css";

export default function NovemberPumpkinWelcome({ index, onClose }) {
  const column = index % 5;
  const row = Math.floor(index / 5);
  return (
    <aside className="november-pumpkin-welcome" role="region" aria-label="Surprise de novembre">
      <button type="button" className="november-pumpkin-welcome__close" aria-label="Fermer la surprise de novembre" onClick={onClose}>
        ×
      </button>
      <div
        className="november-pumpkin-welcome__art"
        role="img"
        aria-label={`Citrouille grimpeuse ${index + 1} sur ${NOVEMBER_PUMPKIN_COUNT}`}
        style={{
          backgroundPosition: `${column * 25}% ${row * (100 / 3)}%`,
        }}
      />
      <div className="november-pumpkin-welcome__copy">
        <strong>Une citrouille prend de la hauteur !</strong>
        <span>Bonnes grimpes de novembre 🎃</span>
      </div>
    </aside>
  );
}
