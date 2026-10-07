import React from "react";
import Button from "../components/Button.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import RouteQrCode from "../components/RouteQrCode.jsx";
import { API_BASE, apiFetch, apiUploadVideoInChunks } from "../lib/api.js";
import { REALISATIONS_PAGE_SIZE, fetchPaginatedCollection } from "../lib/bootstrap-data.js";
import { GRADES, formatRouteName, getRouteCardStyle, normalizeRopeNumber } from "../lib/domain.js";
import {
  ROUTE_REALISATION_FILTER_OPTIONS,
  filterRouteDisplayGroups,
  formatRouteProgress,
  groupParticipantRealisationsByRoute,
} from "../lib/route-progress.js";
import { ROPE_NUMBERS, ROUTE_COLORS, ROUTE_TAGS } from "../lib/ui-config.js";

function parseVideoUrls(text) {
  return [...new Set(String(text || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
}

function playableVideoUrl(url) {
  if (String(url || "").startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

function isLocalVideoUrl(url) {
  return /^\/routes\/[^/]+\/videos\/[^/]+$/.test(String(url || ""));
}

function localVideoId(url) {
  const match = String(url || "").match(/^\/routes\/[^/]+\/videos\/([^/]+)$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function downloadableVideoUrl(url) {
  const videoUrl = playableVideoUrl(url);
  if (!isLocalVideoUrl(url)) return videoUrl;
  return `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}download=1`;
}

export default function Voies({
  adminUnlocked,
  newRoute,
  setNewRoute,
  addRoute,
  routeError,
  routeDisplayGroups,
  routeSortMode,
  setRouteSortMode,
  routeRatingsById,
  routeAggregatesById,
  openRealisationModal,
  selectedParticipantProgress,
  editingRouteId,
  routeEditDraft,
  setRouteEditDraft,
  startRouteEdition,
  saveRouteEdition,
  cancelRouteEdition,
  deleteRoute,
  savingRouteId,
  participants = [],
}) {
  const [videoRouteId, setVideoRouteId] = React.useState("");
  const [videoDraftByRouteId, setVideoDraftByRouteId] = React.useState({});
  const [videoSaveStatus, setVideoSaveStatus] = React.useState("");
  const [videoSavingRouteId, setVideoSavingRouteId] = React.useState("");
  const [videoUploadingRouteId, setVideoUploadingRouteId] = React.useState("");
  const [videoDeletingUrl, setVideoDeletingUrl] = React.useState("");
  const [selectedComparisonVideos, setSelectedComparisonVideos] = React.useState([]);
  const [comparisonOpen, setComparisonOpen] = React.useState(false);
  const [videoDeleteCandidate, setVideoDeleteCandidate] = React.useState(null);
  const [qrRouteId, setQrRouteId] = React.useState("");
  const [routeRealisationFilter, setRouteRealisationFilter] = React.useState("all");
  const [currentParticipantId, setCurrentParticipantId] = React.useState("");
  const [myRouteRealisations, setMyRouteRealisations] = React.useState([]);
  const [routeProgressError, setRouteProgressError] = React.useState("");
  const [expandedRouteIds, setExpandedRouteIds] = React.useState(() => new Set());

  const allRoutes = routeDisplayGroups.flatMap((group) => group.routes);
  const videoRoute = allRoutes.find((route) => String(route.id) === String(videoRouteId)) || null;
  const qrRoute = adminUnlocked
    ? allRoutes.find((route) => String(route.id) === String(qrRouteId)) || null
    : null;
  const realisationsByRoute = React.useMemo(
    () => groupParticipantRealisationsByRoute(myRouteRealisations, currentParticipantId),
    [myRouteRealisations, currentParticipantId],
  );
  const filteredRouteDisplayGroups = React.useMemo(
    () => filterRouteDisplayGroups(routeDisplayGroups, realisationsByRoute, routeRealisationFilter),
    [routeDisplayGroups, realisationsByRoute, routeRealisationFilter],
  );

  const loadMyRouteRealisations = React.useCallback(async () => {
    try {
      setRouteProgressError("");
      const auth = await apiFetch("/auth/me");
      const participantId = String(auth?.user?.participantId || "");
      setCurrentParticipantId(participantId);
      if (!participantId) {
        setMyRouteRealisations([]);
        return;
      }
      const allRealisations = await fetchPaginatedCollection(
        ({ limit, offset }) => apiFetch(`/realisations?limit=${limit}&offset=${offset}`),
        { pageSize: REALISATIONS_PAGE_SIZE },
      );
      setMyRouteRealisations(allRealisations.filter(
        (realisation) => String(realisation?.participantId || "") === participantId,
      ));
    } catch (error) {
      setRouteProgressError(error.message || "Impossible de charger vos réalisations.");
      setMyRouteRealisations([]);
    }
  }, []);

  React.useEffect(() => {
    void loadMyRouteRealisations();
  }, [loadMyRouteRealisations]);

  React.useEffect(() => {
    const refresh = () => void loadMyRouteRealisations();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadMyRouteRealisations]);

  React.useEffect(() => {
    setSelectedComparisonVideos([]);
    setComparisonOpen(false);
    setVideoSaveStatus("");
  }, [videoRouteId]);

  function toggleRouteDetails(routeId) {
  const key = String(routeId);
  setExpandedRouteIds((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
}

function handleRouteSummaryKeyDown(event, routeId) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggleRouteDetails(routeId);
}

  function effectiveVideoUrls(route) {
    const local = videoDraftByRouteId[route.id];
    if (local?.savedUrls) return local.savedUrls;
    return Array.isArray(route.videoUrls) ? route.videoUrls : [];
  }

  function videoDraftText(route) {
    const local = videoDraftByRouteId[route.id];
    if (local && Object.hasOwn(local, "draft")) return local.draft;
    return effectiveVideoUrls(route).filter((url) => !isLocalVideoUrl(url)).join("\n");
  }

  function setSavedVideoUrls(route, savedUrls) {
    setVideoDraftByRouteId((current) => ({
      ...current,
      [route.id]: {
        draft: savedUrls.filter((url) => !isLocalVideoUrl(url)).join("\n"),
        savedUrls,
      },
    }));
  }

  function updateVideoDraft(route, draft) {
    setVideoDraftByRouteId((current) => ({ ...current, [route.id]: { ...(current[route.id] || {}), draft } }));
    setVideoSaveStatus("");
  }

  async function uploadLocalVideo(route, file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setVideoSaveStatus("Vidéo trop volumineuse. Maximum 50 Mo.");
      return;
    }
    try {
      setVideoUploadingRouteId(route.id);
      setVideoSaveStatus("");
      const result = await apiUploadVideoInChunks(`/routes/${encodeURIComponent(route.id)}/video-uploads`, file, {
        onProgress: ({ uploadedParts, totalParts }) => setVideoSaveStatus(`Chargement vidéo… ${uploadedParts}/${totalParts}`),
      });
      const savedUrls = Array.isArray(result?.route?.videoUrls)
        ? result.route.videoUrls
        : [...effectiveVideoUrls(route), result.url].filter(Boolean);
      setSavedVideoUrls(route, savedUrls);
      setVideoSaveStatus("Vidéo chargée.");
    } catch (error) {
      setVideoSaveStatus(error.message || "Chargement de la vidéo impossible.");
    } finally {
      setVideoUploadingRouteId("");
    }
  }

  async function performDeleteVideo(route, url) {
    try {
      setVideoDeletingUrl(url);
      setVideoSaveStatus("");
      let savedUrls;

      if (isLocalVideoUrl(url)) {
        const videoId = localVideoId(url);
        if (!videoId) throw new Error("Identifiant de vidéo invalide.");
        const result = await apiFetch(`/routes/${encodeURIComponent(route.id)}/videos/${encodeURIComponent(videoId)}`, {
          method: "DELETE",
        });
        savedUrls = Array.isArray(result?.route?.videoUrls)
          ? result.route.videoUrls
          : effectiveVideoUrls(route).filter((candidate) => candidate !== url);
      } else {
        const videoUrls = effectiveVideoUrls(route).filter((candidate) => candidate !== url);
        const updated = await apiFetch(`/routes/${encodeURIComponent(route.id)}`, {
          method: "PUT",
          body: JSON.stringify({ videoUrls }),
        });
        savedUrls = Array.isArray(updated?.videoUrls) ? updated.videoUrls : videoUrls;
      }

      setSavedVideoUrls(route, savedUrls);
      setSelectedComparisonVideos((current) => current.filter((candidate) => candidate !== url));
      setComparisonOpen(false);
      setVideoSaveStatus("Vidéo supprimée.");
    } catch (error) {
      setVideoSaveStatus(error.message || "Suppression de la vidéo impossible.");
    } finally {
      setVideoDeletingUrl("");
      setVideoDeleteCandidate(null);
    }
  }

  function deleteVideo(route, url) {
    setVideoDeleteCandidate({ route, url });
  }

  function toggleComparisonVideo(url) {
    setComparisonOpen(false);
    setSelectedComparisonVideos((current) => {
      if (current.includes(url)) return current.filter((candidate) => candidate !== url);
      if (current.length >= 2) {
        setVideoSaveStatus("Deux vidéos sont déjà sélectionnées pour la comparaison.");
        return current;
      }
      setVideoSaveStatus("");
      return [...current, url];
    });
  }

  async function saveRouteVideos(route, { silent = false } = {}) {
    const localVideoUrls = effectiveVideoUrls(route).filter(isLocalVideoUrl);
    const externalVideoUrls = parseVideoUrls(videoDraftText(route)).filter((url) => !isLocalVideoUrl(url));
    const videoUrls = [...new Set([...localVideoUrls, ...externalVideoUrls])];
    if (videoUrls.length > 10) {
      setVideoSaveStatus("10 vidéos maximum par voie.");
      return false;
    }
    try {
      setVideoSavingRouteId(route.id);
      setVideoSaveStatus("");
      const updated = await apiFetch(`/routes/${encodeURIComponent(route.id)}`, {
        method: "PUT",
        body: JSON.stringify({ videoUrls }),
      });
      const savedUrls = Array.isArray(updated.videoUrls) ? updated.videoUrls : videoUrls;
      setSavedVideoUrls(route, savedUrls);
      if (!silent) setVideoSaveStatus(`${savedUrls.length} lien${savedUrls.length > 1 ? "s" : ""} vidéo enregistré${savedUrls.length > 1 ? "s" : ""}.`);
      return true;
    } catch (error) {
      setVideoSaveStatus(error.message || "Enregistrement des vidéos impossible.");
      return false;
    } finally {
      setVideoSavingRouteId("");
    }
  }

  async function saveRouteEditionWithVideos(route) {
    const videosSaved = await saveRouteVideos(route, { silent: true });
    if (!videosSaved) return;
    await saveRouteEdition(route);
  }

  if (videoRoute) {
    const videoUrls = effectiveVideoUrls(videoRoute);
    const localVideoUrls = videoUrls.filter(isLocalVideoUrl);
    const comparisonVideos = selectedComparisonVideos.filter((url) => videoUrls.includes(url)).slice(0, 2);
    return (
      <div className="card">
        <ConfirmDialog
          open={Boolean(videoDeleteCandidate)}
          title="Supprimer la vidéo"
          message="Supprimer définitivement cette vidéo de la voie ?"
          onConfirm={() => videoDeleteCandidate && void performDeleteVideo(videoDeleteCandidate.route, videoDeleteCandidate.url)}
          onCancel={() => setVideoDeleteCandidate(null)}
        />
        <div className="card-header">
          <div>
            <h2>Vidéos · {formatRouteName(videoRoute)}</h2>
            <div className="small">Corde {normalizeRopeNumber(videoRoute.numeroCorde)} · {videoRoute.cotationAjustee || videoRoute.cotationReference || "nc"}</div>
          </div>
          <Button variant="secondary" onClick={() => setVideoRouteId("")}>Retour aux voies</Button>
        </div>

        {localVideoUrls.length >= 2 && (
          <div className="subcard" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <div>
                <strong>Comparer deux vidéos</strong>
                <div className="small">Sélectionnez deux vidéos chargées dans l’application, puis lancez la comparaison.</div>
              </div>
              <div className="group">
                <span className="badge">{comparisonVideos.length}/2</span>
                <Button
                  type="button"
                  disabled={comparisonVideos.length !== 2}
                  onClick={() => setComparisonOpen(true)}
                >
                  Comparer
                </Button>
                {comparisonVideos.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setSelectedComparisonVideos([]);
                      setComparisonOpen(false);
                    }}
                  >
                    Effacer la sélection
                  </Button>
                )}
              </div>
            </div>

            {comparisonOpen && comparisonVideos.length === 2 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
                {comparisonVideos.map((url, index) => (
                  <div key={url}>
                    <div className="small" style={{ marginBottom: 6 }}><strong>Vidéo {index + 1}</strong></div>
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={playableVideoUrl(url)}
                      style={{ width: "100%", maxHeight: "65vh", borderRadius: 12, background: "#000" }}
                    >
                      Votre navigateur ne permet pas la lecture de cette vidéo.
                    </video>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {videoSaveStatus && <div className="small" style={{ marginBottom: 10 }}>{videoSaveStatus}</div>}

        {videoUrls.length === 0 ? <div className="muted-box">Aucune vidéo n’est encore associée à cette voie.</div> : (
          <div className="stack">
            {videoUrls.map((url, index) => {
              const localVideo = isLocalVideoUrl(url);
              const selectedForComparison = selectedComparisonVideos.includes(url);
              return (
                <div className="subcard" key={`${url}-${index}`}>
                  <div className="card-header">
                    <div><strong>Vidéo {index + 1}</strong>{!localVideo && <div className="small" style={{ overflowWrap: "anywhere" }}>{url}</div>}</div>
                    <div className="group">
                      {localVideo && localVideoUrls.length >= 2 && (
                        <Button
                          type="button"
                          variant={selectedForComparison ? "primary" : "secondary"}
                          aria-pressed={selectedForComparison}
                          onClick={() => toggleComparisonVideo(url)}
                        >
                          {selectedForComparison ? "Sélectionnée" : "Comparer"}
                        </Button>
                      )}
                      {localVideo ? (
                        <a className="pill" href={downloadableVideoUrl(url)} download style={{ textDecoration: "none" }}>Télécharger</a>
                      ) : (
                        <a className="pill" href={playableVideoUrl(url)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>Voir la vidéo</a>
                      )}
                      {adminUnlocked && (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={videoDeletingUrl === url}
                          aria-busy={videoDeletingUrl === url}
                          onClick={() => deleteVideo(videoRoute, url)}
                        >
                          {videoDeletingUrl === url ? "Suppression…" : "Supprimer"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {localVideo && (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={playableVideoUrl(url)}
                      style={{ width: "100%", maxHeight: "70vh", marginTop: 10, borderRadius: 12, background: "#000" }}
                    >
                      Votre navigateur ne permet pas la lecture de cette vidéo.
                    </video>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {adminUnlocked && (
        <div className="card">
          <div className="card-header"><h2>Ajouter une voie</h2><Button onClick={addRoute}>Ajouter</Button></div>
          <div className="grid four">
            <div><label>Corde</label><select value={newRoute.numeroCorde} onChange={(e) => setNewRoute((p) => ({ ...p, numeroCorde: e.target.value }))}><option value="" disabled>Choisir une corde</option>{ROPE_NUMBERS.map((numero) => <option key={numero} value={String(numero)}>Corde {numero}</option>)}</select></div>
            <div><label>Couleur voie</label><select value={newRoute.couleurPrises} onChange={(e) => setNewRoute((p) => ({ ...p, couleurPrises: e.target.value }))}><option value="" disabled>Choisir une couleur</option>{ROUTE_COLORS.map((couleur) => <option key={couleur} value={couleur}>{couleur}</option>)}</select></div>
            <div><label>Cotation</label><select value={newRoute.cotationReference} onChange={(e) => setNewRoute((p) => ({ ...p, cotationReference: e.target.value }))}><option value="" disabled>Choisir une cotation</option>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
            <div><label>Nom de la voie</label><input value={newRoute.nomVoie} onChange={(e) => setNewRoute((p) => ({ ...p, nomVoie: e.target.value }))} /></div>
            <div><label>Ouvreur</label><input list="climbcrew-opener-users" placeholder="Choisir un utilisateur ou saisir un nom" value={newRoute.nomOuvreur} onChange={(e) => setNewRoute((p) => ({ ...p, nomOuvreur: e.target.value }))} /><datalist id="climbcrew-opener-users">{participants.map((p) => { const name = `${p.prenom || ""} ${p.nom || ""}`.trim(); return name ? <option key={p.id || name} value={name} /> : null; })}</datalist></div>
            <div><label className="checkbox-field"><input type="checkbox" checked={newRoute.moulinetteOnly} onChange={(event) => setNewRoute((p) => ({ ...p, moulinetteOnly: event.target.checked }))} /><span>Moulinette uniquement</span></label></div>
          </div>
          <div className="realisation-tags" style={{ marginTop: 10 }}>
            <label>Caractéristiques de la voie <span className="small">({newRoute.tags.length}/3 sélectionnées)</span></label>
            <div className="tag-selector" aria-label="Caractéristiques de la nouvelle voie">{ROUTE_TAGS.map((tag) => { const selected = newRoute.tags.includes(tag.value); const limitReached = newRoute.tags.length >= 3; return <button type="button" className={selected ? "tag-option selected" : "tag-option"} aria-pressed={selected} disabled={!selected && limitReached} key={tag.value} onClick={() => setNewRoute((prev) => ({ ...prev, tags: selected ? prev.tags.filter((value) => value !== tag.value) : [...prev.tags, tag.value] }))}>{selected && <span aria-hidden="true">✓ </span>}{tag.label}</button>; })}</div>
          </div>
          {routeError && <div className="error" style={{ marginTop: 10 }}>{routeError}</div>}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Tableau des voies</h2>
          <div className="group">
            <label htmlFor="route-sort-mode">Trier par</label>
            <select id="route-sort-mode" value={routeSortMode} onChange={(event) => setRouteSortMode(event.target.value)} style={{ width: "auto", minWidth: 130 }}><option value="corde">Corde</option><option value="cotation">Cotation</option></select>
            <label htmlFor="route-realisation-filter">Réalisation</label>
            <select id="route-realisation-filter" value={routeRealisationFilter} onChange={(event) => setRouteRealisationFilter(event.target.value)} style={{ width: "auto", minWidth: 150 }}>
              {ROUTE_REALISATION_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        {routeProgressError && <div className="small" role="status" style={{ marginBottom: 10 }}>{routeProgressError}</div>}
        <div className="stack">
          {filteredRouteDisplayGroups.map((group) => (
            <div className="subcard" key={group.key}>
              <div className="card-header"><strong>{group.label}</strong><span className="badge">{group.routes.length} voie(s)</span></div>
              {group.routes.length === 0 ? <div className="small">Aucune voie.</div> : (
                <div className="stack">
                  {group.routes.map((route) => {
                    const routeRating = routeRatingsById[route.id] || { average: 0, count: 0 };
                    const videoCount = effectiveVideoUrls(route).length;
                    const videoInputId = `route-video-upload-${route.id}`;
                    const myRouteProgress = realisationsByRoute.get(String(route.id)) || [];
                    const isExpanded = expandedRouteIds.has(String(route.id));
                    return (
                      <div className={`route-card ${route.moulinetteOnly ? "moulinette-only" : ""}`} key={route.id} style={getRouteCardStyle(route.couleurPrises)}>
                        {adminUnlocked && editingRouteId === route.id && routeEditDraft ? (
                          <>
                            <div className="grid three">
                              <div><label>Corde</label><select value={routeEditDraft.numeroCorde} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, numeroCorde: event.target.value }))}>{ROPE_NUMBERS.map((numero) => <option key={numero} value={String(numero)}>Corde {numero}</option>)}</select></div>
                              <div><label>Couleur</label><select value={routeEditDraft.couleurPrises} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, couleurPrises: event.target.value }))}>{ROUTE_COLORS.map((couleur) => <option key={couleur} value={couleur}>{couleur}</option>)}</select></div>
                              <div><label>Cotation</label><select value={routeEditDraft.cotationReference} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, cotationReference: event.target.value }))}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></div>
                              <div><label>Nom de la voie</label><input value={routeEditDraft.nomVoie} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, nomVoie: event.target.value }))} /></div>
                              <div><label>Ouvreur</label><input list="climbcrew-opener-users" placeholder="Choisir un utilisateur ou saisir un nom" value={routeEditDraft.nomOuvreur} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, nomOuvreur: event.target.value }))} /></div>
                              <div><label className="checkbox-field"><input type="checkbox" checked={routeEditDraft.moulinetteOnly} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, moulinetteOnly: event.target.checked }))} /><span>Moulinette uniquement</span></label></div>
                            </div>
                            <div className="realisation-tags" style={{ marginTop: 8 }}>
                              <label>Caractéristiques de la voie <span className="small">({routeEditDraft.tags.length}/5 sélectionnées)</span></label>
                              <div className="tag-selector" aria-label="Modifier les caractéristiques de la voie">{ROUTE_TAGS.map((tag) => { const selected = routeEditDraft.tags.includes(tag.value); const limitReached = routeEditDraft.tags.length >= 5; return <button type="button" className={selected ? "tag-option selected" : "tag-option"} aria-pressed={selected} disabled={!selected && limitReached} key={tag.value} onClick={() => setRouteEditDraft((prev) => ({ ...prev, tags: selected ? prev.tags.filter((value) => value !== tag.value) : [...prev.tags, tag.value] }))}>{selected && <span aria-hidden="true">✓ </span>}{tag.label}</button>; })}</div>
                            </div>
                            <div style={{ marginTop: 10 }}>
                              <label htmlFor={`route-videos-${route.id}`}>Vidéos de la voie</label>
                              <textarea id={`route-videos-${route.id}`} rows={4} value={videoDraftText(route)} onChange={(event) => updateVideoDraft(route, event.target.value)} placeholder={"https://youtu.be/...\nhttps://www.youtube.com/watch?v=..."} />
                              <div className="small">Une URL externe par ligne · 10 vidéos maximum. Les vidéos chargées depuis l’appareil restent associées sans afficher leur chemin technique.</div>
                              <div className="group" style={{ marginTop: 8 }}>
                                <input id={videoInputId} type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" style={{ display: "none" }} disabled={videoUploadingRouteId === route.id} onChange={(event) => { const file = event.target.files?.[0]; uploadLocalVideo(route, file); event.target.value = ""; }} />
                                <Button type="button" variant="secondary" disabled={videoUploadingRouteId === route.id} onClick={() => document.getElementById(videoInputId)?.click()}>{videoUploadingRouteId === route.id ? "Chargement…" : "Charger une vidéo"}</Button>
                              </div>
                              {videoSaveStatus && <div className="small" style={{ marginTop: 4 }}>{videoSaveStatus}</div>}
                            </div>
                            {routeError && <div className="error" style={{ marginTop: 8 }}>{routeError}</div>}
                            <div className="group" style={{ marginTop: 8 }}>
                              <Button onClick={() => saveRouteEditionWithVideos(route)} disabled={savingRouteId === route.id || videoSavingRouteId === route.id || videoUploadingRouteId === route.id} aria-busy={savingRouteId === route.id || videoSavingRouteId === route.id || videoUploadingRouteId === route.id}>{savingRouteId === route.id || videoSavingRouteId === route.id || videoUploadingRouteId === route.id ? "Enregistrement…" : "Enregistrer"}</Button>
                              <Button variant="secondary" onClick={cancelRouteEdition}>Annuler</Button>
                              <Button variant="danger" onClick={() => deleteRoute(route)}>Supprimer la voie</Button>
                            </div>
                          </>
                        ) : (
                          <div className="card-header">
                            <div
                    className="route-summary"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Masquer" : "Afficher"} les détails de ${formatRouteName(route)}`}
                    onClick={() => toggleRouteDetails(route.id)}
                    onKeyDown={(event) => handleRouteSummaryKeyDown(event, route.id)}
                    style={{ cursor: "pointer", flex: 1 }}
                  >
                              <strong className="route-primary-line">
                      {route.cotationAjustee || route.cotationReference || "nc"} · {route.couleurPrises || "Sans couleur"}
                      <span className="small" aria-hidden="true" style={{ marginLeft: 8 }}>{isExpanded ? "▴" : "▾"}</span>
                    </strong>
                              <div className="route-meta-line" aria-label="Réalisation du grimpeur connecté">{formatRouteProgress(myRouteProgress, route)}</div>
                    {isExpanded && (
                      <div
                        className="route-expanded-details"
                        aria-label="Détails complets de la voie"
                        style={{ marginTop: 10, display: "grid", gap: 4 }}
                      >
                        <div><strong>Nom :</strong> {route.nomVoie || "Sans nom"}</div>
                        <div><strong>Corde :</strong> {normalizeRopeNumber(route.numeroCorde)}</div>
                        <div><strong>Couleur :</strong> {route.couleurPrises || "Sans couleur"}</div>
                        <div><strong>Ouvreur :</strong> {route.nomOuvreur || "Non renseigné"}</div>
                        <div><strong>Cotation de référence :</strong> {route.cotationReference || "nc"}</div>
                        <div><strong>Cotation ajustée :</strong> {route.cotationAjustee || route.cotationReference || "nc"}</div>
                        <div><strong>Consensus :</strong> {routeAggregatesById[route.id]?.consensusGrade || "nc"}</div>
                        <div><strong>Type :</strong> {route.moulinetteOnly ? "Moulinette uniquement" : "En tête / Moulinette"}</div>
                        <div><strong>Caractéristiques :</strong> {route.tags?.length > 0 ? route.tags.map((tag) => ROUTE_TAGS.find((item) => item.value === tag)?.label || tag).join(", ") : "Aucune"}</div>
                        <div><strong>Note :</strong> {routeRating.count ? `★ ${Number(routeRating.average || 0).toFixed(1)} · ${routeRating.count} avis` : "Aucun avis"}</div>
                        <div><strong>Vidéos :</strong> {videoCount}</div>
                      </div>
                    )}
                            </div>
                            <div className="group">
                              <Button variant="secondary" onClick={() => openRealisationModal(route.id, selectedParticipantProgress)}>Réalisation</Button>
                              {videoCount > 0 && <Button variant="secondary" onClick={() => setVideoRouteId(route.id)}>Vidéos · {videoCount}</Button>}
                              {adminUnlocked && <Button variant="secondary" onClick={() => setQrRouteId(route.id)}>QR code</Button>}
                              {adminUnlocked && <Button variant="secondary" onClick={() => startRouteEdition(route)}>Modifier</Button>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <RouteQrCode route={qrRoute} onClose={() => setQrRouteId("")} />
    </>
  );
}