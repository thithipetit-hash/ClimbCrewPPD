import React from "react";
import Button from "./Button.jsx";
import { API_BASE, apiFetch } from "../lib/api.js";
import { buildClimbingCoach } from "../lib/climbing-coach.js";
import { analyzeClimbingVideo } from "../lib/mediapipe-video-analysis.js";
import { buildTechnicalAnalysisComparison } from "../lib/video-analysis-comparison.js";
import { fetchVideoAnalysisRules } from "../lib/video-analysis-rules.js";

function playableVideoUrl(url) {
  if (String(url || "").startsWith("/")) return `${API_BASE}${url}`;
  return String(url || "");
}

function isLocalVideoUrl(url) {
  return /^\/routes\/[^/]+\/videos\/[^/]+$/.test(String(url || ""));
}

function formatTimestamp(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatSavedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Metric({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: "1.05rem" }}>{value}</div>
    </div>
  );
}

function RecommendationComparison({ items }) {
  if (!items.length) return null;
  const statusLabel = {
    common: "Commune aux deux analyses",
    "only-a": "Uniquement analyse A",
    "only-b": "Uniquement analyse B",
  };

  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <strong>Comparaison des recommandations</strong>
      {items.map((item) => (
        <div className="muted-box" key={item.code}>
          <strong>{item.title}</strong>
          <div className="small" style={{ marginTop: 3 }}>{statusLabel[item.status]}</div>
          {item.a?.detail && (
            <div className="small" style={{ marginTop: 4 }}><b>A :</b> {item.a.detail}</div>
          )}
          {item.b?.detail && item.b?.detail !== item.a?.detail && (
            <div className="small" style={{ marginTop: 4 }}><b>B :</b> {item.b.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function VideoTechnicalAnalysis({
  videoUrls = [],
  realisationId = "",
  technicalAnalysis = null,
  editable = false,
  onSaved,
}) {
  const analyzableUrls = React.useMemo(
    () => [...new Set((videoUrls || []).filter(isLocalVideoUrl))],
    [videoUrls],
  );
  const storedVideos = React.useMemo(() => {
    const videos = technicalAnalysis?.videos;
    return videos && typeof videos === "object" && !Array.isArray(videos) ? videos : {};
  }, [technicalAnalysis]);
  const savedUrls = React.useMemo(
    () => Object.keys(storedVideos).filter(isLocalVideoUrl),
    [storedVideos],
  );
  const selectionUrls = React.useMemo(
    () => [...new Set([...analyzableUrls, ...savedUrls])],
    [analyzableUrls, savedUrls],
  );

  const [selectedUrl, setSelectedUrl] = React.useState(selectionUrls[0] || "");
  const [comparisonUrl, setComparisonUrl] = React.useState("");
  const [analysis, setAnalysis] = React.useState(() => storedVideos[selectionUrls[0]] || null);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState("");
  const [analyzing, setAnalyzing] = React.useState(false);
  const videoRef = React.useRef(null);
  const abortRef = React.useRef(null);

  React.useEffect(() => {
    const nextUrl = selectionUrls.includes(selectedUrl) ? selectedUrl : (selectionUrls[0] || "");
    if (nextUrl !== selectedUrl) {
      setSelectedUrl(nextUrl);
      return;
    }
    setAnalysis(nextUrl ? (storedVideos[nextUrl] || null) : null);
    setError("");
    setSaveError("");
    setSaveStatus("");
  }, [selectionUrls, selectedUrl, storedVideos]);

  React.useEffect(() => {
    const alternatives = savedUrls.filter((url) => url !== selectedUrl);
    if (!alternatives.includes(comparisonUrl)) {
      setComparisonUrl(alternatives[0] || "");
    }
  }, [comparisonUrl, savedUrls, selectedUrl]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const videoAvailable = analyzableUrls.includes(selectedUrl);
  const primarySavedAnalysis = storedVideos[selectedUrl] || null;
  const comparisonAnalysis = comparisonUrl ? (storedVideos[comparisonUrl] || null) : null;
  const comparison = React.useMemo(
    () => buildTechnicalAnalysisComparison(primarySavedAnalysis, comparisonAnalysis),
    [primarySavedAnalysis, comparisonAnalysis],
  );
  const comparisonChoices = savedUrls.filter((url) => url !== selectedUrl);

  async function runAnalysis() {
    if (!videoRef.current || !selectedUrl || !videoAvailable || !editable) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setAnalysis(null);
    setError("");
    setSaveError("");
    setSaveStatus("");
    setProgress(0);
    try {
      const rules = await fetchVideoAnalysisRules();
      const result = await analyzeClimbingVideo(videoRef.current, {
        rules,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const resultWithCoach = {
        ...result,
        coach: buildClimbingCoach(result.metrics, result.rules),
      };
      setAnalysis(resultWithCoach);

      if (!realisationId) {
        setSaveError("Analyse calculée, mais la réalisation ne peut pas être identifiée pour enregistrer les mesures.");
        return;
      }

      try {
        const saved = await apiFetch(
          `/realisations/${encodeURIComponent(realisationId)}/technical-analysis`,
          {
            method: "PUT",
            body: JSON.stringify({ videoUrl: selectedUrl, analysis: resultWithCoach }),
          },
        );
        setAnalysis(saved?.analysis || resultWithCoach);
        setSaveStatus("Mesures et conseils entraîneur enregistrés avec cette réalisation.");
        if (typeof onSaved === "function") await onSaved(saved?.technicalAnalysis);
      } catch (saveFailure) {
        setSaveError(`Analyse calculée, mais enregistrement impossible : ${saveFailure.message || saveFailure}`);
      }
    } catch (caughtError) {
      if (caughtError?.name !== "AbortError") {
        setError(String(caughtError?.message || caughtError || "Analyse impossible."));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setAnalyzing(false);
    }
  }

  function cancelAnalysis() {
    abortRef.current?.abort();
  }

  if (!selectionUrls.length) {
    return (
      <div className="muted-box" style={{ marginTop: 10 }}>
        Associez d’abord à cette réalisation une vidéo chargée dans ClimbCrew. Les liens YouTube ou externes peuvent être conservés, mais ne sont pas analysés automatiquement.
      </div>
    );
  }

  const metrics = analysis?.metrics;
  const pauses = Array.isArray(metrics?.pauses) ? metrics.pauses : [];
  const recommendations = Array.isArray(analysis?.recommendations) ? analysis.recommendations : [];
  const coach = analysis?.coach || (metrics ? buildClimbingCoach(metrics, analysis?.rules || {}) : null);
  const coachPriorities = Array.isArray(coach?.priorities) ? coach.priorities : [];
  const analyzedAt = formatSavedAt(analysis?.analyzedAt);

  return (
    <div className="subcard" style={{ marginTop: 10 }}>
      <div className="card-header">
        <div>
          <strong>Analyse technique vidéo</strong>
          <div className="small">MediaPipe Pose · traitement de l’image sur cet appareil · règles globales du club · aucun coût par analyse</div>
          {analysis && analyzedAt && (
            <div className="small" style={{ marginTop: 4 }}>Mesures enregistrées le {analyzedAt}.</div>
          )}
        </div>
        {selectionUrls.length > 1 && (
          <select
            aria-label="Vidéo ou analyse technique"
            value={selectedUrl}
            onChange={(event) => {
              setSelectedUrl(event.target.value);
              setError("");
              setSaveError("");
              setSaveStatus("");
            }}
            style={{ width: "auto", minWidth: 150 }}
          >
            {selectionUrls.map((url) => {
              const currentIndex = analyzableUrls.indexOf(url);
              const savedIndex = savedUrls.indexOf(url);
              const label = currentIndex >= 0
                ? `Vidéo ${currentIndex + 1}`
                : `Mesures conservées ${savedIndex + 1}`;
              return <option key={url} value={url}>{label}</option>;
            })}
          </select>
        )}
      </div>

      {videoAvailable ? (
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          src={playableVideoUrl(selectedUrl)}
          style={{ width: "100%", maxHeight: "58vh", marginTop: 8, borderRadius: 12, background: "#000" }}
        >
          Votre navigateur ne permet pas la lecture de cette vidéo.
        </video>
      ) : (
        <div className="muted-box" style={{ marginTop: 8 }}>
          La vidéo n’est plus disponible, mais les mesures de son analyse technique sont conservées avec la réalisation.
        </div>
      )}

      {videoAvailable && editable && (
        <div className="group" style={{ marginTop: 10 }}>
          <Button onClick={runAnalysis} disabled={analyzing}>{analysis ? "Relancer l’analyse" : "Analyser la technique"}</Button>
          {analyzing && <Button variant="secondary" onClick={cancelAnalysis}>Annuler</Button>}
          {analyzing && <span className="small">Analyse {Math.round(progress * 100)} %</span>}
        </div>
      )}

      {analyzing && (
        <progress value={progress} max={1} style={{ width: "100%", marginTop: 8 }} aria-label="Progression de l’analyse vidéo" />
      )}

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      {saveError && <div className="error" style={{ marginTop: 10 }}>{saveError}</div>}
      {saveStatus && <div className="small" role="status" style={{ marginTop: 10 }}>{saveStatus}</div>}

      {analysis && metrics && (
        <div style={{ marginTop: 12 }}>
          <div className="stats-grid">
            <Metric label="Corps détecté" value={analysis.display?.detection || `${Math.round((Number(metrics.detectionRatio) || 0) * 100)} %`} />
            <Metric label="Pauses" value={pauses.length} />
            <Metric label="Ajustements pieds" value={Number(metrics.footAdjustments?.total || 0)} />
            <Metric label="Pics dynamiques" value={Number(metrics.dynamicMoves || 0)} />
            <Metric label="Bras gauche fléchi" value={analysis.display?.bentLeft || formatTimestamp(metrics.bentArmSeconds?.left)} />
            <Metric label="Bras droit fléchi" value={analysis.display?.bentRight || formatTimestamp(metrics.bentArmSeconds?.right)} />
          </div>

          {comparisonChoices.length > 0 && primarySavedAnalysis && (
            <div className="subcard" style={{ marginTop: 12 }}>
              <div className="card-header">
                <div>
                  <strong>Comparer les mesures</strong>
                  <div className="small">Comparaison des données enregistrées et des recommandations, sans charger une seconde vidéo.</div>
                </div>
                <select
                  aria-label="Analyse technique à comparer"
                  value={comparisonUrl}
                  onChange={(event) => setComparisonUrl(event.target.value)}
                  style={{ width: "auto", minWidth: 160 }}
                >
                  {comparisonChoices.map((url) => (
                    <option key={url} value={url}>
                      Analyse enregistrée {savedUrls.indexOf(url) + 1}
                    </option>
                  ))}
                </select>
              </div>

              {comparison && (
                <>
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Mesure</th>
                          <th style={{ textAlign: "right" }}>A</th>
                          <th style={{ textAlign: "right" }}>B</th>
                          <th style={{ textAlign: "right" }}>Écart B−A</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.rows.map((row) => (
                          <tr key={row.key}>
                            <td>{row.label}</td>
                            <td style={{ textAlign: "right" }}>{row.aDisplay}</td>
                            <td style={{ textAlign: "right" }}>{row.bDisplay}</td>
                            <td style={{ textAlign: "right" }}>{row.deltaDisplay}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <RecommendationComparison items={comparison.recommendations} />
                </>
              )}
            </div>
          )}

          {coachPriorities.length > 0 && (
            <div className="subcard" style={{ marginTop: 12 }}>
              <strong>Couche entraîneur</strong>
              <div className="small" style={{ marginTop: 4 }}>{coach?.summary}</div>
              <div className="stack" style={{ marginTop: 8 }}>
                {coachPriorities.map((item, index) => (
                  <div className="muted-box" key={item.code}>
                    <strong>{index + 1}. {item.title}</strong>
                    <div className="small" style={{ marginTop: 4 }}><b>Pourquoi :</b> {item.reason}</div>
                    <div className="small" style={{ marginTop: 4 }}><b>Consigne :</b> {item.cue}</div>
                    <div className="small" style={{ marginTop: 4 }}><b>Exercice :</b> {item.exercise}</div>
                    <div className="small" style={{ marginTop: 4 }}><b>Volume :</b> {item.dose}</div>
                    {item.caution && <div className="small" style={{ marginTop: 4 }}><b>À confirmer :</b> {item.caution}</div>}
                  </div>
                ))}
              </div>
              {coach?.note && <div className="small" style={{ marginTop: 8 }}>{coach.note}</div>}
            </div>
          )}

          {pauses.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Passages à revoir</strong>
              <div className="group" style={{ marginTop: 6 }}>
                {pauses.slice(0, 8).map((pause, index) => (
                  videoAvailable ? (
                    <button
                      type="button"
                      className="pill"
                      key={`${pause.start}-${index}`}
                      onClick={() => {
                        if (!videoRef.current) return;
                        videoRef.current.currentTime = pause.start;
                        videoRef.current.play().catch(() => {});
                      }}
                    >
                      {formatTimestamp(pause.start)}–{formatTimestamp(pause.end)}
                    </button>
                  ) : (
                    <span className="pill" key={`${pause.start}-${index}`}>
                      {formatTimestamp(pause.start)}–{formatTimestamp(pause.end)}
                    </span>
                  )
                ))}
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="stack" style={{ marginTop: 12 }}>
              <strong>Constats mécaniques</strong>
              {recommendations.map((recommendation) => (
                <div className={recommendation.severity === "warning" ? "muted-box" : "subcard"} key={recommendation.code}>
                  <strong>{recommendation.title}</strong>
                  <div className="small" style={{ marginTop: 4 }}>{recommendation.detail}</div>
                </div>
              ))}
            </div>
          )}

          <div className="small" style={{ marginTop: 10 }}>
            Ces résultats sont des indicateurs mécaniques expérimentaux, pas un jugement automatique de la qualité du geste. Les seuils sont ajustables dans Administration → Analyse technique.
          </div>
        </div>
      )}
    </div>
  );
}
