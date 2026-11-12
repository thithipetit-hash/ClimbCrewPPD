import { getPool } from "./database.js";
import { markSchedulerDegraded, markSchedulerHealthy } from "../scheduler-health.js";

const DEFAULT_UNVERIFIED_ACCOUNT_RETENTION_DAYS = 8;
const DEFAULT_SECURITY_TOKEN_RETENTION_DAYS = 7;
const DEFAULT_SESSION_RECORD_RETENTION_DAYS = 30;
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_CREATED_PARTICIPANT_MAX_SKEW_SECONDS = 5 * 60;
let timer = null;

function boundedDays(value, fallback, minimum = 1, maximum = 730) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

export function getSecurityRetentionConfig(env = process.env) {
  return {
    unverifiedAccountDays: boundedDays(
      env.UNVERIFIED_ACCOUNT_RETENTION_DAYS,
      DEFAULT_UNVERIFIED_ACCOUNT_RETENTION_DAYS,
      7,
      90,
    ),
    tokenDays: boundedDays(
      env.SECURITY_TOKEN_RETENTION_DAYS,
      DEFAULT_SECURITY_TOKEN_RETENTION_DAYS,
      1,
      90,
    ),
    sessionDays: boundedDays(
      env.SESSION_RECORD_RETENTION_DAYS,
      DEFAULT_SESSION_RECORD_RETENTION_DAYS,
      1,
      365,
    ),
  };
}

async function removeHistoricalAutoCreatedParticipant(client, staleUser) {
  if (!staleUser.participant_id) return 0;

  // Avant 20260823.021 une demande de compte pouvait créer immédiatement une
  // fiche minimale. On ne supprime cette fiche historique que si elle possède
  // exactement les valeurs de cette création automatique, la même adresse et
  // une date de création distante de moins de cinq minutes du compte. Une fiche
  // préparée manuellement par le club est ainsi conservée.
  const result = await client.query(
    `
      delete from participants p
      where p.id = $1
        and not exists (select 1 from users u where u.participant_id = p.id)
        and lower(trim(coalesce(nullif(p.login_email, ''), nullif(p.email, ''), ''))) = lower(trim($2))
        and lower(coalesce(p.passport, 'sans')) = 'sans'
        and coalesce(p.cotisation, false) = false
        and coalesce(p.ffme, false) = false
        and coalesce(p.can_encadrer, false) = false
        and coalesce(p.can_referer, false) = false
        and coalesce(p.can_admin, false) = false
        and coalesce(p.avatar_id, 'gecko') = 'gecko'
        and coalesce(p.crest_id, 'cristal') = 'cristal'
        and coalesce(p.custom_avatar_image, '') = ''
        and abs(extract(epoch from (p.created_at - $3::timestamptz))) <= $4
      returning p.id
    `,
    [
      staleUser.participant_id,
      staleUser.email,
      staleUser.created_at,
      AUTO_CREATED_PARTICIPANT_MAX_SKEW_SECONDS,
    ],
  );
  return result.rowCount || 0;
}

/**
 * Purge les traces techniques d'authentification devenues inutiles.
 *
 * - comptes pending dont l'adresse n'a jamais été vérifiée après expiration du lien ;
 * - anciens jetons de vérification, changement d'e-mail et mot de passe ;
 * - anciennes sessions révoquées ou expirées ;
 * - anciennes fiches minimales créées automatiquement avant 20260823.021,
 *   uniquement lorsqu'elles sont identifiables sans ambiguïté.
 */
export async function purgeExpiredSecurityData({
  pool = getPool(),
  config = getSecurityRetentionConfig(),
} = {}) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const staleUsers = await client.query(
      `
        select id, participant_id, email, created_at
        from users
        where status = 'pending'
          and email_verified_at is null
          and created_at < now() - ($1::integer * interval '1 day')
        order by id asc
        for update
      `,
      [config.unverifiedAccountDays],
    );

    let deletedUnverifiedAccounts = 0;
    let deletedHistoricalParticipants = 0;
    for (const staleUser of staleUsers.rows) {
      const deleted = await client.query(
        `
          delete from users
          where id = $1
            and status = 'pending'
            and email_verified_at is null
          returning id
        `,
        [staleUser.id],
      );
      if (!deleted.rowCount) continue;
      deletedUnverifiedAccounts += deleted.rowCount;
      deletedHistoricalParticipants += await removeHistoricalAutoCreatedParticipant(client, staleUser);
    }

    const verificationTokens = await client.query(
      `
        delete from email_verification_tokens
        where (used_at is not null and used_at < now() - ($1::integer * interval '1 day'))
           or expires_at < now() - ($1::integer * interval '1 day')
      `,
      [config.tokenDays],
    );
    const emailChangeTokens = await client.query(
      `
        delete from email_change_tokens
        where (used_at is not null and used_at < now() - ($1::integer * interval '1 day'))
           or expires_at < now() - ($1::integer * interval '1 day')
      `,
      [config.tokenDays],
    );
    const passwordTokens = await client.query(
      `
        delete from password_reset_tokens
        where (used_at is not null and used_at < now() - ($1::integer * interval '1 day'))
           or expires_at < now() - ($1::integer * interval '1 day')
      `,
      [config.tokenDays],
    );
    const sessions = await client.query(
      `
        delete from user_sessions
        where (revoked_at is not null and revoked_at < now() - ($1::integer * interval '1 day'))
           or expires_at < now() - ($1::integer * interval '1 day')
      `,
      [config.sessionDays],
    );

    await client.query("commit");

    return {
      ...config,
      deletedUnverifiedAccounts,
      deletedHistoricalParticipants,
      deletedEmailVerificationTokens: verificationTokens.rowCount || 0,
      deletedEmailChangeTokens: emailChangeTokens.rowCount || 0,
      deletedPasswordResetTokens: passwordTokens.rowCount || 0,
      deletedSessions: sessions.rowCount || 0,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Lance une purge au démarrage puis une fois par jour. */
export async function startSecurityRetentionScheduler() {
  if (timer) return;

  try {
    const result = await purgeExpiredSecurityData();
    const deleted = result.deletedUnverifiedAccounts
      + result.deletedHistoricalParticipants
      + result.deletedEmailVerificationTokens
      + result.deletedEmailChangeTokens
      + result.deletedPasswordResetTokens
      + result.deletedSessions;
    if (deleted > 0) {
      console.log(`[security-retention] ${deleted} enregistrement(s) obsolète(s) purgé(s).`);
    }
    markSchedulerHealthy("security-retention");
  } catch (error) {
    markSchedulerDegraded("security-retention");
    console.error("Purge initiale des données de sécurité impossible :", error);
  }

  timer = setInterval(async () => {
    try {
      await purgeExpiredSecurityData();
      markSchedulerHealthy("security-retention");
    } catch (error) {
      markSchedulerDegraded("security-retention");
      console.error("Purge périodique des données de sécurité impossible :", error);
    }
  }, DEFAULT_SWEEP_INTERVAL_MS);
  timer.unref?.();
}
