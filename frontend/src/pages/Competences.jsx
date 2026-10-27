import React from "react";
import {
  COMPETENCE_CATEGORIES,
  FFME_COMPETENCES,
  FFME_VIDEOS,
  filterFfmeCompetences,
  normalizeConsultedCompetences,
} from "../lib/competences-ffme.js";
import { COMPETENCE_LESSONS } from "../lib/competences-lessons.js";
import CompetenceIllustration from "../components/CompetenceIllustration.jsx";
import CompetenceLocalMedia from "../components/CompetenceLocalMedia.jsx";

const STORAGE_PREFIX = "climbcrew-ffme-ressources-consultees:";

export default function Competences({ accountId, standalone = false }) {
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [openLessonId, setOpenLessonId] = React.useState(null);
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
          Explorez les 12 fiches pédagogiques rédigées pour ClimbCrew à partir des thèmes
          de l’atlas « Initiateur SAE ». Texte et schémas sont intégrés à l’application :
          aucun PDF ni lecteur externe n’est nécessaire.
        </p>
        <p className="small">
          Ces fiches sont des supports de formation, pas une évaluation de votre aptitude
          ni une certification FFME. Pour les gestes de sécurité, pratiquez avec un encadrant
          qualifié et suivez les règles du club ainsi que les notices des fabricants.
          Ces synthèses et schémas originaux ne reproduisent pas les documents officiels de la FFME.
        </p>
        <p className="small">
          <a className="competences-offline-link" href="/competences/hors-ligne">
            Ouvrir la bibliothèque autonome, accessible hors connexion après sa préparation
          </a>
          {standalone && " · Mode autonome sans compte et sans données serveur."}
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
          Suivi personnel sur cet appareil et ce navigateur uniquement.
          Aucun passeport ou validation d’encadrant n’est modifié.
          Le suivi du mode autonome est distinct de celui du compte connecté.
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
                const lessonOpen = openLessonId === item.id;
                return (
                  <article className="card competence-resource" key={item.id}>
                    <div className="competence-resource-header">
                      <h4>{item.title}</h4>
                      {consulted && <span className="competences-viewed">Consultée</span>}
                    </div>
                    <p>{item.description}</p>
                    <p className="small">Chapitre : {item.chapter} · Thème de l’atlas FFME</p>
                    <CompetenceIllustration category={item.category} title={item.title} />
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
                        <p><strong>Objectif :</strong> {COMPETENCE_LESSONS[item.id].objective}</p>
                        <ul>
                          {COMPETENCE_LESSONS[item.id].points.map((point, index) => <li key={index}>{point}</li>)}
                        </ul>
                        <p className="competences-warning"><strong>Vigilance :</strong> {COMPETENCE_LESSONS[item.id].vigilance}</p>
                        <details className="competences-image-details">
                          <summary>Ajouter une illustration personnelle</summary>
                          <p className="small">Image autorisée, enregistrée localement ; ne remplace pas les illustrations officielles.</p>
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
    </div>
  );
}
