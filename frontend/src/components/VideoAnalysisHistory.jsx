import React from "react";
import Button from "./Button.jsx";
import { apiFetch } from "../lib/api.js";
import { buildTechnicalAnalysisComparison } from "../lib/video-analysis-comparison.js";
import { ComparisonGraphics } from "./VideoAnalysisGraphics.jsx";

export default function VideoAnalysisHistory({ routeId }) {
  const [entries, setEntries] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const active = React.useRef(true);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function load() {
    if (!routeId || loading) return;
    setLoading(true); setError("");
    try {
      const response = await apiFetch(`/video-analysis/history/${encodeURIComponent(routeId)}`);
      if (!active.current) return;
      const rows = Array.isArray(response?.analyses) ? response.analyses : [];
      setEntries(rows);
      setA(rows.length > 1 ? "1" : "");
      setB(rows.length > 1 ? "0" : "");
    } catch (err) {
      if (active.current) setError(err.message || "Historique indisponible.");
    } finally { if (active.current) setLoading(false); }
  }
  const comparison = a !== "" && b !== "" && a !== b ? buildTechnicalAnalysisComparison(entries?.[Number(a)]?.analysis, entries?.[Number(b)]?.analysis) : null;
  return <section className="subcard" style={{ marginTop: 12 }}>
    <strong>Progression technique sur cette voie</strong>
    <p className="small">Jusqu’à 20 analyses personnelles enregistrées, y compris lorsque la vidéo a été retirée. Les comparaisons restent descriptives.</p>
    <Button variant="secondary" disabled={loading || !routeId} onClick={load}>{loading ? "Chargement…" : entries ? "Actualiser l’historique" : "Afficher mon historique"}</Button>
    {error && <div className="error" role="alert">{error}</div>}
    {entries && entries.length < 2 && <p className="small">{entries.length ? "Une analyse enregistrée. Une deuxième est nécessaire pour comparer." : "Aucune analyse enregistrée sur cette voie."}</p>}
    {entries?.length > 1 && <>
      <div className="group" style={{ marginTop: 8 }}>
        {[["A",a,setA],["B",b,setB]].map(([label,value,setValue]) => <label key={label}>Essai {label}
          <select value={value} onChange={e => setValue(e.target.value)} aria-label={`Essai ${label}`}>
            {entries.map((entry,i) => <option key={i} value={String(i)}>{String(entry.dateRealisation || "").slice(0,10)} · analyse {entries.length-i}</option>)}
          </select>
        </label>)}
      </div>
      {a === b ? <p className="small">Sélectionner deux analyses différentes.</p> : <ComparisonGraphics comparison={comparison} />}
    </>}
  </section>;
}
