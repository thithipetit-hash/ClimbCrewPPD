import React, { useState } from "react";
import DemandesEvolution from "../pages/DemandesEvolution.jsx";

const HELP_ITEMS = [
  {
    title: "A quoi sert CristalClimbClub ?",
    content: "CristalClimbClub gère les séances, les inscriptions, les participants, les voies, les profils et la progression des grimpeurs du site SAE de Cristal. Les séances sont disponibles en vues Jour et Semaine et peuvent être Libres, Encadrées, Passeport, Challenge, Renouvellement ou Fermées.",
  },
  {
    title: "Qui peut changer le statut d'une séance ?",
    content: "Un référent ou un encadrant peut passer une séance en Libre. Pour choisir Fermée, Encadrée, Passeport, Challenge ou Renouvellement, il faut être encadrant. Le rôle administrateur ne contourne pas cette règle métier.",
  },
  {
    title: "Comment enregistrer une voie réalisée ?",
    content: "Dans Voies, le bouton Réalisation ouvre la saisie. Depuis son propre profil, Nouvelle réalisation permet aussi d'enregistrer une voie. Le mode En tête ou Moulinette et le critère À vue, Flash, Travaillée, Avec repos, Projet, Non enchaînée ou Essai/test sont indépendants. Une voie moulinette uniquement impose automatiquement Moulinette.",
  },
  {
    title: "Quel grimpeur est affiché par défaut dans Profil ?",
    content: "Le profil associé au compte connecté est sélectionné automatiquement et placé en tête de la liste. Les actions personnelles restent disponibles uniquement lorsque son propre profil est affiché.",
  },
  {
    title: "Que voit-on lorsqu'on consulte le profil d'un autre grimpeur ?",
    content: "Un profil public affiche avatar, statistiques, badges, CPR, évolution et réalisations. Si le grimpeur a choisi un profil privé, ces informations détaillées ne sont pas présentées aux autres utilisateurs.",
  },
  {
    title: "Comment sont présentés les participants et les voies ?",
    content: "La bille d'un participant indique son passeport. Le cadre reflète cotisation et licence FFME. En séance Libre, un fond hachuré signale une inscription sans passeport requis. Pour une voie, le fond reprend la couleur des prises et un cadre rouge indique une voie uniquement en moulinette.",
  },
  {
    title: "Comment fonctionnent les avatars et l'image de profil ?",
    content: "Chaque grimpeur peut choisir un avatar ou une image personnelle. L'avatar évolue selon le niveau récent calculé par l'application. Une image PNG, JPEG ou WebP peut être recadrée en carré 512 × 512. Ces éléments sont ludiques et ne modifient ni les droits, ni les statistiques, ni les classements.",
  },
  {
    title: "A quoi sert le choix du sexe dans le profil ?",
    content: "Le sexe peut être Homme, Femme ou Non précisé. Il sert notamment à certaines variantes d'avatar et au filtre du Tableau d'honneur. Il ne modifie pas le CPR, les points ou les réalisations.",
  },
  {
    title: "Comment fonctionnent les vidéos associées aux voies ?",
    content: "Une voie peut contenir plusieurs vidéos accessibles depuis son titre. Les administrateurs les gèrent depuis Modifier : liens HTTP/HTTPS ou fichiers locaux MP4, WebM, OGG et MOV. Les chargements locaux sont tracés dans les journaux administrateur.",
  },
  {
    title: "Comment fonctionnent les badges ?",
    content: "Les badges sont calculés automatiquement à partir des séances, voies, réalisations et contributions enregistrées. Ils couvrent notamment premières réussites, niveaux atteints, exploration, régularité, rôles, vols et assurages. Ils sont uniquement symboliques et n'accordent aucun droit particulier.",
  },
  {
    title: "Comment lire le Kiviat des caractéristiques ?",
    content: "Le Kiviat présente un indice d'aisance de 0 à 100 % pour les caractéristiques des voies. La zone autour de 50 % est neutre. Le score se stabilise progressivement avec les réalisations saisies et décrit uniquement les données présentes dans l'application.",
  },
  {
    title: "Que signifie CPR ?",
    content: "Le CPR représente le niveau récent du grimpeur. Il utilise les réalisations des 90 derniers jours, pondérées par cotation, mode et critère, puis conserve les dix meilleures performances. Une voie facile d'échauffement n'abaisse donc pas le CPR si elle ne fait pas partie de ces dix performances.",
  },
  {
    title: "Comment est calculée la cotation consensus ?",
    content: "Les propositions de cotation sont converties en indices. Chaque avis compte et son poids augmente progressivement avec le CPR du grimpeur, de 1 à 2 au maximum. La moyenne pondérée est ensuite reconvertie en cotation.",
  },
  {
    title: "Comment sont calculées les statistiques des réalisations en tête ?",
    content: "Une réussite en tête combine le mode En tête avec un critère de réussite À vue, Flash ou Travaillée. Les anciennes valeurs historiques restent compatibles. Les ratios sont calculés uniquement lorsque des voies existent pour la cotation concernée.",
  },
  {
    title: "Comment fonctionne le Tableau d’honneur ?",
    content: "Le Tableau d'honneur présente les meilleurs résultats sur plusieurs indicateurs : CPR, points, participations, réalisations, voies en tête, records de séance et vols. Les égalités conservent le même rang.",
  },
  {
    title: "Comment fonctionne la règle des 1 000 points ?",
    content: "Chaque voie distribue exactement 1 000 points entre les grimpeurs distincts qui l'ont réussie en tête avec un critère de réussite. Refaire la même voie ne donne pas une part supplémentaire et une réussite en moulinette ne distribue pas de points d'ascension en tête.",
  },
  {
    title: "Comment exporter ses réalisations vers theCrag ?",
    content: "Depuis son propre profil, Exporter pour theCrag génère un fichier CSV adapté à l'import. Le bouton n'est proposé que pour le profil associé au compte connecté.",
  },
];

const ADMIN_ITEMS = [
  {
    title: "Qui peut accéder à Administration, Gestion des comptes et Administration Serveur ?",
    content: "Ces pages sont réservées aux administrateurs et ne sont pas affichées dans la navigation des utilisateurs standards.",
  },
  {
    title: "A quoi servent Gestion des comptes et Administration Serveur ?",
    content: "Gestion des comptes permet d'approuver, révoquer, réactiver, associer et administrer les accès. Administration Serveur regroupe notamment sauvegardes, restauration, messagerie, diffusion et journaux techniques. Les actions sensibles sont tracées.",
  },
];

function FaqItem({ title, content }) {
  return (
    <details className="faq-item">
      <summary><strong>{title}</strong></summary>
      <div className="small">{content}</div>
    </details>
  );
}

export default function FaqSection({ APP_VERSION, canAccessAdminTabs, USE_API, authToken, authUser }) {
  const [activeSection, setActiveSection] = useState("aide");

  return (
    <div className="card">
      <div className="card-header">
        <h2>FAQ - fonctionnement de CristalClimbClub</h2>
        <span className="small">Version : {APP_VERSION}</span>
      </div>

      <div className="faq-subtabs" role="tablist" aria-label="Sections de la FAQ">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "aide"}
          className={activeSection === "aide" ? "primary-button" : "secondary"}
          onClick={() => setActiveSection("aide")}
        >
          Aide
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "evolutions"}
          className={activeSection === "evolutions" ? "primary-button" : "secondary"}
          onClick={() => setActiveSection("evolutions")}
        >
          Demandes d’évolution
        </button>
      </div>

      {activeSection === "aide" && (
        <>
          {HELP_ITEMS.map((item) => <FaqItem key={item.title} {...item} />)}
          {canAccessAdminTabs && ADMIN_ITEMS.map((item) => <FaqItem key={item.title} {...item} />)}
        </>
      )}

      {activeSection === "evolutions" && (
        <DemandesEvolution USE_API={USE_API} authToken={authToken} authUser={authUser} />
      )}
    </div>
  );
}
