import React, { useMemo, useState } from "react";
import { normalizeRopeNumber } from "../lib/domain.js";
import {
  REALISATION_CRITERIA,
  REALISATION_CRITERION_LABELS,
  REALISATION_MODES,
  REALISATION_MODE_LABELS,
} from "../lib/realisation-mode.js";
import { filterRouteRealisationStatistics } from "../lib/route-realisation-statistics.js";

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
  routeRealisationStats = [],
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
  const [realisationModeFilter, setRealisationModeFilter] = useState("all");
  const [realisationCriterionFilter, setRealisationCriterionFilter] = useState("all");

  const displayedRouteRealisationStats = useMemo(
    () => filterRouteRealisationStatistics(routeRealisationStats, {
      mode: realisationModeFilter,
      criterion: realisationCriterionFilter,
    }).sort((left, right) => (
      normalizeRopeNumber(left.route.numeroCorde) - normalizeRopeNumber(right.route.numeroCorde)
      || formatRouteName(left.route).localeCompare(formatRouteName(right.route), "fr")
    )),
    [routeRealisationStats, realisationModeFilter, realisationCriterionFilter, formatRouteName],
  );

  return (
    <>
      <div className="stats-grid">
        <div className="stat"><div className="label">Inscrits uniques</div><div className="value">{sessionStats.nombreInscrits}</div></div>
        <div className="stat"><div className="label">Comptes actifs</div><div className="value">{sessionStats.nombreComptesActifs || 0}</div></div>
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
          <div>
            <h2>Réalisations par voie</h2>
            <div className="small">Nombre de réalisations par mode et par critère.</div>
          </div>
          <span className="badge">
            {displayedRouteRealisationStats.length}/{routeRealisationStats.length} voie{routeRealisationStats.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="group" style={{ marginBottom: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label htmlFor="statistics-realisation-mode">Mode</label>
            <select
              id="statistics-realisation-mode"
              value={realisationModeFilter}
              onChange={(event) => setRealisationModeFilter(event.target.value)}
              style={{ minWidth: 150 }}
            >
              <option value="all">Tous les modes</option>
              {REALISATION_MODES.map((mode) => (
                <option key={mode} value={mode}>{REALISATION_MODE_LABELS[mode]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="statistics-realisation-criterion">Critère</label>
            <select
              id="statistics-realisation-criterion"
              value={realisationCriterionFilter}
              onChange={(event) => setRealisationCriterionFilter(event.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="all">Tous les critères</option>
              {REALISATION_CRITERIA.map((criterion) => (
                <option key={criterion} value={criterion}>{REALISATION_CRITERION_LABELS[criterion]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={realisationModeFilter === "all" && realisationCriterionFilter === "all"}
            onClick={() => {
              setRealisationModeFilter("all");
              setRealisationCriterionFilter("all");
            }}
          >
            Effacer les filtres
          </button>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid var(--border, #bbb)", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1180, background: "var(--surface, white)", fontSize: "clamp(.72rem, .8vw, .86rem)" }}>
            <thead style={{ background: "var(--card-bg, #eee)" }}>
              <tr>
                {["Corde", "Voie", "Cotation", "Total", "En tête", "Moulinette", "À vue", "Flash", "Travaillée", "Avec repos", "Projet", "Non enchaînée", "Essai / test", "Historique"].map((label) => (
                  <th key={label} style={{ padding: "7px 6px", border: "1px solid #bbb", textAlign: label === "Voie" ? "left" : "center", whiteSpace: "nowrap" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRouteRealisationStats.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: 12, textAlign: "center", border: "1px solid #ccc" }}>
                    Aucune voie ne correspond aux filtres sélectionnés.
                  </td>
                </tr>
              ) : displayedRouteRealisationStats.map((entry) => (
                <tr key={entry.route.id}>
                  <td style={{ padding: 6, textAlign: "center", border: "1px solid #ccc", whiteSpace: "nowrap" }}>
                    {normalizeRopeNumber(entry.route.numeroCorde)}
                  </td>
                  <td style={{ padding: 6, border: "1px solid #ccc", minWidth: 180 }}>
                    {formatRouteName(entry.route)}
                    {entry.route.moulinetteOnly && <span className="small"> · Moulinette uniquement</span>}
                  </td>
                  <td style={{ padding: 6, textAlign: "center", border: "1px solid #ccc", whiteSpace: "nowrap" }}>
                    {entry.route.cotationAjustee || entry.route.cotationReference || "nc"}
                  </td>
                  {[
                    entry.total,
                    entry.modeCounts.en_tete,
                    entry.modeCounts.moulinette,
                    entry.criterionCounts.a_vue,
                    entry.criterionCounts.flash,
                    entry.criterionCounts.travaillee,
                    entry.criterionCounts.avec_repos,
                    entry.criterionCounts.projet,
                    entry.criterionCounts.non_enchainee,
                    entry.criterionCounts.test,
                    entry.historicalCriterionCount,
                  ].map((count, index) => (
                    <td key={index} style={{ padding: 6, textAlign: "center", border: "1px solid #ccc", fontVariantNumeric: "tabular-nums" }}>
                      {count}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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


    </>
  );
}
