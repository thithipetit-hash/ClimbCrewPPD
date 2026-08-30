import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCookies, isStrongPassword } from "../admin-users/security.js";
import { sanitizeMalformedCookieHeader } from "../admin-users/cookie-hardening.js";

const requestSource = await readFile(
  new URL("../admin-users/email-association-service.js", import.meta.url),
  "utf8",
);
const httpStackSource = await readFile(
  new URL("../middleware/http-stack.js", import.meta.url),
  "utf8",
);

test("la réponse publique de demande de compte ne divulgue aucune association interne", () => {
  assert.match(
    requestSource,
    /function publicRequestResponse\(res\)[\s\S]*res\.json\(\{ ok: true, message: PUBLIC_REQUEST_MESSAGE \}\)/,
  );
  assert.match(requestSource, /if \(existing\.rowCount\)[\s\S]*return publicRequestResponse\(res\)/);
  assert.match(requestSource, /return publicRequestResponse\(res\);\s*\}\s*catch/);
});

test("les identités de demande de compte sont bornées et l'e-mail est validé", () => {
  assert.match(requestSource, /prenom\.length > 120 \|\| nom\.length > 120/);
  assert.match(requestSource, /email\.length > 320 \|\| !EMAIL_PATTERN\.test\(email\)/);
});

test("un cookie percent-encodé invalide ne fait pas lever le parseur de sécurité", () => {
  assert.doesNotThrow(() => parseCookies({ headers: { cookie: "ok=1; broken=%E0%A4%A" } }));
});

test("la pile HTTP retire un en-tête Cookie malformé avant les autres middlewares", () => {
  const req = { headers: { cookie: "climbcrew_session=%E0%A4%A" } };
  let nextCalled = false;
  sanitizeMalformedCookieHeader(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.headers.cookie, undefined);
  const cookieIndex = httpStackSource.indexOf("app.use(sanitizeMalformedCookieHeader);");
  const csrfIndex = httpStackSource.indexOf("app.use(createCrossOriginCsrfBridge());");
  assert.ok(cookieIndex >= 0);
  assert.ok(csrfIndex > cookieIndex);
});

test("les mots de passe dépassant 72 octets sont refusés avant bcrypt", () => {
  assert.equal(isStrongPassword("Aa1!abcd"), true);
  assert.equal(isStrongPassword(`Aa1!${"x".repeat(69)}`), false);
  assert.equal(isStrongPassword(`Aa1!${"é".repeat(35)}`), false);
});
