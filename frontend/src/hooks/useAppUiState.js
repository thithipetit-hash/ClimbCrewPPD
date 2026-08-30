import { useState } from "react";

export function useAppUiState({ useApi }) {
  const [tab, setTab] = useState("inscriptions");
  const [viewMode, setViewMode] = useState("jour");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsSortField, setStatsSortField] = useState("name");
  const [statsSortDirection, setStatsSortDirection] = useState("asc");
  const [wallOfFameSexFilter, setWallOfFameSexFilter] = useState("all");
  const [recentlyAddedParticipantIds, setRecentlyAddedParticipantIds] = useState([]);
  const [adminInput, setAdminInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [, setSyncMessage] = useState(useApi ? "API activée" : "Mode local");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  return {
    tab, setTab, viewMode, setViewMode, sidebarOpen, setSidebarOpen,
    statsSortField, setStatsSortField, statsSortDirection, setStatsSortDirection,
    wallOfFameSexFilter, setWallOfFameSexFilter, recentlyAddedParticipantIds, setRecentlyAddedParticipantIds,
    adminInput, setAdminInput, adminUnlocked, setAdminUnlocked, adminError, setAdminError,
    routeError, setRouteError, importMessage, setImportMessage, setSyncMessage,
    confirmationMessage, setConfirmationMessage, isSyncing, setIsSyncing,
  };
}
