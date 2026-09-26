import React, { useMemo, useState } from "react";
import {
  filterAndSortRouteRealisationStatistics,
  routeRealisationStatisticValue,
} from "../lib/route-realisation-statistics.js";

const PASSPORT_STATISTICS = [
  ["sans", "Sans"],
  ["jaune", "Jaune"],
  ["orange", "Orange"],
  ["vert", "Vert"],
  ["bleu", "Bleu"],
  ["decouverte", "Découverte"],
];

const ROUTE_REALISATION_COLUMNS = [
  { key: "rope", label: "Corde", numeric: true },
  { key: "route", label: "Voie", numeric: false },
  { key: "grade", label: "Cotation", numeric: false },
  { key: "total", label: "Total", numeric: true },
  { key: "lead", label: "En tête", numeric: true },
  { key: "toprope", label: "Moulinette", numeric: true },
  { key: "onsight", label: "À vue", numeric: true },
  { key: "flash", label: "Flash", numeric: true },
  { key: "worked", label: "Travaillée", numeric: true },
  { key: "withRest", label: "Avec repos", numeric: true },
  { key: "project", label: "Projet", numeric: true },
  { key: "notSent", label: "Non enchaînée", numeric: true },
  { key: "test", label: "Essai / test", numeric: true },
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
  const [routeColumnFilters, setRouteColumnFilters] = useState({});
  const [routeSort, setRouteSort] = useState({ key: "rope", direction: "asc" });

  const displayedRouteRealisationStats = useMemo(
    () => filterAndSortRouteRealisationStatistics(routeRealisationStats, {
      filters: routeColumnFilters,
      sortKey: routeSort.key,
      sortDirection: routeSort.direction,
      formatRouteName,
    }),
    [routeRealisationStats, routeColumnFilters, routeSort, formatRouteName],
  );

  const hasRouteColumnFilters = Object.values(routeColumnFilters).some((value) => String(value || "").trim());

  function toggleRouteSort(key) {
    setRouteSort((current) => (
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    ));
  }

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

        <div className="group" style={{ marginBottom: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={!hasRouteColumnFilters}
            onClick={() => setRouteColumnFilters({})}
          >
            Effacer les filtres
          </button>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid var(--border, #bbb)", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100, background: "var(--surface, white)", fontSize: "clamp(.72rem, .8vw, .86rem)" }}>
            <thead style={{ background: "var(--card-bg, #eee)" }}>
              <tr>
                {ROUTE_REALISATION_COLUMNS.map((column) => {
                  const activeSort = routeSort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      style={{
                        padding: "6px 5px",
                        border: "1px solid #bbb",
                        textAlign: column.key === "route" ? "left" : "center",
                        verticalAlign: "top",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleRouteSort(column.key)}
                        aria-label={`Trier par ${column.label}`}
                        style={{
                          width: "100%",
                          minHeight: 28,
                          padding: "2px 4px",
                          fontWeight: 700,
                          background: "transparent",
                          border: 0,
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {column.label} <span aria-hidden="true">{activeSort ? (routeSort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                      <input
                        type="search"
                        value={routeColumnFilters[column.key] || ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRouteColumnFilters((current) => ({ ...current, [column.key]: value }));
                        }}
                        aria-label={`Filtrer ${column.label}`}
                        placeholder={column.numeric ? "ex. >=1" : "Filtrer"}
                        style={{
                          width: column.key === "route" ? 150 : 86,
                          minWidth: 0,
                          marginTop: 3,
                          padding: "4px 5px",
                          fontSize: "inherit",
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayedRouteRealisationStats.length === 0 ? (
                <tr>
                  <td colSpan={ROUTE_REALISATION_COLUMNS.length} style={{ padding: 12, textAlign: "center", border: "1px solid #ccc" }}>
                    Aucune voie ne correspond aux filtres sélectionnés.
                  </td>
                </tr>
              ) : displayedRouteRealisationStats.map((entry) => (
                <tr key={entry.route.id}>
                  {ROUTE_REALISATION_COLUMNS.map((column) => {
                    const value = routeRealisationStatisticValue(entry, column.key, { formatRouteName });
                    return (
                      <td
                        key={column.key}
                        style={{
                          padding: 6,
                          textAlign: column.key === "route" ? "left" : "center",
                          border: "1px solid #ccc",
                          minWidth: column.key === "route" ? 180 : undefined,
                          whiteSpace: column.key === "route" ? "normal" : "nowrap",
                          fontVariantNumeric: column.numeric ? "tabular-nums" : undefined,
                        }}
                      >
                        {value}
                        {column.key === "route" && entry.route.moulinetteOnly && (
                          <span className="small"> · Moulinette uniquement</span>
                        )}
                      </td>
                    );
                  })}
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
