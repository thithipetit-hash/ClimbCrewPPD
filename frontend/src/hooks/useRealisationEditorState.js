import { useState } from "react";

export function useRealisationEditorState({ defaultRouteId = "" } = {}) {
  const [newRealisation, setNewRealisation] = useState({
    participantId: "", selectedDay: "", sessionId: "", voieId: defaultRouteId,
    styleRealisation: "a_vue", commentaire: "", cotationProposee: "", rating: 0,
    chute: false, assureurId: "",
  });
  const [realisationModalRouteId, setRealisationModalRouteId] = useState(null);
  const [selectedRouteProgress, setSelectedRouteProgress] = useState("");
  const [expandedRealisationIds, setExpandedRealisationIds] = useState([]);

  return {
    newRealisation, setNewRealisation, realisationModalRouteId, setRealisationModalRouteId,
    selectedRouteProgress, setSelectedRouteProgress, expandedRealisationIds, setExpandedRealisationIds,
  };
}
