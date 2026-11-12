import { apiFetch, apiUpload } from "../lib/api.js";
import { formatRouteForRealisation } from "../lib/domain.js";

export function useProfileRealisations({
  isOwnProfile,
  myParticipantId,
  selectedRealisations,
  routesById,
  theCragStartDate,
  setRealisations,
  setProfileError,
  setTheCragImportStatus,
  setTheCragImporting,
  setPendingConfirmation,
  onTheCragImported,
  onRealisationsChanged,
}) {
  async function refreshRealisations() {
    const data = await apiFetch("/realisations");
    if (Array.isArray(data)) setRealisations(data);
    if (typeof onRealisationsChanged === "function") {
      await onRealisationsChanged();
    }
    return data;
  }

  function resetOwnRealisations() {
    if (!isOwnProfile || selectedRealisations.length === 0) return;
    setPendingConfirmation({
      title: "Reset des réalisations",
      message: `Supprimer définitivement vos ${selectedRealisations.length} réalisation(s) ? Cette action est irréversible.`,
      onConfirm: async () => {
        try {
          setProfileError("");
          await apiFetch("/realisations/me", { method: "DELETE" });
          setRealisations((current) => current.filter(
            (realisation) => String(realisation.participantId) !== String(myParticipantId),
          ));
          await refreshRealisations();
        } catch (error) {
          setProfileError(String(error.message || error));
        } finally {
          setPendingConfirmation(null);
        }
      },
    });
  }

  async function importTheCragFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !isOwnProfile) return;
    try {
      setProfileError("");
      setTheCragImportStatus(null);
      setTheCragImporting(true);
      if (!theCragStartDate) throw new Error("Choisissez une date de début pour l’import theCrag.");
      const result = await apiUpload(
        `/realisations/import-thecrag?startDate=${encodeURIComponent(theCragStartDate)}`,
        file,
        {
          headers: {
            "Content-Type": "application/vnd.ms-excel",
            "X-TheCrag-Start-Date": theCragStartDate,
          },
        },
      );
      await refreshRealisations();
      if (typeof onTheCragImported === "function") await onTheCragImported();
      const details = [
        `${result.imported || 0} réalisation(s) importée(s)`,
        result.duplicates ? `${result.duplicates} déjà présente(s)` : "",
        result.unmatched ? `${result.unmatched} voie(s) non reconnue(s)` : "",
        result.invalid ? `${result.invalid} ligne(s) invalide(s)` : "",
        result.filteredBeforeStart
          ? `${result.filteredBeforeStart} antérieure(s) à la date de début ignorée(s)`
          : "",
      ].filter(Boolean).join(" · ");
      setTheCragImportStatus({
        type: "success",
        message: `Import theCrag réussi : ${details || "import terminé."}`,
      });
    } catch (error) {
      const message = String(error.message || error);
      setTheCragImportStatus({
        type: "error",
        message: `Problème lors de l’import theCrag : ${message}`,
      });
    } finally {
      setTheCragImporting(false);
    }
  }

  async function updateOwnRealisation(realisationId, patch) {
    if (!isOwnProfile) return;
    try {
      setProfileError("");
      await apiFetch(`/realisations/${encodeURIComponent(realisationId)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      await refreshRealisations();
    } catch (error) {
      setProfileError(String(error.message || error));
    }
  }

  function deleteOwnRealisation(realisation) {
    if (!isOwnProfile || !realisation?.id) return;
    const route = routesById[realisation.voieId];
    const label = route ? formatRouteForRealisation(route) : "cette réalisation";
    setPendingConfirmation({
      title: "Supprimer la réalisation",
      message: `Supprimer définitivement ${label} ?`,
      onConfirm: async () => {
        try {
          setProfileError("");
          await apiFetch(`/realisations/${encodeURIComponent(realisation.id)}`, {
            method: "DELETE",
          });
          await refreshRealisations();
        } catch (error) {
          setProfileError(String(error.message || error));
        } finally {
          setPendingConfirmation(null);
        }
      },
    });
  }

  return {
    refreshRealisations,
    resetOwnRealisations,
    importTheCragFile,
    updateOwnRealisation,
    deleteOwnRealisation,
  };
}
