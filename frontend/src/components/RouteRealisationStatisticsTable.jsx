import React, { useMemo, useState } from "react";
import { filterAndSortRouteRealisationStatistics, routeRealisationStatisticValue } from "../lib/route-realisation-statistics.js";

export const ROUTE_REALISATION_COLUMNS = [
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

export default function RouteRealisationStatisticsTable({
  rows = [],
  formatRouteName,
  title = "Réalisations par voie",
  description = "Nombre de réalisations par mode et par critère.",
  collapsible = false,
  defaultExpanded = true,
}) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: "rope", direction: "asc" });
  const displayedRows = useMemo(() => filterAndSortRouteRealisationStatistics(rows, {
    filters, sortKey: sort.key, sortDirection: sort.direction, formatRouteName,
  }), [rows, filters, sort, formatRouteName]);
  const hasFilters = Object.values(filters).some((value) => String(value || "").trim());
  const highlightCprRows = title === "Voies du grimpeur";

  function toggleSort(key) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  const header = (
    <>
      <div><h2>{title}</h2><div className="small">{description}</div></div>
      <span className="badge">{displayedRows.length}/{rows.length} voie{rows.length > 1 ? "s" : ""}</span>
    </>
  );

  const body = (
    <>
      <div className="group" style={{ marginBottom: 8, justifyContent: "flex-end" }}>
        <button type="button" disabled={!hasFilters} onClick={() => setFilters({})}>Effacer les filtres</button>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border, #bbb)", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1280, background: "var(--surface, white)", fontSize: "clamp(.72rem, .8vw, .86rem)" }}>
          <thead style={{ background: "var(--card-bg, #eee)" }}>
            <tr>{ROUTE_REALISATION_COLUMNS.map((column) => {
              const activeSort = sort.key === column.key;
              return <th key={column.key} style={{ padding: "6px 5px", border: "1px solid #bbb", textAlign: column.key === "route" ? "left" : "center", verticalAlign: "top", whiteSpace: "normal", minWidth: column.key === "route" ? 180 : column.key === "grade" ? 100 : 90 }}>
                <button type="button" onClick={() => toggleSort(column.key)} aria-label={`Trier par ${column.label}`} style={{ width: "100%", minHeight: 28, padding: "2px 4px", fontWeight: 700, background: "transparent", border: 0, color: "inherit", cursor: "pointer", display: "block", whiteSpace: "normal" }}>
                  {column.label} <span aria-hidden="true">{activeSort ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
                <input type="search" value={filters[column.key] || ""} onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))} aria-label={`Filtrer ${column.label}`} placeholder={column.numeric ? "ex. >=1" : "Filtrer"} style={{ width: "100%", maxWidth: "100%", minWidth: 0, display: "block", boxSizing: "border-box", marginTop: 3, padding: "4px 5px", fontSize: "inherit" }} />
              </th>;
            })}</tr>
          </thead>
          <tbody>{displayedRows.length === 0
            ? <tr><td colSpan={ROUTE_REALISATION_COLUMNS.length} style={{ padding: 12, textAlign: "center", border: "1px solid #ccc" }}>Aucune voie ne correspond aux filtres sélectionnés.</td></tr>
            : displayedRows.map((entry) => {
              const cprIncluded = highlightCprRows && entry.cprIncluded;
              return <tr
                key={entry.route.id}
                data-cpr-included={cprIncluded ? "true" : undefined}
                title={cprIncluded ? "Voie prise en compte pour le CPR" : undefined}
                style={cprIncluded ? { background: "rgba(34, 197, 94, 0.24)", boxShadow: "inset 4px 0 #16a34a" } : undefined}
              >{ROUTE_REALISATION_COLUMNS.map((column) => {
                const value = routeRealisationStatisticValue(entry, column.key, { formatRouteName });
                return <td key={column.key} style={{ padding: 6, textAlign: column.key === "route" ? "left" : "center", border: "1px solid #ccc", minWidth: column.key === "route" ? 180 : undefined, whiteSpace: column.key === "route" ? "normal" : "nowrap", fontVariantNumeric: column.numeric ? "tabular-nums" : undefined }}>
                  {value}{column.key === "route" && entry.route.moulinetteOnly && <span className="small"> · Moulinette uniquement</span>}
                </td>;
              })}</tr>;
            })}</tbody>
        </table>
      </div>
    </>
  );

  if (collapsible) {
    return (
      <details className="card route-realisation-statistics" open={defaultExpanded || undefined}>
        <summary className="card-header" style={{ cursor: "pointer" }}>{header}</summary>
        <div style={{ marginTop: 10 }}>{body}</div>
      </details>
    );
  }

  return (
    <div className="card route-realisation-statistics">
      <div className="card-header">{header}</div>
      {body}
    </div>
  );
}
