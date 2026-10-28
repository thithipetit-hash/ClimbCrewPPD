import React from "react";
import {
  COMPETENCE_CATEGORIES,
  FFME_COMPETENCES,
  FFME_VIDEOS,
  normalizeConsultedCompetences,
  getFfmePdfPath,
} from "../lib/competences-ffme.js";
import { COMPETENCE_LESSONS } from "../lib/competences-lessons.js";
import CompetenceLocalMedia from "../components/CompetenceLocalMedia.jsx";
import CompetencesPdfHtml from "../components/CompetencesPdfHtml.jsx";

const STORAGE_PREFIX = "climbcrew-ffme-ressources-consultees:";

export default function Competences({ accountId, standalone = false }) {
  const [openLessonId, setOpenLessonId] = React.useState(null);
  const [consultedIds, setConsultedIds] = React.useState([]);
  const [storageError, setStorageError] = React.useState("");
  const [zoomedImage, setZoomedImage] = React.useState(null);
  const [zoomPercent, setZoomPercent] = React.useState(100);
  const imageDialogRef = React.useRef(null);

  React.useEffect(() => {
    const dialog = imageDialogRef.current;
    if (!dialog) return;
    if (zoomedImage && !dialog.open) dialog.showModal();
    if (!zoomedImage && dialog.open) dialog.close();
  }, [zoomedImage]);

  function showImage(src, alt) {
    setZoomPercent(100);
    setZoomedImage({ src, alt });
  }
  const storageKey = accountId == null ? null : STORAGE_PREFIX + String(accountId);

  React.useEffect(() => {
    setStorageError("");
    if (!storageKey) {
      setConsultedIds([]);
      return;
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      setConsultedIds(normalizeConsultedCompetences(stored));
    } catch {
      setConsultedIds([]);
      setStorageError("Le suivi de lecture local est indisponible dans ce navigateur.");
    }
  }, [storageKey]);

  function toggleConsulted(id) {
    if (!storageKey) return;
    const next = consultedIds.includes(id)
      ? consultedIds.filter((value) => value !== id)
      : normalizeConsultedCompetences([...consultedIds, id]);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setConsultedIds(next);
      setStorageError("");
    } catch {
      setStorageError("Impossible d'enregistrer le suivi sur cet appareil. Vérifiez les paramètres du navigateur.");
    }
  }

  const displayed = FFME_COMPETENCES;
  const consultedSet = new Set(consultedIds);

  return (
    <div className="stack competences-page">
      {COMPETENCE_CATEGORIES.map((domain) => {
        const items = displayed.filter((item) => item.category === domain.id);
        if (items.length === 0) return null;
        return (
          <section key={domain.id} className="competences-domain" aria-labelledby={"competences-" + domain.id}>
            <h3 id={"competences-" + domain.id}>{domain.title}</h3>
            <div className="competences-grid">
              {items.map((item) => {
                const consulted = consultedSet.has(item.id);
                const lessonOpen = openLessonId === item.id;

                return (
                  <article className="card competence-resource" key={item.id}>
                    <div className="competence-resource-header">
                      <h4>{item.title}</h4>
                      {consulted && <span className="competences-viewed">Consultée</span>}
                    </div>
                    <p>{item.description}</p>
                    <p className="small">Chapitre : {item.chapter} · Thème de l’atlas FFME</p>
                    <p className="small">Texte FFME intégré et consultable, illustrations séparées et mise en page d’origine disponible.</p>
                    <div className="competences-actions">
                      <a
                        className="competences-source-link"
                        href={getFfmePdfPath(item)}
                        download={"FFME-" + item.id + ".pdf"}
                        aria-label={"Télécharger le document PDF FFME original : " + item.title}
                      >
                        Télécharger le PDF original
                      </a>
                      <button
                        type="button"
                        onClick={() => setOpenLessonId(lessonOpen ? null : item.id)}
                        aria-expanded={lessonOpen}
                        aria-controls={"competences-lesson-" + item.id}
                      >
                        {lessonOpen ? "Refermer la fiche" : "Lire la fiche intégrée"}
                      </button>
                    </div>
                    {lessonOpen && (
                      <div id={"competences-lesson-" + item.id} className="competences-lesson">
                        <CompetencesPdfHtml item={item} onExpandImage={showImage} />
                        <h5>Complément pédagogique ClimbCrew</h5>
                        <p><strong>Objectif :</strong> {COMPETENCE_LESSONS[item.id].objective}</p>
                        <ul>
                          {COMPETENCE_LESSONS[item.id].points.map((point, index) => <li key={index}>{point}</li>)}
                        </ul>
                        <p className="competences-warning"><strong>Vigilance :</strong> {COMPETENCE_LESSONS[item.id].vigilance}</p>
                        <details className="competences-image-details">
                          <summary>Ajouter une illustration personnelle</summary>
                          <p className="small">Image complémentaire personnelle, enregistrée localement sur cet appareil.</p>
                          <CompetenceLocalMedia type="image" id={item.id} title={item.title} />
                        </details>
                      </div>
                    )}
                    <label className="competences-consulted">
                      <input
                        type="checkbox"
                        disabled={!storageKey}
                        checked={consulted}
                        onChange={() => toggleConsulted(item.id)}
                      />
                      J’ai consulté cette ressource
                    </label>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      {displayed.length === 0 && (
        <div className="card competences-empty" role="status">Aucune ressource ne correspond aux filtres sélectionnés.</div>
      )}

      <section className="card competences-videos" aria-labelledby="competences-videos-title">
        <h3 id="competences-videos-title">Vidéos techniques FFME</h3>
        <p className="small">
          Lecteur natif intégré, sans YouTube ni connexion. Les quatre vidéos originales ne sont pas
          incluses : importez vos propres fichiers MP4/WebM uniquement si vous disposez des droits nécessaires.
          Les fichiers restent sur cet appareil et ne sont pas partagés avec les autres membres.
        </p>
        <div className="competences-video-grid">
          {FFME_VIDEOS.map((video) => (
            <article className="competences-video-item" key={video.id}>
              <h4>{video.title}</h4>
              <CompetenceLocalMedia type="video" id={video.id} title={video.title} />
            </article>
          ))}
        </div>
      </section>
      <dialog
        ref={imageDialogRef}
        className="competences-zoom-dialog"
        aria-label="Agrandir une illustration FFME"
        onClose={() => setZoomedImage(null)}
      >
        <div className="competences-zoom-controls">
          <strong>Page officielle FFME · © FFME</strong>
          <button type="button" disabled={zoomPercent <= 100} onClick={() => setZoomPercent((size) => Math.max(100, size - 50))}>−</button>
          <span>{zoomPercent}%</span>
          <button type="button" disabled={zoomPercent >= 400} onClick={() => setZoomPercent((size) => Math.min(400, size + 50))}>+</button>
          <button type="button" onClick={() => imageDialogRef.current?.close()}>Fermer</button>
        </div>
        {zoomedImage && (
          <div className="competences-zoom-scroller">
            <img src={zoomedImage.src} alt={zoomedImage.alt} style={{ width: zoomPercent + "%" }} />
          </div>
        )}
      </dialog>
    </div>
  );
}
