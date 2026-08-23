import React, { useEffect, useState } from "react";
import ClimberProfilePanel from "../components/ClimberProfilePanel.jsx";
import ParticipantBadges from "../components/ParticipantBadges.jsx";
import ProfileGecko from "../components/ProfileGecko.jsx";
import CprEvolutionChart from "../sections/CprEvolutionChart.jsx";
import { fullName, formatPoints } from "../lib/domain.js";
import { apiFetch } from "../lib/api.js";

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
}) {
  const [receiveAccountNotifications, setReceiveAccountNotifications] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    if (!USE_API || authUser?.role !== "admin") return undefined;

    let mounted = true;
    setNotificationLoading(true);
    setNotificationError("");

    apiFetch("/auth/notification-preference")
      .then((data) => {
        if (mounted) setReceiveAccountNotifications(Boolean(data?.receiveAccountNotifications));
      })
      .catch((error) => {
        if (mounted) setNotificationError(String(error.message || error));
      })
      .finally(() => {
        if (mounted) setNotificationLoading(false);
      });

    return () => { mounted = false; };
  }, [USE_API, authUser?.id, authUser?.role]);

  async function saveAccountNotificationPreference(enabled) {
    const previous = receiveAccountNotifications;
    setReceiveAccountNotifications(enabled);
    setNotificationSaving(true);
    setNotificationError("");
    try {
      const result = await apiFetch("/auth/notification-preference", {
        method: "PATCH",
        body: JSON.stringify({ receiveAccountNotifications: enabled }),
      });
      setReceiveAccountNotifications(Boolean(result?.receiveAccountNotifications));
    } catch (error) {
      setReceiveAccountNotifications(previous);
      setNotificationError(String(error.message || error));
    } finally {
      setNotificationSaving(false);
    }
  }

  const adminNotificationCard = authUser?.role === "admin" ? (
    <div className="card profile-privacy-card">
      <div>
        <strong>Notifications administrateur</strong>
        <div className="small">Recevoir un e-mail lorsqu'une nouvelle demande de compte est confirmée.</div>
      </div>
      <label className="profile-privacy-toggle">
        <input
          type="checkbox"
          checked={receiveAccountNotifications}
          disabled={notificationLoading || notificationSaving}
          onChange={(event) => saveAccountNotificationPreference(event.target.checked)}
        />
        <span>{receiveAccountNotifications ? "E-mails activés" : "E-mails désactivés"}</span>
      </label>
      {notificationError && <div className="error">{notificationError}</div>}
    </div>
  ) : null;

  if (!USE_API) {
    return <div className="card"><div className="muted-box">Mon Profil est disponible avec le backend API.</div></div>;
  }

  if (!myParticipant) {
    return (
      <div className="stack">
        <div className="card">
          <div className="muted-box">
            Votre compte n'est pas encore relié à une fiche grimpeur. Demandez à un administrateur de faire l'association pour retrouver vos statistiques et vos badges ici.
          </div>
        </div>
        {adminNotificationCard}
      </div>
    );
  }

  const cpr = cprByParticipantId[myParticipantId] || {};
  const points = pointsByParticipantId[myParticipantId] || 0;
  const participations = sessionStats.participationCount[myParticipantId] || 0;

  return (
    <div className="stack">
      <div className="card" style={getPassportStyle(myParticipant)} data-passport={normalizePassport(myParticipant.passport)}>
        <div className="card-header">
          <div className="participant-identity">
            <span className="passport-dot" style={getPassportDotStyle(myParticipant)} aria-hidden="true" />
            <div>
              <h2 style={{ margin: 0 }}>{fullName(myParticipant)}</h2>
              <div className="small">{authUser.email}</div>
            </div>
          </div>
        </div>
        <div className="group" style={{ marginTop: 10 }}>
          <span className="pill">Passeport : {myParticipant.passport || "-"}</span>
          <span className="pill">Cotisation : {myParticipant.cotisation ? "Oui" : "Non"}</span>
          <span className="pill">Licence FFME : {myParticipant.ffme ? "Oui" : "Non"}</span>
          <span className="pill">Sexe : {myParticipant.sexe ? String(myParticipant.sexe).toUpperCase() : "Non précisé"}</span>
        </div>
      </div>

      {adminNotificationCard}

      <ProfileGecko
        grade={cpr.currentGrade || ""}
        sexe={myParticipant.sexe}
        participant={myParticipant}
        onProfileUpdate={updateMyProfile}
      />

      <div className="card profile-stats-card" aria-label="Mes statistiques">
        <div className="stats-grid profile-stats-grid">
          <div className="stat"><div className="label">Voies réalisées</div><div className="value">{myProfileStats.count}</div></div>
          <div className="stat"><div className="label">Meilleure cotation</div><div className="value">{myProfileStats.bestAll || "-"}</div></div>
          <div className="stat"><div className="label">CPR actuel</div><div className="value">{cpr.currentGrade || "-"}</div></div>
          <div className="stat"><div className="label">Points</div><div className="value">{formatPoints(points)}</div></div>
          <div className="stat"><div className="label">Séances</div><div className="value">{participations}</div></div>
        </div>
      </div>

      <ClimberProfilePanel
        realisations={myRealisations}
        routesById={routesById}
        cprGrade={cpr.currentGrade || ""}
      />

      <ParticipantBadges
        participant={myParticipant}
        realisations={myRealisations}
        allRealisations={allRealisations}
        routesById={routesById}
        sessions={getParticipantSessions(myParticipantId)}
      />

      <div className="card">
        <CprEvolutionChart realisations={myRealisations} routesById={routesById} />
      </div>
    </div>
  );
}
