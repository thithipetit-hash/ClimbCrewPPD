import React from "react";
import Button from "./Button.jsx";
import VideoTechnicalAnalysis from "./VideoTechnicalAnalysis.jsx";
import { API_BASE, apiFetch, apiUpload } from "../lib/api.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
const VIDEO_TYPE_BY_EXTENSION = Object.freeze({
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
  mov: "video/quicktime",
});

function isLocalVideoUrl(url) {
  return /^\/routes\/[^/]+\/videos\/[^/]+$/.test(String(url || ""));
}

function parseLocalVideoUrl(url) {
  const match = String(url || "").match(/^\/routes\/([^/]+)\/videos\/([^/]+)$/);
  if (!match) return null;
  return {
    routeId: decodeURIComponent(match[1]),
    videoId: decodeURIComponent(match[2]),
  };
}

function playableVideoUrl(url) {
  if (String(url || "").startsWith("/")) return `${API_BASE}${url}`;
  return String(url || "");
}

function uniqueVideoUrls(...groups) {
  return [...new Set(groups.flatMap((group) => Array.isArray(group) ? group : []).map(String).filter(Boolean))];
}

function resolveVideoType(file) {
  const declaredType = String(file?.type || "").toLowerCase();
  if (ACCEPTED_VIDEO_TYPES.has(declaredType)) return declaredType;
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  return VIDEO_TYPE_BY_EXTENSION[extension] || "";
}

export default function RealisationVideoAnalysis({
  realisation,
  route,
  editable = false,
  onUpdate,
  onRefresh,
}) {
  const inputRef = React.useRef(null);
  const [uploadedRouteUrls, setUploadedRouteUrls] = React.useState([]);
  const [localSelectedUrls, setLocalSelectedUrls] = React.useState(() => (
    Array.isArray(realisation?.videoUrls) ? realisation.videoUrls : []
  ));
  const [compareUrls, setCompareUrls] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [deletingUrl, setDeletingUrl] = React.useState("");
  const [uploadStatus, setUploadStatus] = React.useState("");
  const [uploadError, setUploadError] = React.useState("");

  React.useEffect(() => {
    const urls = Array.isArray(realisation?.videoUrls) ? realisation.videoUrls : [];
    setLocalSelectedUrls(urls);
    setCompareUrls((current) => current.filter((url) => urls.includes(url)).slice(0, 2));
  }, [realisation?.id, realisation?.videoUrls]);

  React.useEffect(() => {
    setUploadedRouteUrls([]);
    setUploadStatus("");
    setUploadError("");
    setCompareUrls([]);
  }, [route?.id]);

  const selectedVideoUrls = uniqueVideoUrls(localSelectedUrls);
  const routeVideoUrls = uniqueVideoUrls(route?.videoUrls, selectedVideoUrls, uploadedRouteUrls);
  const availableRouteUrls = routeVideoUrls.filter((url) => !selectedVideoUrls.includes(url));
  const comparableUrls = selectedVideoUrls.filter(isLocalVideoUrl);
  const limitReached = selectedVideoUrls.length >= 3;

  async function handleUpload(file) {
    if (!file || !realisation?.id || !editable || uploading) return;
    setUploadStatus("");
    setUploadError("");

    if (limitReached) {
      setUploadError("Trois vidéos maximum peuvent être associées à une réalisation.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError("Vidéo trop volumineuse. Maximum 50 Mo.");
      return;
    }
    const mimeType = resolveVideoType(file);
    if (!mimeType) {
      setUploadError("Format vidéo refusé. Utilisez MP4, WebM, OGG ou MOV.");
      return;
    }

    try {
      setUploading(true);
      const result = await apiUpload(
        `/realisations/${encodeURIComponent(realisation.id)}/videos`,
        file,
        { headers: { "Content-Type": mimeType } },
      );
      const nextSelected = Array.isArray(result?.videoUrls)
        ? result.videoUrls
        : uniqueVideoUrls(selectedVideoUrls, [result?.url]).slice(0, 3);
      const nextRouteUrls = Array.isArray(result?.routeVideoUrls)
        ? result.routeVideoUrls
        : uniqueVideoUrls(routeVideoUrls, [result?.url]);
      setLocalSelectedUrls(nextSelected);
      setUploadedRouteUrls(nextRouteUrls);
      setUploadStatus("Vidéo chargée et associée à cette réalisation.");
      if (typeof onRefresh === "function") await onRefresh();
    } catch (error) {
      setUploadError(error.message || "Chargement de la vidéo impossible.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDeleteVideo(url) {
    if (!editable || !realisation?.id || deletingUrl) return;
    const localVideo = parseLocalVideoUrl(url);
    const label = selectedVideoUrls.indexOf(url) + 1;
    if (!window.confirm(`Effacer la vidéo ${label > 0 ? label : ""} de cette réalisation ?`)) return;

    setUploadError("");
    setUploadStatus("");
    setDeletingUrl(url);
    try {
      if (localVideo) {
        const result = await apiFetch(
          `/realisations/${encodeURIComponent(realisation.id)}/videos/${encodeURIComponent(localVideo.videoId)}`,
          { method: "DELETE" },
        );
        const nextSelected = Array.isArray(result?.videoUrls)
          ? result.videoUrls
          : selectedVideoUrls.filter((item) => item !== url);
        setLocalSelectedUrls(nextSelected);
        setCompareUrls((current) => current.filter((item) => item !== url));
        setUploadStatus(result?.deletedPermanently
          ? "Vidéo effacée définitivement."
          : "Vidéo retirée de cette réalisation.");
      } else if (typeof onUpdate === "function") {
        const nextSelected = selectedVideoUrls.filter((item) => item !== url);
        setLocalSelectedUrls(nextSelected);
        setCompareUrls((current) => current.filter((item) => item !== url));
        await onUpdate({ videoUrls: nextSelected });
        setUploadStatus("Lien vidéo retiré de cette réalisation.");
      }
      if (typeof onRefresh === "function") await onRefresh();
    } catch (error) {
      setUploadError(error.message || "Suppression de la vidéo impossible.");
    } finally {
      setDeletingUrl("");
    }
  }

  function toggleCompare(url) {
    setCompareUrls((current) => {
      if (current.includes(url)) return current.filter((item) => item !== url);
      if (current.length >= 2) return current;
      return [...current, url];
    });
  }

  return (
    <>
      <div className="subcard" style={{ marginTop: 10 }}>
        <div className="card-header">
          <div>
            <strong>Vidéos de cette réalisation</strong>
            <div className="small">Chargez, effacez ou sélectionnez deux vidéos pour les comparer.</div>
          </div>
          {editable && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.ogv,.mov"
                style={{ display: "none" }}
                onChange={(event) => handleUpload(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={uploading || limitReached || !realisation?.id || !route?.id}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "Chargement…" : "Charger une vidéo"}
              </Button>
            </>
          )}
        </div>

        {uploadError && <div className="error" role="alert" style={{ marginTop: 8 }}>{uploadError}</div>}
        {uploadStatus && <div className="small" role="status" style={{ marginTop: 8 }}>{uploadStatus}</div>}

        {selectedVideoUrls.length === 0 ? (
          <div className="small" style={{ marginTop: 8 }}>Aucune vidéo associée à cette réalisation.</div>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {selectedVideoUrls.map((url, index) => {
              const local = isLocalVideoUrl(url);
              const compareChecked = compareUrls.includes(url);
              return (
                <div className="subcard" key={url}>
                  <div className="card-header">
                    <div>
                      <strong>Vidéo {index + 1}</strong>
                      <div className="small">{local ? "Chargée dans ClimbCrew" : "Lien externe"}</div>
                    </div>
                    <div className="group">
                      {local && (
                        <label className="checkbox-field" style={{ width: "auto" }}>
                          <input
                            type="checkbox"
                            checked={compareChecked}
                            disabled={!compareChecked && compareUrls.length >= 2}
                            onChange={() => toggleCompare(url)}
                          />
                          <span>Comparer</span>
                        </label>
                      )}
                      {editable && (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={Boolean(deletingUrl)}
                          onClick={() => handleDeleteVideo(url)}
                        >
                          {deletingUrl === url ? "Suppression…" : "Effacer"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {editable && availableRouteUrls.length > 0 && !limitReached && (
          <details style={{ marginTop: 10 }}>
            <summary>Associer une vidéo déjà disponible sur cette voie</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {availableRouteUrls.map((url, index) => (
                <Button
                  type="button"
                  variant="secondary"
                  key={url}
                  onClick={async () => {
                    if (typeof onUpdate !== "function") return;
                    const next = uniqueVideoUrls(selectedVideoUrls, [url]).slice(0, 3);
                    setLocalSelectedUrls(next);
                    await onUpdate({ videoUrls: next });
                  }}
                >
                  Associer la vidéo disponible {index + 1}
                </Button>
              ))}
            </div>
          </details>
        )}

        <div className="small" style={{ marginTop: 8 }}>
          {limitReached
            ? "3 vidéos associées : effacez-en une avant d’en charger une autre."
            : "3 vidéos maximum par réalisation · 50 Mo maximum par fichier."}
        </div>
      </div>

      {compareUrls.length > 0 && (
        <div className="subcard" style={{ marginTop: 10 }}>
          <div className="card-header">
            <div>
              <strong>Comparaison vidéo</strong>
              <div className="small">
                {compareUrls.length === 2
                  ? "Les deux vidéos peuvent être lues côte à côte et positionnées indépendamment."
                  : "Sélectionnez une deuxième vidéo pour comparer deux passages."}
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => setCompareUrls([])}>Réinitialiser</Button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 10,
              marginTop: 8,
            }}
          >
            {compareUrls.map((url, index) => (
              <div key={url}>
                <div className="small">Vidéo {selectedVideoUrls.indexOf(url) + 1 || index + 1}</div>
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={playableVideoUrl(url)}
                  style={{ width: "100%", maxHeight: "55vh", borderRadius: 12, background: "#000", marginTop: 4 }}
                >
                  Votre navigateur ne permet pas la lecture de cette vidéo.
                </video>
              </div>
            ))}
          </div>
        </div>
      )}

      <VideoTechnicalAnalysis videoUrls={selectedVideoUrls} />
    </>
  );
}
