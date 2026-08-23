import pg from "pg";

const OriginalPool = pg.Pool;
let capturedPool = null;
let captureInstalled = false;

/**
 * Intercepte la création du Pool PostgreSQL du serveur principal.
 * Le module est préchargé avant server.js, ce qui permet aux services séparés
 * d'utiliser exactement la même connexion sans dupliquer la configuration.
 */
export function installPoolCapture() {
  if (captureInstalled) return;

  pg.Pool = class ClimbCrewCapturedPool extends OriginalPool {
    constructor(...args) {
      super(...args);
      capturedPool = this;
    }
  };

  captureInstalled = true;
}

/** Retourne la connexion partagée ou lève une erreur explicite. */
export function getPool() {
  if (!capturedPool) {
    throw new Error("Connexion PostgreSQL ClimbCrew introuvable");
  }
  return capturedPool;
}

/**
 * Migration idempotente : elle peut être rejouée à chaque démarrage.
 * Les deux représentations historiques du droit administrateur sont alignées.
 * L'adresse e-mail normalisée est la clé fonctionnelle de rapprochement entre
 * un compte et son profil grimpeur.
 *
 * `login_email` est désormais la valeur canonique. La colonne historique
 * `email` reste maintenue automatiquement pour les anciennes routes du serveur
 * afin qu'un profil créé ou modifié par l'administration soit immédiatement
 * retrouvable lors de la création d'un compte utilisateur.
 */
export async function ensureAdminUserSchema() {
  const pool = getPool();

  await pool.query(`alter table users add column if not exists is_admin boolean not null default false`);
  await pool.query(`alter table users add column if not exists email_verified_at timestamptz`);
  await pool.query(`alter table users add column if not exists pending_email text`);
  await pool.query(`alter table users add column if not exists receive_account_notifications boolean not null default false`);
  await pool.query(`alter table participants add column if not exists email text not null default ''`);
  await pool.query(`alter table participants add column if not exists login_email text`);

  await pool.query(`
    create table if not exists email_verification_tokens (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      token_hash text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      used_at timestamptz
    )
  `);
  await pool.query(`create index if not exists idx_email_verification_tokens_user on email_verification_tokens(user_id)`);
  await pool.query(`create index if not exists idx_email_verification_tokens_hash on email_verification_tokens(token_hash)`);

  await pool.query(`
    create table if not exists email_change_tokens (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      new_email text not null,
      token_hash text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      used_at timestamptz
    )
  `);
  await pool.query(`create index if not exists idx_email_change_tokens_user on email_change_tokens(user_id)`);
  await pool.query(`create index if not exists idx_email_change_tokens_hash on email_change_tokens(token_hash)`);

  await pool.query(`update users set is_admin = true where role = 'admin' and is_admin = false`);
  await pool.query(`update users set role = 'admin' where is_admin = true and role <> 'admin'`);

  // L'index unique éventuellement créé par une version précédente est retiré
  // avant le rattrapage des anciennes valeurs `email`. Cela permet de détecter
  // proprement les doublons historiques au lieu de faire échouer le démarrage.
  await pool.query(`drop index if exists uq_participants_login_email_normalized`);

  // Normalise les deux représentations historiques de l'adresse e-mail.
  await pool.query(`
    update participants
    set email = lower(trim(coalesce(email, ''))),
        login_email = nullif(lower(trim(coalesce(login_email, ''))), '')
  `);

  // Migration P1 : les profils créés avant l'introduction de login_email
  // conservaient leur adresse uniquement dans `email`. On la recopie dans la
  // clé canonique afin que la demande de compte retrouve le bon grimpeur.
  await pool.query(`
    update participants
    set login_email = nullif(email, '')
    where (login_email is null or trim(login_email) = '')
      and trim(email) <> ''
  `);

  // Le compte lié reste la source de vérité de l'adresse de connexion.
  await pool.query(`
    update participants p
    set can_admin = (u.role = 'admin' or u.is_admin),
        email = lower(trim(u.email)),
        login_email = lower(trim(u.email))
    from users u
    where u.participant_id = p.id
  `);

  // Sur les profils non liés également, login_email est la clé canonique.
  await pool.query(`
    update participants
    set email = coalesce(login_email, '')
    where login_email is not null
      and email is distinct from login_email
  `);

  // Maintient les deux colonnes synchronisées tant que les anciennes routes de
  // server.js écrivent encore `email` et que les nouveaux services écrivent
  // `login_email`. Ce trigger rend la migration sûre dans les deux sens.
  await pool.query(`
    create or replace function climbcrew_sync_participant_email()
    returns trigger
    language plpgsql
    as $$
    declare
      normalized_email text;
      normalized_login_email text;
    begin
      normalized_email := lower(trim(coalesce(new.email, '')));
      normalized_login_email := nullif(lower(trim(coalesce(new.login_email, ''))), '');

      if tg_op = 'INSERT' then
        if normalized_login_email is null and normalized_email <> '' then
          normalized_login_email := normalized_email;
        elsif normalized_login_email is not null then
          normalized_email := normalized_login_email;
        end if;
      else
        if new.login_email is distinct from old.login_email then
          normalized_email := coalesce(normalized_login_email, '');
        elsif new.email is distinct from old.email then
          normalized_login_email := nullif(normalized_email, '');
        elsif normalized_login_email is not null then
          normalized_email := normalized_login_email;
        elsif normalized_email <> '' then
          normalized_login_email := normalized_email;
        end if;
      end if;

      new.email := normalized_email;
      new.login_email := normalized_login_email;
      return new;
    end;
    $$
  `);
  await pool.query(`drop trigger if exists trg_climbcrew_sync_participant_email on participants`);
  await pool.query(`
    create trigger trg_climbcrew_sync_participant_email
    before insert or update of email, login_email on participants
    for each row execute function climbcrew_sync_participant_email()
  `);

  // Index de recherche utilisé par le rapprochement compte <-> grimpeur.
  await pool.query(`
    create index if not exists idx_participants_login_email_normalized
    on participants ((lower(trim(login_email))))
    where login_email is not null and trim(login_email) <> ''
  `);

  // Sur une base saine, l'unicité est également garantie par PostgreSQL.
  // Si des doublons historiques existent, le démarrage n'est pas bloqué :
  // l'application les détecte et refuse toute association ambiguë jusqu'à
  // correction par un administrateur.
  const duplicateEmails = await pool.query(`
    select lower(trim(login_email)) as email, count(*)::int as count
    from participants
    where login_email is not null and trim(login_email) <> ''
    group by lower(trim(login_email))
    having count(*) > 1
    order by lower(trim(login_email))
  `);

  if (duplicateEmails.rowCount === 0) {
    await pool.query(`
      create unique index uq_participants_login_email_normalized
      on participants ((lower(trim(login_email))))
      where login_email is not null and trim(login_email) <> ''
    `);
  } else {
    console.warn(
      "ClimbCrew : doublons d'adresse e-mail détectés dans participants ; "
      + "l'index unique n'a pas été créé.",
      duplicateEmails.rows
    );
  }
}
