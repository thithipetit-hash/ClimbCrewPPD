import Button from "./Button.jsx";
import { formatDateShortFr, formatRouteForRealisation } from "../lib/domain.js";

export default function CprDetailsModal({
  open,
  cpr,
  realisations = [],
  routesById = {},
  onClose,
}) {
  if (!open) return null;

  const realisationsById = Object.fromEntries(
    realisations.map((realisation) => [String(realisation.id), realisation]),
  );
  const timeline = Array.isArray(cpr?.timeline) ? cpr.timeline : [];
  const count = timeline.length;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cpr-details-title">
      <div className="modal-panel cpr-details-modal">
        <div className="card-header">
          <div>
            <div className="small">CPR actuel : {cpr?.currentGrade || "-"}</div>
            <h2 id="cpr-details-title" className="modal-title">Voies prises en compte</h2>
          </div>
        </div>

        <div className="small cpr-details-help">
          Le CPR est la moyenne des valeurs pondérées des 10 meilleures réalisations éligibles des 90 derniers jours. Chaque valeur correspond à l’indice de cotation multiplié par le coefficient du mode de réalisation.
        </div>

        {timeline.length === 0 ? (
          <div className="muted-box">Aucune voie n’est actuellement prise en compte dans le CPR.</div>
        ) : (
          <ol className="cpr-details-list">
            {timeline.map((item, index) => {
              const realisation = realisationsById[String(item.id)];
              const route = realisation ? routesById[realisation.voieId] : null;

              return (
                <li key={String(item.id)} className="cpr-details-item">
                  <span className="cpr-details-rank" aria-hidden="true">{index + 1}</span>
                  <div className="cpr-details-copy">
                    <strong>{route ? formatRouteForRealisation(route) : `Cotation ${item.grade || "-"}`}</strong>
                    <span className="small">
                      Réalisée le {formatDateShortFr(item.date || realisation?.dateRealisation)}
                    </span>
                    <span className="small">
                      Valeur CPR de la voie : {Number.isFinite(item.weightedIndex) ? item.weightedIndex.toFixed(2) : "–"}
                      {count > 0 && Number.isFinite(item.weightedIndex) ? ` · Contribution à la moyenne : ${(item.weightedIndex / count).toFixed(2)}` : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="group cpr-details-actions">
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
