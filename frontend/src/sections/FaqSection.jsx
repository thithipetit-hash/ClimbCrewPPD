import React, { useState } from "react";
import DemandesEvolution from "../pages/DemandesEvolution.jsx";

export default function FaqSection({ APP_VERSION, canAccessAdminTabs, USE_API, authToken, authUser }) {
  const [activeSection, setActiveSection] = useState("aide");

  return (
    <>
    <div className="card">
      <div className="card-header">
        <h2>FAQ - fonctionnement de ClimbClubCristal</h2>
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
      <details className="faq-item">
        <summary><strong>A quoi sert ClimbClubCristal ?</strong></summary>
        <div className="small">
          ClimbClubCristal permet de gérer les séances en vues Jour et Semaine, les inscriptions, les participants, les voies, les profils et la progression des grimpeurs du site SAE de Cristal. Une séance peut être Libre, Encadrée, Passeport, Challenge, Renouvellement ou Fermée. Le bandeau supérieur indique toujours la page active.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Qui peut changer le statut d'une séance ?</strong></summary>
        <div className="small">
          Un référent ou un encadrant peut passer une séance en « Libre ». Pour choisir un autre statut — Fermée, Encadrée, Passeport, Challenge ou Renouvellement — il faut être encadrant. Un administrateur qui n'est ni référent ni encadrant ne contourne pas cette règle métier. La création des séances reste gérée par l'administration.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment enregistrer une voie réalisée ?</strong></summary>
        <div className="small">
          Dans l'onglet Voies, le bouton « Réalisation » ouvre la saisie. Dans Profil, lorsque votre propre profil est affiché, le bouton « Nouvelle réalisation » permet également d'enregistrer une voie pour le compte connecté. Seules vos propres réalisations peuvent être ajoutées, modifiées ou supprimées. La personne doit être cotisante et inscrite à une séance le jour choisi. La saisie ne distingue pas les créneaux midi et soir.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Quel grimpeur est affiché par défaut dans Profil ?</strong></summary>
        <div className="small">
          À l'ouverture de l'onglet Profil, l'application affiche automatiquement le grimpeur associé au compte connecté. La liste « Grimpeur affiché » permet ensuite de consulter un autre grimpeur. Les actions personnelles — visibilité du profil, personnalisation, modification ou suppression de réalisations et export theCrag — restent disponibles uniquement lorsque votre propre profil est affiché.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Que voit-on lorsqu'on consulte le profil d'un autre grimpeur ?</strong></summary>
        <div className="small">
          Si son profil est public, l'onglet Profil affiche son avatar, ses statistiques, ses badges, son CPR, son évolution et ses réalisations enregistrées. Si le grimpeur a choisi un profil privé, ces informations détaillées ne sont pas affichées aux autres utilisateurs. Le propriétaire du profil continue à voir et gérer ses propres informations.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment sont présentés les participants et les voies ?</strong></summary>
        <div className="small">
          Pour un participant, la bille placée à gauche du nom indique la couleur du passeport. Le cadre est vert si la cotisation est réglée et rouge sinon ; il est plein avec une licence FFME et en pointillés sans licence. Dans les statistiques, la catégorie des grimpeurs sans passeport est affichée « Sans ». En séance Libre, un fond hachuré signale une personne déjà inscrite sans passeport requis. Pour une voie, le fond reprend la couleur des prises et un cadre rouge indique une voie uniquement en moulinette.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment fonctionnent les avatars et l'image de profil ?</strong></summary>
        <div className="small">
          Chaque grimpeur peut choisir un avatar parmi plusieurs animaux, personnages, fruits et objets. L’avatar évolue visuellement selon le niveau récent calculé par l’application. Dans « Profil », lorsque votre propre profil est affiché, un clic sur l'image ouvre les choix de personnalisation : avatar, sexe et image personnelle. Une image personnelle peut remplacer l'avatar ; les formats PNG, JPEG et WebP sont acceptés jusqu'à 5 Mo, puis l'image est recadrée au centre et convertie automatiquement en WebP carré 512 × 512. Il est toujours possible de revenir à l'avatar. Ces représentations sont proposées à titre purement ludique : elles ne portent aucun jugement sur les personnes et n’ont aucune intention offensante, discriminatoire ou stéréotypée. Le choix d’un avatar ou d'une image ne modifie ni les droits, ni les statistiques, ni le classement du grimpeur.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>A quoi sert le choix du sexe dans le profil ?</strong></summary>
        <div className="small">
          Le sexe peut être défini comme Homme, Femme ou Non précisé depuis la personnalisation ouverte en cliquant sur l'image de votre profil. Cette information sert notamment à choisir la variante visuelle de certains avatars et au filtre du Tableau d’honneur lorsqu'il est utilisé. Elle ne modifie pas le calcul du CPR, des points ou des réalisations.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment fonctionnent les vidéos associées aux voies ?</strong></summary>
        <div className="small">
          Lorsqu'une voie possède une ou plusieurs vidéos, son titre permet d'ouvrir la page dédiée à ces vidéos. Les administrateurs peuvent les gérer depuis « Modifier » sur la voie. Ils peuvent ajouter des liens HTTP ou HTTPS, à raison d'une URL par ligne, ou charger une vidéo locale depuis leur appareil. Jusqu'à 10 vidéos peuvent être associées à une voie. Les formats locaux acceptés sont MP4, WebM, OGG et MOV, avec une taille maximale de 50 Mo par fichier.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Les chargements de vidéos sont-ils tracés ?</strong></summary>
        <div className="small">
          Oui. Lorsqu'un administrateur charge une vidéo locale sur une voie, l'action est enregistrée dans les journaux administrateur avec la voie concernée, le nom du fichier, son type, son volume en octets et en Mo ainsi que l'identifiant technique de la vidéo.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment fonctionnent les badges ?</strong></summary>
        <div className="small">
          Les badges sont attribués automatiquement à partir des séances, voies et réalisations enregistrées. Ils illustrent notamment les premières réussites, les cotations atteintes, la régularité, l’exploration, les contributions et certains rôles du club. Les badges de vol et d’assurage comportent quatre niveaux, débloqués à 1, 5, 10 puis 50 vols enregistrés ou retenus. Ils sont uniquement ludiques, n’accordent aucun droit particulier et ne constituent pas une évaluation de la valeur ou des capacités d’une personne.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment lire le Kiviat des caractéristiques ?</strong></summary>
        <div className="small">
          Le Kiviat présente un indice d’aisance de 0 à 100 % pour chaque caractéristique de voie. La valeur de 50 % correspond à une zone neutre : au-dessus, la caractéristique ressort comme plus maîtrisée ; en dessous, elle constitue davantage un axe de progression. Le score se stabilise progressivement avec le nombre de réalisations enregistrées, indiqué à côté de chaque axe. Il reflète uniquement les données saisies dans l’application et non une évaluation générale du grimpeur.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Que signifie CPR ?</strong></summary>
        <div className="small">
          Le CPR représente le niveau récent du grimpeur. Le calcul examine les réalisations des 90 derniers jours et convertit chaque cotation en indice, de 4a à 7b. Cet indice est multiplié par le coefficient du style : à vue 1,25 ; flash 1,20 ; en tête 1,00 ; moulinette 0,85 ; travaillée 0,75 ; avec repos 0,60 ; projet 0,30 ; non enchaînée 0,20 ; essai ou test 0,10. Les performances sont ensuite classées par indice pondéré et seules les 10 meilleures sont conservées. La moyenne de leurs indices pondérés est arrondie à l'indice de cotation le plus proche, puis reconvertie en cotation. S'il existe moins de 10 réalisations valides, le calcul utilise uniquement celles disponibles. Une voie facile d'échauffement ne réduit donc pas le CPR si elle ne figure pas parmi les 10 meilleures performances récentes.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment est calculée la cotation consensus ?</strong></summary>
        <div className="small">
          Le consensus utilise uniquement les cotations proposées pour la voie. Chaque cotation est convertie en indice de 4a = 0 à 7b = 14. L'indice CPR utilisé est limité à l'intervalle 0-14. Le poids d'un avis vaut 1 + (indice CPR du grimpeur ÷ 14) : il varie donc de 1 à 2. Sans CPR calculable, le poids reste égal à 1. La formule est : somme des indices proposés multipliés par leur poids, divisée par la somme des poids. Le résultat est arrondi à l'indice le plus proche puis reconverti en cotation. Ainsi, tous les avis comptent, tandis que l'expérience récente mesurée par le CPR augmente progressivement leur poids sans jamais le doubler au-delà de 2.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment sont calculées les statistiques des réalisations en tête ?</strong></summary>
        <div className="small">
          Le total correspond à tous les enregistrements dont le style est « En tête ». Pour chaque cotation, l'application compte les voies disponibles et les réalisations en tête enregistrées sur ces voies. Le ratio est égal au nombre de réalisations en tête divisé par le nombre de voies de la cotation. Il représente donc le nombre moyen de réalisations en tête par voie et peut dépasser 1. Sans voie pour une cotation, le ratio est indiqué « nc ».
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment fonctionne le Tableau d’honneur ?</strong></summary>
        <div className="small">
          Le Tableau d’honneur affiche les trois premiers grimpeurs pour le CPR, les points, les participations, les réalisations, les voies en tête, les records sur une séance et les vols enregistrés. Le nombre total compte chaque réalisation réussie, même si une voie est refaite lors d'une autre séance. Pour les records d'une séance, une même voie n'est comptée qu'une fois. La difficulté cumulée attribue 1 point à 4a, puis un point supplémentaire par niveau jusqu'à 15 points pour 7b, avant d'additionner les voies de la séance. Les personnes ayant la même valeur conservent le même rang.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment fonctionne la règle des 1 000 points ?</strong></summary>
        <div className="small">
          Chaque voie distribue exactement 1 000 points entre les grimpeurs distincts qui l'ont enregistrée avec le style « En tête ». La part reçue pour une voie est donc égale à 1 000 divisé par le nombre de grimpeurs concernés. Par exemple, une personne seule reçoit 1 000 points ; quatre personnes reçoivent 250 points chacune. Plusieurs enregistrements en tête de la même voie par le même grimpeur ne lui donnent qu'une seule part. Les réalisations dans les autres styles ne distribuent pas de points. Le total d'un grimpeur est la somme de ses parts sur toutes les voies.
        </div>
      </details>

      <details className="faq-item">
        <summary><strong>Comment exporter ses réalisations vers theCrag ?</strong></summary>
        <div className="small">
          Dans « Profil », lorsque votre propre profil est affiché, le bouton « Exporter pour theCrag » est placé en bas de page. Il génère un fichier CSV contenant les réalisations du grimpeur connecté dans un format adapté à l'import vers theCrag. Le bouton n'est actif que lorsque des réalisations sont disponibles et n'est pas proposé lors de la consultation du profil d'un autre grimpeur.
        </div>
      </details>

      {canAccessAdminTabs && (
        <>
          <details className="faq-item">
            <summary><strong>Qui peut accéder à Administration, Gestion des comptes et Administration Serveur ?</strong></summary>
            <div className="small">
              Ces pages sont réservées aux administrateurs et ne sont pas affichées dans la navigation des utilisateurs standards.
            </div>
          </details>

          <details className="faq-item">
            <summary><strong>A quoi servent Gestion des comptes et Administration Serveur ?</strong></summary>
            <div className="small">
              Gestion des comptes permet d'approuver, révoquer, réactiver et réinitialiser les accès. Administration Serveur regroupe notamment les sauvegardes, la restauration, la messagerie, la diffusion et les journaux techniques et administrateur. Les actions sensibles réalisées par les administrateurs y sont tracées lorsqu'elles sont concernées par la journalisation.
            </div>
          </details>
        </>
      )}
        </>
      )}

      {activeSection === "evolutions" && (
        <DemandesEvolution USE_API={USE_API} authToken={authToken} authUser={authUser} />
      )}
    </div>
    </>
  );
}
