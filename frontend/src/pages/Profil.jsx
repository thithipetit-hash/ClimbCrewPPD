import React from "react";
import Button from "../components/Button.jsx";
import ClimberProfilePanel from "../components/ClimberProfilePanel.jsx";
import ParticipantBadges from "../components/ParticipantBadges.jsx";
import ProfileGecko from "../components/ProfileGecko.jsx";
import RealisationVideoAnalysis from "../components/RealisationVideoAnalysis.jsx";
import CprEvolutionChart from "../sections/CprEvolutionChart.jsx";
import { apiFetch } from "../lib/api.js";
import {
  fullName,
  formatPoints,
  formatDateShortFr,
  formatRouteForRealisation,
  gradeToIndex,
} from "../lib/domain.js";
import {
  REALISATION_CRITERION_LABELS,
  REALISATION_MODE_LABELS,
  getRealisationCriterion,
  getRealisationMode,
} from "../lib/realisation-mode.js";

function sortParticipantsForProfile(participants, myParticipantId) {
  return [...participants].sort((a, b) => {
    const aIsMe = String(a.id) === String(myParticipantId || "");
    const bIsMe = String(b.id) === String(myParticipantId || "");
    if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
    return fullName(a).localeCompare(fullName(b), "fr");
  });
}

export default function Profil({
  USE_API,
  authUser,
  myParticipant,
  myParticipantId,
  myRealisations,
  allRealisations,
  myProfileStats,
  cprByParticipantId,
  pointsByParticipantId,
  sessionStats,
  routesById,
  getParticipantSessions,
  getPassportStyle,
  getPassportDotStyle,
  normalizePassport,
  updateMyProfile,
  exportMyRealisationsCsv,
}) {
  const [participants, setParticipants] = React.useState(() => myParticipant ? [myParticipant] : []);
  const [selectedParticipantId, setSelectedParticipantId] = React.useState(() => String(myParticipantId || ""));
  const [realisations, setRealisations] = React.useState(() => Array.isArray(allRealisations) ? allRealisations : []);
  const [profileError, setProfileError] = React.useState("");

  React.useEffect(() => {
    setRealisations(Array.isArray(allRealisations) ? allRealisations : []);
  }, [allRealisations]);

  React.useEffect(() => {
    if (!selectedParticipantId && myParticipantId) {
      setSelectedParticipantId(String(myParticipantId));
    }
  }, [myParticipantId, selectedParticipantId]);

  React.useEffect(() => {
    if (!USE_API) return;
    let mounted = true;
    apiFetch("/participants")
      .then((data) => {
        if (!mounted || !Array.isArray(data)) return;
        setParticipants(sortParticipantsForProfile(data, myParticipantId));
      })
      .catch((error) => {
        if (mounted) setProfileError(String(error.message || error));
      });
    return () => { mounted = false; };
  }, [USE_API, myParticipantId]);

  if (!USE_API) return <div className="card"><div className="muted-box">Profil est disponible avec le backend API.</div></div>;

  if (!myParticipant) {
    return <div className="stack"><div className="card"><div className="muted-box">Votre compte n'est pas encore relié à une fiche grimpeur. Demandez à un administrateur de faire l'association pour retrouver votre profil et votre progression ici.</div></div></div>;
  }

  const selectedParticipant = participants.find((participant) => String(participant.id) === String(selectedParticipantId))
    || (String(selectedParticipantId) === String(myParticipantId) ? myParticipant : null);
  const isOwnProfile = Boolean(selectedParticipant && String(selectedParticipant.id) === String(myParticipantId));
  const selectedRealisations = realisations
    .filter((realisation) => String(realisation.participantId) === String(selectedParticipantId))
    .sort((a, b) => String(b.dateRealisation || "").localeCompare(String(a.dateRealisation || "")));
  const cpr = cprByParticipantId[selectedParticipantId] || {};
  const points = pointsByParticipantId[selectedParticipantId] || 0;
  const participations = sessionStats.participationCount[selectedParticipantId] || 0;
  const grades = selectedRealisations
    .map((realisation) => routesById[realisation.voieId]?.cotationAjustee || routesById[realisation.voieId]?.cotationReference)
    .filter(Boolean);
  const bestGrade = grades.length
    ? grades.reduce((best, current) => gradeToIndex(current) > gradeToIndex(best) ? current : best)
    : "";
  const profileIsVisible = isOwnProfile || selectedParticipant?.profilePublic !== false;

  async function handleProfileUpdate(patch) {
    if (!isOwnProfile) return;
    if (!Object.prototype.hasOwnProperty.call(patch || {}, "sexe")) {
      return updateMyProfile(patch);
    }
    const normalizedSexe = String(patch.sexe || "").trim().toLowerCase() === "m"
      ? "h"
      : String(patch.sexe || "").trim().toLowerCase();
    return updateMyProfile({ ...patch, sexe: normalizedSexe });
  }

  async function refreshRealisations() {
    const data = await apiFetch("/realisations");
    if (Array.isArray(data)) setRealisations(data);
  }

  async function updateOwnRealisation(realisationId, patch) {
    if (!isOwnProfile) return;
    try {
      setProfileError("");
      await apiFetch(`/realisations/${encodeURIComponent(realisationId)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      await refreshRealisations();
    } catch (error) {
      setProfileError(String(error.message || error));
    }
  }

  async function deleteOwnRealisation(realisation) {
    if (!isOwnProfile || !realisation?.id) return;
    const route = routesById[realisation.voieId];
    const label = route ? formatRouteForRealisation(route) : "cette réalisation";
    if (!window.confirm(`Supprimer définitivement ${label} ?`)) return;
    try {
      setProfileError("");
      await apiFetch(`/realisations/${encodeURIComponent(realisation.id)}`, { method: "DELETE" });
      await refreshRealisations();
    } catch (error) {
      setProfileError(String(error.message || error));
    }
  }

  return (
    <div className="stack unified-profile-page">
      <div className="card profile-selector-card">
        <label htmlFor="profile-climber-select">Grimpeur affiché</label>
        <select
          id="profile-climber-select"
          value={selectedParticipantId}
          onChange={(event) => setSelectedParticipantId(event.target.value)}
        >
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {fullName(participant)}{String(participant.id) === String(myParticipantId) ? " — moi" : ""}
            </option>
          ))}
        </select>
      </div>

      {profileError && <div className="muted-box" role="alert">{profileError}</div>}

      {!selectedParticipant ? (
        <div className="card"><div className="muted-box">Choisissez un grimpeur.</div></div>
      ) : (
        <>
          <div className="card" style={getPassportStyle(selectedParticipant)} data-passport={normalizePassport(selectedParticipant.passport)}>
            <div className="card-header">
              <div className="participant-identity">
                <span className="passport-dot" style={getPassportDotStyle(selectedParticipant)} aria-hidden="true" />
                <div>
                  <h2 style={{ margin: 0 }}>{fullName(selectedParticipant)}</h2>
                  {isOwnProfile && <div className="small">{authUser.email}</div>}
                </div>
              </div>
            </div>
            <div className="group" style={{ marginTop: 10 }}>
              <span className="pill">Passeport : {selectedParticipant.passport || "-"}</span>
              <span className="pill">Cotisation : {selectedParticipant.cotisation ? "Oui" : "Non"}</span>
              <span className="pill">Licence FFME : {selectedParticipant.ffme ? "Oui" : "Non"}</span>
              <span className="pill">Sexe : {selectedParticipant.sexe ? String(selectedParticipant.sexe).toUpperCase() : "Non précisé"}</span>
            </div>
          </div>

          {isOwnProfile && (
            <div className="card profile-privacy-card">
              <div>
                <strong>Visibilité du profil</strong>
                <div className="small">Un profil public permet aux autres grimpeurs de consulter votre avatar, vos statistiques et votre progression.</div>
              </div>
              <label className="profile-privacy-toggle">
                <input
                  type="checkbox"
                  checked={myParticipant.profilePublic !== false}
                  onChange={(event) => handleProfileUpdate({ profilePublic: event.target.checked })}
                />
                <span>{myParticipant.profilePublic !== false ? "Public" : "Privé"}</span>
              </label>
            </div>
          )}

          {!profileIsVisible ? (
            <div className="muted-box private-profile-notice">Ce grimpeur a choisi de conserver son profil privé.</div>
          ) : (
            <>
              <ProfileGecko
                grade={cpr.currentGrade || ""}
                sexe={selectedParticipant.sexe}
                participant={selectedParticipant}
                editable={isOwnProfile}
                onProfileUpdate={isOwnProfile ? handleProfileUpdate : undefined}
              />

              <div className="card profile-stats-card" aria-label="Statistiques du grimpeur">
                <div className="stats-grid profile-stats-grid">
                  <div className="stat"><div className="label">Voies réalisées</div><div className="value">{selectedRealisations.length}</div></div>
                  <div className="stat"><div className="label">Meilleure cotation</div><div className="value">{bestGrade || (isOwnProfile ? myProfileStats.bestAll : "-") || "-"}</div></div>
                  <div className="stat"><div className="label">CPR actuel</div><div className="value">{cpr.currentGrade || "-"}</div></div>
                  <div className="stat"><div className="label">Points</div><div className="value">{formatPoints(points)}</div></div>
                  <div className="stat"><div className="label">Séances</div><div className="value">{participations}</div></div>
                </div>
              </div>

              <ClimberProfilePanel realisations={selectedRealisations} routesById={routesById} cprGrade={cpr.currentGrade || ""} />
              <ParticipantBadges participant={selectedParticipant} realisations={selectedRealisations} allRealisations={realisations} routesById={routesById} sessions={getParticipantSessions(selectedParticipantId)} />
              <div className="card"><CprEvolutionChart realisations={selectedRealisations} routesById={routesById} /></div>

              <div className="card">
                <div className="card-header">
                  <h3>Réalisations</h3>
                  <span className="badge">{selectedRealisations.length}</span>
                </div>
                <div className="stack">
                  {selectedRealisations.length === 0 ? (
                    <div className="muted-box">Aucune réalisation enregistrée.</div>
                  ) : selectedRealisations.map((realisation) => {
                    const route = routesById[realisation.voieId];
                    const modeRealisation = getRealisationMode(realisation, route);
                    const criterionRealisation = getRealisationCriterion(realisation);
                    const modeLabel = REALISATION_MODE_LABELS[modeRealisation] || modeRealisation;
                    const criterionLabel = criterionRealisation
                      ? REALISATION_CRITERION_LABELS[criterionRealisation]
                      : "Critère non précisé (historique)";
                    const forcedMoulinette = Boolean(route?.moulinetteOnly);
                    return (
                      <details className="subcard editable-realisation-card" key={realisation.id}>
                        <summary className="card-header realisation-summary">
                          <div>
                            <strong>{route ? formatRouteForRealisation(route) : "Voie inconnue"}</strong>
                            <div className="small">{formatDateShortFr(realisation.dateRealisation?.slice(0, 10))} · {modeLabel} · {criterionLabel}</div>
                          </div>
                          {isOwnProfile && <Button variant="danger" onClick={(event) => { event.preventDefault(); event.stopPropagation(); deleteOwnRealisation(realisation); }}>Supprimer</Button>}
                        </summary>
                        <div className="grid two">
                          <div className="realisation-mode-field" data-context="existing">
                            <label>Mode</label>
                            <select
                              className="realisation-mode-select"
                              aria-label="Mode de réalisation"
                              value={modeRealisation}
                              disabled={!isOwnProfile || forcedMoulinette}
                              onChange={(event) => updateOwnRealisation(realisation.id, { modeRealisation: event.target.value })}
                            >
                              {Object.entries(REALISATION_MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                            {forcedMoulinette && <div className="small">Cette voie est configurée en moulinette uniquement.</div>}
                          </div>
                          <div>
                            <label>Critère</label>
                            <select
                              value={criterionRealisation}
                              disabled={!isOwnProfile}
                              onChange={(event) => updateOwnRealisation(realisation.id, { styleRealisation: event.target.value })}
                            >
                              {!criterionRealisation && <option value="" disabled>Non précisé (historique)</option>}
                              {Object.entries(REALISATION_CRITERION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label>Commentaire</label>
                            <input
                              value={realisation.commentaire || ""}
                              disabled={!isOwnProfile}
                              onChange={(event) => updateOwnRealisation(realisation.id, { commentaire: event.target.value })}
                            />
                          </div>
                        </div>

                        <RealisationVideoAnalysis
                          realisation={realisation}
                          route={route}
                          editable={isOwnProfile}
                          onUpdate={(patch) => updateOwnRealisation(realisation.id, patch)}
                          onRefresh={refreshRealisations}
                        />
                      </details>
                    );
                  })}
                </div>
              </div>

              {isOwnProfile && (
                <div className="card">
                  <div className="card-header">
                    <h3>Export</h3>
                    <Button variant="secondary" onClick={exportMyRealisationsCsv} disabled={myRealisations.length === 0}>Exporter pour theCrag</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
