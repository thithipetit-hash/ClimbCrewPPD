import React, { useState } from "react";
import Button from "./Button.jsx";
import SaveFeedback from "./SaveFeedback.jsx";
import AdminSection from "./AdminSection.jsx";
import { apiFetch, USE_API } from "../lib/api.js";

export default function AdminRouteArchiveSection() {
  const [routeArchiveState, setRouteArchiveState] = useState({ status: "idle", message: "" });

  async function archiveActiveRoutes() {
    if (!USE_API) {
      setRouteArchiveState({ status: "error", message: "Archivage des voies disponible uniquement avec l’API." });
      return;
    }

    if (!window.confirm("Archiver toutes les voies actives ? Elles resteront dans l’historique mais ne seront plus affichées dans l’onglet Voies.")) return;

    setRouteArchiveState({ status: "saving", message: "Archivage des voies…" });
    try {
      const result = await apiFetch("/admin/routes/archive-active", { method: "POST" });
      const archivedCount = Number(result?.archivedCount || 0);

      if (archivedCount === 0) {
        setRouteArchiveState({ status: "success", message: "✓ Aucune voie active à archiver" });
        return;
      }

      setRouteArchiveState({
        status: "success",
        message: `✓ ${archivedCount} voie${archivedCount > 1 ? "s" : ""} archivée${archivedCount > 1 ? "s" : ""}. Rechargement…`,
      });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setRouteArchiveState({
        status: "error",
        message: `Archivage impossible : ${String(error?.message || error)}`,
      });
    }
  }

  return (
    <AdminSection
      title="Gestion des voies"
      summary="Archive les voies actives sans supprimer leur historique"
    >
      <div className="small" style={{ marginBottom: 10 }}>
        Les voies archivées restent conservées avec leurs réalisations, mais ne sont plus affichées dans l’onglet Voies.
      </div>
      <Button
        type="button"
        variant="danger"
        disabled={routeArchiveState.status === "saving"}
        onClick={archiveActiveRoutes}
      >
        {routeArchiveState.status === "saving" ? "Archivage…" : "Archiver les voies"}
      </Button>
      <SaveFeedback status={routeArchiveState.status} message={routeArchiveState.message} />
    </AdminSection>
  );
}
