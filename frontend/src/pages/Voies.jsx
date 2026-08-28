import React from "react";
import Button from "../components/Button.jsx";
import { API_BASE, apiFetch, apiUpload } from "../lib/api.js";
import { GRADES, formatRouteName, getRouteCardStyle, normalizeRopeNumber } from "../lib/domain.js";
import { ROPE_NUMBERS, ROUTE_COLORS, ROUTE_TAGS } from "../lib/ui-config.js";

function parseVideoUrls(text) {
  return [...new Set(String(text || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
}

function playableVideoUrl(url) {
  if (String(url || "").startsWith("/")) return `${API_BASE}${url}`;
  return url;
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
}) {
  const [videoRouteId, setVideoRouteId] = React.useState("");
  const [videoDraftByRouteId, setVideoDraftByRouteId] = React.useState({});
  const [videoSaveStatus, setVideoSaveStatus] = React.useState("");
  const [videoSavingRouteId, setVideoSavingRouteId] = React.useState("");
  const [videoUploadingRouteId, setVideoUploadingRouteId] = React.useState("");

  const allRoutes = routeDisplayGroups.flatMap((group) => group.routes);
  const videoRoute = allRoutes.find((route) => String(route.id) === String(videoRouteId)) || null;

  function effectiveVideoUrls(route) {
    const local = videoDraftByRouteId[route.id];
    if (local?.savedUrls) return local.savedUrls;
    return Array.isArray(route.videoUrls) ? route.videoUrls : [];
  }

  function videoDraftText(route) {
    const local = videoDraftByRouteId[route.id];
    if (local && Object.hasOwn(local, "draft")) return local.draft;
    return effectiveVideoUrls(route).join("\n");
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
      const result = await apiUpload(`/routes/${encodeURIComponent(route.id)}/videos`, file);
      const savedUrls = Array.isArray(result?.route?.videoUrls)
        ? result.route.videoUrls
        : [...effectiveVideoUrls(route), result.url].filter(Boolean);
      setVideoDraftByRouteId((current) => ({
        ...current,
        [route.id]: { draft: savedUrls.join("\n"), savedUrls },
      }));
      setVideoSaveStatus(`Vidéo locale « ${file.name} » chargée.`);
    } catch (error) {
      setVideoSaveStatus(error.message || "Chargement de la vidéo impossible.");
    } finally {
      setVideoUploadingRouteId("");
    }
  }

  async function saveRouteVideos(route, { silent = false } = {}) {
    const videoUrls = parseVideoUrls(videoDraftText(route));
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
      setVideoDraftByRouteId((current) => ({ ...current, [route.id]: { draft: savedUrls.join("\n"), savedUrls } }));
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
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Vidéos · {formatRouteName(videoRoute)}</h2>
            <div className="small">Corde {normalizeRopeNumber(videoRoute.numeroCorde)} · {videoRoute.cotationAjustee || videoRoute.cotationReference || "nc"}</div>
          </div>
          <Button variant="secondary" onClick={() => setVideoRouteId("")}>Retour aux voies</Button>
        </div>
        {videoUrls.length === 0 ? <div className="muted-box">Aucune vidéo n’est encore associée à cette voie.</div> : (
          <div className="stack">
            {videoUrls.map((url, index) => (
              <div className="subcard" key={`${url}-${index}`}>
                <div className="card-header">
                  <div><strong>Vidéo {index + 1}</strong><div className="small" style={{ overflowWrap: "anywhere" }}>{url}</div></div>
                  <a className="pill" href={playableVideoUrl(url)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>Voir la vidéo</a>
                </div>
              </div>
            ))}
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
            <div><label>Ouvreur</label><input value={newRoute.nomOuvreur} onChange={(e) => setNewRoute((p) => ({ ...p, nomOuvreur: e.target.value }))} /></div>
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
          <div className="group"><label htmlFor="route-sort-mode">Trier par</label><select id="route-sort-mode" value={routeSortMode} onChange={(event) => setRouteSortMode(event.target.value)} style={{ width: "auto", minWidth: 150 }}><option value="corde">Corde</option><option value="cotation">Cotation</option></select></div>
        </div>
        <div className="stack">
          {routeDisplayGroups.map((group) => (
            <div className="subcard" key={group.key}>
              <div className="card-header"><strong>{group.label}</strong><span className="badge">{group.routes.length} voie(s)</span></div>
              {group.routes.length === 0 ? <div className="small">Aucune voie.</div> : (
                <div className="stack">
                  {group.routes.map((route) => {
                    const routeRating = routeRatingsById[route.id] || { average: 0, count: 0 };
                    const videoCount = effectiveVideoUrls(route).length;
                    return (
                      <div className={`route-card ${route.moulinetteOnly ? "moulinette-only" : ""}`} key={route.id} style={getRouteCardStyle(route.couleurPrises)}>
                        {adminUnlocked && editingRouteId === route.id && routeEditDraft ? (
                          <>
                            <div className="grid three">
                              <div><label>Corde</label><select value={routeEditDraft.numeroCorde} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, numeroCorde: event.target.value }))}>{ROPE_NUMBERS.map((numero) => <option key={numero} value={String(numero)}>Corde {numero}</option>)}</select></div>
                              <div><label>Couleur</label><select value={routeEditDraft.couleurPrises} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, couleurPrises: event.target.value }))}>{ROUTE_COLORS.map((couleur) => <option key={couleur} value={couleur}>{couleur}</option>)}</select></div>
                              <div><label>Cotation</label><select value={routeEditDraft.cotationReference} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, cotationReference: event.target.value }))}>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></div>
                              <div><label>Nom de la voie</label><input value={routeEditDraft.nomVoie} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, nomVoie: event.target.value }))} /></div>
                              <div><label>Ouvreur</label><input value={routeEditDraft.nomOuvreur} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, nomOuvreur: event.target.value }))} /></div>
                              <div><label className="checkbox-field"><input type="checkbox" checked={routeEditDraft.moulinetteOnly} onChange={(event) => setRouteEditDraft((draft) => ({ ...draft, moulinetteOnly: event.target.checked }))} /><span>Moulinette uniquement</span></label></div>
                            </div>
                            <div className="realisation-tags" style={{ marginTop: 8 }}>
                              <label>Caractéristiques de la voie <span className="small">({routeEditDraft.tags.length}/3 sélectionnées)</span></label>
                              <div className="tag-selector" aria-label="Modifier les caractéristiques de la voie">{ROUTE_TAGS.map((tag) => { const selected = routeEditDraft.tags.includes(tag.value); const limitReached = routeEditDraft.tags.length >= 3; return <button type="button" className={selected ? "tag-option selected" : "tag-option"} aria-pressed={selected} disabled={!selected && limitReached} key={tag.value} onClick={() => setRouteEditDraft((prev) => ({ ...prev, tags: selected ? prev.tags.filter((value) => value !== tag.value) : [...prev.tags, tag.value] }))}>{selected && <span aria-hidden="true">✓ </span>}{tag.label}</button>; })}</div>
                            </div>
                            <div style={{ marginTop: 10 }}>
                              <label htmlFor={`route-videos-${route.id}`}>Vidéos de la voie</label>
                              <textarea id={`route-videos-${route.id}`} rows={4} value={videoDraftText(route)} onChange={(event) => updateVideoDraft(route, event.target.value)} placeholder={"https://youtu.be/...\nhttps://www.youtube.com/watch?v=..."} />
                              <div className="small">Une URL par ligne · 10 vidéos maximum. Les utilisateurs y accèdent en cliquant sur le titre de la voie.</div>
                              <div className="group" style={{ marginTop: 8 }}>
                                <label className="secondary" style={{ cursor: "pointer" }}>
                                  {videoUploadingRouteId === route.id ? "Chargement…" : "Charger une vidéo locale"}
                                  <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" style={{ display: "none" }} disabled={videoUploadingRouteId === route.id} onChange={(event) => { const file = event.target.files?.[0]; uploadLocalVideo(route, file); event.target.value = ""; }} />
                                </label>
                                <span className="small">MP4, WebM, OGG ou MOV · 50 Mo maximum</span>
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
                            <div className="route-summary">
                              <strong className="route-primary-line">
                                {routeSortMode !== "corde" && <>Corde {normalizeRopeNumber(route.numeroCorde)} · </>}{route.cotationAjustee} · {" "}
                                <a href={`#voie-videos-${route.id}`} onClick={(event) => { event.preventDefault(); setVideoRouteId(route.id); }} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }} title="Voir les vidéos de cette voie">{formatRouteName(route)}</a>
                                {videoCount > 0 && <span className="small"> · 🎬 {videoCount}</span>}
                              </strong>
                              <div className="route-secondary-line"><span>Consensus {routeAggregatesById[route.id]?.consensusGrade || "nc"}</span>{route.moulinetteOnly && <span className="pill moulinette-badge" title="Moulinette uniquement">Moulinette</span>}</div>
                              <div className="route-characteristics" aria-label="Caractéristiques de la voie"><span className="route-characteristics-label">Caractéristiques :</span>{route.tags?.length > 0 ? route.tags.map((tag) => <span className="route-characteristic" key={tag}>{ROUTE_TAGS.find((item) => item.value === tag)?.label || tag}</span>) : <span className="route-characteristics-empty">non renseignées</span>}</div>
                              <div className="route-rating"><span className="rating-average">{routeRating.count ? `★ ${routeRating.average.toFixed(1)} (${routeRating.count} réalisation${routeRating.count > 1 ? "s" : ""})` : "Pas encore notée (0 réalisation)"}</span></div>
                            </div>
                            <div className="group"><Button variant="secondary" onClick={() => openRealisationModal(route.id, selectedParticipantProgress)}>Réalisation</Button>{adminUnlocked && <Button variant="secondary" onClick={() => startRouteEdition(route)}>Modifier</Button>}</div>
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
    </>
  );
}
