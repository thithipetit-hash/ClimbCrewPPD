import React from "react";
import Button from "./Button.jsx";
import { GRADES, formatDateShortFr, formatRouteForRealisation, fullName } from "../lib/domain.js";
import {
  REALISATION_CRITERION_LABELS,
  REALISATION_MODE_LABELS,
} from "../lib/realisation-mode.js";

export default function RealisationModal({
  open,
  route,
  newRealisation,
  setNewRealisation,
  availableDays,
  eligibleParticipants,
  participants,
  routes,
  routesById,
  onRouteIdChange,
  onClose,
  onSubmit,
}) {
  const forcedMoulinette = Boolean(route?.moulinetteOnly);
  const selectedMode = forcedMoulinette
    ? "moulinette"
    : (newRealisation.modeRealisation || "en_tete");

  React.useEffect(() => {
    if (!open) return;
    setNewRealisation((prev) => {
      const modeRealisation = forcedMoulinette
        ? "moulinette"
        : (prev.modeRealisation || "en_tete");
      const styleRealisation = REALISATION_CRITERION_LABELS[prev.styleRealisation]
        ? prev.styleRealisation
        : "a_vue";
      if (prev.modeRealisation === modeRealisation && prev.styleRealisation === styleRealisation) {
        return prev;
      }
      return { ...prev, modeRealisation, styleRealisation };
    });
  }, [open, forcedMoulinette, setNewRealisation]);


  if (!open) return null;

  const eligibleParticipantIds = new Set(eligibleParticipants.map((participant) => String(participant.id)));
  const eligibleBelayers = participants.filter((participant) => (
    eligibleParticipantIds.has(String(participant.id))
    && String(participant.id) !== String(newRealisation.participantId)
  ));

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Enregistrer une voie réalisée">
      <div className="modal-panel">
        <div className="card-header">
          <div>
            <h2 className="modal-title">Enregistrer une voie réalisée</h2>
            <div className="small">{route ? formatRouteForRealisation(route) : "Choisir une voie"}</div>
          </div>
          <Button variant="dangerGhost" className="modal-close" onClick={onClose} aria-label="Fermer">×</Button>
        </div>

        <div className="grid three">
          <div>
            <label>Jour</label>
            <select
              value={newRealisation.selectedDay}
              onChange={(event) => {
                const selectedDay = event.target.value;
                setNewRealisation((prev) => ({ ...prev, selectedDay, sessionId: "", assureurId: "" }));
              }}
            >
              <option value="">Choisir un jour</option>
              {availableDays.length === 0 ? (
                <option value="" disabled>Aucun jour disponible</option>
              ) : (
                availableDays.map((day) => <option key={day} value={day}>{formatDateShortFr(day)}</option>)
              )}
            </select>
            <div className="small" style={{ marginTop: 6, color: "inherit" }}>
              Aucun jour n’est prérempli. Si un participant est sélectionné, seuls ses jours d’inscription sont proposés.
            </div>
          </div>

          <div>
            <label>Participant</label>
            <select
              value={newRealisation.participantId}
              onChange={(event) => {
                const participantId = event.target.value;
                setNewRealisation((prev) => ({ ...prev, participantId, sessionId: "", assureurId: "" }));
              }}
            >
              <option value="">Choisir un participant</option>
              {eligibleParticipants.length === 0 ? (
                <option value="" disabled>Aucun participant éligible</option>
              ) : (
                eligibleParticipants.map((participant) => (
                  <option key={participant.id} value={participant.id}>{fullName(participant)}</option>
                ))
              )}
            </select>
            <div className="small" style={{ marginTop: 6, color: "inherit" }}>
              Seuls les participants cotisants inscrits aux séances du référent ou de l’encadrant à la date choisie sont proposés.
            </div>
          </div>

          <div>
            <label>Voie</label>
            <select
              value={newRealisation.voieId}
              onChange={(event) => {
                const voieId = event.target.value;
                const selectedRoute = routesById[voieId];
                onRouteIdChange(voieId);
                setNewRealisation((prev) => ({
                  ...prev,
                  voieId,
                  modeRealisation: selectedRoute?.moulinetteOnly
                    ? "moulinette"
                    : (prev.modeRealisation || "en_tete"),
                  styleRealisation: REALISATION_CRITERION_LABELS[prev.styleRealisation]
                    ? prev.styleRealisation
                    : "a_vue",
                  cotationProposee: selectedRoute?.cotationAjustee || selectedRoute?.cotationReference || "",
                }));
              }}
            >
              <option value="">Choisir une voie</option>
              {routes.map((item) => (
                <option key={item.id} value={item.id}>{formatRouteForRealisation(item)}</option>
              ))}
            </select>
          </div>

          <div className="realisation-mode-field" data-context="new">
            <label>Mode</label>
            <select
              className="realisation-mode-select"
              aria-label="Mode de réalisation"
              value={selectedMode}
              disabled={forcedMoulinette}
              onChange={(event) => setNewRealisation((prev) => ({
                ...prev,
                modeRealisation: event.target.value,
              }))}
            >
              {Object.entries(REALISATION_MODE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {forcedMoulinette && (
              <div className="small" style={{ marginTop: 6, color: "inherit" }}>
                Cette voie est configurée en moulinette uniquement.
              </div>
            )}
          </div>

          <div>
            <label>Critère</label>
            <select
              value={REALISATION_CRITERION_LABELS[newRealisation.styleRealisation] ? newRealisation.styleRealisation : "a_vue"}
              onChange={(event) => setNewRealisation((prev) => ({ ...prev, styleRealisation: event.target.value }))}
            >
              {Object.entries(REALISATION_CRITERION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Cotation proposée</label>
            <select value={newRealisation.cotationProposee} onChange={(event) => setNewRealisation((prev) => ({ ...prev, cotationProposee: event.target.value }))}>
              <option value="">Aucune</option>
              {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </div>

          <div className="realisation-rating">
            <label>Évaluation de la voie (facultative)</label>
            <div className="rating-stars" role="radiogroup" aria-label="Évaluation de la voie de 1 à 5 étoiles">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  type="button"
                  className={rating <= newRealisation.rating ? "rating-star selected" : "rating-star"}
                  key={rating}
                  onClick={() => setNewRealisation((prev) => ({ ...prev, rating }))}
                  role="radio"
                  aria-checked={newRealisation.rating === rating}
                  aria-label={`${rating} étoile${rating > 1 ? "s" : ""}`}
                >{rating <= newRealisation.rating ? "★" : "☆"}</button>
              ))}
            </div>
          </div>

          <label className="realisation-flight-toggle">
            <input
              type="checkbox"
              checked={newRealisation.chute}
              onChange={(event) => setNewRealisation((prev) => ({
                ...prev,
                chute: event.target.checked,
                assureurId: event.target.checked ? prev.assureurId : "",
              }))}
            />
            <span>Le grimpeur a volé</span>
          </label>

          {newRealisation.chute && (
            <div>
              <label>Binôme assureur</label>
              <select value={newRealisation.assureurId} onChange={(event) => setNewRealisation((prev) => ({ ...prev, assureurId: event.target.value }))}>
                <option value="">Choisir le binôme</option>
                {eligibleBelayers.length === 0 ? (
                  <option value="" disabled>Aucun assureur éligible</option>
                ) : (
                  eligibleBelayers.map((participant) => <option key={participant.id} value={participant.id}>{fullName(participant)}</option>)
                )}
              </select>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Commentaire</label>
          <input value={newRealisation.commentaire} onChange={(event) => setNewRealisation((prev) => ({ ...prev, commentaire: event.target.value }))} />
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            onClick={onSubmit}
            disabled={!newRealisation.selectedDay || !newRealisation.participantId || !newRealisation.voieId || (newRealisation.chute && !newRealisation.assureurId) || eligibleParticipants.length === 0}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
