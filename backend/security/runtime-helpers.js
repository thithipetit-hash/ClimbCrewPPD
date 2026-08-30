import crypto from "node:crypto";

export function nowPlus(ms) {
  return new Date(Date.now() + ms).toISOString();
}

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function randomToken(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

export function cleanEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

export function getCookie(req, name) {
  return parseCookies(req)[name] || "";
}

export function createRequestTokenReader(sessionCookieName) {
  return function getRequestToken(req) {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1];
    return getCookie(req, sessionCookieName) || "";
  };
}

export function isSafeMethod(method) {
  return ["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createCookieWriters(config) {
  function setSessionCookie(res, rawToken, expiresAt) {
    res.cookie(config.sessionCookieName, rawToken, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: config.cookieSameSite,
      expires: new Date(expiresAt),
      path: "/",
    });
  }

  function setCsrfCookie(res, rawToken, expiresAt) {
    res.cookie(config.csrfCookieName, rawToken, {
      httpOnly: false,
      secure: config.secureCookies,
      sameSite: config.cookieSameSite,
      expires: new Date(expiresAt),
      path: "/",
    });
  }

  function clearSessionCookie(res) {
    res.clearCookie(config.sessionCookieName, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: config.cookieSameSite,
      path: "/",
    });
    res.clearCookie(config.csrfCookieName, {
      httpOnly: false,
      secure: config.secureCookies,
      sameSite: config.cookieSameSite,
      path: "/",
    });
  }

  return { setSessionCookie, setCsrfCookie, clearSessionCookie };
}

export function isStrongPassword(value) {
  return typeof value === "string"
    && value.length >= 8
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    participantId: row.participant_id ? String(row.participant_id) : null,
    email: row.email,
    prenom: row.prenom,
    nom: row.nom,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    approved_at: row.approved_at,
    revoked_at: row.revoked_at,
    revoked_reason: row.revoked_reason,
    last_login_at: row.last_login_at,
    must_reset_password: row.must_reset_password,
    theme_preference: row.theme_preference || "auto",
  };
}

export function getClientIp(req) {
  return req.ip || null;
}
