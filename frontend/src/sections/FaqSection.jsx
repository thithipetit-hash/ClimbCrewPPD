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
    content: "Une voie peut contenir plusieurs vidéos accessibles depuis son titre. Les formats vidéo pris en charge permettent de consulter les séquences associées aux voies et aux réalisations lorsqu’elles sont disponibles.",
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
    content: "Le CPR représente le niveau récent du grimpeur. Il utilise les voies réussies au cours des 90 derniers jours et conserve jusqu’aux dix meilleures réalisations. Seules les réussites sont prises en compte : le mode ou le critère de réalisation ne gonfle pas artificiellement la cotation. Une voie facile d'échauffement n'abaisse donc pas le CPR si elle ne fait pas partie de ces dix meilleures réalisations.",
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
    title: "Comment renseigner le profil physique ?",
    content: "Dans Profil > Profil physique, saisissez les valeurs au clavier. La valeur est enregistrée lorsque vous quittez le champ ou appuyez sur Entrée. Taille, envergure et portée se mesurent en centimètres, le poids en kilogrammes. L’Ape Index correspond à envergure moins taille ; l’allonge relative à envergure divisée par taille ; l’IMC est calculé à partir de la taille et du poids. Un avertissement signale les valeurs qui paraissent incohérentes afin de repérer surtout les erreurs de saisie ou d’unité.",
  },
  {
    title: "Comment réaliser les tests physiques ?",
    content: "Faites les tests échauffé, reposé et dans des conditions reproductibles. Préhension : dynamomètre tenu bras le long du corps, meilleure valeur de 2 essais par main. Suspension 20 mm : deux mains sur une réglette de 20 mm, bras tendus, chronométrer jusqu’au lâcher ; si délesté, conserver le même délestage lors des comparaisons. Suspension sur bac : deux mains sur une prise franche, bras tendus, chronométrer jusqu’au lâcher. Tractions strictes : départ bras tendus, monter sans élan jusqu’au menton au-dessus des mains, compter uniquement les répétitions complètes. Suspension à 90° : partir coudes fléchis à environ 90° et chronométrer jusqu’à la perte nette de l’angle. Mobilité des hanches : utilisez toujours le même protocole et le même repère de mesure en cm ; la valeur sert surtout au suivi individuel. Arrêtez un test en cas de douleur.",
  },
  {
    title: "Comment exporter ses réalisations vers theCrag ?",
    content: "Depuis son propre profil, Exporter pour theCrag génère un fichier CSV adapté à l'import. Le bouton n'est proposé que pour le profil associé au compte connecté.",
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

export default function FaqSection({ APP_VERSION, USE_API, authUser }) {
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
        </>
      )}

      {activeSection === "evolutions" && (
        <DemandesEvolution USE_API={USE_API} authUser={authUser} />
      )}
    </div>
  );
}
