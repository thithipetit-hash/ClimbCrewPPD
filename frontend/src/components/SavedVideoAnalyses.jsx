import React from "react";
import Button from "./Button.jsx";
import RealisationVideoAnalysis from "./RealisationVideoAnalysis.jsx";
import { apiFetch } from "../lib/api.js";
import { formatRouteName, formatDateShortFr } from "../lib/domain.js";

export default function SavedVideoAnalyses({ realisations, routesById }) {
  const [rows, setRows] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch("/video-analysis/saved").then(response => {
      if (!active) return;
      const nextRows = Array.isArray(response?.realisations) ? response.realisations : [];
      setRows(nextRows);
      setSelectedId(current => nextRows.some(row => String(row.realisationId) === current) ? current : String(nextRows[0]?.realisationId || ""));
    }).catch(err => {
      if (active) setError(err.message || "Chargement des analyses impossible.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const selected = rows.find(row => String(row.realisationId) === selectedId);
  const realisation = selected && (realisations.find(item => String(item.id) === selectedId) || { id: selectedId, voieId: selected.routeId, videoUrls: [] });
  return <section className="subcard" style={{ marginTop: 12 }}>
    <div className="card-header">
      <div><h3>Mes analyses enregistrées</h3><p className="small">100 dernières réalisations analysées, même si la vidéo a été retirée.</p></div>
      <Button type="button" variant="secondary" disabled={loading} onClick={() => setRevision(n => n + 1)}>Actualiser</Button>
    </div>
    {loading && <p role="status" className="small">Chargement des analyses…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {!loading && !error && rows.length === 0 && <div className="muted-box">Aucune analyse enregistrée. Pour conserver un résultat, ouvrez Mes réalisations, associez une vidéo et lancez l’analyse. Le mode Vidéo de mon appareil ne sauvegarde pas les résultats.</div>}
    {!loading && !error && rows.length > 0 && <>
      <label>Choisir une réalisation analysée
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          {rows.map(row => <option key={row.realisationId} value={String(row.realisationId)}>{formatDateShortFr(String(row.dateRealisation || "").slice(0,10))} · {formatRouteName(routesById[row.routeId])} · {row.analysisCount} analyse(s)</option>)}
        </select>
      </label>
      {realisation && <RealisationVideoAnalysis key={selectedId} realisation={realisation} route={routesById[selected.routeId]} resultsOnly />}
    </>}
  </section>;
}
