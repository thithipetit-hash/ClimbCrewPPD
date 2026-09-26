# AGENTS.md — ClimbCrew

Ce fichier définit les règles permanentes applicables à toute intervention sur ClimbCrew.
Elles s'appliquent aux évolutions, corrections, refactorings, tests et déploiements.

## 1. Principes impératifs

- Lire ce fichier avant toute modification du code.
- Travailler sur la préproduction (PPD) sauf demande explicite concernant la production.
- Effectuer le changement minimal nécessaire pour répondre au besoin.
- Corriger la cause racine d'un problème plutôt que masquer son symptôme.
- Avant de créer une nouvelle logique, rechercher si une implémentation équivalente existe déjà.
- Ne pas dupliquer de logique métier : une règle métier doit autant que possible avoir une source de vérité unique.
- Respecter l'architecture, les conventions et les composants existants.
- Ne pas élargir inutilement le périmètre d'une modification.
- En cas de contradiction entre une demande et une règle importante de ce fichier, signaler la contradiction avant de l'enfreindre.

## 2. Clean Code

- Privilégier un code simple, lisible, maintenable et testable.
- Utiliser des noms explicites pour variables, fonctions, composants, classes et fichiers.
- Éviter les abréviations ambiguës.
- Une fonction ou un composant doit avoir une responsabilité clairement identifiable.
- Réduire les fonctions excessivement longues et limiter les niveaux d'imbrication.
- Préférer des conditions simples et compréhensibles.
- Les commentaires expliquent le pourquoi ; ils ne doivent pas paraphraser le code.
- Supprimer le code mort clairement identifié lorsqu'il est directement lié au changement.
- Ne pas introduire d'abstraction prématurée.
- Ne pas lancer de refactoring massif sans rapport avec la demande.

## 3. DRY et logique métier

- Rechercher les fonctions, composants, hooks, services et utilitaires existants avant d'en créer de nouveaux.
- Factoriser les traitements réellement identiques utilisés à plusieurs endroits.
- Centraliser les constantes, listes de valeurs et règles métier communes.
- Ne pas maintenir deux implémentations concurrentes d'une même règle.
- Une anomalie indépendante découverte pendant une évolution est signalée plutôt que corrigée hors périmètre, sauf si sa correction est nécessaire à la fiabilité du changement.

## 4. Architecture

- Respecter la séparation entre interface, logique métier, accès aux données et infrastructure.
- Éviter de placer de la logique métier dans les composants d'interface lorsqu'elle peut être isolée.
- Ne pas créer de dépendance circulaire.
- Avant toute modification structurelle, rechercher ses impacts sur le reste de l'application.
- Ne pas ajouter une bibliothèque lorsqu'une solution native ou déjà présente répond correctement au besoin.

## 5. Données et API

- Valider côté serveur les données reçues du client.
- Ne jamais considérer une donnée cliente comme fiable par défaut.
- Maintenir la compatibilité avec les données existantes lorsque raisonnablement possible.
- Toute évolution du modèle de données doit prendre en compte les données déjà enregistrées.
- Éviter toute suppression destructive sans contrôle explicite.
- Les erreurs API doivent être compréhensibles et exploitables par le frontend.

## 6. Gestion des erreurs

- Ne pas masquer silencieusement les erreurs.
- Fournir à l'utilisateur un retour compréhensible en cas d'échec.
- Conserver les détails techniques utiles dans les logs plutôt que dans l'interface.
- Éviter les captures d'exception trop générales qui empêchent le diagnostic.
- Les opérations importantes doivent permettre de distinguer clairement succès et échec.

## 7. Frontend et UX

- Les évolutions doivent fonctionner sur mobile et grand écran sauf contrainte explicitement documentée.
- Respecter les composants, styles et comportements UX déjà utilisés dans ClimbCrew.
- Ne pas modifier inutilement la présentation lors d'une correction fonctionnelle.
- Une action nécessitant un délai doit fournir un retour visible.
- Prévenir les doubles soumissions et doubles enregistrements.
- Désactiver une action lorsqu'elle est déjà en cours ou momentanément impossible.
- Après sauvegarde, l'interface doit refléter les données réellement enregistrées.
- Toute saisie déclenchant un enregistrement doit fournir un acquittement visuel explicite : état en cours pendant l'opération, puis confirmation de succès ou message d'échec. Un rafraîchissement silencieux ne constitue pas un acquittement.

## 8. Sécurité

- Ne jamais placer de secret, mot de passe, token ou clé API dans le code.
- Utiliser les variables d'environnement pour les informations sensibles.
- Contrôler les autorisations côté serveur, pas uniquement dans l'interface.
- Ne pas exposer inutilement de données personnelles.
- Valider et nettoyer les entrées utilisateur lorsque nécessaire.

## 9. Performance

- Éviter les appels API inutiles ou répétés.
- Éviter les recalculs et rendus inutiles.
- Préférer une récupération ciblée à un chargement massif lorsque c'est pertinent.
- Ne pas complexifier le code pour une optimisation sans bénéfice identifiable.

## 10. Dépendances

Avant d'ajouter une dépendance :
1. vérifier qu'elle est nécessaire ;
2. vérifier qu'une solution équivalente n'existe pas déjà dans le projet ;
3. privilégier une dépendance maintenue et adaptée ;
4. éviter une dépendance lourde pour une fonctionnalité triviale.

## 11. Tests et non-régression

Pour chaque évolution ou correction :
1. identifier les fonctionnalités potentiellement impactées ;
2. vérifier le comportement nominal ;
3. vérifier les principaux cas limites ;
4. vérifier les principaux cas d'erreur ;
5. vérifier les fonctionnalités existantes directement liées.

Lorsqu'un bug est corrigé, ajouter si possible un test reproduisant le bug afin d'empêcher sa réapparition.

## 12. Validation avant commit

Avant de considérer le changement prêt :
- vérifier le diff et sa cohérence avec la demande ;
- exécuter le build ;
- exécuter le lint lorsqu'il existe ;
- exécuter les tests pertinents ;
- vérifier les erreurs significatives dans les logs ;
- vérifier qu'aucun secret, fichier temporaire ou artefact indésirable n'a été ajouté.

Une modification de code n'est pas à elle seule une preuve que l'évolution fonctionne.

## 13. Git, version et déploiement

- Utiliser la préproduction pour les développements sauf demande explicite contraire.
- Ne pas modifier la production par défaut.
- Conserver des commits cohérents et descriptifs.
- Lorsqu'un déploiement est demandé, vérifier le workflow de déploiement.
- En cas d'échec, analyser la cause racine, corriger puis revérifier.
- Ne jamais annoncer qu'une version est « en ligne » uniquement parce qu'un commit a été poussé ou qu'un workflow a démarré.
- Vérifier effectivement la version déployée avant d'annoncer la mise en ligne.
- Respecter le mécanisme de versionnement existant du projet et l'incrémenter lorsqu'une évolution le nécessite.

### Flux de déploiement PPD

- Le dépôt de développement préproduction est `thithipetit-hash/ClimbCrewPPD`.
- Le workflow de validation et de déploiement PPD est piloté par `fabienkazak-maker/ClimbCrew/.github/workflows/deploy.yml`.
- Un push uniquement dans `ClimbCrewPPD` ne constitue pas un déploiement et ne déclenche pas le workflow du dépôt principal.
- Pour mettre une version PPD en ligne, finaliser et valider les changements dans `ClimbCrewPPD/main`, puis les intégrer dans le dépôt principal.
- **Flux PPD vérifié le 26/09/2026 :** dans `fabienkazak-maker/ClimbCrew`, créer une branche dédiée `deploy/<version>` depuis `main`, incrémenter `VERSION`, puis ouvrir une Pull Request de cette branche vers `main`.
- Laisser les validations de la Pull Request s'exécuter avant fusion. Ce passage par une PR dédiée rend les contrôles préalables consultables et évite de dépendre d'un push direct non observable.
- Fusionner ensuite la Pull Request validée vers `main` : ce push sur `main` déclenche `.github/workflows/deploy.yml` et le déploiement PPD.
- Ne pas utiliser un simple push dans `ClimbCrewPPD` comme mécanisme de mise en ligne.
- Après la fusion, suivre le workflow jusqu'à son terme et vérifier le contrôle public post-déploiement avant d'annoncer que la version est en ligne.
- La branche `production` du dépôt principal ne doit être utilisée que sur demande explicite de mise en production.

## 14. Définition de terminé

Une évolution ClimbCrew est terminée uniquement lorsque les éléments applicables sont satisfaits :

**code propre + changement minimal + build valide + tests pertinents + absence de régression identifiée + déploiement demandé réussi + version déployée vérifiée.**
