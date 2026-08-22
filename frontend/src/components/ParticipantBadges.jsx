import React, { useMemo, useState } from "react";
import { BADGE_FAMILY_LABELS, calculateParticipantBadges, calculateSafetyBadges } from "../lib/badges.js";
import BadgeIllustration from "./BadgeIllustration.jsx";

export const BADGE_IMAGE_PATH = Object.freeze({
  premiere_croix: `/media/badges/badge-00.webp?v=260815007`,
  premiere_tete: `/media/badges/badge-01.webp?v=260815007`,
  premiere_moulinette: `/media/badges/badge-02.webp?v=260815007`,
  premier_a_vue: `/media/badges/badge-03.webp?v=260815007`,
  premier_flash: `/media/badges/badge-04.webp?v=260815007`,
  cap_5c: `/media/badges/badge-05.webp?v=260815007`,
  club_6a: `/media/badges/badge-06.webp?v=260815007`,
  club_6b: `/media/badges/badge-07.webp?v=260815007`,
  club_6c: `/media/badges/badge-08.webp?v=260815007`,
  club_7a: `/media/badges/badge-09.webp?v=260815007`,
  explorateur: `/media/badges/badge-10.webp?v=260815007`,
  tour_de_salle: `/media/badges/badge-11.webp?v=260815007`,
  polyvalent: `/media/badges/badge-12.webp?v=260815007`,
  habitue: `/media/badges/badge-13.webp?v=260815007`,
  fidele: `/media/badges/badge-14.webp?v=260815007`,
  oeil_ouvreur: `/media/badges/badge-15.webp?v=260815007`,
  critique_voies: `/media/badges/badge-16.webp?v=260815007`,
  collectionneur: `/media/badges/badge-17.webp?v=260815007`,
  centurion: `/media/badges/badge-18.webp?v=260815007`,
  cristal: `/media/badges/badge-19.webp?v=260815008`,
  role_encadrant: `/media/avatars/split/role-encadrant.webp?v=260815008`,
  role_referent: `/media/avatars/split/role-referent.webp?v=260815008`,
  role_ouvreur: `/media/avatars/split/role-ouvreur.webp?v=260815008`,
  role_initiateur_sae: `/media/badges/badge-initiateur-sae.svg?v=260822001`,
  role_initiateur_sne: `/media/badges/badge-initiateur-sne.svg?v=260822001`,
  vol_1: `/media/badges/badge-vol.webp?v=260815012`,
  vol_5: `/media/badges/badge-vol.webp?v=260815012`,
  vol_10: `/media/badges/badge-vol.webp?v=260815012`,
  vol_50: `/media/badges/badge-vol.webp?v=260815012`,
  assurage_1: `/media/badges/badge-assurage.webp?v=260815012`,
  assurage_5: `/media/badges/badge-assurage.webp?v=260815012`,
  assurage_10: `/media/badges/badge-assurage.webp?v=260815012`,
  assurage_50: `/media/badges/badge-assurage.webp?v=260815012`,
});

function BadgeRealImage({ src }) {
  return <img className="participant-badge-image" src={src} alt="" draggable="false" aria-hidden="true" />;
}

function BadgeVisual({ badge }) {
  const src = BADGE_IMAGE_PATH[badge.id];
  if (!src) return <BadgeIllustration badge={badge} />;

  return (
    <span
      className="participant-badge-artwork participant-badge-artwork--real"
      role="img"
      aria-label={`Illustration du badge ${badge.name}`}
    >
      <BadgeRealImage src={src} />
    </span>
  );
}

function BadgeTile({ badge, pending = false, onOpen }) {
  return (
    <div
      className={`participant-badge-tile participant-badge-tile--${badge.family}${pending ? " is-pending" : " is-earned"}`}
      title={`${badge.name} — ${badge.condition}`}
      role="button"
      tabIndex={0}
      aria-label={`Voir le badge ${badge.name}`}
      onClick={() => onOpen(badge)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(badge);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <BadgeVisual badge={badge} />
      <span className="participant-badge-copy">
        <strong>{badge.name}</strong>
        <span>{pending ? "À débloquer" : BADGE_FAMILY_LABELS[badge.family]}</span>
      </span>
    </div>
  );
}

function BadgeDetail({ badge, onClose }) {
  if (!badge) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.68)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-detail-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(92vw, 430px)",
          maxHeight: "86vh",
          overflowY: "auto",
          borderRadius: 24,
          padding: 24,
          background: "var(--surface, #ffffff)",
          color: "var(--text, #172033)",
          boxShadow: "0 24px 70px rgba(0,0,0,.42)",
          textAlign: "center",
        }}
      >
        <style>{`.participant-badge-detail-art .participant-badge-artwork{width:min(160px,46vw)!important;height:min(160px,46vw)!important;max-width:36vh!important;max-height:36vh!important;aspect-ratio:1 / 1!important;margin:0 auto;display:block;flex:0 0 auto!important;background-size:500% 400%;}`}</style>
        <div className="participant-badge-detail-art" style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <BadgeVisual badge={badge} />
        </div>
        <h2 id="badge-detail-title" style={{ margin: "4px 0 6px" }}>{badge.name}</h2>
        <div className="small" style={{ marginBottom: 14 }}>{BADGE_FAMILY_LABELS[badge.family]}</div>
        <div className="muted-box" style={{ textAlign: "left", marginBottom: 16 }}>
          <strong>{badge.earned ? "Badge obtenu" : "À débloquer"}</strong>
          <div style={{ marginTop: 6 }}>{badge.condition}</div>
        </div>
        <button type="button" className="btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

function normalizedPersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function participantRoleBadges(participant, routesById) {
  if (!participant) return [];
  const participantName = normalizedPersonName(`${participant.prenom || ""} ${participant.nom || ""}`);
  const isOpener = Boolean(participantName) && Object.values(routesById || {}).some(
    (route) => normalizedPersonName(route?.nomOuvreur) === participantName,
  );

  return [
    participant.initiateurSae && {
      id: "role_initiateur_sae",
      name: "Initiateur SAE",
      family: "contribution",
      condition: "Qualification Initiateur SAE enregistrée par le club.",
      earned: true,
    },
    participant.initiateurSne && {
      id: "role_initiateur_sne",
      name: "Initiateur SNE",
      family: "contribution",
      condition: "Qualification d’initiateur escalade en SNE enregistrée par le club.",
      earned: true,
    },
    participant.canEncadrer && {
      id: "role_encadrant",
      name: "Encadrant",
      family: "contribution",
      condition: "Autorisé à encadrer les séances du club.",
      earned: true,
    },
    participant.canReferer && {
      id: "role_referent",
      name: "Référent",
      family: "contribution",
      condition: "Autorisé à être référent d’une séance libre.",
      earned: true,
    },
    isOpener && {
      id: "role_ouvreur",
      name: "Ouvreur",
      family: "contribution",
      condition: "Identifié comme ouvreur d’au moins une voie.",
      earned: true,
    },
  ].filter(Boolean);
}

export default function ParticipantBadges({ realisations, allRealisations = [], routesById, sessions, participant }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const badges = useMemo(
    () => [
      ...participantRoleBadges(participant, routesById),
      ...calculateSafetyBadges({ participantId: participant?.id, realisations, allRealisations }),
      ...calculateParticipantBadges({ realisations, routesById, sessions }),
    ],
    [participant, realisations, allRealisations, routesById, sessions],
  );

  const earnedBadges = badges.filter((badge) => badge.earned);
  const pendingBadges = badges.filter((badge) => !badge.earned);

  return (
    <section className="card participant-badges-card" aria-labelledby="participant-badges-title">
      <div className="card-header participant-badges-header">
        <h3 id="participant-badges-title">
          Badges <span className="badge participant-badges-count">{earnedBadges.length} / {badges.length}</span>
        </h3>
      </div>

      {earnedBadges.length === 0 ? (
        <div className="muted-box">Aucun badge obtenu pour le moment. La première voie réussie donnera « Première croix ».</div>
      ) : (
        <div className="participant-badges-grid">
          {earnedBadges.map((badge) => <BadgeTile key={badge.id} badge={badge} onOpen={setSelectedBadge} />)}
        </div>
      )}

      {pendingBadges.length > 0 && (
        <details className="participant-badges-pending">
          <summary>Badges à obtenir ({pendingBadges.length})</summary>
          <div className="participant-badges-grid participant-badges-grid--pending">
            {pendingBadges.map((badge) => <BadgeTile key={badge.id} badge={badge} pending onOpen={setSelectedBadge} />)}
          </div>
        </details>
      )}

      <BadgeDetail badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </section>
  );
}
