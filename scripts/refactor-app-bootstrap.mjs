import fs from "node:fs";

const file = "frontend/src/App.jsx";
let source = fs.readFileSync(file, "utf8");

const importNeedle = 'import { useAuthState } from "./hooks/useAuthState.js";\n';
const importLine = 'import { useAppBootstrap } from "./hooks/useAppBootstrap.js";\n';
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error("Import useAuthState introuvable");
  source = source.replace(importNeedle, `${importNeedle}${importLine}`);
}

const startNeedle = "  /**\n   * Recharge toutes les données depuis le backend.";
const endNeedle = "  }, [authUser?.id, authToken]);\n";
const callBlock = `  const { reloadApiState } = useAppBootstrap({\n    useApi: USE_API,\n    authToken,\n    authUserId: authUser?.id,\n    setAuthToken,\n    setAuthUser,\n    setAuthLoading,\n    setThemePreference,\n    setAdminUnlocked,\n    setPendingBroadcastMessages,\n    setBroadcastMessageError,\n    setState,\n    setIsSyncing,\n    setSyncMessage,\n  });\n`;

if (!source.includes(callBlock)) {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error("Début du bloc bootstrap introuvable");
  const endStart = source.indexOf(endNeedle, start);
  if (endStart < 0) throw new Error("Fin du bloc bootstrap introuvable");
  const end = endStart + endNeedle.length;
  source = `${source.slice(0, start)}${callBlock}${source.slice(end)}`;
}

fs.writeFileSync(file, source);
