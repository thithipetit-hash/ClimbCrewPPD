# Déploiement Linux derrière un reverse proxy HTTPS

ClimbCrew fonctionne entièrement sous Linux avec Docker Compose.

## Services exposés localement

- frontend : `127.0.0.1:8080` ;
- backend : `127.0.0.1:3000` ;
- PostgreSQL : réseau Docker uniquement.

Le reverse proxy du serveur publie les domaines HTTPS et gère les certificats TLS.

## Fichiers de déploiement

```text
.env.production.example
docker-compose.prod.yml
backend/Dockerfile.prod
frontend/Dockerfile.prod
frontend/nginx.prod.conf
deploy/nginx/climbcrew.reverse-proxy.example.conf
deploy/nginx/pre-climbcrew.reverse-proxy.conf.template
deploy/systemd/climbcrew-backend.service
deploy/scripts/deploy-docker.sh
deploy/scripts/install-preprod-nginx.sh
deploy/scripts/rollback-preprod.sh
deploy/scripts/setup-db.sh
deploy/scripts/healthcheck.sh
```

## Installation

```bash
cd /opt/climbcrew
cp .env.production.example .env.production
nano .env.production
chmod +x deploy/scripts/*.sh
```

## Vérification de la configuration

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

## Déploiement manuel

```bash
./deploy/scripts/deploy-docker.sh .env.production
./deploy/scripts/setup-db.sh .env.production
./deploy/scripts/healthcheck.sh .env.production
```

## Reverse proxy production

Adapter `deploy/nginx/climbcrew.reverse-proxy.example.conf` :

- `/` vers `http://127.0.0.1:8080` ;
- `/api/` vers `http://127.0.0.1:3000`.

## Préproduction fiable

La préproduction `pre-climbcrew.dip-tcs.com` utilise désormais un vhost Nginx distinct de la production. Le workflow PPD :

1. valide le code, les dépendances, PostgreSQL, Docker et les tests navigateur ;
2. refuse le déploiement d'un push direct sur `main` qui ne provient pas d'une pull request fusionnée ;
3. crée et vérifie un dump PostgreSQL avant la bascule ;
4. verrouille le serveur sur le SHA validé ;
5. installe `pre-climbcrew.reverse-proxy.conf.template` via `install-preprod-nginx.sh` ;
6. reconstruit la pile et contrôle le backend, le frontend et le marqueur public HTTPS ;
7. en cas d'échec après bascule, restaure automatiquement le dump PostgreSQL et le SHA précédent avec `rollback-preprod.sh`.

Le contrôle public n'utilise pas `curl --insecure` : un certificat TLS invalide fait échouer le déploiement et déclenche le rollback.

## Protection de `main`

Le workflow constitue une seconde barrière en refusant les push directs pour le déploiement PPD. La protection GitHub de la branche doit également imposer les checks suivants avant fusion :

- `Validation du code` ;
- `Intégration API et PostgreSQL` ;
- `Validation Linux bloquante / Tests, build and runtime validation`.

La configuration de protection de branche est un réglage administrateur GitHub et ne doit pas être stockée dans le code applicatif.

## Sécurité

- ne pas committer `.env.production` ;
- ne stocker aucun certificat dans le dépôt ;
- conserver `SECURE_COOKIES=true` ;
- conserver `TRUST_PROXY=1` ;
- utiliser un `SETUP_TOKEN` long et aléatoire ;
- sauvegarder et vérifier PostgreSQL avant toute mise à jour.
