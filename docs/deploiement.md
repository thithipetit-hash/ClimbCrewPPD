# Déploiement automatisé GitHub Actions

Ce document décrit le déploiement Linux de ClimbCrewPPD réalisé par le workflow `.github/workflows/deploy.yml`.

## Objectif

Le déploiement est séparé en deux phases :

1. **validation** sur un runner GitHub hébergé (`ubuntu-latest`) ;
2. **déploiement** sur le runner auto-hébergé installé sur le serveur Linux.

Le serveur de production ne doit déployer que le commit qui vient d'être validé.

## Pourquoi le job de production n'utilise plus `actions/checkout`

Le dépôt Git est déjà présent de manière persistante dans `/opt/climbcrew` sur le serveur. Télécharger `actions/checkout` à chaque déploiement est donc inutile pour le job auto-hébergé.

Cette dépendance pouvait empêcher tout déploiement avant même l'exécution du code ClimbCrew. Un cas observé est une réponse GitHub `HTTP 429 Too Many Requests` lors du téléchargement de l'archive `actions/checkout@v4` depuis `codeload.github.com`.

Le job de production utilise désormais uniquement les commandes Git disponibles sur le serveur :

```text
/opt/climbcrew
    ↓
git fetch avec retries
    ↓
vérification du SHA validé
    ↓
git reset --hard <SHA validé>
    ↓
docker compose up -d --build
    ↓
contrôle /health
```

`actions/checkout` reste utilisé dans le job de validation GitHub, car un runner GitHub hébergé est éphémère et ne possède pas de copie persistante du dépôt.

## Commit réellement déployé

Le job `validate` détermine le SHA exact du dépôt après le checkout et l'expose au job `deploy` sous la sortie `validated_sha`.

Le job de production ne fait donc pas simplement un `git reset --hard origin/main`, car `main` peut avancer entre la validation et le déploiement. Il effectue :

1. un `git fetch` de la branche concernée ;
2. une vérification que le commit validé existe localement ;
3. un `git reset --hard` vers le **SHA exact validé** ;
4. une vérification que `HEAD` correspond bien à ce SHA.

Cela garantit que le code démarré sur le serveur est celui qui a passé les tests.

## Relances réseau

Le `git fetch` du runner de production est protégé par plusieurs tentatives avec attente progressive.

Une panne réseau transitoire ou une limitation GitHub ne provoque donc pas immédiatement l'échec du déploiement. Si toutes les tentatives échouent, le workflow s'arrête avant de modifier la version actuellement exécutée.

## Pré-requis du runner auto-hébergé

Le runner doit disposer de :

- Git ;
- Docker Engine ;
- Docker Compose ;
- `curl` ;
- un clone Git persistant dans `/opt/climbcrew` ;
- un remote `origin` donnant accès au dépôt déployé ;
- `/opt/climbcrew/.env.production` créé manuellement et non versionné.

Vérifications utiles sur le serveur :

```bash
cd /opt/climbcrew
git remote -v
git status
docker version
docker compose version
curl --fail http://127.0.0.1:3000/health
```

## Fichier d'environnement et SMTP

`.env.production` reste hors Git et n'est jamais remplacé par le workflow.

Avant le déploiement, le workflow vérifie son existence. Si les secrets GitHub `SMTP_USER` et `SMTP_PASSWORD` sont configurés, les paramètres SMTP nécessaires sont synchronisés dans ce fichier. Les valeurs des secrets ne doivent jamais être écrites dans les logs.

## Déploiement Docker

Après positionnement sur le SHA validé, le workflow exécute :

```bash
cd /opt/climbcrew
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Le backend est ensuite contrôlé sur :

```text
http://127.0.0.1:3000/health
```

Le contrôle est répété pendant la période de démarrage des conteneurs. Le workflow n'est considéré comme réussi que lorsque ce point de santé répond correctement.

En cas d'échec du contrôle, les dernières lignes du conteneur backend sont affichées dans le log GitHub Actions pour faciliter le diagnostic.

## Déclenchement

Le workflow est exécuté automatiquement lors d'un `push` sur `main`.

Il peut également être lancé manuellement avec `workflow_dispatch`. Dans ce cas, la branche demandée est d'abord utilisée par le job de validation ; le SHA obtenu après cette validation est ensuite celui qui est déployé.

Une Pull Request vers `main` exécute uniquement la validation : le job de production n'est pas lancé.

## Lecture des statuts

### `Validation du code` en échec

Aucun déploiement n'est réalisé. Corriger le test, le build ou le backend avant de relancer.

### `Validation du code` réussie, `Déployer sur le serveur de production` en attente

Vérifier que le runner auto-hébergé est connecté et disponible dans GitHub Actions.

### Échec pendant `Synchroniser le dépôt local`

Vérifier :

```bash
cd /opt/climbcrew
git remote -v
git fetch origin main
```

Les causes possibles sont notamment un accès GitHub indisponible, un remote incorrect ou un problème DNS/réseau.

### Échec pendant le build Docker

Consulter les logs du job et, sur le serveur :

```bash
cd /opt/climbcrew
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=200
```

### Échec du contrôle `/health`

Consulter en priorité :

```bash
docker logs --tail 200 climbcrew-backend
```

Puis vérifier PostgreSQL et les variables de `.env.production` sans publier leur contenu dans GitHub.

## Retour manuel à un commit précédent

Le workflow ne réalise pas de rollback automatique de la base de données. Un retour de code doit donc rester une opération contrôlée, notamment lorsqu'une version contient une migration PostgreSQL.

Pour revenir manuellement à un commit connu :

```bash
cd /opt/climbcrew
git log --oneline -20
git reset --hard <SHA_PRECEDENT>
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
curl --fail http://127.0.0.1:3000/health
```

Avant un changement de schéma important, effectuer une sauvegarde PostgreSQL.

## Principe de sécurité

Le workflow applique la règle suivante :

> valider d'abord, déployer ensuite exactement le commit validé.

Le runner de production n'utilise aucune action GitHub tierce ou téléchargée pour préparer le dépôt. Les secrets restent gérés par GitHub Actions et par `.env.production`, qui n'est pas versionné.

## Procédure de publication d'une évolution en préproduction (retour d'expérience du 14/11/2026)

1. Modifier le code sur une branche dédiée et ouvrir une Pull Request vers `main`.
2. Faire valider les tests, puis fusionner la Pull Request.
3. Lire le fichier racine `VERSION`. **Chaque nouvelle publication doit incrémenter la version** (exemple : `261114.001` → `261114.002`). Si l'incrément a été oublié, créer une PR dédiée à `VERSION` et la fusionner.
4. Contrôler le workflow GitHub Actions **Validate and Deploy** du **commit de fusion sur `main`**, pas seulement celui de la Pull Request. Vérifier les jobs de tests et le job de déploiement séparément.
5. Ne jamais interpréter la conclusion globale `success` comme une preuve de publication : un job **Déployer la préproduction** peut avoir la conclusion `skipped`. Dans ce cas, la publication n'est **pas confirmée** ; examiner les conditions `if` du workflow `.github/workflows/deploy.yml`, les événements déclencheurs et la disponibilité du runner.
6. Si le workflow autorise `workflow_dispatch`, le lancer sur `main` puis vérifier le job de déploiement. Sinon, corriger la condition ou le déclencheur de manière ciblée, avec revue et tests ; ne pas créer de commit factice pour simuler une publication.
7. Vérifier sur l'environnement cible le numéro de version et le SHA effectivement exécutés, la santé de l'API, puis les parcours essentiels (connexion, affichage du CPR, enregistrement d'une réalisation). Ne déclarer la publication terminée qu'après ces contrôles.

### Exemple concret

- PR **#347** : affichage de la valeur pondérée de chaque voie dans le CPR ; fusionnée sur `main` au commit `a7d0c8d`.
- Exécution GitHub Actions **#2206** : tests réussis, mais job **Déployer la préproduction** à `skipped`. Le code était fusionné, **pas prouvé publié**.
- PR **#348** : incrément de `VERSION` de `261114.001` à `261114.002`, fusionnée au commit `8a041fe`.
- L'incrément de version ne prouve pas à lui seul que le serveur a été mis à jour ; vérifier une exécution de déploiement et le runtime.

Cette procédure complète les instructions de déploiement Linux ci-dessus ; elle ne remplace pas les contrôles de sécurité ni la validation du SHA déployé.
