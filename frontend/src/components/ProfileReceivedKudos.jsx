import { fullName, formatDateShortFr, formatRouteForRealisation } from "../lib/domain.js";

export default function ProfileReceivedKudos({ realisations = [], routesById = {}, participants = [] }) {
  const participantsById = Object.fromEntries(
    participants.map((participant) => [String(participant.id), participant]),
  );
  const kudosRealisations = realisations.filter((realisation) => Number(realisation.kudosCount || 0) > 0);
  const totalKudos = kudosRealisations.reduce((total, realisation) => total + Number(realisation.kudosCount || 0), 0);

  return (
    <details className="card profile-kudos-received-card">
      <summary className="card-header" style={{ cursor: "pointer" }}>
        <div className="group">
          <h3 style={{ margin: 0 }}>Kudos reçus</h3>
          <span className="badge">{totalKudos}</span>
        </div>
        <span className="small">Cliquer pour afficher</span>
      </summary>
      <div className="stack" style={{ marginTop: 10 }}>
        {kudosRealisations.length === 0 ? (
          <div className="muted-box">Aucun Kudo reçu pour le moment.</div>
        ) : kudosRealisations.map((realisation) => {
          const route = routesById[realisation.voieId];
          const donorNames = (Array.isArray(realisation.kudosParticipantIds) ? realisation.kudosParticipantIds : [])
            .map((participantId) => participantsById[String(participantId)])
            .filter(Boolean)
            .map(fullName);
          return (
            <div className="subcard" key={realisation.id}>
              <div className="card-header">
                <div>
                  <strong>{route ? formatRouteForRealisation(route) : "Voie inconnue"}</strong>
                  <div className="small">{formatDateShortFr(realisation.dateRealisation?.slice(0, 10))}</div>
                </div>
                <span className="pill">👍 {Number(realisation.kudosCount || 0)}</span>
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                <strong>Donné{donorNames.length > 1 ? "s" : ""} par :</strong>{" "}
                {donorNames.length > 0 ? donorNames.join(", ") : "Nom indisponible"}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
