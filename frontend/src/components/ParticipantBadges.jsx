import React, { useMemo } from "react";
import { BADGE_FAMILY_LABELS, calculateParticipantBadges } from "../lib/badges.js";

function BadgeTile({ badge, pending = false }) {
  return (
    <div className={`participant-badge-tile participant-badge-tile--${badge.family}${pending ? " is-pending" : " is-earned"}`} title={`${badge.name} — ${badge.condition}`}>
      <span className={`participant-badge-emblem participant-badge-emblem--${badge.shape}`} aria-hidden="true">
        {pending ? "?" : badge.symbol}
      </span>
      <span className="participant-badge-copy">
        <strong>{badge.name}</strong>
        <span>{pending ? badge.condition : BADGE_FAMILY_LABELS[badge.family]}</span>
      </span>
    </div>
  );
}

export default function ParticipantBadges({ realisations, routesById, sessions }) {
  const badges = useMemo(
    () => calculateParticipantBadges({ realisations, routesById, sessions }),
    [realisations, routesById, sessions],
  );

  const earnedBadges = badges.filter((badge) => badge.earned);
  const pendingBadges = badges.filter((badge) => !badge.earned);

  return (
    <section className="card participant-badges-card" aria-labelledby="participant-badges-title">
      <div className="card-header participant-badges-header">
        <div>
          <h3 id="participant-badges-title">Badges</h3>
          <div className="small">Récompenses calculées automatiquement à partir de la progression enregistrée.</div>
        </div>
        <span className="badge">{earnedBadges.length} / {badges.length}</span>
      </div>

      {earnedBadges.length === 0 ? (
        <div className="muted-box">Aucun badge obtenu pour le moment. La première voie réussie donnera « Première croix ».</div>
      ) : (
        <div className="participant-badges-grid">
          {earnedBadges.map((badge) => <BadgeTile key={badge.id} badge={badge} />)}
        </div>
      )}

      {pendingBadges.length > 0 && (
        <details className="participant-badges-pending">
          <summary>Badges à obtenir ({pendingBadges.length})</summary>
          <div className="participant-badges-grid participant-badges-grid--pending">
            {pendingBadges.map((badge) => <BadgeTile key={badge.id} badge={badge} pending />)}
          </div>
        </details>
      )}
    </section>
  );
}
