import { useState } from "react";

const EMPTY_ROUTE = {
  numeroCorde: "", couleurPrises: "", cotationReference: "", nomVoie: "",
  nomOuvreur: "", moulinetteOnly: false, tags: [],
};

export function useRouteEditorState() {
  const [newRoute, setNewRoute] = useState(EMPTY_ROUTE);
  const [editingRouteId, setEditingRouteId] = useState("");
  const [routeEditDraft, setRouteEditDraft] = useState(null);
  const [savingRouteId, setSavingRouteId] = useState("");
  const [routeSortMode, setRouteSortMode] = useState("corde");

  return {
    newRoute, setNewRoute, editingRouteId, setEditingRouteId,
    routeEditDraft, setRouteEditDraft, savingRouteId, setSavingRouteId,
    routeSortMode, setRouteSortMode,
  };
}
