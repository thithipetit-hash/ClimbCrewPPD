import React from "react";
import VideoTechnicalAnalysis from "../components/VideoTechnicalAnalysis.jsx";
import RealisationVideoAnalysis from "../components/RealisationVideoAnalysis.jsx";
import Button from "../components/Button.jsx";
import VideoAnalysisHistory from "../components/VideoAnalysisHistory.jsx";
import SavedVideoAnalyses from "../components/SavedVideoAnalyses.jsx";
import { USE_API } from "../lib/api.js";
import { formatRouteName, formatDateShortFr } from "../lib/domain.js";

export default function AnalyseVideo({ myRealisations = [], routesById = {}, onUpdate, onRefresh }) {
  const [mode, setMode] = React.useState(USE_API ? "saved" : "local");
  const [localVideo, setLocalVideo] = React.useState(null);
  const [realisationId, setRealisationId] = React.useState("");
  const selectedRealisation = myRealisations.find((item) => String(item.id) === realisationId);

  React.useEffect(() => {
    const url = localVideo?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [localVideo]);

  function selectVideo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLocalVideo({ name: file.name, url: URL.createObjectURL(file) });
  }

  function selectMode(nextMode) {
    setMode(nextMode);
    if (nextMode !== "local") setLocalVideo(null);
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Analyse vidéo</h2>
          <div className="small">Observer sa technique, revoir les passages clés et choisir des exercices adaptés.</div>
        </div>
      </div>
      <div className="group" style={{ marginTop: 10 }}>
        {USE_API && <Button variant={mode === "saved" ? "primary" : "secondary"} onClick={() => selectMode("saved")}>Mes analyses enregistrées</Button>}
        <Button variant={mode === "local" ? "primary" : "secondary"} onClick={() => selectMode("local")}>Vidéo de mon appareil</Button>
        {USE_API && <Button variant={mode === "realisation" ? "primary" : "secondary"} onClick={() => selectMode("realisation")}>Mes réalisations</Button>}
      </div>
      <details className="muted-box" style={{ marginTop: 12 }}>
        <summary>Bien filmer pour obtenir des mesures exploitables</summary>
        <p>Caméra fixe, grimpeur entier visible et suffisamment grand, éclairage homogène. Éviter les zooms, les panoramiques et les autres personnes dans le cadre. Filmer le passage grimpé, sans longue attente au sol. Pour comparer deux essais, garder le même point de vue et la même voie.</p>
        <p>La vidéo 2D ne mesure ni les forces ni la distance réelle à la paroi. Les pauses, les mouvements et les angles sont des observations indicatives à confirmer avec un encadrant ; ne jamais supprimer un repos ou un geste de sécurité pour améliorer un indicateur.</p>
        <p className="small">Références : <a href="https://doi.org/10.3389/fpsyg.2020.00249" target="_blank" rel="noreferrer">Fluidité en escalade (2020)</a> · <a href="https://doi.org/10.3390/s23198216" target="_blank" rel="noreferrer">Analyse du squelette (2023)</a> · <a href="https://openaccess.thecvf.com/content/CVPR2025W/CVSPORTS/html/Maschek_The_Way_Up_A_Dataset_for_Hold_Usage_Detection_in_CVPRW_2025_paper.html" target="_blank" rel="noreferrer">The Way Up (2025)</a>.</p>
      </details>
      {mode === "saved" ? (
        <SavedVideoAnalyses realisations={myRealisations} routesById={routesById} />
      ) : mode === "local" ? (
        <div className="subcard" style={{ marginTop: 12 }}>
          <strong>Analyser une vidéo sans l’envoyer au serveur</strong>
          <p className="small">Choisir une vidéo déjà filmée (8 minutes maximum). La vidéo et les résultats de ce mode restent sur cet appareil pendant la consultation ; ils ne sont pas enregistrés dans le profil.</p>
          <label>
            <span>Choisir une vidéo</span>
            <input type="file" accept="video/*,.mp4,.mov,.webm" onChange={selectVideo} />
          </label>
          {localVideo && (
            <>
              <div className="group" style={{ marginTop: 8 }}>
                <span className="small">{localVideo.name}</span>
                <Button variant="secondary" onClick={() => setLocalVideo(null)}>Retirer la vidéo</Button>
              </div>
              <VideoTechnicalAnalysis key={localVideo.url} videoUrls={[localVideo.url]} editable localOnly />
            </>
          )}
        </div>
      ) : (
        <div className="subcard" style={{ marginTop: 12 }}>
          <strong>Analyses liées à mes réalisations</strong>
          <p className="small">Retrouver les mesures conservées, associer une vidéo à une réalisation et comparer les essais. Cette partie utilise les enregistrements habituels du club.</p>
          {myRealisations.length ? (
            <label>
              <span>Réalisation</span>
              <select value={realisationId} onChange={(event) => setRealisationId(event.target.value)}>
                <option value="">Choisir une réalisation</option>
                {myRealisations.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {formatDateShortFr(String(item.dateRealisation || "").slice(0, 10))} · {formatRouteName(routesById[item.voieId])}
                  </option>
                ))}
              </select>
            </label>
          ) : <p className="small">Aucune réalisation enregistrée. Vous pouvez analyser une vidéo locale ou enregistrer une réalisation depuis votre profil.</p>}
          {selectedRealisation && (
            <>
            <RealisationVideoAnalysis
              key={selectedRealisation.id}
              realisation={selectedRealisation}
              route={routesById[selectedRealisation.voieId]}
              editable
              onUpdate={(patch) => onUpdate(selectedRealisation.id, patch)}
              onRefresh={onRefresh}
            />
            <VideoAnalysisHistory key={selectedRealisation.voieId} routeId={selectedRealisation.voieId} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
