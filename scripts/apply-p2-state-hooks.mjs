import fs from "node:fs/promises";

const appPath = "frontend/src/App.jsx";
let source = await fs.readFile(appPath, "utf8");

function replaceOrFail(pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`Transformation introuvable: ${label}`);
  }
  source = next;
}

replaceOrFail(
  'import React, { useEffect, useMemo, useState } from "react";',
  'import React, { useEffect, useMemo } from "react";',
  "React useState import"
);

replaceOrFail(
  'import { EMPTY_APP_DATA, useAppBusinessState } from "./hooks/useAppBusinessState.js";',
  `import { EMPTY_APP_DATA, useAppBusinessState } from "./hooks/useAppBusinessState.js";\nimport { useAppUiState } from "./hooks/useAppUiState.js";\nimport { useAuthState } from "./hooks/useAuthState.js";\nimport { useParticipantEditorState } from "./hooks/useParticipantEditorState.js";\nimport { useRouteEditorState } from "./hooks/useRouteEditorState.js";\nimport { useRealisationEditorState } from "./hooks/useRealisationEditorState.js";`,
  "state hook imports"
);

replaceOrFail(
  /  const \[tab, setTab\] = useState\("inscriptions"\);[\s\S]*?  const \[isSyncing, setIsSyncing\] = useState\(false\);/,
  `  const {\n    tab, setTab,\n    viewMode, setViewMode,\n    sidebarOpen, setSidebarOpen,\n    statsSortField, setStatsSortField,\n    statsSortDirection, setStatsSortDirection,\n    wallOfFameSexFilter, setWallOfFameSexFilter,\n    recentlyAddedParticipantIds, setRecentlyAddedParticipantIds,\n    adminInput, setAdminInput,\n    adminUnlocked, setAdminUnlocked,\n    adminError, setAdminError,\n    routeError, setRouteError,\n    importMessage, setImportMessage,\n    setSyncMessage,\n    confirmationMessage, setConfirmationMessage,\n    isSyncing, setIsSyncing,\n  } = useAppUiState({ useApi: USE_API });\n  const [state, setState] = useAppBusinessState({ useApi: USE_API });`,
  "UI state block"
);

replaceOrFail(
  /  const \[authToken, setAuthToken\] = useState\(\(\) => \(USE_API \? "cookie" : ""\)\);[\s\S]*?  const \[themePreference, setThemePreference\] = useState\(\(\) => localStorage\.getItem\(THEME_PREFERENCE_KEY\) \|\| "auto"\);/,
  `  const {\n    authToken, setAuthToken,\n    authUser, setAuthUser,\n    authLoading, setAuthLoading,\n    authView, setAuthView,\n    authError, setAuthError,\n    authMessage, setAuthMessage,\n    loginForm, setLoginForm,\n    requestAccessForm, setRequestAccessForm,\n    forgotPasswordForm, setForgotPasswordForm,\n    resetPasswordForm, setResetPasswordForm,\n    adminAuthUsers, setAdminAuthUsers,\n    adminAccessLogs, setAdminAccessLogs,\n    generatedResetToken, setGeneratedResetToken,\n    pendingBroadcastMessages, setPendingBroadcastMessages,\n    broadcastMessageError, setBroadcastMessageError,\n    themePreference, setThemePreference,\n  } = useAuthState({ useApi: USE_API, themePreferenceKey: THEME_PREFERENCE_KEY });`,
  "auth state block"
);

replaceOrFail(
  /  const \[newParticipant, setNewParticipant\] = useState\(\{[\s\S]*?  \}\);\n  const \[newRoute, setNewRoute\]/,
  `  const { newParticipant, setNewParticipant } = useParticipantEditorState();\n  const [newRoute, setNewRoute]`,
  "participant editor state"
);

replaceOrFail(
  /  const \[newRoute, setNewRoute\] = useState\(\{[\s\S]*?  const \[routeSortMode, setRouteSortMode\] = useState\("corde"\);/,
  `  const {\n    newRoute, setNewRoute,\n    editingRouteId, setEditingRouteId,\n    routeEditDraft, setRouteEditDraft,\n    savingRouteId, setSavingRouteId,\n    routeSortMode, setRouteSortMode,\n  } = useRouteEditorState();`,
  "route editor state"
);

replaceOrFail(
  /  const \[newRealisation, setNewRealisation\] = useState\(\{[\s\S]*?  const \[expandedRealisationIds, setExpandedRealisationIds\] = useState\(\[\]\);/,
  `  const {\n    newRealisation, setNewRealisation,\n    realisationModalRouteId, setRealisationModalRouteId,\n    selectedRouteProgress, setSelectedRouteProgress,\n    expandedRealisationIds, setExpandedRealisationIds,\n  } = useRealisationEditorState({ defaultRouteId: EMPTY_APP_DATA.routes?.[0]?.id || "" });`,
  "realisation editor state"
);

await fs.writeFile(appPath, source);

await fs.writeFile("frontend/src/hooks/useAppUiState.js", `import { useState } from "react";\n\nexport function useAppUiState({ useApi }) {\n  const [tab, setTab] = useState("inscriptions");\n  const [viewMode, setViewMode] = useState("jour");\n  const [sidebarOpen, setSidebarOpen] = useState(false);\n  const [statsSortField, setStatsSortField] = useState("name");\n  const [statsSortDirection, setStatsSortDirection] = useState("asc");\n  const [wallOfFameSexFilter, setWallOfFameSexFilter] = useState("all");\n  const [recentlyAddedParticipantIds, setRecentlyAddedParticipantIds] = useState([]);\n  const [adminInput, setAdminInput] = useState("");\n  const [adminUnlocked, setAdminUnlocked] = useState(false);\n  const [adminError, setAdminError] = useState("");\n  const [routeError, setRouteError] = useState("");\n  const [importMessage, setImportMessage] = useState("");\n  const [, setSyncMessage] = useState(useApi ? "API activée" : "Mode local");\n  const [confirmationMessage, setConfirmationMessage] = useState("");\n  const [isSyncing, setIsSyncing] = useState(false);\n\n  return {\n    tab, setTab, viewMode, setViewMode, sidebarOpen, setSidebarOpen,\n    statsSortField, setStatsSortField, statsSortDirection, setStatsSortDirection,\n    wallOfFameSexFilter, setWallOfFameSexFilter, recentlyAddedParticipantIds, setRecentlyAddedParticipantIds,\n    adminInput, setAdminInput, adminUnlocked, setAdminUnlocked, adminError, setAdminError,\n    routeError, setRouteError, importMessage, setImportMessage, setSyncMessage,\n    confirmationMessage, setConfirmationMessage, isSyncing, setIsSyncing,\n  };\n}\n`);

await fs.writeFile("frontend/src/hooks/useAuthState.js", `import { useState } from "react";\n\nexport function useAuthState({ useApi, themePreferenceKey }) {\n  const [authToken, setAuthToken] = useState(() => (useApi ? "cookie" : ""));\n  const [authUser, setAuthUser] = useState(null);\n  const [authLoading, setAuthLoading] = useState(useApi);\n  const [authView, setAuthView] = useState("login");\n  const [authError, setAuthError] = useState("");\n  const [authMessage, setAuthMessage] = useState("");\n  const [loginForm, setLoginForm] = useState({ email: "", password: "" });\n  const [requestAccessForm, setRequestAccessForm] = useState({\n    prenom: "", nom: "", email: "", password: "", confirmPassword: "", acceptTerms: false,\n  });\n  const [forgotPasswordForm, setForgotPasswordForm] = useState({ email: "" });\n  const [resetPasswordForm, setResetPasswordForm] = useState({\n    email: "", token: "", password: "", confirmPassword: "",\n  });\n  const [adminAuthUsers, setAdminAuthUsers] = useState([]);\n  const [adminAccessLogs, setAdminAccessLogs] = useState([]);\n  const [generatedResetToken, setGeneratedResetToken] = useState("");\n  const [pendingBroadcastMessages, setPendingBroadcastMessages] = useState([]);\n  const [broadcastMessageError, setBroadcastMessageError] = useState("");\n  const [themePreference, setThemePreference] = useState(() => localStorage.getItem(themePreferenceKey) || "auto");\n\n  return {\n    authToken, setAuthToken, authUser, setAuthUser, authLoading, setAuthLoading,\n    authView, setAuthView, authError, setAuthError, authMessage, setAuthMessage,\n    loginForm, setLoginForm, requestAccessForm, setRequestAccessForm,\n    forgotPasswordForm, setForgotPasswordForm, resetPasswordForm, setResetPasswordForm,\n    adminAuthUsers, setAdminAuthUsers, adminAccessLogs, setAdminAccessLogs,\n    generatedResetToken, setGeneratedResetToken, pendingBroadcastMessages, setPendingBroadcastMessages,\n    broadcastMessageError, setBroadcastMessageError, themePreference, setThemePreference,\n  };\n}\n`);

await fs.writeFile("frontend/src/hooks/useParticipantEditorState.js", `import { useState } from "react";\n\nconst EMPTY_PARTICIPANT = {\n  nom: "", prenom: "", email: "", passport: "sans", sexe: "",\n  cotisation: false, ffme: false, canEncadrer: false, canReferer: false, canAdmin: false,\n};\n\nexport function useParticipantEditorState() {\n  const [newParticipant, setNewParticipant] = useState(EMPTY_PARTICIPANT);\n  return { newParticipant, setNewParticipant };\n}\n`);

await fs.writeFile("frontend/src/hooks/useRouteEditorState.js", `import { useState } from "react";\n\nconst EMPTY_ROUTE = {\n  numeroCorde: "", couleurPrises: "", cotationReference: "", nomVoie: "",\n  nomOuvreur: "", moulinetteOnly: false, tags: [],\n};\n\nexport function useRouteEditorState() {\n  const [newRoute, setNewRoute] = useState(EMPTY_ROUTE);\n  const [editingRouteId, setEditingRouteId] = useState("");\n  const [routeEditDraft, setRouteEditDraft] = useState(null);\n  const [savingRouteId, setSavingRouteId] = useState("");\n  const [routeSortMode, setRouteSortMode] = useState("corde");\n\n  return {\n    newRoute, setNewRoute, editingRouteId, setEditingRouteId,\n    routeEditDraft, setRouteEditDraft, savingRouteId, setSavingRouteId,\n    routeSortMode, setRouteSortMode,\n  };\n}\n`);

await fs.writeFile("frontend/src/hooks/useRealisationEditorState.js", `import { useState } from "react";\n\nexport function useRealisationEditorState({ defaultRouteId = "" } = {}) {\n  const [newRealisation, setNewRealisation] = useState({\n    participantId: "", selectedDay: "", sessionId: "", voieId: defaultRouteId,\n    styleRealisation: "a_vue", commentaire: "", cotationProposee: "", rating: 0,\n    chute: false, assureurId: "",\n  });\n  const [realisationModalRouteId, setRealisationModalRouteId] = useState(null);\n  const [selectedRouteProgress, setSelectedRouteProgress] = useState("");\n  const [expandedRealisationIds, setExpandedRealisationIds] = useState([]);\n\n  return {\n    newRealisation, setNewRealisation, realisationModalRouteId, setRealisationModalRouteId,\n    selectedRouteProgress, setSelectedRouteProgress, expandedRealisationIds, setExpandedRealisationIds,\n  };\n}\n`);

await fs.writeFile("frontend/test/app-state-hooks.test.js", `import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");\n\ntest("App délègue ses états transverses et éditeurs à des hooks dédiés", () => {\n  for (const hook of [\n    "useAppUiState", "useAuthState", "useParticipantEditorState",\n    "useRouteEditorState", "useRealisationEditorState",\n  ]) {\n    assert.match(app, new RegExp(hook));\n  }\n  assert.doesNotMatch(app, /useState\\(/);\n});\n\ntest("les hooks de domaine restent séparés du composant racine", () => {\n  for (const file of [\n    "useAppUiState.js", "useAuthState.js", "useParticipantEditorState.js",\n    "useRouteEditorState.js", "useRealisationEditorState.js",\n  ]) {\n    const source = fs.readFileSync(new URL("../src/hooks/" + file, import.meta.url), "utf8");\n    assert.match(source, /useState/);\n    assert.doesNotMatch(source, /function App\\(/);\n  }\n});\n`);

await fs.writeFile("VERSION", "20260830.011\n");

await fs.rm("scripts/apply-p2-state-hooks.mjs", { force: true });
await fs.rm(".github/workflows/p2-state-hooks-apply.yml", { force: true });
