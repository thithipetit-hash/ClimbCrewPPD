import React from "react";
import {
  COMPETENCE_CATEGORIES,
  FFME_COMPETENCES,
  FFME_VIDEOS,
  filterFfmeCompetences,
  normalizeConsultedCompetences,
} from "../lib/competences-ffme.js";

const STORAGE_PREFIX = "climbcrew-ffme-ressources-consultees:";

export default function Competences({ accountId }) {
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [previewId, setPreviewId] = React.useState(null);
  const [consultedIds, setConsultedIds] = React.useState([]);
  const [storageError, setStorageError] = React.useState("");
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

  const matching = filterFfmeCompetences({ category, query });
  const displayed = onlyUnread ? matching.filter((item) => !consultedIds.includes(item.id)) : matching;
  const consultedSet = new Set(consultedIds);

  return (
    <div className="stack competences-page">
      <section className="card competences-intro">
        <h2>Compétences · Atlas FFME</h2>
        <p>
          Explorez les ressources techniques et pédagogiques de l’atlas « Initiateur SAE » :
          documents originaux FFME et vidéos associées, sans reproduction des illustrations.
        </p>
        <p className="small">
          Ces fiches sont des supports de formation, pas une évaluation de votre aptitude
          ni une certification FFME. Pour les gestes de sécurité, pratiquez avec un encadrant
          qualifié et suivez les règles du club ainsi que les notices des fabricants.
        </p>
      </section>

      <section className="card competences-dashboard" aria-label="Suivi des ressources">
        <div className="competences-count">
          <strong>{consultedIds.length} / {FFME_COMPETENCES.length}</strong>
          <span>ressources marquées comme consultées</span>
        </div>
        <progress value={consultedIds.length} max={FFME_COMPETENCES.length}>
          {consultedIds.length} sur {FFME_COMPETENCES.length}
        </progress>
        <p className="small">
          Suivi personnel enregistré uniquement sur cet appareil et ce navigateur,
          sans synchronisation avec les passeports ni validation d’un encadrant.
        </p>
        {storageError && <p className="competences-error" role="alert">{storageError}</p>}
      </section>

      <section className="card competences-search" aria-label="Rechercher des ressources">
        <label htmlFor="competences-query">Rechercher une compétence</label>
        <input
          id="competences-query"
          type="search"
          placeholder="Ex. : encordement, parade, pieds…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="competences-categories" aria-label="Filtrer par domaine">
          <button type="button" aria-pressed={category === "all"} className={category === "all" ? "selected" : ""} onClick={() => setCategory("all")}>
            Toutes
          </button>
          {COMPETENCE_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              className={category === item.id ? "selected" : ""}
              onClick={() => setCategory(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <label className="competences-unread">
          <input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} />
          Afficher uniquement les ressources non consultées
        </label>
        <p className="small" role="status">{displayed.length} ressource{displayed.length > 1 ? "s" : ""} affichée{displayed.length > 1 ? "s" : ""}</p>
      </section>

      {COMPETENCE_CATEGORIES.map((domain) => {
        const items = displayed.filter((item) => item.category === domain.id);
        if (items.length === 0) return null;
        return (
          <section key={domain.id} className="competences-domain" aria-labelledby={"competences-" + domain.id}>
            <h3 id={"competences-" + domain.id}>{domain.title}</h3>
            <div className="competences-grid">
              {items.map((item) => {
                const consulted = consultedSet.has(item.id);
                const previewOpen = previewId === item.id;
                return (
                  <article className="card competence-resource" key={item.id}>
                    <div className="competence-resource-header">
                      <h4>{item.title}</h4>
                      {consulted && <span className="competences-viewed">Consultée</span>}
                    </div>
                    <p>{item.description}</p>
                    <p className="small">Chapitre : {item.chapter} · {item.pages} page{item.pages > 1 ? "s" : ""} · Source FFME</p>
                    <div className="competences-actions">
                      <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer" className="competences-source-link">
                        Ouvrir le PDF FFME
                      </a>
                      <button type="button" onClick={() => setPreviewId(previewOpen ? null : item.id)} aria-expanded={previewOpen} aria-controls={"competences-preview-" + item.id}>
                        {previewOpen ? "Masquer l’aperçu" : "Aperçu du PDF"}
                      </button>
                    </div>
                    {previewOpen && (
                      <div id={"competences-preview-" + item.id} className="competences-preview">
                        <iframe
                          title={"Document FFME : " + item.title}
                          src={item.pdfUrl + "#toolbar=1"}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <p className="small">
                          Si l’aperçu ne s’affiche pas, utilisez le lien « Ouvrir le PDF FFME ».
                        </p>
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
        <p className="small">Liens présents dans l’atlas joint, à visionner sur YouTube.</p>
        <div className="competences-video-grid">
          {FFME_VIDEOS.map((video) => (
            <a key={video.id} href={video.url} target="_blank" rel="noopener noreferrer" className="competences-video-link">
              {video.title} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
