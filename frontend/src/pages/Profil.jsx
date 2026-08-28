import React from "react";
import Button from "../components/Button.jsx";
import ClimberProfilePanel from "../components/ClimberProfilePanel.jsx";
import ParticipantBadges from "../components/ParticipantBadges.jsx";
import ProfileGecko from "../components/ProfileGecko.jsx";
import CprEvolutionChart from "../sections/CprEvolutionChart.jsx";
import { fullName, formatPoints } from "../lib/domain.js";

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
  if (!USE_API) return <div className="card"><div className="muted-box">Mon Profil est disponible avec le backend API.</div></div>;

  if (!myParticipant) {
    return <div className="stack"><div className="card"><div className="muted-box">Votre compte n'est pas encore relié à une fiche grimpeur. Demandez à un administrateur de faire l'association pour retrouver vos statistiques et vos badges ici.</div></div></div>;
  }

  const cpr = cprByParticipantId[myParticipantId] || {};
  const points = pointsByParticipantId[myParticipantId] || 0;
  const participations = sessionStats.participationCount[myParticipantId] || 0;

  async function handleProfileUpdate(patch) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, "sexe")) {
      return updateMyProfile(patch);
    }

    const normalizedSexe = String(patch.sexe || "").trim().toLowerCase() === "m"
      ? "h"
      : String(patch.sexe || "").trim().toLowerCase();

    // Utilise la mise à jour optimiste du profil déjà gérée par App :
    // le sexe et l'avatar évolutif changent immédiatement sans recharger
    // toute l'application ni relancer la vidéo d'introduction.
    return updateMyProfile({ ...patch, sexe: normalizedSexe });
  }

  return (
    <div className="stack">
      <div className="card" style={getPassportStyle(myParticipant)} data-passport={normalizePassport(myParticipant.passport)}>
        <div className="card-header">
          <div className="participant-identity">
            <span className="passport-dot" style={getPassportDotStyle(myParticipant)} aria-hidden="true" />
            <div><h2 style={{ margin: 0 }}>{fullName(myParticipant)}</h2><div className="small">{authUser.email}</div></div>
          </div>
        </div>
        <div className="group" style={{ marginTop: 10 }}>
          <span className="pill">Passeport : {myParticipant.passport || "-"}</span>
          <span className="pill">Cotisation : {myParticipant.cotisation ? "Oui" : "Non"}</span>
          <span className="pill">Licence FFME : {myParticipant.ffme ? "Oui" : "Non"}</span>
          <span className="pill">Sexe : {myParticipant.sexe ? String(myParticipant.sexe).toUpperCase() : "Non précisé"}</span>
        </div>
      </div>

      <ProfileGecko grade={cpr.currentGrade || ""} sexe={myParticipant.sexe} participant={myParticipant} onProfileUpdate={handleProfileUpdate} />

      <div className="card profile-stats-card" aria-label="Mes statistiques">
        <div className="stats-grid profile-stats-grid">
          <div className="stat"><div className="label">Voies réalisées</div><div className="value">{myProfileStats.count}</div></div>
          <div className="stat"><div className="label">Meilleure cotation</div><div className="value">{myProfileStats.bestAll || "-"}</div></div>
          <div className="stat"><div className="label">CPR actuel</div><div className="value">{cpr.currentGrade || "-"}</div></div>
          <div className="stat"><div className="label">Points</div><div className="value">{formatPoints(points)}</div></div>
          <div className="stat"><div className="label">Séances</div><div className="value">{participations}</div></div>
        </div>
      </div>

      <ClimberProfilePanel realisations={myRealisations} routesById={routesById} cprGrade={cpr.currentGrade || ""} />
      <ParticipantBadges participant={myParticipant} realisations={myRealisations} allRealisations={allRealisations} routesById={routesById} sessions={getParticipantSessions(myParticipantId)} />
      <div className="card"><CprEvolutionChart realisations={myRealisations} routesById={routesById} /></div>

      <div className="card"><div className="card-header"><h3>Export</h3><Button variant="secondary" onClick={exportMyRealisationsCsv} disabled={myRealisations.length === 0}>Exporter pour theCrag</Button></div></div>
    </div>
  );
}
