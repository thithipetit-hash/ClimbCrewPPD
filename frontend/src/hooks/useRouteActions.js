import { apiFetch } from "../lib/api.js";
import { formatRouteName } from "../lib/domain.js";

export function useRouteActions({
  useApi,
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
}) {
  async function addRoute() {
    const numeroVoieUnique = `voie-${Date.now()}`;
    const couleurPrises = newRoute.couleurPrises.trim();
    const nomOuvreur = newRoute.nomOuvreur.trim();
    if (!newRoute.numeroCorde || !couleurPrises || !newRoute.cotationReference || !nomOuvreur) {
      return setRouteError("Renseigne la corde, la couleur, la cotation et l’ouvreur.");
    }

    const route = {
      id: `route-${Date.now()}`,
      numeroVoieUnique,
      numeroCorde: Number(newRoute.numeroCorde),
      couleurPrises,
      cotationReference: newRoute.cotationReference,
      cotationAjustee: newRoute.cotationReference,
      nomVoie: newRoute.nomVoie.trim(),
      nomOuvreur,
      moulinetteOnly: newRoute.moulinetteOnly,
      active: true,
      dateCreation: selectedDate,
      tags: newRoute.tags,
    };

    try {
      const savedRoute = useApi
        ? await apiFetch("/routes", { method: "POST", body: JSON.stringify(route) })
        : route;
      setState((previous) => ({ ...previous, routes: [...previous.routes, savedRoute] }));
      setRouteError("");
      setNewRoute({
        numeroCorde: "",
        couleurPrises: "",
        cotationReference: "",
        nomVoie: "",
        nomOuvreur: "",
        moulinetteOnly: false,
        tags: [],
      });
      setConfirmationMessage("Voie ajoutée.");
    } catch (error) {
      setRouteError(error.message || "Création de la voie impossible.");
    }
  }

  function startRouteEdition(route) {
    setEditingRouteId(route.id);
    setRouteEditDraft({
      numeroCorde: String(route.numeroCorde ?? 0),
      couleurPrises: route.couleurPrises || "Blanc",
      cotationReference: route.cotationReference || route.cotationAjustee || "5c",
      nomVoie: route.nomVoie || "",
      nomOuvreur: route.nomOuvreur || "",
      moulinetteOnly: Boolean(route.moulinetteOnly),
      tags: route.tags || [],
    });
    setRouteError("");
  }

  function cancelRouteEdition() {
    setEditingRouteId("");
    setRouteEditDraft(null);
  }

  async function deleteRoute(route) {
    if (!route?.id) return;
    const relatedRealisations = state.realisations.filter(
      (item) => String(item.voieId) === String(route.id),
    ).length;
    const routeLabel = formatRouteName(route);
    const warning = relatedRealisations
      ? ` Cette action supprimera aussi ${relatedRealisations} réalisation(s).`
      : "";
    if (!window.confirm(`Supprimer définitivement la voie « ${routeLabel} » ?${warning}`)) return;

    try {
      if (useApi) await apiFetch(`/routes/${encodeURIComponent(route.id)}`, { method: "DELETE" });
      setState((previous) => ({
        ...previous,
        routes: previous.routes.filter((item) => item.id !== route.id),
        realisations: previous.realisations.filter((item) => item.voieId !== route.id),
      }));
      cancelRouteEdition();
      setConfirmationMessage("Voie supprimée.");
    } catch (error) {
      setRouteError(error.message || "Suppression de la voie impossible.");
    }
  }

  async function saveRouteEdition(route) {
    if (!routeEditDraft) return;
    setRouteError("");
    const couleurPrises = routeEditDraft.couleurPrises.trim();
    const nomOuvreur = routeEditDraft.nomOuvreur.trim();
    if (!couleurPrises || !nomOuvreur) {
      setRouteError("Renseigne au moins la couleur et l’ouvreur.");
      return;
    }

    const routePatch = {
      numeroCorde: Number(routeEditDraft.numeroCorde),
      couleurPrises,
      cotationReference: routeEditDraft.cotationReference,
      cotationAjustee: routeEditDraft.cotationReference,
      nomVoie: routeEditDraft.nomVoie.trim(),
      nomOuvreur,
      moulinetteOnly: routeEditDraft.moulinetteOnly,
      tags: routeEditDraft.tags,
    };
    const updatedRoute = { ...route, ...routePatch };

    setSavingRouteId(route.id);
    try {
      const savedRoute = useApi
        ? await apiFetch(`/routes/${encodeURIComponent(route.id)}`, {
            method: "PUT",
            body: JSON.stringify(routePatch),
          })
        : updatedRoute;
      setState((previous) => ({
        ...previous,
        routes: previous.routes.map((item) => (item.id === route.id ? savedRoute : item)),
      }));
      cancelRouteEdition();
      setSyncMessage("Voie mise à jour.");
      setConfirmationMessage("Voie modifiée.");
    } catch (error) {
      setRouteError(error.message || "Modification de la voie impossible.");
    } finally {
      setSavingRouteId("");
    }
  }

  return {
    addRoute,
    startRouteEdition,
    cancelRouteEdition,
    deleteRoute,
    saveRouteEdition,
  };
}
