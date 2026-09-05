import React from "react";
import Button from "./Button.jsx";
import { API_BASE } from "../lib/api.js";
import { analyzeClimbingVideo } from "../lib/mediapipe-video-analysis.js";
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

function Metric({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: "1.05rem" }}>{value}</div>
    </div>
  );
}

export default function VideoTechnicalAnalysis({ videoUrls = [] }) {
  const analyzableUrls = React.useMemo(
    () => [...new Set((videoUrls || []).filter(isLocalVideoUrl))],
    [videoUrls],
  );
  const [selectedUrl, setSelectedUrl] = React.useState(analyzableUrls[0] || "");
  const [analysis, setAnalysis] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [analyzing, setAnalyzing] = React.useState(false);
  const videoRef = React.useRef(null);
  const abortRef = React.useRef(null);

  React.useEffect(() => {
    if (!analyzableUrls.length) {
      setSelectedUrl("");
      setAnalysis(null);
      return;
    }
    if (!analyzableUrls.includes(selectedUrl)) {
      setSelectedUrl(analyzableUrls[0]);
      setAnalysis(null);
    }
  }, [analyzableUrls, selectedUrl]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  async function runAnalysis() {
    if (!videoRef.current || !selectedUrl) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setAnalysis(null);
    setError("");
    setProgress(0);
    try {
      const rules = await fetchVideoAnalysisRules();
      const result = await analyzeClimbingVideo(videoRef.current, {
        rules,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setAnalysis(result);
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

  if (!analyzableUrls.length) {
    return (
      <div className="muted-box" style={{ marginTop: 10 }}>
        Associez d’abord à cette réalisation une vidéo chargée dans ClimbCrew. Les liens YouTube ou externes peuvent être conservés, mais ne sont pas analysés automatiquement.
      </div>
    );
  }

  const metrics = analysis?.metrics;

  return (
    <div className="subcard" style={{ marginTop: 10 }}>
      <div className="card-header">
        <div>
          <strong>Analyse technique vidéo</strong>
          <div className="small">MediaPipe Pose · traitement de l’image sur cet appareil · règles globales du club · aucun coût par analyse</div>
        </div>
        {analyzableUrls.length > 1 && (
          <select
            aria-label="Vidéo à analyser"
            value={selectedUrl}
            onChange={(event) => {
              setSelectedUrl(event.target.value);
              setAnalysis(null);
              setError("");
            }}
            style={{ width: "auto", minWidth: 130 }}
          >
            {analyzableUrls.map((url, index) => <option key={url} value={url}>Vidéo {index + 1}</option>)}
          </select>
        )}
      </div>

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

      <div className="group" style={{ marginTop: 10 }}>
        <Button onClick={runAnalysis} disabled={analyzing}>{analysis ? "Relancer l’analyse" : "Analyser la technique"}</Button>
        {analyzing && <Button variant="secondary" onClick={cancelAnalysis}>Annuler</Button>}
        {analyzing && <span className="small">Analyse {Math.round(progress * 100)} %</span>}
      </div>

      {analyzing && (
        <progress value={progress} max={1} style={{ width: "100%", marginTop: 8 }} aria-label="Progression de l’analyse vidéo" />
      )}

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {analysis && metrics && (
        <div style={{ marginTop: 12 }}>
          <div className="stats-grid">
            <Metric label="Corps détecté" value={analysis.display.detection} />
            <Metric label="Pauses" value={metrics.pauses.length} />
            <Metric label="Ajustements pieds" value={metrics.footAdjustments.total} />
            <Metric label="Pics dynamiques" value={metrics.dynamicMoves} />
            <Metric label="Bras gauche fléchi" value={analysis.display.bentLeft} />
            <Metric label="Bras droit fléchi" value={analysis.display.bentRight} />
          </div>

          {metrics.pauses.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Passages à revoir</strong>
              <div className="group" style={{ marginTop: 6 }}>
                {metrics.pauses.slice(0, 8).map((pause, index) => (
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
                ))}
              </div>
            </div>
          )}

          <div className="stack" style={{ marginTop: 12 }}>
            {analysis.recommendations.map((recommendation) => (
              <div className={recommendation.severity === "warning" ? "muted-box" : "subcard"} key={recommendation.code}>
                <strong>{recommendation.title}</strong>
                <div className="small" style={{ marginTop: 4 }}>{recommendation.detail}</div>
              </div>
            ))}
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Ces résultats sont des indicateurs mécaniques expérimentaux, pas un jugement automatique de la qualité du geste. Les seuils sont ajustables dans Administration → Analyse technique.
          </div>
        </div>
      )}
    </div>
  );
}
