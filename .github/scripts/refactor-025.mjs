import fs from "node:fs";

const appPath = "frontend/src/App.jsx";
let app = fs.readFileSync(appPath, "utf8");

function replaceSection(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Section introuvable: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

if (!app.includes('from "./hooks/useAppDerivedData.js"')) {
  app = app.replace(
    'import React, { useEffect, useMemo } from "react";',
    'import React, { useEffect } from "react";',
  );
  app = app.replace(
    'import { useRealisationEditorState } from "./hooks/useRealisationEditorState.js";\n',
    'import { useRealisationEditorState } from "./hooks/useRealisationEditorState.js";\n'
      + 'import { useAppDerivedData } from "./hooks/useAppDerivedData.js";\n'
      + 'import { useSessionActions } from "./hooks/useSessionActions.js";\n'
      + 'import { useRouteActions } from "./hooks/useRouteActions.js";\n'
      + 'import { useRealisationActions } from "./hooks/useRealisationActions.js";\n',
  );
  app = app.replace('import { buildRouteDisplayGroups } from "./lib/route-display-groups.js";\n', '');
  app = app.replace(
    'import {\n  buildRealisationDraft,\n  buildRealisationPayload,\n  getParticipantSessionDays,\n  isManagedSession,\n  resolveSessionIdForRealisation,\n} from "./lib/realisation-workflow.js";\n',
    '',
  );

  for (const unusedImport of [
    '  todayIso,\n',
    '  defaultSessionStatus,\n',
    '  gradeToIndex,\n',
    '  calculateSimpleCpr,\n',
    '  isSuccessfulLeadRealisation,\n',
    '  calculateLeadRealisationStats,\n',
    '  calculateLeadPoints,\n',
    '  calculateRouteAggregates,\n',
    '  calculateWallOfFameCategories,\n',
  ]) {
    app = app.replace(unusedImport, '');
  }
}

const derivedReplacement = `  const {
    participantsById,
    routesById,
    routeDisplayGroups,
    sessionsById,
    realisationModalRoute,
    modalAvailableDays,
    modalEligibleParticipants,
    selectedDate,
    daySessions,
    weekSessions,
    selectedParticipantRealisations,
    participantProgressStats,
    progressViewRealisations,
    allProgressRealisationsExpanded,
    sessionStats,
    alphabeticalParticipants,
    cprByParticipantId,
    pointsByParticipantId,
    myParticipantId,
    myParticipant,
    myRealisations,
    myProfileStats,
    sortedStatsParticipants,
    adminParticipants,
    routeAggregatesById,
    leadRealisationStats,
    routeRatingsById,
    topRouteRankings,
    wallOfFameCategories,
  } = useAppDerivedData({
    state,
    authUser,
    newRealisation,
    realisationModalRouteId,
    selectedRouteProgress,
    expandedRealisationIds,
    routeSortMode,
    statsSortField,
    statsSortDirection,
    wallOfFameSexFilter,
    recentlyAddedParticipantIds,
  });

  function toggleAllProgressRealisations() {
    const visibleIds = progressViewRealisations.map((realisation) => realisation.id);
    setExpandedRealisationIds((currentIds) => {
      if (visibleIds.every((id) => currentIds.includes(id))) {
        return currentIds.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...currentIds, ...visibleIds])];
    });
  }

  function setRealisationExpanded(realisationId, expanded) {
    setExpandedRealisationIds((currentIds) => expanded
      ? [...new Set([...currentIds, realisationId])]
      : currentIds.filter((id) => id !== realisationId));
  }

`;
app = replaceSection(
  app,
  '  const participantsById = useMemo(',
  '  function setSelectedDate(date) {',
  derivedReplacement,
);

const sessionReplacement = `  const {
    setSelectedDate,
    ensureSessionsForDate,
    updateSession,
    addParticipantToSession,
    removeParticipantFromSession,
  } = useSessionActions({
    useApi: USE_API,
    state,
    setState,
    setSyncMessage,
    setConfirmationMessage,
  });

`;
app = replaceSection(
  app,
  '  function setSelectedDate(date) {',
  '  async function addParticipant() {',
  sessionReplacement,
);

const routeReplacement = `  const {
    addRoute,
    startRouteEdition,
    cancelRouteEdition,
    deleteRoute,
    saveRouteEdition,
  } = useRouteActions({
    useApi: USE_API,
    state,
    setState,
    newRoute,
    setNewRoute,
    selectedDate,
    routeEditDraft,
    setRouteEditDraft,
    setEditingRouteId,
    setSavingRouteId,
    setRouteError,
    setSyncMessage,
    setConfirmationMessage,
  });

`;
app = replaceSection(
  app,
  '  async function addRoute() {',
  '  function getParticipantSessions(participantId) {',
  routeReplacement,
);

const realisationReplacement = `  const {
    getParticipantSessions,
    updateRealisation,
    openRealisationModal,
    closeRealisationModal,
    deleteRealisation,
    addRealisation,
  } = useRealisationActions({
    useApi: USE_API,
    authUser,
    state,
    setState,
    myParticipantId,
    sessionsById,
    routesById,
    participantsById,
    newRealisation,
    setNewRealisation,
    setRealisationModalRouteId,
    setConfirmationMessage,
  });

`;
app = replaceSection(
  app,
  '  function getParticipantSessions(participantId) {',
  '  async function loadAdminAccessData() {',
  realisationReplacement,
);

fs.writeFileSync(appPath, app);
fs.writeFileSync("VERSION", "260907.025\n");

const architectureTest = `import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("App délègue les gros blocs métier aux hooks dédiés", () => {
  assert.match(app, /useAppDerivedData\\(/);
  assert.match(app, /useSessionActions\\(/);
  assert.match(app, /useRouteActions\\(/);
  assert.match(app, /useRealisationActions\\(/);
  assert.doesNotMatch(app, /function buildDefaultSession/);
  assert.doesNotMatch(app, /async function addRoute\\(/);
  assert.doesNotMatch(app, /async function addRealisation\\(/);
  assert.doesNotMatch(app, /const sessionStats = useMemo/);
});
`;
fs.writeFileSync("frontend/test/app-maintainability.test.js", architectureTest);

console.log(`App.jsx réduit à ${app.split("\\n").length} lignes`);
