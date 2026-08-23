// Script temporaire : extrait le bootstrap du premier administrateur hors de server.js.
import { readFile, writeFile } from "node:fs/promises";

const serverUrl = new URL("../server.js", import.meta.url);
let source = await readFile(serverUrl, "utf8");

const importAnchor = `import { installDatabaseMaintenanceRoutes } from "./database-maintenance-routes.js";`;
const importLine = `import { createDefaultAdminBootstrap } from "./default-admin-bootstrap.js";`;
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error("Ancre d'import introuvable");
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const blockStart = source.indexOf("async function ensureDefaultAdmin()");
const blockEnd = source.indexOf("const { requireAuth, requireAdmin } = createAuthMiddleware({", blockStart);
if (blockStart < 0 || blockEnd < 0 || blockEnd <= blockStart) {
  throw new Error("Bloc ensureDefaultAdmin introuvable");
}
const extracted = source.slice(blockStart, blockEnd);
for (const expected of [
  "role = 'admin' and status = 'active' limit 1",
  "bcrypt.hash(FIRST_ADMIN_PASSWORD, BCRYPT_ROUNDS)",
  "on conflict (email) do update set",
]) {
  if (!extracted.includes(expected)) throw new Error(`Garantie attendue absente: ${expected}`);
}

const install = `const ensureDefaultAdmin = createDefaultAdminBootstrap({\n  pool,\n  cleanEmail,\n  firstAdminEmail: FIRST_ADMIN_EMAIL,\n  firstAdminPassword: FIRST_ADMIN_PASSWORD,\n  allowWeakFirstAdminPassword: ALLOW_WEAK_FIRST_ADMIN_PASSWORD,\n  isStrongPassword,\n  bcrypt,\n  bcryptRounds: BCRYPT_ROUNDS,\n});\n\n`;
source = `${source.slice(0, blockStart)}${install}${source.slice(blockEnd)}`;

if (source.includes("async function ensureDefaultAdmin()")) {
  throw new Error("Ancien bootstrap encore présent dans server.js");
}
if (!source.includes("const ensureDefaultAdmin = createDefaultAdminBootstrap({")) {
  throw new Error("Initialisation du bootstrap extraite absente");
}
if (!source.includes("const { requireAuth, requireAdmin } = createAuthMiddleware({")) {
  throw new Error("Middleware d'authentification perdu");
}

await writeFile(serverUrl, source, "utf8");
