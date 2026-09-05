import fs from "node:fs";
import path from "node:path";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Motif introuvable: ${label}`);
  return source.replace(before, after);
}

const appPath = "frontend/src/App.jsx";
let app = read(appPath);
app = replaceExact(
  app,
  'import { ROPE_NUMBERS, ROUTE_COLORS, STYLE_LABELS, ROUTE_TAGS, THECRAG_STYLE_BY_CLIMBCREW, TABS } from "./lib/ui-config.js";',
  'import { ROPE_NUMBERS, ROUTE_COLORS, STYLE_LABELS, ROUTE_TAGS, TABS } from "./lib/ui-config.js";',
  "import ui-config",
);
app = replaceExact(
  app,
  'import { USE_API, apiFetch, authApiFetch, downloadFile } from "./lib/api.js";',
  'import { USE_API, apiFetch, downloadFile } from "./lib/api.js";',
  "import api",
);
app = replaceExact(
  app,
  'import { buildRouteDisplayGroups } from "./lib/route-display-groups.js";',
  'import { buildRouteDisplayGroups } from "./lib/route-display-groups.js";\nimport { theCragStyleForRealisation } from "./lib/thecrag.js";\nimport {\n  buildRealisationDraft,\n  buildRealisationPayload,\n  getParticipantSessionDays,\n  isManagedSession,\n  resolveSessionIdForRealisation,\n} from "./lib/realisation-workflow.js";',
  "imports realisation",
);
app = replaceExact(app, '    authToken, setAuthToken,\n    authUser, setAuthUser,', '    authUser, setAuthUser,', "auth state destructuring");
app = replaceExact(app, '    authToken,\n    authUserId: authUser?.id,\n    setAuthToken,', '    authUserId: authUser?.id,', "bootstrap auth args");
app = replaceExact(app, '  }, [tab, canManageAccountsAndLogs, authToken]);', '  }, [tab, canManageAccountsAndLogs, authUser?.id]);', "admin effect deps");

const managedSessionBlock = `  function isManagedSession(session) {\n    if (["passeport", "challenge", "renouvellement"].includes(session.status)) return true;\n    return (session.status === "encadree" && Boolean(session.encadrantId))\n      || (session.status === "libre" && Boolean(session.referentId));\n  }\n\n`;
app = replaceExact(app, managedSessionBlock, "", "isManagedSession local");
const participantDaysBlock = `  function getParticipantSessionDays(participantId) {\n    if (!participantId) return [];\n\n    return [...new Set(\n      state.sessions\n        .filter(isManagedSession)\n        .filter((session) => session.participantIds?.includes(participantId))\n        .map((session) => session.date)\n    )].sort((a, b) => b.localeCompare(a));\n  }\n\n`;
app = replaceExact(app, participantDaysBlock, "", "getParticipantSessionDays local");
app = app.replaceAll("getParticipantSessionDays(participant.id)", "getParticipantSessionDays(state.sessions, participant.id)");
app = app.replaceAll("getParticipantSessionDays(newRealisation.participantId)", "getParticipantSessionDays(state.sessions, newRealisation.participantId)");
app = app.replaceAll("getParticipantSessionDays(requestedParticipantId)", "getParticipantSessionDays(state.sessions, requestedParticipantId)");

const resolveSessionBlock = `  function resolveSessionIdForRealisation(participantId, selectedDay) {\n    if (!participantId || !selectedDay) return \"\";\n\n    const matchingSessions = state.sessions\n      .filter((session) => session.date === selectedDay)\n      .filter(isManagedSession)\n      .filter((session) => session.participantIds?.includes(participantId))\n      .sort((a, b) => a.slot.localeCompare(b.slot));\n\n    return matchingSessions[0]?.id || \"\";\n  }\n\n`;
app = replaceExact(app, resolveSessionBlock, "", "resolveSession local");
app = app.replaceAll("resolveSessionIdForRealisation(defaultParticipantId, latestRegisteredDay)", "resolveSessionIdForRealisation(state.sessions, defaultParticipantId, latestRegisteredDay)");
app = app.replaceAll("resolveSessionIdForRealisation(newRealisation.participantId, newRealisation.selectedDay)", "resolveSessionIdForRealisation(state.sessions, newRealisation.participantId, newRealisation.selectedDay)");

const oldDraft = `    setNewRealisation((prev) => ({\n      ...prev,\n      participantId: defaultParticipantId,\n      selectedDay: latestRegisteredDay,\n      sessionId: defaultParticipantId && latestRegisteredDay\n        ? resolveSessionIdForRealisation(state.sessions, defaultParticipantId, latestRegisteredDay) || \"\"\n        : \"\",\n      voieId: routeId || \"\",\n      styleRealisation: route?.moulinetteOnly ? \"moulinette\" : (prev.styleRealisation || \"a_vue\"),\n      cotationProposee: route?.cotationAjustee || route?.cotationReference || \"\",\n      commentaire: \"\",\n      rating: 0,\n    }));`;
const newDraft = `    setNewRealisation((previous) => buildRealisationDraft({\n      previous,\n      route,\n      routeId,\n      participantId: defaultParticipantId,\n      selectedDay: latestRegisteredDay,\n      sessionId: defaultParticipantId && latestRegisteredDay\n        ? resolveSessionIdForRealisation(state.sessions, defaultParticipantId, latestRegisteredDay)\n        : \"\",\n    }));`;
app = replaceExact(app, oldDraft, newDraft, "draft realisation");

const oldPayload = `    const realisation = {\n      id: \`realisation-\${Date.now()}\`,\n      participantId: newRealisation.participantId,\n      sessionId,\n      voieId: newRealisation.voieId,\n      dateRealisation: \`\${newRealisation.selectedDay}T12:00:00\`,\n      styleRealisation: newRealisation.styleRealisation,\n      commentaire: newRealisation.commentaire,\n      cotationProposee: newRealisation.cotationProposee,\n      ...(newRealisation.rating ? { rating: newRealisation.rating } : {}),\n      chute: newRealisation.chute,\n      assureurId: newRealisation.chute ? newRealisation.assureurId : \"\",\n    };`;
const newPayload = `    const realisation = buildRealisationPayload({\n      draft: newRealisation,\n      sessionId,\n      route: routesById[newRealisation.voieId],\n    });`;
app = replaceExact(app, oldPayload, newPayload, "payload realisation");
app = app.replaceAll('THECRAG_STYLE_BY_CLIMBCREW[realisation.styleRealisation] || "Attempt"', 'theCragStyleForRealisation(realisation, route)');

// L'authentification moderne repose uniquement sur le cookie HttpOnly.
app = app.replace(/authApiFetch\(([^,\n]+), authToken, /g, "apiFetch($1, ");
app = app.replace(/authApiFetch\(([^,\n]+), authToken\)/g, "apiFetch($1)");
app = app.replaceAll('      setAuthToken("cookie");\n', "");
app = app.replaceAll('      setAuthToken("");\n', "");
app = app.replaceAll('    if (!authToken || authUser?.role !== "admin") return;', '    if (authUser?.role !== "admin") return;');
app = app.replaceAll('  if (!authToken) {\n    throw new Error("Connexion requise pour enregistrer une réalisation.");\n  }\n', '  if (!authUser) {\n    throw new Error("Connexion requise pour enregistrer une réalisation.");\n  }\n');
app = app.replaceAll('  if (!USE_API || !authToken) return;', '  if (!USE_API || !authUser) return;');
app = app.replaceAll('  if (!USE_API || !authToken || !authUser) return;', '  if (!USE_API || !authUser) return;');
app = app.replaceAll('    if (USE_API && authToken) {', '    if (USE_API && authUser?.role === "admin") {');
app = app.replaceAll('      if (USE_API && authToken) {', '      if (USE_API && authUser?.role === "admin") {');
if (app.includes("authApiFetch") || app.includes("authToken") || app.includes("setAuthToken")) {
  throw new Error("Résidu authToken/authApiFetch dans App.jsx");
}
write(appPath, app);

let bootstrap = read("frontend/src/hooks/useAppBootstrap.js");
bootstrap = bootstrap.replace('import { apiFetch, authApiFetch } from "../lib/api.js";', 'import { apiFetch } from "../lib/api.js";');
bootstrap = bootstrap.replace('  authToken,\n', "").replace('  setAuthToken,\n', "");
bootstrap = bootstrap.replace('const data = await authApiFetch("/auth/me", authToken);', 'const data = await apiFetch("/auth/me");');
bootstrap = bootstrap.replace('        setAuthToken("");\n', "");
bootstrap = bootstrap.replace('    authToken,\n', "").replace('    setAuthToken,\n', "");
bootstrap = bootstrap.replace('    authApiFetch("/auth/broadcast-messages/pending", authToken)', '    apiFetch("/auth/broadcast-messages/pending")');
bootstrap = bootstrap.replace('    authToken,\n', "");
if (bootstrap.includes("authApiFetch") || bootstrap.includes("authToken") || bootstrap.includes("setAuthToken")) throw new Error("Résidu auth dans useAppBootstrap");
write("frontend/src/hooks/useAppBootstrap.js", bootstrap);

let authState = read("frontend/src/hooks/useAuthState.js");
authState = authState.replace('  const [authToken, setAuthToken] = useState(() => (useApi ? "cookie" : ""));\n', "");
authState = authState.replace('    authToken, setAuthToken, authUser, setAuthUser, authLoading, setAuthLoading,', '    authUser, setAuthUser, authLoading, setAuthLoading,');
write("frontend/src/hooks/useAuthState.js", authState);

let api = read("frontend/src/lib/api.js");
api = api.replace('import { enrichRealisationCreateOptions } from "./realisation-request-mode.js";\n\n', "");
api = api.replace('  const preparedOptions = enrichRealisationCreateOptions(path, options);\n  const method = String(preparedOptions.method || "GET").toUpperCase();', '  const method = String(options.method || "GET").toUpperCase();');
api = api.replaceAll('performApiFetch(path, preparedOptions)', 'performApiFetch(path, options)');
api = api.replace('\nexport async function authApiFetch(path, _token, options = {}) {\n  return apiFetch(path, options);\n}\n', "\n");
if (api.includes("realisation-request-mode") || api.includes("authApiFetch") || api.includes("preparedOptions")) throw new Error("Résidu bridge dans api.js");
write("frontend/src/lib/api.js", api);

let modal = read("frontend/src/components/RealisationModal.jsx");
modal = modal.replace('import { setPendingRealisationMode } from "../lib/realisation-request-mode.js";\n', "");
modal = modal.replace(`\n  React.useEffect(() => {\n    if (!open) return;\n    setPendingRealisationMode(selectedMode);\n  }, [open, selectedMode]);\n`, "\n");
if (modal.includes("setPendingRealisationMode") || modal.includes("realisation-request-mode")) throw new Error("Résidu bridge dans modal");
write("frontend/src/components/RealisationModal.jsx", modal);

const requestModePath = "frontend/src/lib/realisation-request-mode.js";
if (fs.existsSync(requestModePath)) fs.unlinkSync(requestModePath);

let uiConfig = read("frontend/src/lib/ui-config.js");
uiConfig = uiConfig.replace(/\nexport const THECRAG_STYLE_BY_CLIMBCREW = \{[\s\S]*?\n\};\n/, "\n");
write("frontend/src/lib/ui-config.js", uiConfig);

write("frontend/src/lib/realisation-workflow.js", `import { normalizeRealisationCriterion, normalizeRealisationMode } from "./realisation-mode.js";\n\nexport function isManagedSession(session) {\n  if (["passeport", "challenge", "renouvellement"].includes(session?.status)) return true;\n  return (session?.status === "encadree" && Boolean(session.encadrantId))\n    || (session?.status === "libre" && Boolean(session.referentId));\n}\n\nexport function getParticipantSessionDays(sessions, participantId) {\n  if (!participantId) return [];\n  return [...new Set((sessions || [])\n    .filter(isManagedSession)\n    .filter((session) => session.participantIds?.includes(participantId))\n    .map((session) => session.date))]\n    .sort((a, b) => b.localeCompare(a));\n}\n\nexport function resolveSessionIdForRealisation(sessions, participantId, selectedDay) {\n  if (!participantId || !selectedDay) return "";\n  return (sessions || [])\n    .filter((session) => session.date === selectedDay)\n    .filter(isManagedSession)\n    .filter((session) => session.participantIds?.includes(participantId))\n    .sort((a, b) => a.slot.localeCompare(b.slot))[0]?.id || "";\n}\n\nexport function buildRealisationDraft({ previous = {}, route = null, routeId = "", participantId = "", selectedDay = "", sessionId = "" } = {}) {\n  return {\n    ...previous,\n    participantId,\n    selectedDay,\n    sessionId,\n    voieId: routeId || "",\n    modeRealisation: route?.moulinetteOnly\n      ? "moulinette"\n      : (normalizeRealisationMode(previous.modeRealisation) || "en_tete"),\n    styleRealisation: normalizeRealisationCriterion(previous.styleRealisation) || "a_vue",\n    cotationProposee: route?.cotationAjustee || route?.cotationReference || "",\n    commentaire: "",\n    rating: 0,\n    chute: false,\n    assureurId: "",\n  };\n}\n\nexport function buildRealisationPayload({ draft, sessionId, route = null, now = Date.now } = {}) {\n  const rating = Number(draft?.rating || 0);\n  return {\n    id: \`realisation-\${now()}\`,\n    participantId: draft?.participantId || "",\n    sessionId: sessionId || "",\n    voieId: draft?.voieId || "",\n    dateRealisation: \`\${draft?.selectedDay || ""}T12:00:00\`,\n    modeRealisation: route?.moulinetteOnly\n      ? "moulinette"\n      : (normalizeRealisationMode(draft?.modeRealisation) || "en_tete"),\n    styleRealisation: normalizeRealisationCriterion(draft?.styleRealisation) || "a_vue",\n    commentaire: draft?.commentaire || "",\n    cotationProposee: draft?.cotationProposee || "",\n    ...(Number.isInteger(rating) && rating >= 1 && rating <= 5 ? { rating } : {}),\n    chute: Boolean(draft?.chute),\n    assureurId: draft?.chute ? (draft?.assureurId || "") : "",\n  };\n}\n`);

write("frontend/src/lib/thecrag.js", `import { getRealisationCriterion, getRealisationMode } from "./realisation-mode.js";\n\nconst STYLE_BY_CRITERION = {\n  a_vue: "Onsight",\n  flash: "Flash",\n  travaillee: "Redpoint",\n  avec_repos: "Dog",\n  projet: "Attempt",\n  non_enchainee: "Attempt",\n  test: "Attempt",\n};\n\nexport function theCragStyleForRealisation(realisation, route = null) {\n  if (getRealisationMode(realisation, route) === "moulinette") return "Top rope";\n  const criterion = getRealisationCriterion(realisation);\n  if (criterion) return STYLE_BY_CRITERION[criterion] || "Attempt";\n  const legacyStyle = String(realisation?.styleRealisation || realisation?.style_realisation || "");\n  if (legacyStyle === "moulinette") return "Top rope";\n  if (legacyStyle === "en_tete") return "Redpoint";\n  return "Attempt";\n}\n`);

write("frontend/src/styles/ui-density.css", `/* Échelle visuelle canonique : compacte, homogène et lisible. */\n:root {\n  --cc-font-body:14px;\n  --cc-font-control:13px;\n  --cc-font-small:12px;\n  --cc-font-label:12px;\n  --cc-font-h1:20px;\n  --cc-font-h2:17px;\n  --cc-font-h3:15px;\n  --cc-control-height:34px;\n  --cc-space-1:3px;\n  --cc-space-2:5px;\n  --cc-space-3:7px;\n}\n\nhtml, body, .app { font-size:var(--cc-font-body)!important; line-height:1.22!important; }\n.app h1 { font-size:var(--cc-font-h1)!important; line-height:1.08!important; margin:0 0 var(--cc-space-1)!important; }\n.app h2 { font-size:var(--cc-font-h2)!important; line-height:1.12!important; margin:0 0 var(--cc-space-1)!important; }\n.app h3 { font-size:var(--cc-font-h3)!important; line-height:1.12!important; margin:0 0 var(--cc-space-1)!important; }\n.app :where(label,.label) { font-size:var(--cc-font-label)!important; line-height:1.12!important; font-weight:600; }\n.app :where(.small,.muted,.auth-helper-text,.auth-subtitle) { font-size:var(--cc-font-small)!important; line-height:1.18!important; }\n.app :where(button,input,select,textarea) {\n  min-height:var(--cc-control-height)!important;\n  height:auto;\n  padding:5px 8px!important;\n  font-size:var(--cc-font-control)!important;\n  line-height:1.15!important;\n}\n.app textarea { min-height:64px!important; }\n.app :where(.toolbar,.card) { margin-top:var(--cc-space-2)!important; padding:var(--cc-space-3)!important; }\n.app :where(.subcard,.stat,.modal-panel,.muted-box) { padding:6px 7px!important; }\n.app :where(.grid,.stack,.group,.card-header,.session-form-row) { gap:var(--cc-space-2)!important; }\n.app .card-header { margin-bottom:var(--cc-space-1)!important; }\n.app .participant-row { min-height:26px!important; padding:2px 5px!important; }\n.app .session-participant-list { gap:2px 5px!important; }\n.app .session-participant-list .participant-row { min-height:26px!important; padding:2px 3px 2px 5px!important; }\n.app :where(.badge,.pill) { padding:2px 5px!important; font-size:11px!important; line-height:1.08!important; }\n.app .faq-item { padding:4px 0!important; }\n.app .modal-panel { max-height:92vh; overflow:auto; }\n.app .modal-actions { gap:6px!important; margin-top:7px!important; }\n.app .realisation-rating .rating-star { width:34px!important; min-width:34px!important; height:34px!important; min-height:34px!important; font-size:21px!important; }\n.app .route-card { padding:5px 7px!important; }\n.app .route-card button { min-height:32px!important; padding:4px 7px!important; }\n.app .stat strong { font-size:15px; }\n\n@media (max-width:700px) {\n  :root { --cc-font-body:13.5px; --cc-font-control:13px; --cc-control-height:36px; }\n  .app h1 { font-size:18px!important; }\n  .app h2 { font-size:16px!important; }\n  .app h3 { font-size:14.5px!important; }\n  .app :where(.toolbar,.card) { padding:6px!important; margin-top:4px!important; }\n  .app :where(.menu-button,.nav-symbol,.remove-button,.modal-close,.bottom-tab) { min-height:40px!important; }\n  .app .session-card :where(select,input,button) { min-height:36px!important; }\n  .app .route-card button { min-height:34px!important; }\n  .app .mobile-bottom-nav { gap:2px!important; padding:3px!important; }\n  .app .bottom-tab { padding:4px 5px!important; font-size:12px!important; }\n}\n`);

let main = read("frontend/src/main.jsx");
main = replaceExact(main, 'import "./styles/startup-video.css";', 'import "./styles/startup-video.css";\nimport "./styles/ui-density.css";', "ui density import");
write("frontend/src/main.jsx", main);

let architectureTest = read("frontend/test/frontend-architecture.test.js");
architectureTest = architectureTest.replace('  "admin-user-management/index.js",\n];', '  "admin-user-management/index.js",\n  "lib/realisation-request-mode.js",\n];');
architectureTest = architectureTest.replace('assert.ok(info.size <= 72_000, `App.jsx fait ${info.size} octets : extraire un bloc métier avant d\'ajouter du code au monolithe`);', 'assert.ok(info.size <= 70_000, `App.jsx fait ${info.size} octets : extraire un bloc métier avant d\'ajouter du code au monolithe`);');
write("frontend/test/frontend-architecture.test.js", architectureTest);

write("frontend/test/realisation-workflow.test.js", `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { buildRealisationDraft, buildRealisationPayload, getParticipantSessionDays, resolveSessionIdForRealisation } from "../src/lib/realisation-workflow.js";\n\nconst sessions = [\n  { id:"2026-09-04-midi", date:"2026-09-04", slot:"midi", status:"encadree", encadrantId:"e1", participantIds:["p1"] },\n  { id:"2026-09-05-soir", date:"2026-09-05", slot:"soir", status:"libre", referentId:"r1", participantIds:["p1"] },\n];\n\ntest("les jours et la séance de réalisation proviennent des séances gérées", () => {\n  assert.deepEqual(getParticipantSessionDays(sessions, "p1"), ["2026-09-05", "2026-09-04"]);\n  assert.equal(resolveSessionIdForRealisation(sessions, "p1", "2026-09-04"), "2026-09-04-midi");\n});\n\ntest("le draft sépare le mode du critère", () => {\n  const draft = buildRealisationDraft({ previous:{ modeRealisation:"en_tete", styleRealisation:"flash" }, route:{ moulinetteOnly:true }, routeId:"v1" });\n  assert.equal(draft.modeRealisation, "moulinette");\n  assert.equal(draft.styleRealisation, "flash");\n});\n\ntest("le payload transporte explicitement modeRealisation", () => {\n  const payload = buildRealisationPayload({ draft:{ participantId:"p1", voieId:"v1", selectedDay:"2026-09-05", modeRealisation:"moulinette", styleRealisation:"a_vue", rating:5 }, sessionId:"s1", now:() => 42 });\n  assert.equal(payload.id, "realisation-42");\n  assert.equal(payload.modeRealisation, "moulinette");\n  assert.equal(payload.styleRealisation, "a_vue");\n  assert.equal(payload.rating, 5);\n});\n`);

write("frontend/test/thecrag-export.test.js", `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { theCragStyleForRealisation } from "../src/lib/thecrag.js";\n\ntest("theCrag distingue le mode du critère", () => {\n  assert.equal(theCragStyleForRealisation({ modeRealisation:"moulinette", styleRealisation:"a_vue" }), "Top rope");\n  assert.equal(theCragStyleForRealisation({ modeRealisation:"en_tete", styleRealisation:"a_vue" }), "Onsight");\n  assert.equal(theCragStyleForRealisation({ modeRealisation:"en_tete", styleRealisation:"flash" }), "Flash");\n  assert.equal(theCragStyleForRealisation({ modeRealisation:"en_tete", styleRealisation:"travaillee" }), "Redpoint");\n});\n`);

write("frontend/test/ui-density.test.js", `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n\nconst css = await readFile(new URL("../src/styles/ui-density.css", import.meta.url), "utf8");\nconst main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");\n\ntest("l'échelle typographique compacte est centralisée", () => {\n  assert.match(css, /--cc-font-body:14px/);\n  assert.match(css, /--cc-font-h1:20px/);\n  assert.match(css, /--cc-control-height:34px/);\n  assert.match(css, /@media \(max-width:700px\)/);\n  assert.match(main, /styles\\/ui-density\\.css/);\n});\n`);

let deploy = read(".github/workflows/deploy.yml");
deploy = deploy.replace('set_env_var "EMAIL_FROM_NAME" "ClimbClubCristal"', 'set_env_var "EMAIL_FROM_NAME" "CristalClimbClub"');
write(".github/workflows/deploy.yml", deploy);

write("VERSION", "20260905.005\n");

// Garde-fous de fin de migration.
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk("frontend/src");
for (const file of sourceFiles) {
  const source = read(file);
  if (source.includes("realisation-request-mode.js")) throw new Error(`bridge encore référencé: ${file}`);
  if (source.includes("authApiFetch")) throw new Error(`authApiFetch encore référencé: ${file}`);
}
console.log("Migration frontend 20260905.005 appliquée.");
