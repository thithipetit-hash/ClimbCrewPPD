# Déploiement Linux derrière un reverse proxy HTTPS

ClimbCrew fonctionne entièrement sous Linux avec Docker Compose.

## Services exposés localement

- frontend : `127.0.0.1:8080` ;
- backend : `127.0.0.1:3000` ;
- PostgreSQL : réseau Docker uniquement.

Le reverse proxy du serveur publie le domaine HTTPS et gère le certificat TLS.

## Fichiers de production

```text
.env.production.example
docker-compose.prod.yml
backend/Dockerfile.prod
frontend/Dockerfile.prod
frontend/nginx.prod.conf
deploy/nginx/climbcrew.reverse-proxy.example.conf
deploy/systemd/climbcrew-backend.service
deploy/scripts/deploy-docker.sh
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

## Déploiement

```bash
./deploy/scripts/deploy-docker.sh .env.production
./deploy/scripts/setup-db.sh .env.production
./deploy/scripts/healthcheck.sh .env.production
```

## Reverse proxy

Adapter `deploy/nginx/climbcrew.reverse-proxy.example.conf` :

- `/` vers `http://127.0.0.1:8080` ;
- `/api/` vers `http://127.0.0.1:3000` ;
- conserver `client_max_body_size 55m;` sur le serveur HTTPS : les vidéos ClimbCrew sont autorisées jusqu’à 50 Mo et le proxy externe ne doit pas les rejeter avant l’API.

Après une modification de la configuration Nginx hôte, valider puis recharger :

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Sécurité

- ne pas committer `.env.production` ;
- ne stocker aucun certificat dans le dépôt ;
- conserver `SECURE_COOKIES=true` ;
- conserver `TRUST_PROXY=1` ;
- utiliser un `SETUP_TOKEN` long et aléatoire ;
- sauvegarder le volume PostgreSQL avant toute mise à jour.
