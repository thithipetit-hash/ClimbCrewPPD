# Sécurité GitHub et circuit de livraison — ClimbCrew

## Source de vérité et déploiements
- Développement/préproduction : `thithipetit-hash/ClimbCrewPPD`, branche `main`, serveur `pre-climbcrew.dip-tcs.com`.
- Production : `fabienkazak-maker/ClimbCrew`, branche `production`, serveur `climbcrew.dip-tcs.com`.
- La branche `main` du dépôt production peut servir de branche d'intégration mais ne correspond pas nécessairement à la version exécutée.
- La branche `production` du dépôt PPD est historique et ne doit jamais publier la production.
- Circuit cible : PR PPD -> validations -> PPD `main` -> contrôle serveur -> promotion contrôlée dans le dépôt production -> PR vers `production` -> validations -> déploiement -> contrôle du SHA et de la version publique.

## Réglages GitHub à appliquer par un administrateur
Dans Settings > Rules > Rulesets, protéger PPD `main` et production `main` / `production`, ainsi que l'ancienne branche PPD `production` si elle est conservée.
Exiger une Pull Request, une approbation et les contrôles de tests, intégration PostgreSQL et Linux. Interdire les force-push, les suppressions et les contournements par défaut. Contrôler les permissions de l'application GitHub et les collaborateurs.
La vérification de PR dans `deploy.yml` est une deuxième barrière, pas une protection GitHub. Ne pas annoncer que les règles sont activées sans vérification de leur état dans les paramètres.

## Données historiques
Les archives `docs/imports/` contiennent des données pseudonymisées (prénoms, initiales et informations d'inscriptions). Elles ont été retirées de la branche de développement et cette arborescence doit rester exclue des fichiers suivis.
**Les anciens commits, autres branches, tags et forks publics peuvent conserver des copies.** La suppression des fichiers en tête de branche ne constitue pas une purge complète.
Pour traiter cet historique : conserver d'abord une archive privée justifiée, inventorier les références des deux dépôts, faire évaluer le risque de réidentification par le responsable de traitement, planifier une purge coordonnée de l'historique avec un outil adapté et une sauvegarde, gérer les clones et forks, puis contrôler les anciennes URL et documenter les mesures. Une réécriture Git change les SHA et peut casser les déploiements : ne jamais la lancer automatiquement ou sans fenêtre de maintenance.

## Sauvegardes production
Le dépôt `fabienkazak-maker/ClimbCrew` doit disposer d'un runner auto-hébergé en ligne sur la machine de production (Settings > Actions > Runners). Un runner PPD ne prouve pas la restauration d'un dump de production.
`verify-backups.yml` vérifie quotidiennement un dump via restauration PostgreSQL temporaire et ne doit pas être annulé par une nouvelle planification. `monitor-backup-freshness.yml` utilise un runner GitHub pour signaler toute absence de restauration réussie depuis 36 h.
Ne clore l'alerte qu'après exécution manuelle réussie et vérification d'un cycle planifié, en contrôlant les résultats réels et non la seule présence du job.
