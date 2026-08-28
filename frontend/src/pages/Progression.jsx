import React from "react";
import Button from "../components/Button.jsx";
import ParticipantBadges from "../components/ParticipantBadges.jsx";
import { GRADES, fullName, formatRouteForRealisation, formatPoints, formatDateShortFr } from "../lib/domain.js";
import { STYLE_LABELS } from "../lib/ui-config.js";
import CprEvolutionChart from "../sections/CprEvolutionChart.jsx";
import ClimberProfilePanel from "../components/ClimberProfilePanel.jsx";
import ProfileGecko from "../components/ProfileGecko.jsx";

function ratingStars(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "";
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

export default function Progression({
  selectedParticipantProgress,
  selectedParticipant,
  setState,
  selectedRouteProgress,
  setSelectedRouteProgress,
  alphabeticalParticipants,
  routes,
  routesById,
  openRealisationModal,
  participantProgressStats,
  pointsByParticipantId,
  selectedParticipantRealisations,
  progressViewRealisations,
  participantsById,
  getParticipantSessions,
  cprByParticipantId,
  deleteRealisation,
  updateRealisation,
  expandedRealisationIds,
  setRealisationExpanded,
  allProgressRealisationsExpanded,
  toggleAllProgressRealisations,
  allRealisations,
  myParticipantId,
}) {
  const defaultParticipantApplied = React.useRef(false);

  React.useEffect(() => {
    if (defaultParticipantApplied.current || !myParticipantId) return;
    defaultParticipantApplied.current = true;
    if (!selectedParticipantProgress && !selectedRouteProgress) {
      setState((prev) => ({ ...prev, selectedParticipantProgress: String(myParticipantId) }));
    }
  }, [myParticipantId, selectedParticipantProgress, selectedRouteProgress, setState]);

  return (
    <div className="card">
      <div className="grid two progression-filters">
        <div>
          <label>Consulter par grimpeur</label>
          <select
            value={selectedParticipantProgress || ""}
            onChange={(event) => {
              const participantId = event.target.value;
              setState((prev) => ({ ...prev, selectedParticipantProgress: participantId }));
              if (participantId) setSelectedRouteProgress("");
            }}
          >
            <option value="">Choisir un grimpeur</option>
            {alphabeticalParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>{fullName(participant)}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Consulter par voie</label>
          <select
            value={selectedRouteProgress}
            onChange={(event) => {
              const routeId = event.target.value;
              setSelectedRouteProgress(routeId);
              if (routeId) {
                setState((prev) => ({ ...prev, selectedParticipantProgress: "" }));
              }
            }}
          >
            <option value="">Choisir une voie</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {formatRouteForRealisation(route)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <h3>Saisir une réalisation</h3>
          <Button onClick={() => openRealisationModal("", myParticipantId)} disabled={!myParticipantId}>
            Nouvelle réalisation
          </Button>
        </div>
      </div>

      {selectedParticipantProgress && (
        <div className="stats-grid" style={{ marginTop: 12 }}>
          <div className="stat"><div className="label">Voies réalisées</div><div className="value">{participantProgressStats.count}</div></div>
          <div className="stat"><div className="label">Meilleure cotation</div><div className="value">{participantProgressStats.bestAll || "-"}</div></div>
          <div className="stat"><div className="label">CPR actuel</div><div className="value">{participantProgressStats.cpr.currentGrade || "-"}</div></div>
          <div className="stat"><div className="label">Points</div><div className="value">{formatPoints(pointsByParticipantId[selectedParticipantProgress])}</div></div>
        </div>
      )}

      {selectedParticipantProgress && selectedParticipant?.profilePublic !== false && (
        <section className="public-profile-section">
          <ProfileGecko grade={participantProgressStats.cpr.currentGrade || ""} sexe={selectedParticipant.sexe} participant={selectedParticipant} editable={false} compact />
          <ClimberProfilePanel realisations={selectedParticipantRealisations} routesById={routesById} cprGrade={participantProgressStats.cpr.currentGrade || ""} />
        </section>
      )}

      {selectedParticipantProgress && selectedParticipant?.profilePublic === false && (
        <div className="muted-box private-profile-notice">Ce grimpeur a choisi de conserver son profil privé.</div>
      )}

      {selectedParticipantProgress && selectedParticipant?.profilePublic !== false && (
        <ParticipantBadges participant={selectedParticipant} realisations={selectedParticipantRealisations} allRealisations={allRealisations} routesById={routesById} sessions={getParticipantSessions(selectedParticipantProgress)} />
      )}

      {selectedParticipantProgress && selectedParticipant?.profilePublic !== false && (
        <div className="card" style={{ marginTop: 12 }}>
          <CprEvolutionChart realisations={selectedParticipantRealisations} routesById={routesById} />
        </div>
      )}

      {(selectedParticipantProgress || selectedRouteProgress) && <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <h3>{selectedParticipantProgress ? "Réalisations du grimpeur" : selectedRouteProgress ? "Grimpeurs ayant réalisé la voie" : "Réalisations"}</h3>
          <div className="group">
            {progressViewRealisations.length > 1 && (
              <Button variant="secondary" onClick={toggleAllProgressRealisations} aria-expanded={allProgressRealisationsExpanded}>
                {allProgressRealisationsExpanded ? "Tout replier" : "Tout déployer"}
              </Button>
            )}
            {(selectedParticipantProgress || selectedRouteProgress) && <span className="badge">{progressViewRealisations.length}</span>}
          </div>
        </div>

        <div className="stack">
          {progressViewRealisations.length === 0 ? <div className="muted-box">Aucune réalisation enregistrée pour cette sélection.</div> : progressViewRealisations.map((realisation) => {
            const participant = participantsById[realisation.participantId];
            const route = routesById[realisation.voieId];
            const availableSessionsForRealisation = getParticipantSessions(realisation.participantId);
            const displayedRating = ratingStars(realisation.rating);
            const canEditRealisation = String(realisation.participantId) === String(myParticipantId);
            const isIncludedInCpr = Boolean(cprByParticipantId[realisation.participantId]?.timeline.some((performance) => String(performance.id) === String(realisation.id)));
            return (
              <details className="subcard editable-realisation-card" key={realisation.id} open={expandedRealisationIds.includes(realisation.id)} onToggle={(event) => setRealisationExpanded(realisation.id, event.currentTarget.open)}>
                <summary className="card-header realisation-summary">
                  <div>
                    <strong>{!selectedParticipantProgress && `${fullName(participant)} — `}{route ? formatRouteForRealisation(route) : "Voie inconnue"}</strong>
                    <div className="small">{formatDateShortFr(realisation.dateRealisation?.slice(0, 10))} · {STYLE_LABELS[realisation.styleRealisation] || realisation.styleRealisation}{realisation.chute && <> · Vol{realisation.assureurId && participantsById[realisation.assureurId] ? ` · assuré par ${fullName(participantsById[realisation.assureurId])}` : ""}</>}{displayedRating && <> · <span aria-label={`Évaluation ${Number(realisation.rating)} sur 5`}>{displayedRating}</span></>}</div>
                  </div>
                  <div className="group">{isIncludedInCpr && <span className="pill">Prise en compte dans le CPR</span>}{canEditRealisation && <Button variant="danger" className="realisation-delete-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); deleteRealisation(realisation); }}>Supprimer</Button>}</div>
                </summary>
                <div className="grid three">
                  <div><label>Séance</label><select value={realisation.sessionId} disabled={!canEditRealisation} onChange={(event) => updateRealisation(realisation.id, { sessionId: event.target.value })}>{availableSessionsForRealisation.length === 0 ? <option value="">Aucune séance inscrite</option> : availableSessionsForRealisation.map((sessionOption) => <option key={sessionOption.id} value={sessionOption.id}>{formatDateShortFr(sessionOption.date)} · {sessionOption.slot}</option>)}</select></div>
                  <div><label>Voie</label><select value={realisation.voieId} disabled={!canEditRealisation} onChange={(event) => updateRealisation(realisation.id, { voieId: event.target.value })}>{routes.map((routeOption) => <option key={routeOption.id} value={routeOption.id}>{formatRouteForRealisation(routeOption)}</option>)}</select></div>
                  <div><label>Style</label><select value={realisation.styleRealisation} disabled={!canEditRealisation} onChange={(event) => updateRealisation(realisation.id, { styleRealisation: event.target.value })}>{Object.entries(STYLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
                  <div><label>Cotation proposée</label><select value={realisation.cotationProposee || ""} disabled={!canEditRealisation} onChange={(event) => updateRealisation(realisation.id, { cotationProposee: event.target.value })}><option value="">Aucune</option>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></div>
                  {displayedRating && <div><label>Évaluation</label><div className="pill" aria-label={`Évaluation ${Number(realisation.rating)} sur 5`}>{displayedRating}</div></div>}
                </div>
                <div style={{ marginTop: 8 }}><label>Commentaire</label><input value={realisation.commentaire || ""} disabled={!canEditRealisation} onChange={(event) => updateRealisation(realisation.id, { commentaire: event.target.value })} /></div>
              </details>
            );
          })}
        </div>
      </div>}
    </div>
  );
}
