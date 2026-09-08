import React from "react";
import Button from "../components/Button.jsx";
import { fullName } from "../lib/domain.js";

const PASSPORT_STATISTICS = [
  ["sans", "Sans"],
  ["jaune", "Jaune"],
  ["orange", "Orange"],
  ["vert", "Vert"],
  ["bleu", "Bleu"],
  ["decouverte", "Découverte"],
];

export default function StatisticsSection({
  sessionStats,
  topRouteRankings,
  leadRealisationStats,
  formatRouteName,
  statsSortField,
  setStatsSortField,
  statsSortDirection,
  setStatsSortDirection,
  sortedStatsParticipants,
  getPassportStyle,
  normalizePassport,
  getPassportDotStyle,
}) {
  return (
    <>
      <div className="stats-grid">
        <div className="stat"><div className="label">Inscrits uniques</div><div className="value">{sessionStats.nombreInscrits}</div></div>
        <div className="stat"><div className="label">Cotisations</div><div className="value">{sessionStats.nombreCotisations}</div></div>
        <div className="stat"><div className="label">FFME</div><div className="value">{sessionStats.nombreFFME}</div></div>
        <div className="stat"><div className="label">Voies actives</div><div className="value">{sessionStats.nombreVoiesActives}</div></div>
      </div>

      <div className="stats-grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="label">Séances libres</div><div className="value">{sessionStats.nombreSeancesLibres || 0}</div></div>
        <div className="stat"><div className="label">Séances encadrées</div><div className="value">{sessionStats.nombreSeancesEncadrees || 0}</div></div>
        <div className="stat" title="Somme des inscriptions aux séances libres et encadrées">
          <div className="label">Participations libre + encadrée</div>
          <div className="value">{sessionStats.nombreParticipationsLibreEncadree || 0}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Grimpeurs par couleur de passeport</h2>
          <span className="badge">{sortedStatsParticipants.length} grimpeur{sortedStatsParticipants.length > 1 ? "s" : ""}</span>
        </div>
        <div
          className="passport-statistics-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}
        >
          {PASSPORT_STATISTICS.map(([passport, label]) => (
            <div
              className="stat passport-statistic"
              key={passport}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}
            >
              <div className="label" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="passport-dot" style={getPassportDotStyle({ passport })} aria-hidden="true" />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
              </div>
              <div className="value" style={{ flex: "0 0 auto" }}>{sessionStats.passportCounts?.[passport] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Classement des voies</h2>
          <span className="small">Cinq voies maximum par classement</span>
        </div>
        <div className="grid two route-rankings-grid">
          {topRouteRankings.map((ranking) => (
            <div className="subcard" key={ranking.title}>
              <h3>{ranking.title}</h3>
              <div className="stack" style={{ marginTop: 8 }}>
                {ranking.entries.length === 0 ? (
                  <div className="muted-box">Pas encore assez de données.</div>
                ) : ranking.entries.map((entry, index) => (
                  <div className="participant-row route-ranking-row" key={entry.route.id}>
                    <span>{index + 1}. {formatRouteName(entry.route)} · {entry.route.cotationAjustee}</span>
                    <strong>{ranking.value(entry)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Réalisations en tête par cotation</h2>
          <span className="badge">{leadRealisationStats.total} au total</span>
        </div>
        <div className="stack">
          {leadRealisationStats.byGrade.length === 0 ? (
            <div className="muted-box">Aucune voie ou réalisation en tête à analyser.</div>
          ) : (
            leadRealisationStats.byGrade.map((entry) => (
              <div className="participant-row lead-grade-row" key={entry.grade}>
                <strong style={{ color: "#ffffff" }}>{entry.grade}</strong>
                <span className="small" style={{ color: "#ffffff" }}>
                  {entry.routeCount} voie{entry.routeCount > 1 ? "s" : ""}
                  {" · "}{entry.leadCount} réalisation{entry.leadCount > 1 ? "s" : ""} en tête
                  {" · "}Ratio : {entry.ratio === null
                    ? "nc"
                    : entry.ratio.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Liste des inscrits</h2>
          <div className="group">
            <div
              className="stats-sort-field"
              style={{ display: "grid", gridTemplateColumns: "auto minmax(160px, 1fr)", gap: 8, alignItems: "center", minWidth: 250 }}
            >
              <label style={{ margin: 0 }}>Trier par</label>
              <select value={statsSortField} onChange={(e) => setStatsSortField(e.target.value)}>
                <option value="name">Nom</option>
                <option value="passport">Passeport</option>
                <option value="cotisation">Cotisation</option>
                <option value="ffme">Licence FFME</option>
              </select>
            </div>
            <Button
              variant="secondary"
              onClick={() => setStatsSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
              title="Inverser le tri"
              aria-label={statsSortDirection === "asc" ? "Trier par ordre décroissant" : "Trier par ordre croissant"}
            >
              {statsSortDirection === "asc" ? "↓" : "↑"}
            </Button>
          </div>
        </div>
        <div className="stack">
          {sortedStatsParticipants.map((participant) => (
            <div className="participant-row passport-row stats-participant-row" key={participant.id} style={getPassportStyle(participant)} data-passport={normalizePassport(participant.passport)}>
              <span className="participant-identity">
                <span className="passport-dot" style={getPassportDotStyle(participant)} aria-hidden="true" />
                <span className="participant-name">{fullName(participant)},</span>
              </span>
              <span className="stats-participant-details small" style={{ color: "inherit" }}>
                <span title="Cotisation">Cotis. : {participant.cotisation ? "Oui" : "Non"}</span>
                <span>FFME : {participant.ffme ? "Oui" : "Non"}</span>
                <span>Passeport : {participant.passport}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
