import React from "react";
import Button from "../components/Button.jsx";
import ClimberProfilePanel from "../components/ClimberProfilePanel.jsx";
import ParticipantBadges from "../components/ParticipantBadges.jsx";
import ProfileGecko from "../components/ProfileGecko.jsx";
import ProfileRealisationRecorder from "../components/ProfileRealisationRecorder.jsx";
import RealisationVideoAnalysis from "../components/RealisationVideoAnalysis.jsx";
import CprEvolutionChart from "../sections/CprEvolutionChart.jsx";
import { apiFetch, apiUpload } from "../lib/api.js";
import {
  fullName,
  formatPoints,
  formatDateShortFr,
  formatRouteForRealisation,
  gradeToIndex,
  normalizeRopeNumber,
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

function sortRealisationsForDisplay(realisations, routesById, sortBy) {
  return [...realisations].sort((a, b) => {
    const dateOrder = String(b.dateRealisation || "").localeCompare(String(a.dateRealisation || ""));
    if (sortBy === "date") return dateOrder;

    const routeA = routesById[a.voieId];
    const routeB = routesById[b.voieId];

    if (sortBy === "rope") {
      const ropeOrder = normalizeRopeNumber(routeA?.numeroCorde) - normalizeRopeNumber(routeB?.numeroCorde);
      return ropeOrder || dateOrder;
    }

    if (sortBy === "difficulty") {
      const gradeA = routeA?.cotationAjustee || routeA?.cotationReference || "";
      const gradeB = routeB?.cotationAjustee || routeB?.cotationReference || "";
      const gradeOrder = gradeToIndex(gradeB) - gradeToIndex(gradeA);
      return gradeOrder || normalizeRopeNumber(routeA?.numeroCorde) - normalizeRopeNumber(routeB?.numeroCorde) || dateOrder;
    }

    return dateOrder;
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
  onTheCragImported,
  onRealisationsChanged,
}) {
  const [participants, setParticipants] = React.useState(() => myParticipant ? [myParticipant] : []);
  const [selectedParticipantId, setSelectedParticipantId] = React.useState(() => String(myParticipantId || ""));
  const [realisations, setRealisations] = React.useState(() => Array.isArray(allRealisations) ? allRealisations : []);
  const [realisationSort, setRealisationSort] = React.useState("date");
  const [profileError, setProfileError] = React.useState("");
  const [theCragImporting, setTheCragImporting] = React.useState(false);
  const [theCragImportStatus, setTheCragImportStatus] = React.useState(null);
  const [theCragStartDate, setTheCragStartDate] = React.useState("");
  const [kudosPendingId, setKudosPendingId] = React.useState("");

  async function toggleKudo(realisation) {
    if (!myParticipantId || kudosPendingId) return;
    setKudosPendingId(realisation.id);
    try {
      await apiFetch(`/realisations/${encodeURIComponent(realisation.id)}/kudos`, {
        method: realisation.kudosByMe ? "DELETE" : "POST",
      });
      await refreshRealisations();
    } finally {
      setKudosPendingId("");
    }
  }


  React.useEffect(() => {
    setRealisations(Array.isArray(allRealisations) ? allRealisations : []);
  }, [allRealisations]);

  React.useEffect(() => {
    if (!selectedParticipantId && myParticipantId) {
      setSelectedParticipantId(String(myParticipantId));
    }
  }, [myParticipantId, selectedParticipantId]);

  React.useEffect(() => {
    if (!myParticipant?.id) return;
    setParticipants((current) => {
      const participantId = String(myParticipant.id);
      const exists = current.some((participant) => String(participant.id) === participantId);
      const next = exists
        ? current.map((participant) => String(participant.id) === participantId ? myParticipant : participant)
        : [myParticipant, ...current];
      return sortParticipantsForProfile(next, myParticipantId);
    });
  }, [myParticipant, myParticipantId]);

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
  const displayedRealisations = sortRealisationsForDisplay(selectedRealisations, routesById, realisationSort);
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
    if (typeof onRealisationsChanged === "function") {
      await onRealisationsChanged();
    }
  }

  async function resetOwnRealisations() {
    if (!isOwnProfile || selectedRealisations.length === 0) return;
    if (!window.confirm(`Supprimer définitivement vos ${selectedRealisations.length} réalisation(s) ? Cette action est irréversible.`)) return;
    try {
      setProfileError("");
      await apiFetch("/realisations/me", { method: "DELETE" });
      setRealisations((current) => current.filter(
        (realisation) => String(realisation.participantId) !== String(myParticipantId),
      ));
      await refreshRealisations();
    } catch (error) {
      setProfileError(String(error.message || error));
    }
  }

  async function importTheCragFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !isOwnProfile) return;
    try {
      setProfileError("");
      setTheCragImportStatus(null);
      setTheCragImporting(true);
      if (!theCragStartDate) throw new Error("Choisissez une date de début pour l’import theCrag.");
      const result = await apiUpload(`/realisations/import-thecrag?startDate=${encodeURIComponent(theCragStartDate)}`, file, {
        headers: { "Content-Type": "application/vnd.ms-excel", "X-TheCrag-Start-Date": theCragStartDate },
      });
      await refreshRealisations();
      if (typeof onTheCragImported === "function") await onTheCragImported();
      const details = [
        `${result.imported || 0} réalisation(s) importée(s)`,
        result.duplicates ? `${result.duplicates} déjà présente(s)` : "",
        result.unmatched ? `${result.unmatched} voie(s) non reconnue(s)` : "",
        result.invalid ? `${result.invalid} ligne(s) invalide(s)` : "",
        result.filteredBeforeStart ? `${result.filteredBeforeStart} antérieure(s) à la date de début ignorée(s)` : "",
      ].filter(Boolean).join(" · ");
      setTheCragImportStatus({ type: "success", message: `Import theCrag réussi : ${details || "import terminé."}` });
    } catch (error) {
      const message = String(error.message || error);
      setTheCragImportStatus({ type: "error", message: `Problème lors de l’import theCrag : ${message}` });
    } finally {
      setTheCragImporting(false);
    }
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
              <span className="pill">Couleur de passeport : {selectedParticipant.passport || "-"}</span>
              <span className="pill">Passeport FFME : {selectedParticipant.passeportFfme ? "Oui" : "Non"}</span>
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

          {profileIsVisible && (
            <div className="card profile-physical-card">
              <div className="card-header"><h3>Profil physique</h3></div>
              <div className="grid four">
                {[
                  ["heightCm", "Taille", "cm", 80, 250, 0.1],
                  ["weightKg", "Poids", "kg", 20, 250, 0.1],
                  ["armSpanCm", "Envergure", "cm", 80, 280, 0.1],
                  ["standingReachCm", "Portée bras levé", "cm", 100, 350, 0.1],
                ].map(([key, label, unit, min, max, step]) => (
                  <div key={key}>
                    <label>{label} ({unit})</label>
                    <input type="number" min={min} max={max} step={step}
                      value={selectedParticipant[key] ?? ""}
                      disabled={!isOwnProfile}
                      onChange={(event) => handleProfileUpdate({ [key]: event.target.value })} />
                  </div>
                ))}
              </div>
              <div className="group" style={{ marginTop: 10 }}>
                <span className="pill">Ape Index : {selectedParticipant.heightCm && selectedParticipant.armSpanCm ? `${(Number(selectedParticipant.armSpanCm) - Number(selectedParticipant.heightCm)).toFixed(1)} cm` : "-"}</span>
                <span className="pill">Allonge relative : {selectedParticipant.heightCm && selectedParticipant.armSpanCm ? (Number(selectedParticipant.armSpanCm) / Number(selectedParticipant.heightCm)).toFixed(3) : "-"}</span>
              </div>
              <h4 style={{ marginBottom: 8 }}>Tests physiques</h4>
              <div className="grid four">
                {[
                  ["gripStrengthRightKg", "Préhension droite", "kg", 0, 150, 0.1],
                  ["gripStrengthLeftKg", "Préhension gauche", "kg", 0, 150, 0.1],
                  ["hang20mmSeconds", "Suspension 20 mm", "s", 0, 600, 0.1],
                  ["strictPullups", "Tractions strictes", "nb", 0, 200, 1],
                  ["weightedPullupKg", "Traction lestée", "kg", 0, 200, 0.1],
                  ["hipMobilityCm", "Mobilité / ouverture hanches", "cm", 0, 300, 0.1],
                ].map(([key, label, unit, min, max, step]) => (
                  <div key={key}>
                    <label>{label} ({unit})</label>
                    <input type="number" min={min} max={max} step={step}
                      value={selectedParticipant[key] ?? ""}
                      disabled={!isOwnProfile}
                      onChange={(event) => handleProfileUpdate({ [key]: event.target.value })} />
                  </div>
                ))}
              </div>
              {isOwnProfile && <div className="small" style={{ marginTop: 8 }}>Données facultatives. Chaque valeur est enregistrée lors de sa modification.</div>}
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
                  <div className="stat"><div className="label">Kudos reçus</div><div className="value">{selectedRealisations.reduce((total, item) => total + Number(item.kudosCount || 0), 0)}</div></div>
                </div>
              </div>

              <ClimberProfilePanel realisations={selectedRealisations} routesById={routesById} cprGrade={cpr.currentGrade || ""} />
              <ParticipantBadges participant={selectedParticipant} realisations={selectedRealisations} allRealisations={realisations} routesById={routesById} sessions={getParticipantSessions(selectedParticipantId)} />
              <div className="card"><CprEvolutionChart realisations={selectedRealisations} routesById={routesById} /></div>

              {isOwnProfile && (
                <ProfileRealisationRecorder
                  myParticipantId={myParticipantId}
                  routesById={routesById}
                  getParticipantSessions={getParticipantSessions}
                  onSaved={refreshRealisations}
                />
              )}

              <details className="card profile-realisations-card">
                <summary className="card-header" style={{ cursor: "pointer" }}>
                  <div className="group">
                    <h3 style={{ margin: 0 }}>Réalisations</h3>
                    <span className="badge">{selectedRealisations.length}</span>
                  </div>
                  <span className="small">Cliquer pour afficher</span>
                </summary>
                <div style={{ marginTop: 10 }}>
                  {isOwnProfile && selectedRealisations.length > 0 && (
                    <div className="group" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
                      <Button type="button" variant="danger" onClick={resetOwnRealisations}>
                        Reset mes réalisations
                      </Button>
                    </div>
                  )}
                  {selectedRealisations.length > 1 && (
                    <div className="group" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
                      <label className="group" htmlFor="profile-realisation-sort">
                        <span className="small">Trier par</span>
                        <select
                          id="profile-realisation-sort"
                          value={realisationSort}
                          onChange={(event) => setRealisationSort(event.target.value)}
                          style={{ width: "auto", maxWidth: "100%" }}
                        >
                          <option value="date">Date</option>
                          <option value="rope">Corde</option>
                          <option value="difficulty">Difficulté</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="stack">
                    {displayedRealisations.length === 0 ? (
                      <div className="muted-box">Aucune réalisation enregistrée.</div>
                    ) : displayedRealisations.map((realisation) => {
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
                              <div className="small">👍 {Number(realisation.kudosCount || 0)} Kudo{Number(realisation.kudosCount || 0) > 1 ? "s" : ""}</div>
                            </div>
                          </summary>
                          <div className="group" style={{ justifyContent: "flex-end", marginBottom: 8 }}><Button variant="secondary" disabled={!myParticipantId || kudosPendingId === realisation.id} aria-pressed={Boolean(realisation.kudosByMe)} onClick={() => void toggleKudo(realisation)}>👍 {realisation.kudosByMe ? "Kudo donné" : "Kudo"} · {Number(realisation.kudosCount || 0)}</Button></div>
                          {isOwnProfile && (
                            <div className="group" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
                              <Button variant="danger" onClick={() => deleteOwnRealisation(realisation)}>Supprimer</Button>
                            </div>
                          )}
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
              </details>

              {isOwnProfile && (
                <div className="card">
                  <div className="card-header">
                    <h3>theCrag</h3>
                    <div className="group">
                      <label className="inline-field">
                        <span>Date de début</span>
                        <input
                          type="date"
                          value={theCragStartDate}
                          onChange={(event) => setTheCragStartDate(event.target.value)}
                        />
                      </label>
                      <input
                        id="thecrag-import-file"
                        type="file"
                        accept=".xls,application/vnd.ms-excel"
                        style={{ display: "none" }}
                        onChange={importTheCragFile}
                        disabled={theCragImporting || !theCragStartDate}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={theCragImporting || !theCragStartDate}
                        onClick={() => document.getElementById("thecrag-import-file")?.click()}
                      >
                        {theCragImporting ? "Import en cours…" : "Importer depuis theCrag (.xls)"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => exportMyRealisationsCsv(theCragStartDate)}
                        disabled={myRealisations.length === 0 || !theCragStartDate}
                      >
                        Exporter pour theCrag
                      </Button>
                    </div>
                  </div>
                  <div className="small">La date de début est appliquée à l’import et à l’export. Seules les réalisations à compter de cette date sont prises en compte. Format d’import : feuille « Ascents » au format Excel .xls.</div>
                  {theCragImporting && <div className="muted-box" role="status" style={{ marginTop: 8 }}>Import theCrag en cours…</div>}
                  {theCragImportStatus && (
                    <div
                      className={theCragImportStatus.type === "success" ? "success" : "error"}
                      role={theCragImportStatus.type === "success" ? "status" : "alert"}
                      style={{ marginTop: 8 }}
                    >
                      {theCragImportStatus.type === "success" ? "✅ " : "❌ "}
                      {theCragImportStatus.message}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}