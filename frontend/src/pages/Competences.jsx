import React from "react";
import { COMPETENCE_CATEGORIES, FFME_COMPETENCES } from "../lib/competences-ffme.js";
import { COMPETENCE_LESSONS } from "../lib/competences-lessons.js";
import CompetencesPdfHtml from "../components/CompetencesPdfHtml.jsx";

export default function Competences() {
  const [openLessonId, setOpenLessonId] = React.useState(null);
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
  const displayed = FFME_COMPETENCES;

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
                const lessonOpen = openLessonId === item.id;

                return (
                  <article className="card competence-resource" key={item.id}>
                    <div className="competence-resource-header">
                      <h4>{item.title}</h4>
                    </div>
                    <p>{item.description}</p>
                    <p className="small">Chapitre : {item.chapter} · Thème de l’atlas FFME</p>
                    <p className="small">Texte FFME intégré et consultable, illustrations séparées et mise en page d’origine disponible.</p>
                    <div className="competences-actions">
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
                      </div>
                    )}
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
