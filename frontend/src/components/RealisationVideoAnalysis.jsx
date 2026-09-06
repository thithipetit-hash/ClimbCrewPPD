import React from "react";
import Button from "./Button.jsx";
import VideoTechnicalAnalysis from "./VideoTechnicalAnalysis.jsx";
import { apiFetch, apiUpload } from "../lib/api.js";

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

function localVideoId(url) {
  const match = String(url || "").match(/^\/routes\/[^/]+\/videos\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
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
  const [removedRouteUrls, setRemovedRouteUrls] = React.useState([]);
  const [localSelectedUrls, setLocalSelectedUrls] = React.useState(() => (
    Array.isArray(realisation?.videoUrls) ? realisation.videoUrls : []
  ));
  const [uploading, setUploading] = React.useState(false);
  const [deletingUrl, setDeletingUrl] = React.useState("");
  const [uploadStatus, setUploadStatus] = React.useState("");
  const [uploadError, setUploadError] = React.useState("");

  React.useEffect(() => {
    setLocalSelectedUrls(Array.isArray(realisation?.videoUrls) ? realisation.videoUrls : []);
  }, [realisation?.id, realisation?.videoUrls]);

  React.useEffect(() => {
    setUploadedRouteUrls([]);
    setRemovedRouteUrls([]);
    setUploadStatus("");
    setUploadError("");
  }, [route?.id]);

  const selectedVideoUrls = uniqueVideoUrls(localSelectedUrls).filter((url) => !removedRouteUrls.includes(url));
  const routeVideoUrls = uniqueVideoUrls(route?.videoUrls, selectedVideoUrls, uploadedRouteUrls)
    .filter((url) => !removedRouteUrls.includes(url));
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

  async function handleDelete(url) {
    if (!editable || !realisation?.id || !isLocalVideoUrl(url) || deletingUrl) return;
    const videoId = localVideoId(url);
    if (!videoId) return;
    if (!window.confirm("Supprimer définitivement cette vidéo de ClimbCrew ? Elle sera retirée de toutes les réalisations qui l’utilisent.")) return;

    setUploadStatus("");
    setUploadError("");
    setDeletingUrl(url);
    try {
      const result = await apiFetch(
        `/realisations/${encodeURIComponent(realisation.id)}/videos/${encodeURIComponent(videoId)}`,
        { method: "DELETE" },
      );
      const nextSelected = Array.isArray(result?.videoUrls)
        ? result.videoUrls
        : selectedVideoUrls.filter((item) => item !== url);
      const nextRouteUrls = Array.isArray(result?.routeVideoUrls)
        ? result.routeVideoUrls
        : routeVideoUrls.filter((item) => item !== url);
      setRemovedRouteUrls((current) => uniqueVideoUrls(current, [url]));
      setLocalSelectedUrls(nextSelected);
      setUploadedRouteUrls(nextRouteUrls);
      setUploadStatus("Vidéo supprimée définitivement.");
      if (typeof onRefresh === "function") await onRefresh();
    } catch (error) {
      setUploadError(error.message || "Suppression de la vidéo impossible.");
    } finally {
      setDeletingUrl("");
    }
  }

  return (
    <>
      <div className="subcard" style={{ marginTop: 10 }}>
        <div className="card-header">
          <strong>Vidéos de cette réalisation</strong>
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
                disabled={uploading || Boolean(deletingUrl) || limitReached || !realisation?.id || !route?.id}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "Chargement…" : "Charger une vidéo"}
              </Button>
            </>
          )}
        </div>

        {uploadError && <div className="error" role="alert" style={{ marginTop: 8 }}>{uploadError}</div>}
        {uploadStatus && <div className="small" role="status" style={{ marginTop: 8 }}>{uploadStatus}</div>}

        {routeVideoUrls.length === 0 ? (
          <div className="small" style={{ marginTop: 6 }}>Aucune vidéo n’est encore associée à cette voie.</div>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {routeVideoUrls.map((url, index) => {
              const checked = selectedVideoUrls.includes(url);
              const localVideo = isLocalVideoUrl(url);
              return (
                <div className="card-header" key={url} style={{ gap: 8 }}>
                  <label className="checkbox-field" style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!editable || Boolean(deletingUrl) || (!checked && limitReached)}
                      onChange={(event) => {
                        if (!editable || typeof onUpdate !== "function") return;
                        const next = event.target.checked
                          ? uniqueVideoUrls(selectedVideoUrls, [url]).slice(0, 3)
                          : selectedVideoUrls.filter((item) => item !== url);
                        setLocalSelectedUrls(next);
                        onUpdate({ videoUrls: next });
                      }}
                    />
                    <span>Vidéo {index + 1}{localVideo ? " · chargée dans ClimbCrew" : " · lien externe"}</span>
                  </label>
                  {editable && localVideo && checked && (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={Boolean(deletingUrl)}
                      onClick={() => handleDelete(url)}
                    >
                      {deletingUrl === url ? "Suppression…" : "Supprimer"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="small" style={{ marginTop: 6 }}>
          {limitReached
            ? "3 vidéos associées : retirez-en une pour en charger une autre."
            : "Jusqu’à 3 vidéos peuvent être rattachées précisément à ce passage · 50 Mo maximum par fichier."}
        </div>
      </div>

      <VideoTechnicalAnalysis videoUrls={selectedVideoUrls} />
    </>
  );
}
