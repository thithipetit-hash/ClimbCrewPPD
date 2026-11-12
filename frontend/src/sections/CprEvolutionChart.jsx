import React, { useMemo, useState } from "react";
import Button from "../components/Button.jsx";
import { GRADES, calculateCprHistory, formatDateShortFr, formatRouteForRealisation } from "../lib/domain.js";
import { STYLE_LABELS } from "../lib/ui-config.js";

export default function CprEvolutionChart({ realisations, routesById, resetAt = null }) {
  const [range, setRange] = useState("6m");
  const [selectedPointDate, setSelectedPointDate] = useState("");
  const history = useMemo(
    () => calculateCprHistory(realisations, routesById, Date.now(), resetAt),
    [realisations, routesById, resetAt]
  );

  const rangeDays = { "3m": 92, "6m": 183, "1a": 366 };
  const latestTimestamp = history.at(-1)?.timestamp || Date.now();
  const visibleHistory = range === "all"
    ? history
    : history.filter((point) => point.timestamp >= latestTimestamp - rangeDays[range] * 86400000);

  if (history.length === 0) return <div className="muted-box">Pas encore assez de données pour tracer le CPR Club.</div>;

  const width = 900;
  const height = 330;
  const margin = { top: 24, right: 24, bottom: 44, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const minTime = visibleHistory[0]?.timestamp || latestTimestamp;
  const maxTime = visibleHistory.at(-1)?.timestamp || latestTimestamp;
  const timeSpan = Math.max(1, maxTime - minTime);
  const xFor = (timestamp) => margin.left + ((timestamp - minTime) / timeSpan) * plotWidth;
  const yFor = (averageIndex) => {
    const boundedIndex = Math.max(0, Math.min(GRADES.length - 1, averageIndex));
    return margin.top + plotHeight - (boundedIndex / (GRADES.length - 1)) * plotHeight;
  };
  const linePoints = visibleHistory.map((point) => `${xFor(point.timestamp)},${yFor(point.averageIndex)}`).join(" ");
  const bestIndex = Math.max(...history.map((point) => point.averageIndex));
  const selectedPoint = visibleHistory.find((point) => point.date === selectedPointDate) || visibleHistory.at(-1);
  const selectedRealisations = selectedPoint
    ? realisations.filter((item) => selectedPoint.includedIds.includes(String(item.id)))
    : [];

  return (
    <div className="cpr-chart-card">
      <div className="card-header">
        <div><h3>Évolution du CPR Club</h3><div className="small">Meilleur historique : {GRADES[Math.max(0, Math.min(GRADES.length - 1, Math.round(bestIndex)))]}</div></div>
        <div className="group cpr-range-selector" aria-label="Période du graphique CPR">
          {[["3m", "3 mois"], ["6m", "6 mois"], ["1a", "1 an"], ["all", "Tout"]].map(([value, label]) => (
            <Button type="button" variant={range === value ? "primary" : "secondary"} aria-pressed={range === value} key={value} onClick={() => { setRange(value); setSelectedPointDate(""); }}>{label}</Button>
          ))}
        </div>
      </div>
      <div className="cpr-chart-scroll">
        <svg className="cpr-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe d'évolution du CPR Club par date">
          {GRADES.map((grade, index) => {
            const y = yFor(index);
            return <g key={grade}><line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className="cpr-grid-line" /><text x={margin.left - 10} y={y + 4} textAnchor="end" className="cpr-axis-label">{grade}</text></g>;
          })}
          <line x1={margin.left} x2={width - margin.right} y1={yFor(bestIndex)} y2={yFor(bestIndex)} className="cpr-best-line" />
          {visibleHistory.length > 1 && <polyline points={linePoints} className="cpr-evolution-line" />}
          {visibleHistory.map((point) => (
            <circle key={point.date} cx={xFor(point.timestamp)} cy={yFor(point.averageIndex)} r={selectedPoint?.date === point.date ? 8 : 6} className={selectedPoint?.date === point.date ? "cpr-point selected" : "cpr-point"} tabIndex="0" role="button" aria-label={`${formatDateShortFr(point.date)} : CPR ${point.currentGrade}`} onClick={() => setSelectedPointDate(point.date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedPointDate(point.date); }}><title>{formatDateShortFr(point.date)} · CPR {point.currentGrade}</title></circle>
          ))}
          <text x={margin.left} y={height - 12} className="cpr-axis-label">{formatDateShortFr(visibleHistory[0]?.date)}</text>
          <text x={width - margin.right} y={height - 12} textAnchor="end" className="cpr-axis-label">{formatDateShortFr(visibleHistory.at(-1)?.date)}</text>
        </svg>
      </div>
      {selectedPoint && <div className="cpr-chart-detail"><strong>{formatDateShortFr(selectedPoint.date)} · CPR {selectedPoint.currentGrade}</strong><span className="small">{selectedRealisations.map((item) => { const route = routesById[item.voieId]; return route ? `${formatRouteForRealisation(route)} · ${STYLE_LABELS[item.styleRealisation] || item.styleRealisation}` : "Voie inconnue"; }).join(" | ")}</span></div>}
    </div>
  );
}
