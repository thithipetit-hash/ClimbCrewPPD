# ClimbCrew

ClimbCrew est une application de gestion de club d'escalade composée de :

- un frontend React/Vite ;
- un backend Node.js/Express ;
- une base PostgreSQL ;
- une authentification par cookie sécurisé ;
- une messagerie SMTP pour les demandes de compte et la récupération du mot de passe.

## Déploiement

Le déploiement de référence utilise un serveur Linux avec Docker Compose et un reverse proxy HTTPS.

| Environnement | Fichier principal | Frontend | Backend | PostgreSQL |
|---|---|---|---|---|
| Serveur Linux | `docker-compose.prod.yml` | Nginx Docker | Node Docker | Docker local |

## Architecture Linux

```text
Internet
  ↓
Reverse proxy HTTPS du serveur Linux
  ├─ /      → Frontend : 127.0.0.1:8080
  └─ /api/  → Backend  : 127.0.0.1:3000
                         ↓
                  PostgreSQL Docker
```

Le certificat TLS est géré par le reverse proxy du serveur. ClimbCrew n'expose pas directement PostgreSQL et n'embarque aucun certificat.

**Impact visuel :** le frontend et l'API partagent le même domaine. Les changements de page, les chargements de données et les actions d'administration restent donc transparents pour le navigateur.

## Organisation des commentaires dans le code

Les fichiers de configuration et les modules modifiés sont commentés en français par section. Les commentaires précisent notamment :

- le rôle technique de chaque partie ;
- les interactions avec les autres composants ;
- l'effet attendu sur la sécurité ou les données ;
- l'impact visuel lorsqu'une section influence directement ce que voit l'utilisateur.

Les commentaires décrivent l'intention sans répéter chaque instruction ligne par ligne, afin de garder le code lisible et maintenable.

## Prérequis Linux

- serveur Linux ;
- Docker Engine ;
- plugin Docker Compose ;
- Git ;
- un nom de domaine configuré vers le serveur ;
- un reverse proxy HTTPS existant ;
- un compte SMTP pour les courriels de création et de réinitialisation des comptes.

## Installation Linux

```bash
sudo mkdir -p /opt/climbcrew
sudo chown "$USER":"$USER" /opt/climbcrew
git clone https://github.com/thithipetit-hash/ClimbCrewPPD.git /opt/climbcrew
cd /opt/climbcrew
cp .env.production.example .env.production
nano .env.production
```

Renseigner au minimum les mots de passe PostgreSQL, `DATABASE_URL`, `SETUP_TOKEN`, `FIRST_ADMIN_EMAIL` et `FIRST_ADMIN_PASSWORD`.

Pour activer les courriels, renseigner également `EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` et `EMAIL_FROM_ADDRESS`.

## Messagerie des comptes

Le backend envoie deux types de courriels transactionnels :

- une confirmation après l'enregistrement d'une demande de création de compte ;
- un code à usage unique lorsqu'un utilisateur actif signale la perte de son mot de passe.

Le code de réinitialisation est valable 60 minutes par défaut. La durée peut être changée avec `RESET_TOKEN_DURATION_MINUTES`. Lorsqu'un nouveau code est demandé, les anciens codes non utilisés sont invalidés.

Le service utilise SMTP via Nodemailer. Configuration courante :

```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=climbcrew@example.com
SMTP_PASSWORD=CHANGE_ME_SMTP_PASSWORD
EMAIL_FROM_NAME=ClimbCrew
EMAIL_FROM_ADDRESS=climbcrew@example.com
EMAIL_REPLY_TO=club@example.com
RESET_TOKEN_DURATION_MINUTES=60
```

Pour le port 465, utiliser `SMTP_SECURE=true` et `SMTP_REQUIRE_TLS=false`.

En cas d'échec SMTP :

- la demande de création du compte reste enregistrée ;
- un code de réinitialisation non envoyé est immédiatement invalidé ;
- l'échec apparaît dans l'onglet des logs administrateur ;
- aucune réponse publique ne confirme si une adresse existe ou non.

## Déploiement Linux

Le déploiement automatisé par GitHub Actions valide d'abord le code sur un runner GitHub, puis déploie exactement le SHA validé avec le runner auto-hébergé du serveur. Le job de production utilise directement le clone persistant `/opt/climbcrew` et ne dépend plus du téléchargement de `actions/checkout`.

La procédure, les prérequis du runner, les retries réseau, le contrôle de santé et le diagnostic sont documentés dans [`docs/deploiement.md`](docs/deploiement.md).

Déploiement manuel :

```bash
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy-docker.sh .env.production
./deploy/scripts/setup-db.sh .env.production
./deploy/scripts/healthcheck.sh .env.production
```

Commandes npm équivalentes :

```bash
npm run prod:config
npm run prod:up
npm run prod:logs
npm run prod:health
```

## Reverse proxy HTTPS Linux

Adapter le fichier :

```text
deploy/nginx/climbcrew.reverse-proxy.example.conf
```

Le reverse proxy doit envoyer :

- `/` vers `http://127.0.0.1:8080` ;
- `/api/` vers `http://127.0.0.1:3000`.

## Sécurité

- ne jamais versionner `.env.production` ;
- conserver `SECURE_COOKIES=true` en production HTTPS ;
- utiliser `COOKIE_SAMESITE=lax` sous un même domaine ;
- conserver `TRUST_PROXY=1` derrière le reverse proxy Linux ;
- utiliser des secrets longs et uniques ;
- ne pas exposer directement PostgreSQL ni le backend Linux ;
- sauvegarder régulièrement le volume `climbcrew_pgdata` ;
- utiliser un mot de passe SMTP dédié et ne jamais le placer dans le frontend ;
- configurer SPF, DKIM et DMARC sur le domaine d'envoi lorsque le fournisseur le permet.

La documentation Linux détaillée se trouve dans [`deploy/README-linux-reverse-proxy.md`](deploy/README-linux-reverse-proxy.md).
